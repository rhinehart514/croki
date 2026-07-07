// gate-mcp-approval.test.mjs — the founder gate is human-only AND browser-only on the raw graph-run path.
//
// THE HOLE this closes (two layers, defense in depth):
//   A4: the MCP tool approve_workflow_gate (mcp.mjs) posted `approvals: { nodeId: true }` to
//       POST /api/graph/run, and that route ran the graph WITHOUT a release-authority guard — so an agent
//       could approve its own gate and release a send. mcp.mjs now stamps every request `x-gtm-actor: agent`,
//       and the route supplies authorizeRelease, which refuses an approval carrying that stamp.
//   W2: that guard trusted the agent to incriminate itself with the header. A capable agent with raw
//       loopback HTTP could POST an approval with NO header and be treated as the founder. The route now
//       also requires the browser-minted session token (an HttpOnly cookie the served page holds); a
//       header-less request that never loaded a page carries no token and is refused — INDEPENDENT of the
//       agent header.
//
// What this proves, over the real HTTP wiring (not a re-implementation):
//   - An agent-originated APPROVAL (x-gtm-actor: agent) is rejected 403 and nothing releases. [A4]
//   - A raw approval with NO session token and NO agent header is rejected 403 — the raw-curl bypass. [W2]
//   - The founder's browser (holds the session cookie, no agent header) approves — the canvas gate works.
//   - An agent, or any caller, may still RUN a graph to a gate (no approval intent) with no token — only
//     the approval is refused.

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import net from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Isolate the durable home BEFORE importing the server, so every write lands in a temp dir.
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-gate-mcp-approval-"));
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

after(() => {
  server.close();
  fs.rmSync(HOME, { recursive: true, force: true });
});

// What a real browser does on first contact: a GET lands the HttpOnly session cookie. We read it back and
// replay it as the Cookie header, exactly as the browser auto-sends it on the later approval POST. Uses
// /api/health so it works regardless of whether the UI bundle is built (the cookie is issued on every GET).
async function browserSessionCookie() {
  const res = await fetch(`${base}/api/health`);
  const setCookie = typeof res.headers.getSetCookie === "function"
    ? res.headers.getSetCookie().join("; ")
    : (res.headers.get("set-cookie") ?? "");
  const match = setCookie.match(/gtm_session=[^;]+/);
  assert.ok(match, "the server issues a session cookie on a GET");
  return match[0];
}

// A gated graph that lands one staged item at a founder gate: source(manual) → gate → execute(local) →
// measure. The execute connector stages locally and never sends, so releasing it here is safe.
function gatedGraph() {
  return {
    id: "gate-mcp-approval-flow",
    name: "Gate approval flow",
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

async function runGraphHttp({ graph, approvals, agent, cookie }) {
  const headers = { "Content-Type": "application/json" };
  if (agent) headers["x-gtm-actor"] = "agent";
  if (cookie) headers["Cookie"] = cookie;
  const res = await fetch(`${base}/api/graph/run`, {
    method: "POST",
    headers,
    body: JSON.stringify({ graph, approvals: approvals ?? {} }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

describe("founder gate is human-only AND browser-only on POST /api/graph/run", () => {
  it("rejects an agent/MCP-originated gate approval (403) and releases nothing [A4]", async () => {
    const { status, body } = await runGraphHttp({
      graph: gatedGraph(),
      approvals: { gate: true },
      agent: true,
    });
    assert.equal(status, 403, "an agent-originated approval is forbidden");
    assert.match(String(body.error), /human-only|cannot approve/i);
    // The run did not proceed to a completed result — no per-node results leaked past the refused guard.
    assert.equal(body.nodes, undefined, "the run body is the error, not a run result");
  });

  it("rejects a raw approval with NO session token and NO agent header (403) — the raw-curl bypass [W2]", async () => {
    const { status, body } = await runGraphHttp({
      graph: gatedGraph(),
      approvals: { gate: true },
      // No agent stamp, no cookie: the header-less raw loopback POST.
    });
    assert.equal(status, 403, "a header-less, token-less approval is forbidden");
    assert.match(String(body.error), /browser session|Drover page/i);
    assert.equal(body.nodes, undefined, "nothing released — the run body is the error, not a run result");
  });

  it("lets the founder's browser (holds the session cookie, no agent stamp) approve — no new friction", async () => {
    const cookie = await browserSessionCookie();
    const { status, body } = await runGraphHttp({
      graph: gatedGraph(),
      approvals: { gate: true },
      agent: false,
      cookie,
    });
    assert.notEqual(status, 403, "the local founder is never refused");
    assert.equal(status, 200);
    // The approval was honored: the run executed the graph (a real run result, not the 403 error body).
    assert.ok(body.nodes && typeof body.nodes === "object", "the founder's approval ran the graph");
  });

  it("still lets a caller RUN a graph to a gate with no token — only the approval is refused", async () => {
    const { status, body } = await runGraphHttp({
      graph: gatedGraph(),
      approvals: {},
      agent: true,
      // No cookie: a non-approval run is unaffected by the session-token requirement.
    });
    assert.equal(status, 200, "a run with no approval intent is allowed");
    assert.ok(Array.isArray(body.pendingGates) && body.pendingGates.includes("gate"), "the run reached the founder gate");
  });
});
