import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assemblePortfolioGraph, summarizePortfolio } from "../src/portfolio-graph.mjs";
import { validateGraph } from "../src/graph-operations.mjs";

// A real composed system: source -> agent -> gate -> execute -> measure, with a feedback edge
// from measure back to the source (the loop closing). This is the shape the composer emits.
function system(id, { agentRef = "gtm-find-prospects" } = {}) {
  return {
    channel: { id, name: `${id} channel`, objective: `win via ${id}` },
    graph: {
      nodes: [
        { id: "src", category: "source", connector: "manual", label: "Seed", position: { x: 0, y: 0 }, config: { items: [] } },
        { id: "agent", kind: "agent", ref: agentRef, label: "Find", position: { x: 240, y: 0 }, config: {}, agentPrompt: "find" },
        { id: "gate", category: "gate", connector: "default", label: "Founder review", position: { x: 480, y: 0 }, config: {} },
        { id: "send", category: "execute", connector: "local", label: "Stage", position: { x: 720, y: 0 }, config: {} },
        { id: "measure", category: "measure", connector: "default", label: "Measure", position: { x: 960, y: 0 }, config: {} },
      ],
      edges: [
        { id: "e1", source: "src", target: "agent", edgeType: "data" },
        { id: "e2", source: "agent", target: "gate", edgeType: "data" },
        { id: "e3", source: "gate", target: "send", edgeType: "data" },
        { id: "e4", source: "send", target: "measure", edgeType: "data" },
        { id: "e5", source: "measure", target: "src", edgeType: "feedback" },
      ],
    },
  };
}

describe("portfolio fan-out — many systems, one legible diagram", () => {
  it("unions multiple composed systems into one valid graph with all gates preserved", () => {
    const graph = assemblePortfolioGraph({
      goal: "land a RodentRadar pilot",
      systems: [system("outbound"), system("referral", { agentRef: "gtm-vouch-request-message-drafter" })],
    });

    assert.equal(validateGraph(graph).ok, true);
    assert.equal(graph.kind, "portfolio");
    assert.equal(graph.nodes.length, 10, "two 5-node systems → 10 nodes");
    // Two distinct GTM systems in one artifact (check 5, engine side).
    assert.equal(graph.systems.length, 2);
    // Multiple founder gates survive the merge (check 6 — branching, multi-gate).
    assert.equal(graph.nodes.filter((n) => n.category === "gate").length, 2);
    assert.equal(graph.nodes.filter((n) => n.category === "execute").length, 2);
    // Every node carries its system tag so the canvas can cluster it.
    assert.ok(graph.nodes.every((n) => typeof n.system === "string" && n.systemLabel));
    // Feedback edges (the loop closing) are preserved, not dropped.
    assert.equal(graph.edges.filter((e) => e.edgeType === "feedback").length, 2);
  });

  it("namespaces ids so two systems with the same internal node ids never collide", () => {
    const graph = assemblePortfolioGraph({ goal: "g", systems: [system("a"), system("b")] });
    const ids = graph.nodes.map((n) => n.id);
    assert.equal(new Set(ids).size, ids.length, "all node ids unique after namespacing");
    assert.ok(ids.includes("a__gate") && ids.includes("b__gate"), "same internal id, different system namespace");
    // Edges were remapped to the namespaced ids — validateGraph already proved no dangling refs.
    assert.ok(graph.edges.every((e) => ids.includes(e.source) && ids.includes(e.target)));
  });

  it("stays legible at 15+ nodes — each system gets its own non-overlapping lane", () => {
    const graph = assemblePortfolioGraph({
      goal: "multi-motion launch",
      systems: [system("outbound"), system("referral"), system("attribution")],
    });
    assert.equal(graph.nodes.length, 15);
    // Lanes don't collapse onto each other: each system occupies a distinct y band.
    const ysBySystem = new Map();
    for (const n of graph.nodes) {
      if (!ysBySystem.has(n.system)) ysBySystem.set(n.system, n.position.y);
      assert.equal(ysBySystem.get(n.system), n.position.y, "a system's nodes share one lane y");
    }
    const laneYs = [...ysBySystem.values()].sort((a, b) => a - b);
    assert.equal(new Set(laneYs).size, 3, "three distinct lanes");
    for (let i = 1; i < laneYs.length; i += 1) {
      assert.ok(laneYs[i] - laneYs[i - 1] >= 200, "lanes are separated enough to read");
    }
  });

  it("re-asserts the wall on the union — an ungated send is rejected, not smuggled in", () => {
    const ungated = {
      channel: { id: "leak", name: "leak" },
      graph: {
        nodes: [
          { id: "src", category: "source", connector: "manual", label: "Seed", position: { x: 0, y: 0 }, config: {} },
          { id: "send", category: "execute", connector: "local", label: "Stage", position: { x: 240, y: 0 }, config: {} },
        ],
        edges: [{ id: "e1", source: "src", target: "send", edgeType: "data" }],
      },
    };
    assert.throws(() => assemblePortfolioGraph({ goal: "g", systems: [ungated] }), /not behind a founder gate/);
  });

  it("summarizePortfolio derives counts from the assembled graph, never seeded", () => {
    const graph = assemblePortfolioGraph({ goal: "g", systems: [system("a"), system("b")] });
    const summary = summarizePortfolio(graph);
    assert.equal(summary.systemCount, 2);
    assert.equal(summary.nodeCount, 10);
    assert.equal(summary.gateCount, 2);
    assert.equal(summary.executeCount, 2);
    assert.equal(summary.systems[0].gates, 1);
  });
});
