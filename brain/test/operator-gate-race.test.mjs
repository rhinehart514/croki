import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { saveFlow } from "../src/flow-store.mjs";
import { loadProject, saveProject } from "../src/project-store.mjs";
import { createOperatorSession, getOperatorSession } from "../src/operator-store.mjs";
import { resolveOperatorGate, runOperatorSession } from "../src/operator-runtime.mjs";

// Drives one model turn per response, like the anthropic adapter expects.
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

// REGRESSION — the founder gate must not double-fire under two concurrent resolves. Before the fix,
// resolveOperatorGate read status === "waiting_for_gate" and then did async work (runGraph) before
// persisting the new status, so two concurrent calls both passed the check and both released the gated
// action. The fix claims the transition synchronously (status → "resolving_gate") before any await, so
// the second concurrent resolve re-reads a non-gate status and is rejected — the action fires once.
describe("founder gate: concurrent resolves fire the gated action exactly once", () => {
  let parent;
  let options;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-gate-race-"));
    const repo = path.join(parent, "repo");
    fs.mkdirSync(repo);
    fs.writeFileSync(path.join(repo, "app.ts"), 'analytics.track("project_created", { projectId });\n');
    options = { root: path.join(parent, "state"), claudeDir: path.join(parent, "claude"), cwd: repo };
  });

  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  function sessionAtGate() {
    const graph = {
      id: "gate-flow",
      name: "Gate flow",
      version: "1",
      nodes: [
        { id: "ctx", category: "context", connector: "product", label: "Prepared", position: { x: 0, y: 0 }, config: { name: "Artifact" } },
        { id: "gate", category: "gate", connector: "default", label: "Founder gate", position: { x: 200, y: 0 }, config: {} },
        { id: "meas", category: "measure", connector: "default", label: "Measure", position: { x: 400, y: 0 }, config: {} },
      ],
      edges: [
        { id: "a", source: "ctx", target: "gate", edgeType: "data" },
        { id: "b", source: "gate", target: "meas", edgeType: "data" },
      ],
    };
    saveFlow(graph, options);
    const project = loadProject({ ...options, projectId: "default" });
    saveProject({
      ...project,
      channels: [
        ...(project.channels ?? []).filter((channel) => channel.graphId !== graph.id),
        { id: "gate-race-pipeline", graphId: graph.id, name: graph.name, objective: "Exercise concurrent gate release", kind: "custom", enabled: true },
      ],
    }, options);
    return createOperatorSession({ goal: "Run to the gate.", graphId: graph.id, projectId: "default" }, options);
  }

  async function reachGate(session) {
    const paused = await runOperatorSession(session.id, {
      options,
      client: fakeClient([{ content: [{ type: "tool_use", id: "run", name: "run_loop", input: {} }] }]),
    });
    assert.equal(paused.status, "waiting_for_gate");
    return paused;
  }

  it("rejects the second concurrent resolve and resolves the gate only once", async () => {
    const session = sessionAtGate();
    await reachGate(session);

    // Fire two resolves for the SAME gate concurrently (no await between the launches). The synchronous
    // claim inside resolveOperatorGate means only the first reaches runGraph; the second must reject.
    const results = await Promise.allSettled([
      resolveOperatorGate(session.id, { approvals: { gate: true } }, { options }),
      resolveOperatorGate(session.id, { approvals: { gate: true } }, { options }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    assert.equal(fulfilled.length, 1, "exactly one resolve releases the gate");
    assert.equal(rejected.length, 1, "the second concurrent resolve is rejected, not silently double-fired");
    assert.match(
      rejected[0].reason?.message ?? String(rejected[0].reason),
      /not waiting at a founder gate/,
      "the loser is rejected by the not-at-a-gate guard",
    );

    // The gated action ran once: the session carries exactly one gate_resolved event and is no longer
    // parked at the gate.
    const final = getOperatorSession(session.id, options);
    assert.notEqual(final.status, "waiting_for_gate", "the gate is cleared after the single release");
    const resolvedEvents = final.events.filter((e) => e.type === "gate_resolved");
    assert.equal(resolvedEvents.length, 1, "the gate resolved exactly once — no double-fire");
  });
});
