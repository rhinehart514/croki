import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runGraph } from "../src/graph.mjs";
import { makeStepRuntime } from "../src/step-runners.mjs";
import {
  SOURCE_MODES,
  sourceMode,
  sourceStandsOnData,
  resolveEntry,
  entryIsDiscovered,
  relaxGateContracts,
  relaxDiscoveryChainContracts,
} from "../src/source-entry.mjs";

// The two source modes are BOTH first-class: a provided (connector-backed) source the founder
// seeds, and a discovered (agent) source that self-sources. The mode is decided VISIBLY at compose
// time and never silently rewritten at run time. These tests pin both paths and the domain rules
// that keep them honest.

function provided(id, items) {
  return { id, category: "source", connector: "manual", label: "Seed", position: { x: 0, y: 0 }, config: { items } };
}
function gate(id) {
  return { id, category: "gate", connector: "default", label: "Founder review", position: { x: 400, y: 0 }, config: {} };
}

describe("source mode — derived from shape, can never lie", () => {
  it("a connector source is provided; an agent source is discovered", () => {
    assert.equal(sourceMode({ category: "source", connector: "manual" }), SOURCE_MODES.PROVIDED);
    assert.equal(sourceMode({ category: "source", kind: "agent", ref: "gtm-find-prospects" }), SOURCE_MODES.DISCOVERED);
  });
  it("a stray mode label cannot override the shape (a connector node stays provided)", () => {
    const lying = { category: "source", connector: "manual", mode: SOURCE_MODES.DISCOVERED, config: { items: [] } };
    assert.equal(sourceMode(lying), SOURCE_MODES.PROVIDED);
    assert.equal(sourceStandsOnData(lying), false); // still empty, still not self-sourcing
  });
});

describe("source stands-on-data — the one predicate", () => {
  it("provided: true only when actually configured", () => {
    assert.equal(sourceStandsOnData(provided("s", [])), false);
    assert.equal(sourceStandsOnData(provided("s", [{ id: "a" }])), true);
    assert.equal(sourceStandsOnData({ category: "source", connector: "csv", config: { csv: "a,b\n1,2" } }), true);
    assert.equal(sourceStandsOnData({ category: "source", connector: "csv", config: { csv: "   " } }), false);
    assert.equal(sourceStandsOnData({ category: "source", connector: "api", config: { endpoint: "https://x" } }), true);
    assert.equal(sourceStandsOnData({ category: "source", connector: "api", config: {} }), false);
  });
  it("discovered: always true (it self-sources)", () => {
    assert.equal(sourceStandsOnData({ category: "source", kind: "agent", ref: "gtm-find-prospects", config: {} }), true);
  });
});

describe("resolveEntry — decides the mode visibly at compose time", () => {
  const agents = [{ ref: "gtm-find-prospects", title: "Find", objective: "find operators" }];

  it("with concrete input, keeps the provided source", () => {
    const { nodes } = resolveEntry({ nodes: [provided("s", [{ id: "a" }]), gate("g")], edges: [], agents, hasInput: true });
    const s = nodes.find((n) => n.id === "s");
    assert.equal(s.kind ?? "tool", "tool");
    assert.equal(sourceMode(s), SOURCE_MODES.PROVIDED);
  });

  it("no input + a downstream agent: drops the empty source and promotes the agent to the discovered entry", () => {
    const nodesIn = [
      provided("s", []),
      { id: "a", kind: "agent", ref: "gtm-find-prospects", label: "Find", config: {}, contract: { accepts: ["seed"], minItems: 1 } },
      gate("g"),
    ];
    const edgesIn = [
      { id: "e1", source: "s", target: "a", edgeType: "data" },
      { id: "e2", source: "a", target: "g", edgeType: "data" },
    ];
    const { nodes, edges } = resolveEntry({ nodes: nodesIn, edges: edgesIn, agents, hasInput: false });
    assert.equal(nodes.find((n) => n.id === "s"), undefined, "empty connector source is dropped");
    const a = nodes.find((n) => n.id === "a");
    assert.equal(sourceMode(a), SOURCE_MODES.DISCOVERED);
    assert.equal(a.contract.minItems, 0, "the promoted entry runs on zero upstream items");
    assert.match(a.agentPrompt, /DISCOVERY entry/);
    assert.ok(!edges.some((e) => e.source === "s" && e.target === "a"), "the dead source→agent edge is gone");
  });

  it("no input + no downstream agent: converts the source node itself into a discovered agent source", () => {
    const { nodes } = resolveEntry({ nodes: [provided("s", []), gate("g")], edges: [{ id: "e", source: "s", target: "g", edgeType: "data" }], agents, hasInput: false });
    const s = nodes.find((n) => n.id === "s");
    assert.equal(s.kind, "agent");
    assert.equal(s.ref, "gtm-find-prospects");
    assert.equal(s.connector, undefined, "the connector is stripped");
    assert.equal(sourceMode(s), SOURCE_MODES.DISCOVERED);
  });

  it("no input, nothing to discover with: leaves it provided (the founder will configure the seed)", () => {
    const { nodes } = resolveEntry({ nodes: [provided("s", []), gate("g")], edges: [], agents: [], hasInput: false });
    const s = nodes.find((n) => n.id === "s");
    assert.equal(sourceMode(s), SOURCE_MODES.PROVIDED);
  });
});

describe("entryIsDiscovered — precise, not fooled by a mid-chain agent", () => {
  it("a provided graph with an agent in the middle is NOT a discovered entry", () => {
    const nodes = [provided("s", [{ id: "a" }]), { id: "m", kind: "agent", ref: "gtm-enrich" }, gate("g")];
    const edges = [
      { source: "s", target: "m", edgeType: "data" },
      { source: "m", target: "g", edgeType: "data" },
    ];
    assert.equal(entryIsDiscovered(nodes, edges), false);
  });
  it("an agent data-root with no source is a discovered entry", () => {
    const nodes = [{ id: "a", kind: "agent", ref: "gtm-find-prospects" }, gate("g")];
    const edges = [{ source: "a", target: "g", edgeType: "data" }];
    assert.equal(entryIsDiscovered(nodes, edges), true);
  });

  it("a discovered agent entry is not vetoed by an auxiliary provided source on a parallel loop", () => {
    // The shape that shipped broken: the gate path begins at a discovered agent (decision-maker
    // research), while a separate provided manual source (inbound replies) feeds a parallel
    // learning branch that never reaches the gate. The provided source must not shadow discovery.
    const nodes = [
      { id: "find", kind: "agent", ref: "gtm-pco-decision-maker-research-agent", mode: "discovered" },
      { id: "draft", kind: "agent", ref: "gtm-outreach" },
      gate("g"),
      provided("replies", [{ id: "r1" }]),
      { id: "learn", kind: "agent", ref: "gtm-conversation-learning-agent" },
      { id: "measure", category: "measure" },
    ];
    const edges = [
      { source: "find", target: "draft", edgeType: "data" },
      { source: "draft", target: "g", edgeType: "data" },
      { source: "g", target: "measure", edgeType: "data" },
      { source: "replies", target: "learn", edgeType: "data" },
      { source: "learn", target: "measure", edgeType: "data" },
    ];
    assert.equal(entryIsDiscovered(nodes, edges), true);
  });
});

describe("contract relaxation — gate always, discovery chain only when discovered", () => {
  it("relaxGateContracts clears the gate's field contract and a post-gate execute, leaves measure", () => {
    const nodes = [
      { id: "draft", kind: "agent", ref: "x", contract: { accepts: ["personalFact"], emits: ["body"] } },
      { id: "g", category: "gate", contract: { accepts: ["decisionMaker"], emits: ["approved"], minItems: 1 } },
      { id: "send", category: "execute", contract: { accepts: ["to"], emits: ["messageId"] } },
      { id: "meas", category: "measure", contract: { accepts: ["sourceTag"], emits: ["attributed"] } },
    ];
    const edges = [
      { source: "draft", target: "g", edgeType: "data" },
      { source: "g", target: "send", edgeType: "data" },
      { source: "send", target: "meas", edgeType: "data" },
    ];
    const out = relaxGateContracts(nodes, edges);
    const byId = Object.fromEntries(out.map((n) => [n.id, n]));
    assert.deepEqual(byId.g.contract, { accepts: [], emits: [], minItems: 1 });
    assert.deepEqual(byId.send.contract, { accepts: [], emits: [] });
    assert.deepEqual(byId.meas.contract.accepts, ["sourceTag"], "measure keeps its contract (stays honestly blind)");
    assert.deepEqual(byId.draft.contract.accepts, ["personalFact"], "pre-gate draft is untouched by gate relaxation");
  });

  it("relaxDiscoveryChainContracts clears pre-gate agent field contracts (best-effort discovery)", () => {
    const nodes = [
      { id: "find", kind: "agent", ref: "x", contract: { accepts: [], emits: ["candidate"], minItems: 0 } },
      { id: "qual", kind: "agent", ref: "y", contract: { accepts: ["candidate"], emits: ["qualified"] } },
      { id: "g", category: "gate", contract: {} },
    ];
    const edges = [
      { source: "find", target: "qual", edgeType: "data" },
      { source: "qual", target: "g", edgeType: "data" },
    ];
    const out = relaxDiscoveryChainContracts(nodes, edges);
    const qual = out.find((n) => n.id === "qual");
    assert.deepEqual(qual.contract.accepts, [], "the rigid accepts is relaxed so the generic shape flows");
  });
});

describe("end-to-end — both source modes reach the founder gate", () => {
  it("PROVIDED: a seeded connector source flows to the gate", async () => {
    const graph = {
      id: "provided-run",
      nodes: [provided("s", [{ id: "p1", name: "Acme", email: "a@acme.com" }]), gate("g")],
      edges: [{ id: "e", source: "s", target: "g", edgeType: "data" }],
    };
    const result = await runGraph(graph);
    assert.equal(result.nodes.s.ok, true);
    assert.equal(result.nodes.s.items.length, 1);
    assert.deepEqual(result.pendingGates, ["g"], "the run pauses at the founder gate");
  });

  it("PROVIDED but empty: the run honestly flags the source as needing a seed (no silent rewrite)", async () => {
    const graph = {
      id: "empty-provided",
      nodes: [provided("s", []), { id: "a", kind: "agent", ref: "gtm-enrich", config: {} }, gate("g")],
      edges: [
        { id: "e1", source: "s", target: "a", edgeType: "data" },
        { id: "e2", source: "a", target: "g", edgeType: "data" },
      ],
    };
    // No compose step ran, so the founder's connector source is preserved exactly — NOT turned into
    // an agent behind their back. It reports a clear "configure this source" signal.
    const result = await runGraph(graph);
    assert.equal(result.nodes.s.ok, false);
    assert.equal(result.nodes.s.blocked, true);
    assert.match(result.nodes.s.error, /Add manual rows, CSV data, or an API endpoint/);
    assert.equal(result.nodes.s.kind ?? "tool", "tool", "the source stays a connector — no silent rewrite");
    assert.deepEqual(result.pendingGates, [], "nothing reaches the gate on an unconfigured source");
  });

  it("DISCOVERED: an agent source self-sources (zero upstream) and flows to the gate", async () => {
    // The discovered entry agent runs on no upstream items and returns its own found candidates —
    // exactly what resolveEntry produces, exercised here with an injected fake invoker.
    const graph = {
      id: "discovered-run",
      nodes: [
        { id: "find", category: "source", kind: "agent", ref: "gtm-find-prospects", label: "Find operators", config: {}, contract: { accepts: [], minItems: 0 } },
        gate("g"),
      ],
      edges: [{ id: "e", source: "find", target: "g", edgeType: "data" }],
    };
    const stepRuntime = makeStepRuntime({
      agent: async (node, upstream) => {
        assert.equal(upstream.length, 0, "the discovered entry self-sources with no upstream");
        return { ok: true, items: [{ id: "found-1", name: "Found Operator", source: "https://example.com" }], meta: { found: 1 } };
      },
    });
    const result = await runGraph(graph, { stepRuntime });
    assert.equal(result.nodes.find.ok, true);
    assert.equal(result.nodes.find.items[0].id, "found-1");
    assert.deepEqual(result.pendingGates, ["g"], "the discovered loop reaches the founder gate");
  });
});
