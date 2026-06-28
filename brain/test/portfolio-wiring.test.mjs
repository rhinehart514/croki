import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assemblePortfolioGraph, summarizePortfolio } from "../src/portfolio-graph.mjs";

// Build the reverse adjacency (target → [sources]) over non-feedback edges — the same lens the wall
// uses. Then "is `nodeId` reachable backward from `exec`" answers "is there a gate upstream".
function incomingMap(edges) {
  const incoming = new Map();
  for (const edge of edges) {
    if (edge.edgeType === "feedback") continue;
    if (!incoming.has(edge.target)) incoming.set(edge.target, []);
    incoming.get(edge.target).push(edge.source);
  }
  return incoming;
}

function reachesUpstream(execId, incoming, isTarget) {
  const seen = new Set();
  const stack = [...(incoming.get(execId) ?? [])];
  while (stack.length) {
    const id = stack.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    if (isTarget(id)) return true;
    stack.push(...(incoming.get(id) ?? []));
  }
  return false;
}

// E5.1 — portfolio wiring (non-live parts only). Several channels with DIFFERENT import sources
// (a provided/connector source and a discovered/self-sourcing agent source) union into ONE branching,
// multi-gate graph. The wall — every execute behind a founder gate on every path — is re-asserted on
// the union. And the consolidated-queue mode folds every per-channel gate into ONE founder approval
// queue. We test assemblePortfolioGraph directly with fixture channel specs; the live model that
// produces those specs is deferred and not exercised here.

// A PROVIDED-source system: a founder-controlled connector source feeds an agent, a gate, an execute.
function providedSystem(id, name) {
  return {
    channel: { id, name, objective: `provided ${name}` },
    graph: {
      nodes: [
        { id: "src", category: "source", connector: "csv", mode: "provided", label: "CSV import", config: {} },
        { id: "work", kind: "agent", ref: "gtm-first-contact-drafting", label: "Draft", config: {} },
        { id: "gate", category: "gate", connector: "default", label: "Founder review", config: {} },
        { id: "send", category: "execute", connector: "local", label: "Stage send", config: {} },
      ],
      edges: [
        { source: "src", target: "work", edgeType: "data" },
        { source: "work", target: "gate", edgeType: "data" },
        { source: "gate", target: "send", edgeType: "data" },
      ],
    },
  };
}

// A DISCOVERED-source system: an agent self-sources (no connector), then gate, then execute.
function discoveredSystem(id, name) {
  return {
    channel: { id, name, objective: `discovered ${name}` },
    graph: {
      nodes: [
        { id: "find", kind: "agent", category: "source", ref: "gtm-find-prospects", label: "Discover", config: {} },
        { id: "gate", category: "gate", connector: "default", label: "Founder review", config: {} },
        { id: "send", category: "execute", connector: "local", label: "Stage send", config: {} },
      ],
      edges: [
        { source: "find", target: "gate", edgeType: "data" },
        { source: "gate", target: "send", edgeType: "data" },
      ],
    },
  };
}

describe("assemblePortfolioGraph — N channels, mixed source modes, one union", () => {
  it("unions provided + discovered source channels into one branching, multi-gate graph", () => {
    const graph = assemblePortfolioGraph({
      goal: "land pilots",
      systems: [providedSystem("outbound", "Outbound"), discoveredSystem("inbound", "Inbound"), providedSystem("events", "Events")],
    });

    assert.equal(graph.kind, "portfolio");
    assert.equal(graph.systems.length, 3, "all three channels union as distinct systems");
    // Both import modes survive: a csv (provided) source and a self-sourcing agent source coexist.
    assert.ok(graph.nodes.some((n) => n.category === "source" && n.connector === "csv"), "provided source preserved");
    assert.ok(graph.nodes.some((n) => n.kind === "agent" && n.category === "source"), "discovered agent source preserved");
    // ids are namespaced so the two systems' identically-named nodes never collide.
    assert.equal(new Set(graph.nodes.map((n) => n.id)).size, graph.nodes.length, "no id collisions across lanes");
    // Default (non-consolidated) behavior: each system keeps its own founder gate.
    assert.equal(graph.nodes.filter((n) => n.category === "gate").length, 3);
    assert.notEqual(graph.consolidatedGate, true);
  });

  it("keeps a founder gate before EVERY execute on the union (the wall holds)", () => {
    const graph = assemblePortfolioGraph({
      goal: "land pilots",
      systems: [providedSystem("a", "A"), discoveredSystem("b", "B")],
    });
    const gateIds = new Set(graph.nodes.filter((n) => n.category === "gate").map((n) => n.id));
    const incoming = incomingMap(graph.edges);
    for (const exec of graph.nodes.filter((n) => n.category === "execute")) {
      assert.ok(reachesUpstream(exec.id, incoming, (id) => gateIds.has(id)), `execute ${exec.id} is behind a founder gate`);
    }
  });

  it("rejects a wall-violating channel set — an ungated execute anywhere kills the whole union", () => {
    const ungated = {
      channel: { id: "rogue", name: "Rogue", objective: "no gate" },
      graph: {
        nodes: [
          { id: "src", category: "source", connector: "manual", label: "Seed", config: {} },
          { id: "send", category: "execute", connector: "local", label: "Send", config: {} }, // no gate upstream
        ],
        edges: [{ source: "src", target: "send", edgeType: "data" }],
      },
    };
    assert.throws(
      () => assemblePortfolioGraph({ goal: "land pilots", systems: [providedSystem("ok", "OK"), ungated] }),
      /founder gate/i,
    );
  });
});

describe("assemblePortfolioGraph — consolidated approval queue (consolidateGate)", () => {
  it("folds every per-channel gate into ONE shared founder gate that still gates every execute", () => {
    const graph = assemblePortfolioGraph({
      goal: "land pilots",
      systems: [providedSystem("outbound", "Outbound"), discoveredSystem("inbound", "Inbound"), providedSystem("events", "Events")],
      consolidateGate: true,
    });

    const gates = graph.nodes.filter((n) => n.category === "gate");
    assert.equal(gates.length, 1, "three channels, ONE consolidated approval queue");
    assert.equal(gates[0].consolidated, true);
    assert.equal(graph.consolidatedGate, true);

    // Every execute still funnels through the single shared gate — the wall is preserved, not weakened.
    const sharedGateId = gates[0].id;
    const incoming = incomingMap(graph.edges);
    const executes = graph.nodes.filter((n) => n.category === "execute");
    assert.equal(executes.length, 3, "each channel still has its own staged send");
    for (const exec of executes) {
      assert.ok(reachesUpstream(exec.id, incoming, (id) => id === sharedGateId), `execute ${exec.id} routes through the one shared gate`);
    }

    // The manifest points every system at the shared gate, and the summary reports the consolidation.
    for (const system of graph.systems) assert.deepEqual(system.gateIds, [sharedGateId]);
    assert.equal(summarizePortfolio(graph).consolidatedGate, true);
    assert.equal(summarizePortfolio(graph).gateCount, 1);
  });

  it("the consolidated union still rejects a wall-violating channel (a gateless execute lane)", () => {
    const ungated = {
      channel: { id: "rogue", name: "Rogue", objective: "no gate" },
      graph: {
        nodes: [
          { id: "src", category: "source", connector: "manual", label: "Seed" },
          { id: "send", category: "execute", connector: "local", label: "Send" },
        ],
        edges: [{ source: "src", target: "send", edgeType: "data" }],
      },
    };
    // The rogue lane has no gate to consolidate, so its execute stays ungated and the wall rejects it.
    assert.throws(
      () => assemblePortfolioGraph({ goal: "land pilots", systems: [providedSystem("ok", "OK"), ungated], consolidateGate: true }),
      /founder gate/i,
    );
  });
});
