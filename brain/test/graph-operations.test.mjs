import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyGraphOperations, validateGraph } from "../src/graph-operations.mjs";
import { defaultGraphTemplate } from "../src/graph.mjs";

describe("typed graph operations", () => {
  it("applies a multi-operation patch and increments the revision", () => {
    const graph = defaultGraphTemplate();
    const result = applyGraphOperations(graph, [
      {
        type: "add_node",
        node: {
          id: "gate-extra",
          category: "gate",
          connector: "default",
          label: "Second review",
          position: { x: 1220, y: 420 },
          config: {},
        },
      },
      {
        type: "connect_nodes",
        edge: {
          id: "e-gen-extra",
          source: "gen-draft",
          target: "gate-extra",
          edgeType: "data",
        },
      },
      {
        type: "update_node",
        nodeId: "ctx-icp",
        patch: { config: { geography: "Western New York" } },
      },
    ]);
    assert.equal(result.graph.revision, 1);
    assert.equal(result.graph.nodes.find((node) => node.id === "ctx-icp").config.geography, "Western New York");
    assert.ok(result.graph.nodes.some((node) => node.id === "gate-extra"));
    assert.equal(result.validation.ok, true);
  });

  it("rejects patches that introduce data cycles", () => {
    const graph = defaultGraphTemplate();
    assert.throws(() => applyGraphOperations(graph, [{
      type: "connect_nodes",
      edge: {
        id: "cycle",
        source: "msr-outcomes",
        target: "src-find",
        edgeType: "data",
      },
    }]), /cycle/i);
  });

  it("reports malformed graphs", () => {
    const graph = defaultGraphTemplate();
    graph.edges.push({ id: "bad", source: "missing", target: "ctx-icp", edgeType: "data" });
    const result = validateGraph(graph);
    assert.equal(result.ok, false);
    assert.match(result.errors.join(" "), /unknown source/i);
  });
});

