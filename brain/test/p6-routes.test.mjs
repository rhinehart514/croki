// P6 founder-facing routes (server.mjs): channel autonomy promote/revoke, the "which flows need you"
// projection, and the microproduct build-and-ship door. All three are FOUNDER acts behind the Wall:
//   - promote/revoke set the per-channel autonomy ladder, and promote refuses a missing blessed pattern
//     and a promote-to-draft (that is revoke's job) — autonomy is ONLY ever set by an explicit founder act.
//   - needs-you is the strictly READ-ONLY read side of the gate (paused sessions), never an approve path.
//   - microproduct delegates to the operator compose_microproduct path; it REQUIRES a goal (the founder
//     input the door represents) and stages behind the gate — it never deploys. Here we cover its guard,
//     since a real build invokes the subscription producer.
//
// Boots the real route handler on an ephemeral port against an isolated store root, so this exercises the
// actual HTTP wiring, not a re-implementation.

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import net from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Isolate the durable home BEFORE importing the server (and the stores), so every write lands in a temp
// dir that the routes and the test seed share.
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-p6-routes-"));
process.env.GTM_IDE_HOME = HOME;
process.env.HOST = "127.0.0.1";
process.env.GTM_IDE_FOUNDER_CODE = "p6-test-founder";

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

const { createChannel, getChannel, loadProject } = await import("../src/project-store.mjs");
const { createOperatorSession, saveOperatorSession, getOperatorSession } = await import("../src/operator-store.mjs");
const { server } = await import("../src/server.mjs");

if (!server.listening) await once(server, "listening");

const base = `http://127.0.0.1:${PORT}`;
const PROJECT = "default"; // the starter project always exists

async function browserCookie() {
  const response = await fetch(`${base}/api/founder-session`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: "p6-test-founder" }),
  });
  return (response.headers.get("set-cookie") ?? "").match(/gtm_session=[^;]+/)?.[0] ?? "";
}

after(() => {
  server.close();
  fs.rmSync(HOME, { recursive: true, force: true });
});

let channelId;
before(() => {
  // A channel carries a saved flow (createFlowChannel writes it), so promote can stamp the gate nodes.
  const { channel } = createChannel({ name: "Pilot outreach", objective: "land 5 pilots" }, { projectId: PROJECT });
  channelId = channel.id;
});

describe("project canvas layout authority", () => {
  it("requires revisioned idempotent writes and rejects stale placement", async () => {
    const endpoint = `${base}/api/projects/${PROJECT}/canvas-layout`;
    const missing = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ positions: { "anchor:goal:g1": { x: 1, y: 2 } } }),
    });
    assert.equal(missing.status, 400);

    const firstBody = {
      positions: { "anchor:goal:g1": { x: 1, y: 2 } },
      expectedRevision: 0,
      idempotencyKey: "route-drag-g1",
    };
    const first = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(firstBody),
    });
    assert.equal(first.status, 200);
    assert.equal((await first.json()).geometry.revision, 1);

    const retry = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(firstBody),
    });
    assert.equal(retry.status, 200);
    assert.equal((await retry.json()).geometry.revision, 1);

    const stale = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        positions: { "anchor:goal:g2": { x: 3, y: 4 } },
        expectedRevision: 0,
        idempotencyKey: "route-drag-g2",
      }),
    });
    assert.equal(stale.status, 409);
    const conflict = await stale.json();
    assert.equal(conflict.code, "CANVAS_LAYOUT_CONFLICT");
    assert.equal(conflict.actualRevision, 1);
  });
});

describe("channel autonomy — the founder ladder", () => {
  it("promotes a channel up the ladder behind a blessed pattern", async () => {
    const res = await fetch(`${base}/api/projects/${PROJECT}/channels/${channelId}/promote`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: await browserCookie() },
      body: JSON.stringify({ autonomy: "trusted", blessedPattern: { rule: "founders at dev-tool startups", note: "looks clean" } }),
    });
    assert.equal(res.status, 200);
    const { channel } = await res.json();
    assert.equal(channel.autonomy, "trusted");
    assert.ok(channel.blessedPattern, "promotion banks a standing blessed pattern on the channel");
    // Durable: the channel record carries the founder's promotion.
    const stored = getChannel(loadProject({ projectId: PROJECT }), channelId);
    assert.equal(stored.autonomy, "trusted");
  });

  it("refuses to promote without a blessed pattern (founder input is required)", async () => {
    const res = await fetch(`${base}/api/projects/${PROJECT}/channels/${channelId}/promote`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: await browserCookie() },
      body: JSON.stringify({ autonomy: "autonomous" }),
    });
    assert.equal(res.status, 400);
    const { error } = await res.json();
    assert.match(error, /blessed pattern/i);
  });

  it("refuses a promote-to-draft (that is revoke's job)", async () => {
    const res = await fetch(`${base}/api/projects/${PROJECT}/channels/${channelId}/promote`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: await browserCookie() },
      body: JSON.stringify({ autonomy: "draft", blessedPattern: { rule: "x" } }),
    });
    assert.equal(res.status, 400);
    const { error } = await res.json();
    assert.match(error, /revoke/i);
  });

  it("revokes a channel back to draft in one call, clearing the standing pattern", async () => {
    const res = await fetch(`${base}/api/projects/${PROJECT}/channels/${channelId}/revoke`, { method: "POST", headers: { cookie: await browserCookie() } });
    assert.equal(res.status, 200);
    const { channel } = await res.json();
    assert.equal(channel.autonomy, "draft");
    assert.equal(channel.blessedPattern, null);
  });
});

describe("needs-you — the read side of the Wall", () => {
  it("surfaces a session paused at a founder gate, ordered and read-only", async () => {
    const session = createOperatorSession({ goal: "draft 5 pilot emails", projectId: PROJECT });
    saveOperatorSession({
      ...session,
      status: "waiting_for_gate",
      graphId: "pilot-flow",
      lastRunId: "run-1",
      pendingGate: { graphId: "pilot-flow", runId: "run-1", nodeIds: ["gate-1"] },
    });

    const res = await fetch(`${base}/api/projects/${PROJECT}/needs-you`);
    assert.equal(res.status, 200);
    const { projectId, flows } = await res.json();
    assert.equal(projectId, PROJECT);
    const mine = flows.find((f) => f.sessionId === session.id);
    assert.ok(mine, "the gate-paused session surfaces in needs-you");
    assert.deepEqual(mine.gateNodeIds, ["gate-1"]);
    assert.equal(mine.label, "draft 5 pilot emails");

    // Strictly read-only: the projection does not advance the session past the gate.
    assert.equal(getOperatorSession(session.id).status, "waiting_for_gate");
  });

  it("does not surface a session that is not paused at a gate", async () => {
    const running = createOperatorSession({ goal: "still working", projectId: PROJECT });
    saveOperatorSession({ ...running, status: "running" });
    const res = await fetch(`${base}/api/projects/${PROJECT}/needs-you`);
    const { flows } = await res.json();
    assert.ok(!flows.some((f) => f.sessionId === running.id));
  });
});

describe("microproduct — the build-and-ship door", () => {
  it("refuses a build with no goal (the founder input the deploy door represents)", async () => {
    const res = await fetch(`${base}/api/projects/${PROJECT}/microproduct`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Landing page" }),
    });
    assert.equal(res.status, 400);
    const { error } = await res.json();
    assert.match(error, /goal/i);
  });

  it("exposes no route that deploys without the founder act — there is no deploy door here", async () => {
    // The door stages behind the gate; there is deliberately no deploy/ship endpoint here — the deploy is
    // a separate founder confirmation at the gate, not an HTTP route. An unmatched path is never a success.
    const res = await fetch(`${base}/api/projects/${PROJECT}/microproduct/deploy`, { method: "POST" });
    assert.ok(res.status >= 400, "there is no deploy endpoint — the request is not a success");
    assert.notEqual(res.status, 200);
    assert.notEqual(res.status, 202);
  });
});
