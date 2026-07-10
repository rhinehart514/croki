import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyGraphOperations, validateGraph, NODE_KINDS_LIST } from "../src/graph-operations.mjs";
import { GRAPH_OPERATIONS_INPUT_SCHEMA } from "../src/operator-tools.mjs";
import { defaultGraphTemplate } from "../src/graph.mjs";

describe("node-kind enum stays synced across the operator schema and the validator (Wave 4)", () => {
  it("the operator's add-node kind enum is exactly the validator's canonical kinds", () => {
    const schemaEnum = GRAPH_OPERATIONS_INPUT_SCHEMA
      .properties.operations.items.properties.node.properties.kind.enum;
    // Same set of kinds — the operator can create every kind the validator accepts (mcp/switch/
    // terminal/query/web included), instead of the old 4-kind subset that couldn't.
    assert.deepEqual([...schemaEnum].sort(), [...NODE_KINDS_LIST].sort());
    assert.ok(schemaEnum.includes("mcp") && schemaEnum.includes("switch"), "the full vocabulary is exposed");
  });
});

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

  it("accepts an mcp-kind node (open kind, ref required) through add_node and validation", () => {
    const graph = defaultGraphTemplate();
    const result = applyGraphOperations(graph, [
      {
        type: "add_node",
        node: {
          id: "mcp-search",
          kind: "mcp",
          ref: "clay/search_people",
          label: "Find people (Clay)",
          position: { x: 900, y: 240 },
          config: { server: "clay", tool: "search_people" },
        },
      },
    ]);
    const added = result.graph.nodes.find((node) => node.id === "mcp-search");
    assert.equal(added.kind, "mcp");
    assert.equal(added.ref, "clay/search_people");
    assert.equal(result.validation.ok, true);
  });

  it("rejects an mcp-kind node with no ref (open kinds require a ref)", () => {
    const graph = defaultGraphTemplate();
    assert.throws(() => applyGraphOperations(graph, [{
      type: "add_node",
      node: { id: "mcp-bad", kind: "mcp", label: "No ref", position: { x: 0, y: 0 }, config: {} },
    }]), /ref/i);
  });

  it("rejects deploy authority in typed config while allowing ordinary question context", () => {
    const graph = defaultGraphTemplate();
    assert.throws(() => applyGraphOperations(graph, [{ type: "update_node", nodeId: "exe-email", patch: { config: { deployConfirmed: true } } }]), /release authority/i);
    assert.doesNotThrow(() => applyGraphOperations(graph, [{ type: "update_node", nodeId: "exe-email", patch: { config: { questionAnswered: true, implicationAccepted: true } } }]));
  });
});
