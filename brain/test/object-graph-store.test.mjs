import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  CanvasLayoutConflictError,
  OBJECT_GRAPH_LAYOUT_NAMESPACE,
  PROJECT_CANVAS_LAYOUT_NAMESPACE,
  objectGraphLayoutStore,
  objectGraphStore,
  normalizeObjectNode,
  normalizeObjectEdge,
} from "../src/object-graph-store.mjs";
import { applyObjectGraphOperations, validateObjectGraph } from "../src/object-graph-operations.mjs";
import { persistence } from "../src/persistence.mjs";

function freshRoot() {
  return { root: fs.mkdtempSync(path.join(os.tmpdir(), "object-graph-")) };
}

function receipt(ref = "founder") {
  return { kind: "founder", ref, preview: ref, at: "2026-07-02T00:00:00.000Z" };
}

describe("object graph store", () => {
  it("persists one graph document per project", () => {
    const options = freshRoot();
    const graph = objectGraphStore.save({
      projectId: "drover",
      nodes: [{
        id: "obj-open-kind",
        domain: "market",
        type: "ritual_that_no_enum_knows",
        maturity: "typed",
        statement: "Founders trade launch notes in tiny private chats.",
        evidence: [{ claim: "seen in notes", source: "notes:1", solidity: "researched" }],
        sources: [receipt("notes:1")],
      }],
      edges: [],
    }, options);
    assert.equal(graph.nodes[0].type, "ritual_that_no_enum_knows", "node type is open");
    assert.equal(graph.nodes[0].solidity, "researched");
    assert.equal(objectGraphStore.load("drover", options).nodes.length, 1);
  });

  it("allows loose untyped cards and requires typed cards to name domain/type", () => {
    const loose = normalizeObjectNode({ maturity: "loose", statement: "A raw founder note" });
    assert.equal(loose.domain, null);
    assert.equal(loose.type, null);
    assert.throws(
      () => normalizeObjectNode({ maturity: "typed", statement: "missing domain", type: "buyer" }),
      /domain/i,
    );
    assert.throws(
      () => normalizeObjectNode({ maturity: "typed", statement: "missing type", domain: "market" }),
      /type/i,
    );
  });

  it("persists founder-arranged node positions separately from graph knowledge", () => {
    const options = freshRoot();
    objectGraphStore.save({
      projectId: "drover",
      nodes: [{ id: "node-1", maturity: "loose", statement: "A card" }],
      edges: [],
    }, options);
    const layout = objectGraphLayoutStore.merge("drover", {
      "node-1": { x: 12, y: -4 },
      "bad-node": { x: "nope", y: 1 },
    }, options);
    assert.deepEqual(layout.positions, { "node-1": { x: 12, y: -4 } });
    assert.equal(objectGraphStore.load("drover", options).nodes[0].payload.x, undefined);
    assert.deepEqual(objectGraphLayoutStore.load("drover", options).positions["node-1"], { x: 12, y: -4 });
  });

  it("aliases legacy positions into namespaced founder geometry without breaking rollback reads", () => {
    const options = freshRoot();
    persistence(options).set("object-graph-layout", "drover", {
      positions: { "obj-old": { x: 8, y: 13 } },
      updatedAt: "2026-07-01T00:00:00.000Z",
    });
    assert.deepEqual(
      objectGraphLayoutStore.loadNamespace("drover", OBJECT_GRAPH_LAYOUT_NAMESPACE, options).positions,
      objectGraphLayoutStore.loadNamespace("drover", PROJECT_CANVAS_LAYOUT_NAMESPACE, options).positions,
    );
    const saved = objectGraphLayoutStore.mergeNamespace("drover", PROJECT_CANVAS_LAYOUT_NAMESPACE, {
      positions: { "anchor:question:q-1": { x: 21, y: 34 } },
      collapsedGroups: ["questions"],
      pinnedCrew: ["crew:researcher"],
      viewport: { x: -10, y: 4, zoom: 0.8 },
    }, options);
    assert.deepEqual(saved.collapsedGroups, ["questions"]);
    assert.deepEqual(saved.pinnedCrew, ["crew:researcher"]);
    assert.deepEqual(saved.viewport, { x: -10, y: 4, zoom: 0.8 });
    assert.deepEqual(objectGraphLayoutStore.load("drover", options).positions, saved.positions);
    assert.deepEqual(persistence(options).get("object-graph-layout", "drover").positions, saved.positions);
  });

  it("guards founder geometry with revisioned idempotent compare-and-set writes", () => {
    const options = freshRoot();
    const first = objectGraphLayoutStore.mergeNamespace("drover", PROJECT_CANVAS_LAYOUT_NAMESPACE, {
      positions: { "anchor:goal:g1": { x: 10, y: 20 } },
    }, { ...options, expectedRevision: 0, idempotencyKey: "drag:g1:1" });
    assert.equal(first.revision, 1);

    const retry = objectGraphLayoutStore.mergeNamespace("drover", PROJECT_CANVAS_LAYOUT_NAMESPACE, {
      positions: { "anchor:goal:g1": { x: 10, y: 20 } },
    }, { ...options, expectedRevision: 0, idempotencyKey: "drag:g1:1" });
    assert.equal(retry.revision, 1);
    assert.equal(retry.deduped, true);

    assert.throws(() => objectGraphLayoutStore.mergeNamespace("drover", PROJECT_CANVAS_LAYOUT_NAMESPACE, {
      positions: { "anchor:goal:g2": { x: 40, y: 50 } },
    }, { ...options, expectedRevision: 0, idempotencyKey: "drag:g2:1" }), CanvasLayoutConflictError);
    assert.deepEqual(
      objectGraphLayoutStore.loadNamespace("drover", PROJECT_CANVAS_LAYOUT_NAMESPACE, options).positions,
      { "anchor:goal:g1": { x: 10, y: 20 } },
    );
  });

  it("keeps edge type as a closed union and requires a basis receipt", () => {
    assert.throws(
      () => normalizeObjectEdge({ source: "a", target: "b", type: "invented_edge", basis: [receipt()] }),
      /Unknown object edge type/,
    );
    assert.throws(
      () => normalizeObjectEdge({ source: "a", target: "b", type: "supports", basis: [] }),
      /basis/i,
    );
  });
});

describe("object graph operations", () => {
  it("adds/promotes/updates/retires nodes and increments the graph revision", () => {
    const start = { projectId: "drover", nodes: [], edges: [], revision: 0 };
    const added = applyObjectGraphOperations(start, [{
      type: "add_node",
      node: { id: "note-1", maturity: "loose", statement: "A loose ICP hunch", sources: [receipt()] },
    }]).graph;
    const promoted = applyObjectGraphOperations(added, [{
      type: "promote_node",
      nodeId: "note-1",
      domain: "market",
      nodeType: "icp_that_stays_open",
      payloadPatch: { label: "solo founders" },
    }]).graph;
    assert.equal(promoted.revision, 2);
    assert.equal(promoted.nodes[0].domain, "market");
    assert.equal(promoted.nodes[0].type, "icp_that_stays_open");
    assert.equal(promoted.nodes[0].payload.label, "solo founders");
  });

  it("rejects derived field writes and projection-only gate payload writes", () => {
    const graph = { projectId: "drover", nodes: [], edges: [] };
    assert.throws(
      () => applyObjectGraphOperations(graph, [{
        type: "add_node",
        node: { id: "forged", domain: "market", type: "buyer", maturity: "typed", statement: "Fake strength", confidence: 99 },
      }]),
      /Derived object-node fields/,
    );
    assert.throws(
      () => applyObjectGraphOperations(graph, [{
        type: "add_node",
        node: {
          id: "gate",
          domain: "runs",
          type: "gate",
          maturity: "execution",
          statement: "Founder gate",
          payload: { protects: "send_emails" },
        },
      }]),
      /projection-only/,
    );
  });

  it("validates edge endpoints, duplicates, and acyclic hierarchy edge types", () => {
    const graph = {
      projectId: "drover",
      nodes: [
        { id: "a", domain: "market", type: "buyer", maturity: "typed", statement: "A" },
        { id: "b", domain: "market", type: "segment", maturity: "typed", statement: "B" },
      ],
      edges: [],
    };
    const withEdges = applyObjectGraphOperations(graph, [
      { type: "add_edge", edge: { id: "ab", source: "a", target: "b", type: "belongs_to", basis: [receipt("machine")] } },
    ]).graph;
    assert.throws(
      () => applyObjectGraphOperations(withEdges, [
        { type: "add_edge", edge: { id: "ba", source: "b", target: "a", type: "belongs_to", basis: [receipt("machine")] } },
      ]),
      /cycle/i,
    );
    const invalid = validateObjectGraph({
      ...withEdges,
      edges: [...withEdges.edges, { id: "dup", source: "a", target: "b", type: "belongs_to", basis: [receipt("machine")] }],
    });
    assert.equal(invalid.ok, false);
    assert.match(invalid.errors.join(" "), /Duplicate edge triple/);
  });

  it("lets the founder confirm or challenge a machine-drawn edge without hand-wiring causality", () => {
    const graph = applyObjectGraphOperations({
      projectId: "drover",
      nodes: [
        { id: "proof", domain: "product", type: "proof", maturity: "typed", statement: "The repo proves scan support." },
        { id: "message", domain: "strategy", type: "message", maturity: "typed", statement: "Lead with scan-backed proof." },
      ],
      edges: [],
    }, [
      { type: "add_edge", edge: { id: "e1", source: "proof", target: "message", type: "supports", basis: [receipt("scan:1")], confidence: 100 } },
      { type: "set_edge_status", edgeId: "e1", status: "confirmed" },
    ]).graph;
    assert.equal(graph.edges[0].status, "confirmed");
  });
});
