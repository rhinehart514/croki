// gate-mcp-approval.test.mjs — the founder gate is human-only on the raw graph-run path.
//
// THE HOLE this closes: the MCP tool approve_workflow_gate (mcp.mjs) posted `approvals: { nodeId: true }`
// to POST /api/graph/run, and that route ran the graph WITHOUT a release-authority guard — so an agent
// could approve its own gate and release a send. mcp.mjs now stamps every request `x-gtm-actor: agent`,
// and the route supplies authorizeRelease, which refuses an approval carrying that stamp.
//
// What this proves, over the real HTTP wiring (not a re-implementation):
//   - An agent-originated APPROVAL (x-gtm-actor: agent + approvals) is rejected 403 and nothing releases.
//   - The founder's browser (no such header) approves unchanged — the local canvas gate keeps working.
//   - An agent may still RUN a graph to a gate (no approval intent) — only the approval is refused.

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

async function runGraphHttp({ graph, approvals, agent }) {
  const headers = { "Content-Type": "application/json" };
  if (agent) headers["x-gtm-actor"] = "agent";
  const res = await fetch(`${base}/api/graph/run`, {
    method: "POST",
    headers,
    body: JSON.stringify({ graph, approvals: approvals ?? {} }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

describe("founder gate is human-only on POST /api/graph/run", () => {
  it("rejects an agent/MCP-originated gate approval (403) and releases nothing", async () => {
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

  it("lets the founder's browser (no agent stamp) approve unchanged — no new friction", async () => {
    const { status, body } = await runGraphHttp({
      graph: gatedGraph(),
      approvals: { gate: true },
      agent: false,
    });
    assert.notEqual(status, 403, "the local founder is never refused");
    assert.equal(status, 200);
    // The approval was honored: the run executed the graph (a real run result, not the 403 error body).
    assert.ok(body.nodes && typeof body.nodes === "object", "the founder's approval ran the graph");
  });

  it("still lets an agent RUN a graph to a gate — only the approval is refused", async () => {
    const { status, body } = await runGraphHttp({
      graph: gatedGraph(),
      approvals: {},
      agent: true,
    });
    assert.equal(status, 200, "an agent run with no approval intent is allowed");
    assert.ok(Array.isArray(body.pendingGates) && body.pendingGates.includes("gate"), "the run reached the founder gate");
  });
});
