// product-routes.test.mjs — F4/integration acceptance: the HTTP surface for fork-is-a-worktree.
// review/apply/revert/discard clear authorizeFounderWriteForRequest at the door BEFORE
// product-change-decide.mjs's own store-layer actor check ever runs; agent-stamped callers are
// rejected; cross-venture access to a workspace 404s. Mirrors the call-harness style of
// wall-routes.test.mjs (a Readable request body, a writeHead/end res double) and its GTM_IDE_HOME
// module-scope isolation.
//
// Fixtures (venture/bet/fork/stage) are built directly through the store functions, exactly like
// wall-routes.test.mjs calls park() directly to set up a queue item before exercising the route —
// only the founder-decision surface (review/apply/revert/discard/readiness/list) is driven through
// the actual HTTP handler.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { Readable } from "node:stream";
import { founderHeaders } from "../helpers/founder-capability.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "drover-product-routes-"));
process.env.GTM_IDE_HOME = root;
process.env.GTM_IDE_PERSISTENCE = "json";

const { default: productRoutes } = await import("../../src/firm/product-routes.mjs");
const { createVenture, setVentureDoc } = await import("../../src/firm/venture-store.mjs");
const { createBet } = await import("../../src/firm/bet.mjs");
const { forkProductBet, stageProductBetForReview } = await import("../../src/firm/product-change.mjs");

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function fixtureRepo() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "drover-product-routes-repo-"));
  git(repo, ["init", "-q"]);
  git(repo, ["config", "user.email", "test@example.com"]);
  git(repo, ["config", "user.name", "Test"]);
  fs.writeFileSync(path.join(repo, "a.txt"), "before\n");
  git(repo, ["add", "."]);
  git(repo, ["commit", "-qm", "base"]);
  return repo;
}

const queueDir = path.join(root, "dogfood", "queue");
const options = { root, queueDir };

const venture = createVenture({ name: "Route-guarded product change" }, options);
const other = createVenture({ name: "Other venture" }, options);

// One fully staged product change on `venture`, ready to review/apply/revert through the route.
// Each call gets its OWN fresh source repo — reviewer/apply/revert genuinely mutate the real
// checkout (an applied-then-uncommitted patch leaves the repo dirty until reverted), so reusing one
// repo across tests would make a later fork's readiness fail on the PRIOR test's leftover dirt. That
// dirty-tree refusal is itself a real safety check (product-change-decide.mjs/revision.mjs); the
// fixture just needs its own repo per staged change to avoid tripping it on unrelated fixtures.
async function stagedFixture() {
  const repoRoot = fixtureRepo();
  const bet = createBet({ ventureId: venture.id, intent: "route-guarded product change" });
  setVentureDoc(venture.id, "bets", bet.id, bet, options);
  const enqueued = forkProductBet({ ventureId: venture.id, betId: bet.id, intent: bet.intent }, {
    ...options, repoRoot,
    runQuery: async ({ cwd }) => { fs.writeFileSync(path.join(cwd, "a.txt"), "after\n"); return { text: "done", error: null }; },
  });
  const built = await enqueued.build;
  const { workspaceId, revision } = await stageProductBetForReview(bet, path.basename(built.file), options, { park: async () => ({}) });
  return { bet, workspaceId, revisionId: revision.id, file: path.basename(built.file), repoRoot };
}

async function call(method, pathname, body = {}, headers = {}) {
  const req = Readable.from([JSON.stringify(body)]);
  req.method = method;
  req.url = pathname;
  req.headers = { "content-type": "application/json", ...founderHeaders({ method, path: pathname }), ...headers };
  let status = 0;
  let raw = "";
  const res = { writeHead(next) { status = next; }, setHeader() {}, end(next) { raw += next ?? ""; } };
  const handled = await productRoutes({ req, res, url: new URL(pathname, "http://local") });
  assert.equal(handled, true, `route did not claim ${method} ${pathname}`);
  return { status, body: raw ? JSON.parse(raw) : null };
}

test.after(() => fs.rmSync(root, { recursive: true, force: true }));

test("GET the product-change list for a venture's bet is not founder-gated", async () => {
  const { bet } = await stagedFixture();
  const res = await call("GET", `/api/ventures/${venture.id}/bets/${bet.id}/product-changes`);
  assert.equal(res.status, 200);
  assert.ok(res.body.changes.some((c) => c.status === "ready-for-review"));
});

test("a local page review POST does not need an unlock session", async () => {
  const { workspaceId, revisionId } = await stagedFixture();
  const res = await call("POST", `/api/ventures/${venture.id}/product-change-workspaces/${workspaceId}/revisions/${revisionId}/review`, { decision: "approve" });
  assert.equal(res.status, 200);
  assert.equal(res.body.revision.status, "approved");
});

test("an agent-stamped review POST is refused", async () => {
  const { workspaceId, revisionId } = await stagedFixture();
  const res = await call(
    "POST",
    `/api/ventures/${venture.id}/product-change-workspaces/${workspaceId}/revisions/${revisionId}/review`,
    { decision: "approve" },
    { "x-gtm-actor": "agent" },
  );
  assert.equal(res.status, 403);
});

test("a local page apply POST on an unreviewed revision is refused for prior review approval", async () => {
  const { workspaceId, revisionId } = await stagedFixture();
  const res = await call("POST", `/api/ventures/${venture.id}/product-change-workspaces/${workspaceId}/revisions/${revisionId}/apply`, { confirm: true });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /prior review approval/i);
});

test("a local page discard POST does not need an unlock session", async () => {
  const { bet, file } = await stagedFixture();
  const res = await call("POST", `/api/ventures/${venture.id}/bets/${bet.id}/product-changes/${file}/discard`, { confirm: true });
  assert.equal(res.status, 200);
  assert.equal(res.body.result.status, "discarded");
});

test("cross-venture access to a workspace 404s — venture B cannot review/apply/readiness venture A's revision under its own route", async () => {
  const { workspaceId, revisionId } = await stagedFixture();
  const reviewRes = await call(
    "POST",
    `/api/ventures/${other.id}/product-change-workspaces/${workspaceId}/revisions/${revisionId}/review`,
    { decision: "approve" },
  );
  assert.equal(reviewRes.status, 404);

  const readinessRes = await call("GET", `/api/ventures/${other.id}/product-change-workspaces/${workspaceId}/revisions/${revisionId}/readiness`);
  assert.equal(readinessRes.status, 404);
});

test("the local founder page can review, then apply through the route — the patch lands on the real source repo", async () => {
  const { workspaceId, revisionId, repoRoot } = await stagedFixture();

  const readinessBefore = await call("GET", `/api/ventures/${venture.id}/product-change-workspaces/${workspaceId}/revisions/${revisionId}/readiness`);
  assert.equal(readinessBefore.status, 200);
  assert.equal(readinessBefore.body.readiness.ready, false, "not yet approved");
  assert.equal(readinessBefore.body.readiness.status, "proposed");

  const reviewRes = await call(
    "POST",
    `/api/ventures/${venture.id}/product-change-workspaces/${workspaceId}/revisions/${revisionId}/review`,
    { decision: "approve" },
  );
  assert.equal(reviewRes.status, 200);
  assert.equal(reviewRes.body.revision.status, "approved");

  const readinessAfter = await call("GET", `/api/ventures/${venture.id}/product-change-workspaces/${workspaceId}/revisions/${revisionId}/readiness`);
  assert.equal(readinessAfter.body.readiness.ready, true, JSON.stringify(readinessAfter.body));
  assert.equal(readinessAfter.body.readiness.status, "approved");

  const applyMissingConfirm = await call(
    "POST",
    `/api/ventures/${venture.id}/product-change-workspaces/${workspaceId}/revisions/${revisionId}/apply`,
    {},
  );
  assert.equal(applyMissingConfirm.status, 400);
  assert.match(applyMissingConfirm.body.error, /explicit confirmation/i);

  const applyRes = await call(
    "POST",
    `/api/ventures/${venture.id}/product-change-workspaces/${workspaceId}/revisions/${revisionId}/apply`,
    { confirm: true },
  );
  assert.equal(applyRes.status, 200);
  assert.equal(applyRes.body.revision.status, "applied");
  assert.equal(fs.readFileSync(path.join(repoRoot, "a.txt"), "utf8"), "after\n");
});

test("the local founder page can revert an applied change through the route", async () => {
  const { workspaceId, revisionId, repoRoot } = await stagedFixture();
  await call("POST", `/api/ventures/${venture.id}/product-change-workspaces/${workspaceId}/revisions/${revisionId}/review`, { decision: "approve" });
  await call("POST", `/api/ventures/${venture.id}/product-change-workspaces/${workspaceId}/revisions/${revisionId}/apply`, { confirm: true });

  const revertMissingConfirm = await call("POST", `/api/ventures/${venture.id}/product-change-workspaces/${workspaceId}/revisions/${revisionId}/revert`, {});
  assert.equal(revertMissingConfirm.status, 400);

  const revertRes = await call("POST", `/api/ventures/${venture.id}/product-change-workspaces/${workspaceId}/revisions/${revisionId}/revert`, { confirm: true });
  assert.equal(revertRes.status, 200);
  assert.equal(revertRes.body.revision.status, "reverted");
  assert.equal(fs.readFileSync(path.join(repoRoot, "a.txt"), "utf8"), "before\n");
});

test("the local founder page can discard a staged product change through the route", async () => {
  const { bet, file } = await stagedFixture();
  const discardMissingConfirm = await call("POST", `/api/ventures/${venture.id}/bets/${bet.id}/product-changes/${file}/discard`, {});
  assert.equal(discardMissingConfirm.status, 400);

  const discardRes = await call("POST", `/api/ventures/${venture.id}/bets/${bet.id}/product-changes/${file}/discard`, { confirm: true });
  assert.equal(discardRes.status, 200);
  assert.equal(discardRes.body.result.status, "discarded");
});
