import { test } from "node:test";
import assert from "node:assert/strict";

import { validateGraph, applyGraphOperations, OUTPUT_KIND_HINTS } from "../src/graph-operations.mjs";

function baseGraph(nodeOverrides = {}) {
  return {
    name: "test",
    revision: 1,
    nodes: [
      { id: "src", kind: "tool", category: "source", label: "Source", position: { x: 0, y: 0 }, config: {}, ...nodeOverrides },
    ],
    edges: [],
  };
}

test("output kind is OPEN — an arbitrary label the engine never saw before still validates", () => {
  // "microproduct" is intentionally NOT in OUTPUT_KIND_HINTS. It must still be accepted.
  const result = validateGraph(baseGraph({ outputKind: "microproduct" }));
  assert.equal(result.ok, true, result.errors.join("; "));
});

test("a node with no outputKind is valid (the field is optional)", () => {
  assert.equal(validateGraph(baseGraph()).ok, true);
});

test("an empty or non-string outputKind is rejected (a label must be real)", () => {
  assert.equal(validateGraph(baseGraph({ outputKind: "" })).ok, false);
  assert.equal(validateGraph(baseGraph({ outputKind: 7 })).ok, false);
});

test("add_node persists an open outputKind and rejects an empty one", () => {
  const added = applyGraphOperations(baseGraph(), [
    { type: "add_node", node: { id: "out", kind: "tool", category: "execute", label: "Deploy artifact", position: { x: 1, y: 1 }, config: {}, outputKind: "artifact" } },
  ]);
  assert.equal(added.graph.nodes.find((n) => n.id === "out").outputKind, "artifact");

  assert.throws(() => applyGraphOperations(baseGraph(), [
    { type: "add_node", node: { id: "bad", kind: "tool", category: "execute", label: "Bad", position: { x: 1, y: 1 }, config: {}, outputKind: "" } },
  ]), /outputKind/);
});

test("update_node can patch outputKind", () => {
  const start = applyGraphOperations(baseGraph(), [
    { type: "add_node", node: { id: "out", kind: "tool", category: "execute", label: "Out", position: { x: 1, y: 1 }, config: {} } },
  ]).graph;
  const updated = applyGraphOperations(start, [
    { type: "update_node", nodeId: "out", patch: { outputKind: "dataset" } },
  ]);
  assert.equal(updated.graph.nodes.find((n) => n.id === "out").outputKind, "dataset");
});

test("OUTPUT_KIND_HINTS are hints, not a closed enum", () => {
  assert.ok(OUTPUT_KIND_HINTS.includes("message"));
  assert.ok(OUTPUT_KIND_HINTS.includes("artifact"));
  // The validator already proved (test 1) it accepts a kind outside this list — that is the contract.
});
