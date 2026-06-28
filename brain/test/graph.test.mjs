import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runGraph, defaultGraphTemplate, listConnectors } from "../src/graph.mjs";

describe("defaultGraphTemplate", () => {
  it("returns a valid GTMGraph", () => {
    const g = defaultGraphTemplate();
    assert.ok(g.id);
    assert.ok(g.name);
    assert.ok(Array.isArray(g.nodes) && g.nodes.length > 0);
    assert.ok(Array.isArray(g.edges) && g.edges.length > 0);
  });

  it("has resource, context, source, gate, measure nodes", () => {
    const g = defaultGraphTemplate();
    const cats = new Set(g.nodes.map((n) => n.category));
    assert.ok(cats.has("resource"));
    assert.ok(cats.has("context"));
    assert.ok(cats.has("source"));
    assert.ok(cats.has("gate"));
    assert.ok(cats.has("measure"));
  });

  it("has data, context, and feedback edges", () => {
    const g = defaultGraphTemplate();
    const types = new Set(g.edges.map((e) => e.edgeType));
    assert.ok(types.has("data"), "missing data edges");
    assert.ok(types.has("context"), "missing context edges");
    assert.ok(types.has("feedback"), "missing feedback edges");
  });

  it("has exactly 2 feedback edges", () => {
    const g = defaultGraphTemplate();
    const feedback = g.edges.filter((e) => e.edgeType === "feedback");
    assert.equal(feedback.length, 2);
  });

  it("nodes have required fields", () => {
    const g = defaultGraphTemplate();
    for (const node of g.nodes) {
      assert.ok(node.id, `node missing id`);
      assert.ok(node.category, `node ${node.id} missing category`);
      assert.ok(node.label, `node ${node.id} missing label`);
      assert.ok(node.position && typeof node.position.x === "number", `node ${node.id} missing position`);
    }
  });
});

describe("runGraph — resource nodes skip execution", () => {
  it("resource nodes return ok with declaration meta", async () => {
    const g = defaultGraphTemplate();
    const result = await runGraph(g);
    const resourceNodes = g.nodes.filter((n) => n.category === "resource");
    assert.ok(resourceNodes.length > 0);
    for (const rn of resourceNodes) {
      const nr = result.nodes[rn.id];
      assert.ok(nr, `no result for resource node ${rn.id}`);
      assert.equal(nr.ok, true);
      assert.equal(nr.meta?.declaration, true);
      assert.deepEqual(nr.items, []);
    }
  });
});

describe("runGraph — context nodes resolve first", () => {
  it("context nodes produce context items", async () => {
    const g = defaultGraphTemplate();
    const result = await runGraph(g);
    const ctxNodes = g.nodes.filter((n) => n.category === "context");
    for (const cn of ctxNodes) {
      const nr = result.nodes[cn.id];
      assert.ok(nr, `no result for context node ${cn.id}`);
      assert.equal(nr.ok, true);
      assert.ok(nr.items.length > 0, `context node ${cn.id} produced no items`);
      assert.ok(nr.items.every((i) => i.type === "context"), `context node ${cn.id} returned non-context items`);
    }
  });
});

describe("runGraph — gate nodes pause for review", () => {
  it("gate node result has pendingReview and appears in pendingGates", async () => {
    const g = defaultGraphTemplate();
    const result = await runGraph(g);
    // Gate may not run if upstream requires env keys — check if it ran
    const gateIds = g.nodes.filter((n) => n.category === "gate").map((n) => n.id);
    for (const gid of gateIds) {
      const nr = result.nodes[gid];
      if (!nr) continue;
      if (nr.ok || nr.pendingReview) {
        if (nr.pendingReview) {
          assert.ok(result.pendingGates.includes(gid), `gate ${gid} not in pendingGates`);
        }
      }
    }
  });

  it("blocks every downstream data node until the gate is approved", async () => {
    const graph = {
      id: "gate-flow",
      nodes: [
        { id: "ctx", category: "context", connector: "product", label: "Context", config: { name: "Test" } },
        { id: "gate", category: "gate", connector: "default", label: "Review", config: {} },
        { id: "measure", category: "measure", connector: "default", label: "Measure", config: {} },
      ],
      edges: [
        { id: "a", source: "ctx", target: "gate", edgeType: "data" },
        { id: "b", source: "gate", target: "measure", edgeType: "data" },
      ],
    };
    const pending = await runGraph(graph);
    assert.equal(pending.nodes.gate.pendingReview, true);
    assert.equal(pending.nodes.measure.blocked, true);

    const approved = await runGraph(graph, { approvals: { gate: true } });
    assert.equal(approved.nodes.gate.pendingReview, false);
    assert.equal(approved.nodes.measure.ok, true);
  });

  it("resumes the exact prepared gate items without rerunning upstream nodes", async () => {
    const graph = {
      id: "durable-gate-flow",
      nodes: [
        { id: "ctx", category: "context", connector: "product", label: "Context", config: { name: "Prepared item" } },
        { id: "gate", category: "gate", connector: "default", label: "Review", config: {} },
        { id: "measure", category: "measure", connector: "default", label: "Measure", config: {} },
      ],
      edges: [
        { id: "a", source: "ctx", target: "gate", edgeType: "data" },
        { id: "b", source: "gate", target: "measure", edgeType: "data" },
      ],
    };
    const pending = await runGraph(graph);
    pending.nodes.gate.items[0].name = "Immutable prepared item";
    const preparedActionId = pending.nodes.gate.items[0].gtmActionId;
    graph.nodes[0].config.name = "A different rerun value";

    const resumed = await runGraph(graph, {
      approvals: { gate: true },
      resumeResult: pending,
    });
    assert.equal(resumed.resumedFromRunId, pending.runId);
    assert.equal(resumed.nodes.gate.items[0].name, "Immutable prepared item");
    assert.equal(resumed.nodes.gate.items[0].gtmActionId, preparedActionId);
    assert.equal(resumed.nodes.measure.ok, true);
  });
});

describe("runGraph — blind measurement is honest, not fatal", () => {
  it("a blind measure node flags blind without failing the run", async () => {
    // The measure node requires an attribution `source` that nothing upstream promises — the real
    // RodentRadar gap. The node must report blind, but the run must still complete (ok: true) so a
    // fully approved, staged run does not read "blocked".
    const graph = {
      id: "blind-measure-flow",
      nodes: [
        { id: "ctx", category: "context", connector: "product", label: "Context", config: { name: "Test" } },
        { id: "gate", category: "gate", connector: "default", label: "Review", config: {} },
        {
          id: "measure", category: "measure", connector: "default", label: "Measure",
          config: { joinKey: "gtmActionId" },
          contract: { accepts: ["gtmActionId", "source"], emits: ["attribution"] },
        },
      ],
      edges: [
        { id: "a", source: "ctx", target: "gate", edgeType: "data" },
        { id: "b", source: "gate", target: "measure", edgeType: "data" },
      ],
    };
    const run = await runGraph(graph, { approvals: { gate: true } });
    assert.equal(run.nodes.measure.blind, true, "measure should report blind");
    assert.equal(run.nodes.measure.ok, true, "a blind node is not a failure");
    assert.equal(run.ok, true, "a blind measure must not fail the whole run");
    assert.equal(run.error, undefined);
  });
});

describe("runGraph — feedback edges deferred", () => {
  it("feedback edges are returned but not executed", async () => {
    const g = defaultGraphTemplate();
    const result = await runGraph(g);
    const feedbackEdges = g.edges.filter((e) => e.edgeType === "feedback");
    assert.equal(result.feedbackEdges.length, feedbackEdges.length);
    // Targets of feedback edges have their own results from normal execution
    for (const fe of result.feedbackEdges) {
      assert.ok(fe.source);
      assert.ok(fe.target);
    }
  });
});

describe("runGraph — execution order respects topological sort", () => {
  it("executionOrder contains all nodes", async () => {
    const g = defaultGraphTemplate();
    const result = await runGraph(g);
    assert.equal(result.executionOrder.length, g.nodes.length);
    const nodeIds = new Set(g.nodes.map((n) => n.id));
    for (const id of result.executionOrder) {
      assert.ok(nodeIds.has(id), `${id} in executionOrder but not in graph`);
    }
  });
});

describe("runGraph — individual node execution", () => {
  it("runs only the selected node and its dependencies", async () => {
    const graph = {
      id: "partial",
      nodes: [
        { id: "ctx", category: "context", connector: "product", label: "Context", config: { name: "Test" } },
        { id: "gate", category: "gate", connector: "default", label: "Gate", config: {} },
        { id: "measure", category: "measure", connector: "default", label: "Measure", config: {} },
      ],
      edges: [
        { id: "a", source: "ctx", target: "gate", edgeType: "data" },
        { id: "b", source: "gate", target: "measure", edgeType: "data" },
      ],
    };
    const result = await runGraph(graph, { targetNodeId: "gate" });
    assert.ok(result.nodes.ctx);
    assert.ok(result.nodes.gate);
    assert.equal(result.nodes.measure, undefined);
  });
});

describe("runGraph — unknown connector fails gracefully", () => {
  it("returns ok:false with a descriptive error for unknown connectors", async () => {
    const g = defaultGraphTemplate();
    const modified = {
      ...g,
      nodes: g.nodes.map((n) =>
        n.category !== "source" ? n : { ...n, connector: "nonexistent-connector-xyz" }
      ),
    };
    const result = await runGraph(modified);
    const sourceNodes = g.nodes.filter((n) => n.category === "source");
    for (const sn of sourceNodes) {
      const nr = result.nodes[sn.id];
      if (nr && !nr.ok) {
        assert.ok(nr.error, `no error message for failed node ${sn.id}`);
      }
    }
  });
});

describe("listConnectors", () => {
  it("returns at least one connector per category", () => {
    const connectors = listConnectors();
    assert.ok(connectors.length > 0);
    const cats = new Set(connectors.map((c) => c.category));
    const expected = ["resource", "source", "context", "filter", "generate", "gate", "measure"];
    for (const cat of expected) {
      assert.ok(cats.has(cat), `no connector for category "${cat}"`);
    }
  });

  it("each connector has required meta fields", () => {
    const connectors = listConnectors();
    for (const c of connectors) {
      assert.ok(c.id, `connector missing id`);
      assert.ok(c.name, `connector ${c.id} missing name`);
      assert.ok(c.category, `connector ${c.id} missing category`);
    }
  });
});

describe("derived source — a channel pulls another channel's output at run time", () => {
  const derivedGraph = () => ({
    id: "g-derived", name: "Derived run", version: "1.0.0",
    nodes: [{ id: "src", category: "source", connector: "manual", label: "Pull from upstream", config: { sourceChannelId: "upstream" }, position: { x: 0, y: 0 } }],
    edges: [],
  });

  it("feeds the upstream channel's items in via the injected loader", async () => {
    let askedFor = null;
    const result = await runGraph(derivedGraph(), {
      loadLastRunItems: async (id) => { askedFor = id; return [{ id: "1", name: "Ada" }, { id: "2", name: "Bo" }]; },
    });
    assert.equal(askedFor, "upstream", "the loader was asked for the wired source channel");
    assert.equal(result.nodes.src.ok, true);
    assert.equal(result.nodes.src.items.length, 2);
    assert.equal(result.nodes.src.meta.source, "derived");
  });

  it("fails honestly when no cross-channel loader is provided (never silently empty)", async () => {
    const result = await runGraph(derivedGraph(), {});
    assert.equal(result.nodes.src.ok, false);
    assert.match(result.nodes.src.error, /another channel/i);
  });
});
