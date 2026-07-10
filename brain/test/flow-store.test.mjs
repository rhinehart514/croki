import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { loadFlow, recordFlowRun, saveFlow } from "../src/flow-store.mjs";

describe("durable general GTM flow", () => {
  let parent;
  let options;
  const graph = {
    id: "test-flow",
    name: "Test flow",
    nodes: [{ id: "a", category: "context", connector: "product", label: "A", config: {}, position: { x: 0, y: 0 } }],
    edges: [],
  };

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-flow-"));
    options = { root: parent };
  });

  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  it("saves graph edits and preserves run results", () => {
    const saved = saveFlow(graph, options);
    assert.equal(saved.graph.store.runs, 0);

    const recorded = recordFlowRun(saved.graph, {
      runId: "run-1",
      ok: false,
      targetNodeId: "a",
      pendingGates: [],
      nodes: { a: { ok: false, items: [], error: "fixture" } },
    }, options);
    assert.equal(recorded.graph.store.runs, 1);

    const loaded = loadFlow(graph.id, graph, options);
    assert.equal(loaded.runs.length, 1);
    assert.equal(loaded.runs[0].result.nodes.a.error, "fixture");
  });

  it("persists optional work context on the graph and live run receipt while direct runs stay valid", () => {
    const contextual = {
      ...graph,
      questionId: "question-1",
      participantRefs: [{ kind: "teammate", id: "researcher" }],
      productRefs: ["product:onboarding"],
    };
    saveFlow(contextual, options);
    const recorded = recordFlowRun(contextual, {
      runId: "run-context",
      ok: true,
      pendingGates: [],
      nodes: {},
    }, options);
    assert.equal(recorded.runs[0].questionId, "question-1");
    assert.deepEqual(recorded.runs[0].participantRefs, [{ type: "teammate", id: "researcher" }]);
    assert.deepEqual(recorded.runs[0].productRefs, [{ type: null, id: "product:onboarding" }]);

    const direct = recordFlowRun({ ...graph, id: "direct-flow" }, { runId: "run-direct", ok: true, pendingGates: [], nodes: {} }, options);
    assert.equal(direct.runs[0].questionId, null);
    assert.deepEqual(direct.runs[0].participantRefs, []);
  });
});
