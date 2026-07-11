import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { Readable } from "node:stream";

const home = fs.mkdtempSync(path.join(os.tmpdir(), "founder-code-guard-"));
process.env.GTM_IDE_HOME = path.join(home, "state");
process.env.GTM_IDE_PERSISTENCE = "json";
const { default: workspaceRoutes } = await import("../src/routes/workspaces.mjs");
const { claimFounderSession, founderBootstrapCode, authorizeFounderWriteForRequest } = await import("../src/routes/session-guard.mjs");
const { openWorkspace, addRevision, getWorkspace } = await import("../src/workspace.mjs");

function git(cwd, args) { return execFileSync("git", args, { cwd, encoding: "utf8" }).trim(); }
function browserCookie() {
  let value = "";
  claimFounderSession({ headers: {} }, { setHeader(_name, next) { value = next; } }, founderBootstrapCode());
  return value.split(";")[0];
}
async function request(pathname, body, headers = {}) {
  const req = Readable.from([JSON.stringify(body ?? {})]); req.method = "POST"; req.headers = { "content-type": "application/json", ...headers };
  let status = 0; let text = "";
  const res = { writeHead(next) { status = next; }, end(next) { text += next ?? ""; } };
  await workspaceRoutes({ req, res, url: new URL(pathname, "http://local") });
  return { status, payload: JSON.parse(text) };
}

test("code review refuses tokenless and agent-stamped writes, while a browser founder can review, apply, and revert", async () => {
  const repo = path.join(home, "repo"); fs.mkdirSync(repo); git(repo, ["init", "-q"]); git(repo, ["config", "user.email", "test@example.com"]); git(repo, ["config", "user.name", "Test"]);
  fs.writeFileSync(path.join(repo, "a.txt"), "before\n"); git(repo, ["add", "."]); git(repo, ["commit", "-qm", "base"]); const base = git(repo, ["rev-parse", "HEAD"]);
  const workspace = openWorkspace(repo, "project_created");
  const revision = { id: "r1", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), status: "proposed", baseCommit: base, diff: "diff --git a/a.txt b/a.txt\nindex 90be1b..3e75765 100644\n--- a/a.txt\n+++ b/a.txt\n@@ -1 +1 @@\n-before\n+after\n", summary: "Change a", evidence: [] };
  addRevision(workspace.id, revision);
  const reviewPath = `/api/workspaces/${workspace.id}/revisions/r1/review`;
  assert.equal((await request(reviewPath, { decision: "approve" })).status, 403);
  const cookie = browserCookie();
  assert.equal((await request(reviewPath, { decision: "approve" }, { cookie, "x-gtm-actor": "agent" })).status, 403);
  assert.equal((await request(reviewPath, { decision: "approve" }, { cookie })).status, 200);
  assert.equal((await request(`/api/workspaces/${workspace.id}/revisions/r1/apply`, { confirm: true })).status, 403);
  assert.equal((await request(`/api/workspaces/${workspace.id}/revisions/r1/apply`, { confirm: true }, { cookie })).status, 200);
  assert.equal(fs.readFileSync(path.join(repo, "a.txt"), "utf8"), "after\n");
  assert.equal((await request(`/api/workspaces/${workspace.id}/revisions/r1/revert`, { confirm: true }, { cookie })).status, 200);
  assert.equal(fs.readFileSync(path.join(repo, "a.txt"), "utf8"), "before\n");
  assert.equal(getWorkspace(workspace.id).revisions[0].status, "reverted");
});

test("the generic destructive-local-work guard preserves solo browser use", () => {
  assert.throws(() => authorizeFounderWriteForRequest({ headers: {} }, "Discard"), /Drover page/);
  assert.throws(() => authorizeFounderWriteForRequest({ headers: { cookie: browserCookie(), "x-gtm-actor": "agent" } }, "Discard"), /founder-only/);
  assert.doesNotThrow(() => authorizeFounderWriteForRequest({ headers: { cookie: browserCookie() } }, "Discard"));
});
