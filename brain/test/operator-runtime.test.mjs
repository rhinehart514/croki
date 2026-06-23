import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { defaultGraphTemplate } from "../src/graph.mjs";
import { saveFlow } from "../src/flow-store.mjs";
import { createOperatorSession, getOperatorSession } from "../src/operator-store.mjs";
import { resolveOperatorGate, runOperatorSession } from "../src/operator-runtime.mjs";

function fakeClient(responses) {
  let index = 0;
  return {
    messages: {
      async create() {
        const response = responses[index];
        index += 1;
        if (!response) throw new Error("Unexpected extra model turn.");
        return response;
      },
    },
  };
}

describe("resident GTM operator runtime", () => {
  let parent;
  let options;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-operator-runtime-"));
    options = { root: parent };
    saveFlow(defaultGraphTemplate(), options);
  });

  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  it("persists a typed graph patch across model turns", async () => {
    const session = createOperatorSession({
      goal: "Narrow the ICP to Western New York.",
      graphId: defaultGraphTemplate().id,
    }, options);
    const client = fakeClient([
      {
        content: [{
          type: "tool_use",
          id: "tool-1",
          name: "patch_graph",
          input: {
            rationale: "The founder explicitly requested a regional ICP.",
            operations: [{
              type: "update_node",
              nodeId: "ctx-icp",
              patch: { config: { geography: "Western New York" } },
            }],
          },
        }],
      },
      {
        content: [{
          type: "tool_use",
          id: "tool-2",
          name: "complete",
          input: { outcome: "achieved", summary: "Updated the ICP geography and validated the durable graph." },
        }],
      },
    ]);
    const completed = await runOperatorSession(session.id, { client, options });
    assert.equal(completed.status, "completed");
    assert.equal(completed.graphRevision, 1);
    assert.ok(completed.events.some((event) => event.type === "graph_patched"));
  });

  it("fails honestly when no runtime is available, naming both options", async () => {
    const session = createOperatorSession({ goal: "Work the goal.", graphId: defaultGraphTemplate().id }, options);
    const priorKey = process.env.ANTHROPIC_API_KEY;
    const priorDisable = process.env.GTM_IDE_DISABLE_CLAUDE_CODE;
    delete process.env.ANTHROPIC_API_KEY;
    process.env.GTM_IDE_DISABLE_CLAUDE_CODE = "1";
    try {
      const failed = await runOperatorSession(session.id, { options });
      assert.equal(failed.status, "failed");
      assert.match(failed.error, /Claude Code/);
      assert.match(failed.error, /ANTHROPIC_API_KEY/);
      assert.ok(failed.events.some((event) => event.type === "session_failed"));
    } finally {
      if (priorKey === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = priorKey;
      if (priorDisable === undefined) delete process.env.GTM_IDE_DISABLE_CLAUDE_CODE;
      else process.env.GTM_IDE_DISABLE_CLAUDE_CODE = priorDisable;
    }
  });

  it("records which runtime drove the session", async () => {
    const session = createOperatorSession({ goal: "Note the runtime.", graphId: defaultGraphTemplate().id }, options);
    const completed = await runOperatorSession(session.id, {
      options,
      client: fakeClient([{
        content: [{ type: "tool_use", id: "t", name: "complete", input: { outcome: "achieved", summary: "done" } }],
      }]),
    });
    assert.equal(completed.runtime, "anthropic");
  });

  it("pauses at a founder gate and resumes the exact run after approval", async () => {
    const graph = {
      id: "gate-session",
      name: "Gate session",
      version: "1",
      nodes: [
        { id: "ctx", category: "context", connector: "product", label: "Prepared", position: { x: 0, y: 0 }, config: { name: "Exact artifact" } },
        { id: "gate", category: "gate", connector: "default", label: "Founder gate", position: { x: 200, y: 0 }, config: {} },
        { id: "measure", category: "measure", connector: "default", label: "Measure", position: { x: 400, y: 0 }, config: {} },
      ],
      edges: [
        { id: "a", source: "ctx", target: "gate", edgeType: "data" },
        { id: "b", source: "gate", target: "measure", edgeType: "data" },
      ],
    };
    saveFlow(graph, options);
    const session = createOperatorSession({ goal: "Run to the gate.", graphId: graph.id }, options);
    const paused = await runOperatorSession(session.id, {
      options,
      client: fakeClient([{
        content: [{ type: "tool_use", id: "tool-run", name: "run_loop", input: {} }],
      }]),
    });
    assert.equal(paused.status, "waiting_for_gate");
    assert.equal(paused.pendingGate.nodeIds[0], "gate");

    const resolved = await resolveOperatorGate(session.id, {
      approvals: { gate: true },
    }, {
      options,
      client: fakeClient([{
        content: [{
          type: "tool_use",
          id: "tool-done",
          name: "complete",
          input: { outcome: "achieved", summary: "The approved artifact continued through measure." },
        }],
      }]),
    });
    assert.equal(resolved.status, "ready");
    await new Promise((resolve) => setTimeout(resolve, 20));
    const completed = getOperatorSession(session.id, options);
    assert.equal(completed.status, "completed");
    assert.ok(completed.events.some((event) => event.type === "gate_resolved"));
  });
});
