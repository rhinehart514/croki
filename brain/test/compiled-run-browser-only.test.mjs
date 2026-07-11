// Compiled-run approvals use the same browser-only release wall as raw graph and operator approvals.

import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-compiled-run-browser-only-"));
process.env.GTM_IDE_HOME = HOME;
process.env.HOST = "127.0.0.1";
process.env.GTM_IDE_FOUNDER_CODE = "compiled-run-founder";

async function freePort() {
  const probe = net.createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

const PORT = await freePort();
process.env.PORT = String(PORT);

const { server } = await import("../src/server.mjs");
if (!server.listening) await once(server, "listening");
const base = `http://127.0.0.1:${PORT}`;

const { createProject, loadProject, saveProject } = await import("../src/project-store.mjs");
const { addMember, createTeam } = await import("../src/team-store.mjs");
const { gtmPathStore, runStore } = await import("../src/gtm-store.mjs");
const { compileRunFromPath, stableActionId } = await import("../src/run-compile.mjs");

const { activeProjectId: PROJECT_ID } = createProject({ id: "compiled-run-wall", name: "Compiled run wall" }, { root: HOME });
const TEAM = createTeam({ name: "Compiled run team", owner: { userId: "founder", name: "Founder" } }, { root: HOME });
addMember(TEAM.id, { userId: "viewer", name: "Viewer", role: "member" }, { root: HOME });
saveProject({ ...loadProject({ root: HOME, projectId: PROJECT_ID }), teamId: TEAM.id }, { root: HOME });

after(async () => {
  await new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); });
  fs.rmSync(HOME, { recursive: true, force: true });
});

function gatedComposer() {
  return async () => ({
    ok: true,
    nodes: [
      { id: "src", category: "source", connector: "manual", label: "Input" },
      { id: "gate", category: "gate", connector: "default", label: "Founder review" },
      { id: "out", category: "execute", connector: "local", label: "Stage output" },
    ],
    edges: [
      { source: "src", target: "gate", edgeType: "data" },
      { source: "gate", target: "out", edgeType: "data" },
    ],
  });
}

async function stagedRun() {
  const pathRecord = gtmPathStore.create(
    {
      projectId: PROJECT_ID,
      summary: "Stage one founder-reviewed action",
      bet: { buyer: "founders", channel: "direct", offer: "useful proof" },
      status: "selected",
    },
    { root: HOME },
  );
  const { run } = await compileRunFromPath({
    projectId: PROJECT_ID,
    pathId: pathRecord.id,
    compose: gatedComposer(),
    input: { items: [{ handle: "@founder", draft: "Prepared action" }] },
    options: { root: HOME },
  });
  return run;
}

function decisionsFor(run) {
  return { [stableActionId(run, run.items[0])]: { decision: "approve" } };
}

async function browserSessionCookie() {
  const response = await fetch(`${base}/api/founder-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: "compiled-run-founder" }),
  });
  const setCookie = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie().join("; ")
    : (response.headers.get("set-cookie") ?? "");
  const match = setCookie.match(/gtm_session=[^;]+/);
  assert.ok(match, "claiming the founder session with the one-time code issues the browser session cookie");
  return match[0];
}

async function approveHttp(run, cookie = null, userId = null) {
  const headers = { "Content-Type": "application/json" };
  if (cookie) headers.Cookie = cookie;
  if (userId) headers["x-gtm-user"] = userId;
  const response = await fetch(`${base}/api/projects/${PROJECT_ID}/runs/${run.id}/approve`, {
    method: "POST",
    headers,
    body: JSON.stringify({ decisions: decisionsFor(run) }),
  });
  return { status: response.status, body: await response.json() };
}

describe("compiled-run UI approval is browser-only", () => {
  it("rejects a normal per-item approval from a caller without the browser session", async () => {
    const run = await stagedRun();
    const response = await approveHttp(run);
    assert.equal(response.status, 403);
    assert.match(String(response.body.error), /browser session|Drover page/i);
    assert.equal(runStore.get(run.id, { root: HOME, projectId: PROJECT_ID }).status, "staged");
  });

  it("lets the browser session release the same normal per-item approval payload", async () => {
    const run = await stagedRun();
    const response = await approveHttp(run, await browserSessionCookie(), "founder");
    assert.equal(response.status, 200);
    assert.equal(response.body.run.status, "completed");
    assert.equal(response.body.run.gateState.status, "approved");
  });

  it("rejects a browser member and a foreign-project actor before changing compiled-run state", async () => {
    const cookie = await browserSessionCookie();
    const memberRun = await stagedRun();
    const member = await approveHttp(memberRun, cookie, "viewer");
    assert.equal(member.status, 403);
    assert.match(member.body.error, /cannot release|owner or approver/i);
    assert.equal(runStore.get(memberRun.id, { root: HOME, projectId: PROJECT_ID }).status, "staged");

    const foreignRun = await stagedRun();
    const foreign = await approveHttp(foreignRun, cookie, "other-project-owner");
    assert.equal(foreign.status, 403);
    assert.equal(runStore.get(foreignRun.id, { root: HOME, projectId: PROJECT_ID }).status, "staged");
  });
});
