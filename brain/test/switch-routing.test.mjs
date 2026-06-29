import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runGraph } from "../src/graph.mjs";
import { applyGraphOperations, validateGraph } from "../src/graph-operations.mjs";
import { createStepRuntime, evaluateSwitchPredicate } from "../src/step-runners.mjs";

// A manual source seeds real upstream items.
function source(id, items) {
  return { id, category: "source", connector: "manual", label: "Seed", position: { x: 0, y: 0 }, config: { items } };
}
// A pass-through branch endpoint: a code node with no registered transform echoes its upstream
// unchanged (createStepRuntime's honest no-op), so result.items === exactly what was routed in.
function branch(id) {
  return { id, kind: "code", ref: "noop", label: id, position: { x: 0, y: 0 }, config: {} };
}
function sw(id) {
  return { id, kind: "switch", label: "Route", position: { x: 0, y: 0 }, config: {} };
}
function edge(id, sourceId, targetId, predicate) {
  return { id, source: sourceId, target: targetId, edgeType: "data", ...(predicate ? { predicate } : {}) };
}

describe("switch — conditional routing in the engine", () => {
  const runtime = () => createStepRuntime();

  it("routes each item to the branch whose edge predicate it matches", async () => {
    const graph = {
      id: "sw-split",
      nodes: [
        source("s", [{ id: "p1", fit: 90 }, { id: "p2", fit: 40 }, { id: "p3", fit: 75 }]),
        sw("sw"),
        branch("fast"),
        branch("slow"),
      ],
      edges: [
        edge("e0", "s", "sw"),
        edge("e1", "sw", "fast", { field: "fit", op: "gte", value: 70 }),
        edge("e2", "sw", "slow", { field: "fit", op: "lt", value: 70 }),
      ],
    };
    const result = await runGraph(graph, { stepRuntime: runtime() });
    assert.equal(result.nodes.fast.ok, true);
    assert.equal(result.nodes.slow.ok, true);
    assert.deepEqual(result.nodes.fast.items.map((i) => i.id), ["p1", "p3"]);
    assert.deepEqual(result.nodes.slow.items.map((i) => i.id), ["p2"]);
  });

  it("passes every upstream item through the switch node itself", async () => {
    const graph = {
      id: "sw-pass",
      nodes: [source("s", [{ id: "p1", fit: 90 }, { id: "p2", fit: 10 }]), sw("sw"), branch("b")],
      edges: [edge("e0", "s", "sw"), edge("e1", "sw", "b", { field: "fit", op: "gte", value: 50 })],
    };
    const result = await runGraph(graph, { stepRuntime: runtime() });
    assert.equal(result.nodes.sw.ok, true);
    assert.equal(result.nodes.sw.kind, "switch");
    assert.equal(result.nodes.sw.items.length, 2, "switch emits all items; branches filter");
    assert.equal(result.nodes.sw.meta.routed, 2);
  });

  it("an unconditional (predicate-less) branch receives every item", async () => {
    const graph = {
      id: "sw-fallthrough",
      nodes: [source("s", [{ id: "p1", fit: 90 }, { id: "p2", fit: 10 }]), sw("sw"), branch("matched"), branch("all")],
      edges: [
        edge("e0", "s", "sw"),
        edge("e1", "sw", "matched", { field: "fit", op: "gte", value: 50 }),
        edge("e2", "sw", "all"),
      ],
    };
    const result = await runGraph(graph, { stepRuntime: runtime() });
    assert.deepEqual(result.nodes.matched.items.map((i) => i.id), ["p1"]);
    assert.deepEqual(result.nodes.all.items.map((i) => i.id), ["p1", "p2"]);
  });

  it("a branch that matches nothing is an honest empty, not a failure", async () => {
    const graph = {
      id: "sw-empty",
      nodes: [source("s", [{ id: "p1", fit: 10 }]), sw("sw"), branch("never")],
      edges: [edge("e0", "s", "sw"), edge("e1", "sw", "never", { field: "fit", op: "gte", value: 90 })],
    };
    const result = await runGraph(graph, { stepRuntime: runtime() });
    assert.equal(result.nodes.never.ok, true);
    assert.equal(result.nodes.never.items.length, 0);
  });

  it("a gate downstream of a switch reuses the exact ROUTED items on resume", async () => {
    const graph = {
      id: "sw-gate",
      nodes: [
        source("s", [{ id: "p1", fit: 90 }, { id: "p2", fit: 30 }]),
        sw("sw"),
        { id: "gate", category: "gate", connector: "default", label: "Review", position: { x: 0, y: 0 }, config: {} },
        { id: "measure", category: "measure", connector: "default", label: "Measure", position: { x: 0, y: 0 }, config: {} },
      ],
      edges: [
        edge("e0", "s", "sw"),
        edge("e1", "sw", "gate", { field: "fit", op: "gte", value: 70 }),
        edge("e2", "gate", "measure"),
      ],
    };
    const pending = await runGraph(graph, { stepRuntime: runtime() });
    // Only the high-fit person was routed to the gate.
    assert.equal(pending.nodes.gate.pendingReview, true);
    assert.deepEqual(pending.nodes.gate.items.map((i) => i.id), ["p1"]);

    const resumed = await runGraph(graph, {
      stepRuntime: runtime(),
      approvals: { gate: true },
      resumeResult: pending,
    });
    assert.equal(resumed.resumedFromRunId, pending.runId);
    assert.deepEqual(resumed.nodes.gate.items.map((i) => i.id), ["p1"], "routed items reused, not re-decided");
    assert.equal(resumed.nodes.measure.ok, true);
  });
});

describe("switch — predicate evaluation", () => {
  it("evaluates the fixed op vocabulary against an item field", () => {
    assert.equal(evaluateSwitchPredicate({ fit: 90 }, { field: "fit", op: "gte", value: 70 }), true);
    assert.equal(evaluateSwitchPredicate({ fit: 40 }, { field: "fit", op: "gte", value: 70 }), false);
    assert.equal(evaluateSwitchPredicate({ tag: "a" }, { field: "tag", op: "eq", value: "a" }), true);
    assert.equal(evaluateSwitchPredicate({ email: "x@y.z" }, { field: "email", op: "exists" }), true);
    assert.equal(evaluateSwitchPredicate({}, { field: "email", op: "exists" }), false);
  });
  it("a null or fieldless predicate matches everything (unconditional)", () => {
    assert.equal(evaluateSwitchPredicate({ any: 1 }, null), true);
    assert.equal(evaluateSwitchPredicate({ any: 1 }, {}), true);
  });
});

describe("switch — validation & typed mutations", () => {
  it("validates a switch node with neither ref nor category", () => {
    const graph = {
      id: "v", revision: 0,
      nodes: [
        { id: "s", category: "source", connector: "manual", label: "Seed", position: { x: 0, y: 0 }, config: {} },
        { id: "sw", kind: "switch", label: "Route", position: { x: 1, y: 0 }, config: {} },
      ],
      edges: [{ id: "e", source: "s", target: "sw", edgeType: "data" }],
    };
    assert.equal(validateGraph(graph).ok, true);
  });

  it("rejects an edge predicate with no field or an unknown op", () => {
    const base = {
      id: "v2", revision: 0,
      nodes: [
        { id: "s", category: "source", connector: "manual", label: "Seed", position: { x: 0, y: 0 }, config: {} },
        { id: "sw", kind: "switch", label: "Route", position: { x: 1, y: 0 }, config: {} },
      ],
      edges: [{ id: "e", source: "s", target: "sw", edgeType: "data", predicate: { op: "eq", value: 1 } }],
    };
    assert.equal(validateGraph(base).ok, false);
    base.edges[0].predicate = { field: "fit", op: "wat", value: 1 };
    assert.equal(validateGraph(base).ok, false);
  });

  it("add_node accepts a switch and connect_nodes persists a valid predicate", () => {
    const graph = { id: "m", revision: 0, name: "m", nodes: [
      { id: "s", category: "source", connector: "manual", label: "Seed", position: { x: 0, y: 0 }, config: {} },
    ], edges: [] };
    const next = applyGraphOperations(graph, [
      { type: "add_node", node: { id: "sw", kind: "switch", label: "Route", position: { x: 1, y: 0 }, config: {} } },
      { type: "connect_nodes", edge: { id: "e", source: "s", target: "sw", edgeType: "data", predicate: { field: "fit", op: "gte", value: 70 } } },
    ]);
    const swNode = next.graph.nodes.find((n) => n.id === "sw");
    assert.equal(swNode.kind, "switch");
    const e = next.graph.edges.find((x) => x.id === "e");
    assert.deepEqual(e.predicate, { field: "fit", op: "gte", value: 70 });
  });

  it("connect_nodes rejects an invalid predicate", () => {
    const graph = { id: "m2", revision: 0, name: "m", nodes: [
      { id: "s", category: "source", connector: "manual", label: "Seed", position: { x: 0, y: 0 }, config: {} },
      { id: "sw", kind: "switch", label: "Route", position: { x: 1, y: 0 }, config: {} },
    ], edges: [] };
    assert.throws(
      () => applyGraphOperations(graph, [
        { type: "connect_nodes", edge: { id: "e", source: "s", target: "sw", edgeType: "data", predicate: { op: "eq" } } },
      ]),
      /predicate/i,
    );
  });
});
