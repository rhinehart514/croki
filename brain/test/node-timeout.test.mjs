import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runGraph } from "../src/graph.mjs";

// Runaway-work safety net #1: the run-level watchdog. A single hanging node (a stuck connector or a
// fetch that never resolves) must not hang the entire run — it must fail HONESTLY at the per-node
// ceiling and let the run finish, so downstream is blocked exactly as for any other failure.

const hangGraph = () => ({
  id: "g",
  name: "watchdog",
  nodes: [
    { id: "hang", kind: "agent", ref: "hang", category: "generate", label: "Stuck step", position: { x: 0, y: 0 }, config: {} },
    { id: "after", kind: "agent", ref: "after", category: "generate", label: "Downstream step", position: { x: 1, y: 0 }, config: {} },
  ],
  edges: [{ id: "e1", source: "hang", target: "after", edgeType: "data" }],
});

describe("runGraph — per-node watchdog", () => {
  it("a node that exceeds the timeout resolves to an honest failure, not a hang", async () => {
    let downstreamRan = false;
    const stepRuntime = {
      // Never resolves — this is the runaway node the watchdog must stop waiting on.
      agent: async (node) => {
        if (node.id === "after") { downstreamRan = true; return { ok: true, items: [] }; }
        return new Promise(() => {});
      },
    };

    const started = Date.now();
    // A real hang would never return; a generous real ceiling would take minutes. Bound it tightly so
    // the test proves the mechanism fast. The run MUST settle well under a real timeout.
    const result = await Promise.race([
      runGraph(hangGraph(), { stepRuntime, nodeTimeoutMs: 40 }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("runGraph hung past the watchdog")), 5000)),
    ]);
    const elapsed = Date.now() - started;

    const stuck = result.nodes.hang;
    assert.equal(stuck.ok, false, "the stuck node must report failure");
    assert.equal(stuck.timedOut, true, "the stuck node must be flagged as timed out");
    assert.match(stuck.error, /longer than/i, "the failure note must explain it ran too long");
    assert.equal(result.ok, false, "a timed-out node must make the whole run fail");
    assert.equal(downstreamRan, false, "the downstream step must not run after an upstream timeout");
    assert.ok(result.nodes.after?.blocked, "downstream must be blocked by the failed upstream");
    assert.ok(elapsed < 4000, `run should finish near the timeout, took ${elapsed}ms`);
  });

  it("a fast node under the ceiling is unaffected (no false timeout)", async () => {
    const stepRuntime = { agent: async () => ({ ok: true, items: [{ id: "x" }] }) };
    const result = await runGraph(hangGraph(), { stepRuntime, nodeTimeoutMs: 5000 });
    assert.equal(result.nodes.hang.ok, true);
    assert.notEqual(result.nodes.hang.timedOut, true);
    assert.equal(result.nodes.after.ok, true);
  });

  it("a non-positive timeout disables the ceiling (unbounded, prior behavior)", async () => {
    const stepRuntime = { agent: async () => ({ ok: true, items: [] }) };
    const result = await runGraph(hangGraph(), { stepRuntime, nodeTimeoutMs: 0 });
    assert.equal(result.nodes.hang.ok, true);
    assert.notEqual(result.nodes.hang.timedOut, true);
  });
});
