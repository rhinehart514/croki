// operator-gate-browser-only.test.mjs — the operator gate release is human-only AND browser-only.
//
// THE HOLE this closes (W2b): W2 made the raw graph-run path (POST /api/graph/run) browser-only — an
// approval must carry the browser-minted session cookie or it is refused 403. But the OPERATOR gate is a
// different endpoint (POST /api/operator/sessions/:id/gate) with a different auth model: it authorized only
// by team ROLE, which for a solo founder resolves to the founder and PASSES a header-less local request.
// That is the live send path (the operator drives to the gate), so an agent/raw-curl POST to it could
// approve without the browser. This proves that endpoint now also requires the session token on an approval.
//
// What this proves, over the real HTTP wiring (not a re-implementation):
//   - An operator-gate APPROVAL with NO session token is refused 403 and the session stays at the gate. [W2b]
//   - The founder's browser (holds the session cookie) approves — the operator gate clears. No new friction.
//   - The role wall is untouched: both guards hold together (defense in depth), tested in operator-team-gate.

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import net from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Isolate the durable home BEFORE importing the server, so every write lands in a temp dir and the
// in-process seeding below shares the exact store the HTTP handler reads.
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-operator-gate-browser-only-"));
process.env.GTM_IDE_HOME = HOME;
process.env.HOST = "127.0.0.1";

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

// The same store + runtime the server uses, resolved against the same GTM_IDE_HOME, so a session driven to
// the gate in-process is the one the HTTP handler resolves.
const { saveFlow } = await import("../src/flow-store.mjs");
const { loadProject, saveProject } = await import("../src/project-store.mjs");
const { createOperatorSession, getOperatorSession } = await import("../src/operator-store.mjs");
const { runOperatorSession } = await import("../src/operator-runtime.mjs");

after(async () => {
  await new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); });
  fs.rmSync(HOME, { recursive: true, force: true });
});

// Drives one model turn per response, like the anthropic adapter expects.
function fakeClient(responses) {
  let index = 0;
  return {
    messages: {
      async create() {
        const response = responses[index];
        index += 1;
        if (!response) throw new Error("Unexpected extra model turn.");
        return response;
      },
    },
  };
}

// A gated graph that stages one item at a founder gate: source(manual) → gate → execute(local) → measure.
// The execute connector stages locally and never sends, so releasing it here is safe and keyless.
function gatedGraph() {
  return {
    id: "operator-gate-browser-only-flow",
    name: "Operator gate flow",
    version: "1",
    nodes: [
      { id: "src", category: "source", connector: "manual", label: "Input", position: { x: 0, y: 0 }, config: { items: [{ id: "lead-1", name: "Ada" }] } },
      { id: "gate", category: "gate", connector: "default", label: "Founder review", position: { x: 200, y: 0 }, config: {} },
      { id: "out", category: "execute", connector: "local", label: "Stage output", position: { x: 400, y: 0 }, config: {} },
      { id: "meas", category: "measure", connector: "default", label: "Measure", position: { x: 600, y: 0 }, config: {} },
    ],
    edges: [
      { id: "e1", source: "src", target: "gate", edgeType: "data" },
      { id: "e2", source: "gate", target: "out", edgeType: "data" },
      { id: "e3", source: "out", target: "meas", edgeType: "data" },
    ],
  };
}

// What a real browser does on first contact: a GET lands the HttpOnly session cookie. Read it back and
// replay it as the Cookie header, exactly as the browser auto-sends it on the later approval POST.
async function browserSessionCookie() {
  const res = await fetch(`${base}/api/health`);
  const setCookie = typeof res.headers.getSetCookie === "function"
    ? res.headers.getSetCookie().join("; ")
    : (res.headers.get("set-cookie") ?? "");
  const match = setCookie.match(/gtm_session=[^;]+/);
  assert.ok(match, "the server issues a session cookie on a GET");
  return match[0];
}

// Seed a fresh operator session driven to the founder gate, in the server's own store.
async function sessionAtGate() {
  const graph = gatedGraph();
  saveFlow(graph, { root: HOME });
  const project = loadProject({ root: HOME, projectId: "default" });
  saveProject({
    ...project,
    channels: [
      ...(project.channels ?? []).filter((channel) => channel.graphId !== graph.id),
      { id: "operator-gate-browser-only-pipeline", graphId: graph.id, name: graph.name, objective: "Exercise browser-only gate release", kind: "custom", enabled: true },
    ],
  }, { root: HOME });
  const session = createOperatorSession(
    { goal: "Run to the gate.", graphId: graph.id, projectId: "default" },
    { root: HOME },
  );
  const paused = await runOperatorSession(session.id, {
    options: { root: HOME },
    client: fakeClient([{ content: [{ type: "tool_use", id: "run", name: "run_loop", input: {} }] }]),
  });
  assert.equal(paused.status, "waiting_for_gate", "the operator drove the graph to the founder gate");
  return paused.id;
}

async function resolveGateHttp({ sessionId, cookie }) {
  const headers = { "Content-Type": "application/json" };
  if (cookie) headers["Cookie"] = cookie;
  const res = await fetch(`${base}/api/operator/sessions/${sessionId}/gate`, {
    method: "POST",
    headers,
    body: JSON.stringify({ approvals: { gate: true } }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

describe("operator gate release is browser-only on POST /api/operator/sessions/:id/gate [W2b]", () => {
  it("rejects an approval with NO session token (403) — the raw-curl bypass — and leaves the gate intact", async () => {
    const sessionId = await sessionAtGate();
    const { status, body } = await resolveGateHttp({ sessionId });
    assert.equal(status, 403, "a token-less operator-gate approval is forbidden");
    assert.match(String(body.error), /browser session|Drover page/i);
    // The refused approval never claimed the gate: the session is still waiting, not stranded mid-claim.
    const still = getOperatorSession(sessionId, { root: HOME });
    assert.equal(still.status, "waiting_for_gate", "a refused approval leaves the session at the gate");
  });

  it("lets the founder's browser (holds the session cookie) approve — the operator gate clears", async () => {
    const sessionId = await sessionAtGate();
    const cookie = await browserSessionCookie();
    const { status, body } = await resolveGateHttp({ sessionId, cookie });
    assert.notEqual(status, 403, "the local founder holding the session cookie is never refused");
    assert.equal(status, 200);
    assert.ok(body.session && typeof body.session === "object", "the approval ran the gate-resume and returned the session");
    assert.notEqual(body.session.status, "waiting_for_gate", "the founder's approval cleared the gate");
  });
});
