import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { handleComposerTurn } from "../src/composer-turn.mjs";
import { classifyComposerIntent } from "../src/composer-router.mjs";
import { listGoals } from "../src/goal-store.mjs";
import {
  appendOperatorEvent,
  createOperatorSession,
  getOperatorSession,
  operatorMutationBoundary,
  saveOperatorSession,
} from "../src/operator-store.mjs";
import { mutationRequirementSatisfied } from "../src/operator-mutation-receipt.mjs";
import { executeOperatorTool, runOperatorSession } from "../src/operator-runtime.mjs";
import { listWorkArtifacts } from "../src/work-artifact-store.mjs";
import { loadProject } from "../src/project-store.mjs";
import { logFailure } from "../src/failure-log.mjs";
import { listFrictionQueue, resolveFrictionQueueDir } from "../src/friction.mjs";

const NODES = [
  { id: "src", category: "source", connector: "manual", label: "Placeholder inputs", config: { items: [{ id: "placeholder-1", name: "Founder-supplied prospect" }] } },
  { id: "draft", kind: "agent", ref: "writer", label: "Prepare locally" },
  { id: "gate", category: "gate", connector: "default", label: "Founder review" },
  { id: "out", category: "execute", connector: "gmail", label: "Outward effect" },
];
const EDGES = [
  { source: "src", target: "draft", edgeType: "data" },
  { source: "draft", target: "gate", edgeType: "data" },
  { source: "gate", target: "out", edgeType: "data" },
];

function fakeClient(response) {
  return { messages: { async create() { return response; } } };
}

function appendUntil(session, cursor) {
  let next = session;
  while (next.eventCursor < cursor) {
    next = appendOperatorEvent(next, { type: "operator_note", title: "Retained progress" });
  }
  return next;
}

describe("outside-founder durable operator contract", () => {
  let parent;
  let options;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "drover-founder-durable-"));
    options = { root: path.join(parent, "state") };
  });
  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  it("routes both audited founder requests as clear action, including a pipeline-specific follow-up", () => {
    const first = classifyComposerIntent("Help me get the first five paying customers. Start with what the code proves, show me the strongest move, and prepare the work without sending anything.");
    const second = classifyComposerIntent("Yes. Turn that into a real pipeline using placeholder inputs where names are missing. Prepare the work, run only local preparation, and stop before anything outward.");
    assert.equal(first.intent, "act");
    assert.ok(first.confidence >= 0.6);
    assert.equal(second.intent, "act");
    assert.ok(second.confidence >= 0.6);
  });

  it("persists a conversational founder turn and useful crew answer as reloadable canvas work", async () => {
    const session = createOperatorSession({ goal: "Understand the strongest move", projectId: "default" }, options);
    const answer = "The strongest move is a founder-led activation experiment grounded in the product's shared-workspace path.";
    const result = await handleComposerTurn(
      { projectId: "default", sessionId: session.id, text: "What angle seems strongest from the product?" },
      {
        classify: () => ({ intent: "act", confidence: 0.3 }),
        runClaudeQuery: () => ({ text: answer, error: null }),
        buildBriefing: () => ({ summary: "No pipeline is active." }),
        productModel: () => ({ name: "Sample" }),
        options,
      },
    );
    assert.equal(result.answer, answer);
    const reloaded = getOperatorSession(session.id, options);
    assert.ok(reloaded.events.some((event) => event.type === "founder_message"));
    assert.equal(reloaded.events.at(-1).type, "model_artifact_recorded");
    assert.ok(reloaded.events.some((event) => event.type === "crew_message" && event.detail === answer));
    assert.equal(listWorkArtifacts("default", options).length, 1);
    assert.equal(listWorkArtifacts("default", options)[0].content, answer);
  });

  it("materializes a clear founder action as a project goal before the drive starts", async () => {
    const session = createOperatorSession({ goal: "Get the first five paying customers", projectId: "default" }, options);
    const calls = [];
    await handleComposerTurn(
      { projectId: "default", sessionId: session.id, text: "Prepare the strongest move without sending anything" },
      {
        classify: () => ({ intent: "act", confidence: 0.88 }),
        resume: (...args) => { calls.push(args); return getOperatorSession(session.id, options); },
        options,
      },
    );
    const goals = listGoals("default", options);
    assert.equal(goals.length, 1);
    assert.equal(goals[0].statement, "Get the first five paying customers");
    assert.equal(calls[0][2].requiredMutation, "durable_work");
  });

  it("rejects a prose-only pipeline success claim and leaves an honest retry state", async () => {
    let session = createOperatorSession({ goal: "Build a real pipeline", projectId: "default" }, options);
    session = saveOperatorSession({ ...session, requiredMutation: { kind: "pipeline", afterEventCount: session.events.length } }, options);
    const done = await runOperatorSession(session.id, {
      options,
      runtime: {
        id: "test-runtime", label: "Test runtime",
        async drive() { return { kind: "completed", summary: "Done — I built and staged the pipeline." }; },
      },
    });
    assert.equal(done.status, "waiting_for_input");
    assert.equal(done.graphId, null);
    assert.match(done.error, /did not create or run/i);
    assert.ok(done.events.some((event) => event.type === "action_not_completed"));
  });

  it("uses stable mutation boundaries across 498, 499, 500, and post-retention event counts", () => {
    for (const cursor of [498, 499, 500, 505]) {
      let session = createOperatorSession({ goal: `Boundary ${cursor}`, projectId: "default" }, options);
      session = appendUntil(session, cursor);
      const requirement = { kind: "durable_work", ...operatorMutationBoundary(session) };
      session = { ...session, requiredMutation: requirement };
      session = appendOperatorEvent(session, { type: "operator_note", title: "Not a mutation" });
      assert.equal(mutationRequirementSatisfied(session), false, `non-mutation after ${cursor}`);
      session = appendOperatorEvent(session, { type: "model_artifact_recorded", title: "Durable mutation" });
      assert.equal(mutationRequirementSatisfied(session), true, `mutation after ${cursor}`);
      assert.ok(session.events.length <= 500);
    }
  });

  it("keeps persisted legacy count cursors readable", () => {
    let session = createOperatorSession({ goal: "Legacy boundary", projectId: "default" }, options);
    const afterEventCount = session.events.length;
    session = appendOperatorEvent({ ...session, requiredMutation: { kind: "durable_work", afterEventCount } }, {
      type: "model_artifact_recorded",
      title: "Legacy mutation",
    });
    assert.equal(mutationRequirementSatisfied(session), true);
  });

  it("accepts stable post-retention receipts in both runtime-complete and complete-tool branches", async () => {
    let runtimeSession = createOperatorSession({ goal: "Runtime completion", projectId: "default" }, options);
    runtimeSession = appendUntil(runtimeSession, 505);
    runtimeSession = {
      ...runtimeSession,
      requiredMutation: { kind: "durable_work", ...operatorMutationBoundary(runtimeSession) },
    };
    runtimeSession = appendOperatorEvent(runtimeSession, { type: "model_artifact_recorded", title: "Runtime receipt" });
    saveOperatorSession(runtimeSession, options);
    const runtimeDone = await runOperatorSession(runtimeSession.id, {
      options,
      runtime: { id: "test-runtime", label: "Test runtime", async drive() { return { kind: "completed", summary: "Done" }; } },
    });
    assert.equal(runtimeDone.status, "completed");

    let toolSession = createOperatorSession({ goal: "Tool completion", projectId: "default" }, options);
    toolSession = appendUntil(toolSession, 505);
    toolSession = {
      ...toolSession,
      requiredMutation: { kind: "durable_work", ...operatorMutationBoundary(toolSession) },
    };
    toolSession = appendOperatorEvent(toolSession, { type: "model_artifact_recorded", title: "Tool receipt" });
    const execution = await executeOperatorTool(toolSession, {
      id: "complete-after-retention",
      name: "complete",
      input: { outcome: "achieved", summary: "Done" },
    }, options);
    assert.equal(execution.session.status, "completed");
  });

  it("a successful compose_and_run stores a real pipeline and stops at the local founder wall", async () => {
    let session = createOperatorSession({ goal: "Build a real pipeline", projectId: "default" }, options);
    session = saveOperatorSession({ ...session, requiredMutation: { kind: "pipeline", afterEventCount: session.events.length } }, options);
    const execution = await executeOperatorTool(session, {
      id: "compose-receipt",
      name: "compose_and_run",
      input: { goal: session.goal, title: "First-workspace activation" },
    }, {
      ...options,
      compose: async () => ({ ok: true, nodes: NODES, edges: EDGES }),
      stepRuntime: { async agent() { return { ok: true, items: [{ id: "draft-1", body: "Prepared locally" }] }; } },
    });
    const stored = getOperatorSession(session.id, options);
    const project = loadProject({ ...options, projectId: "default" });
    assert.equal(execution.pause, true);
    assert.equal(stored.status, "waiting_for_gate");
    assert.ok(stored.graphId);
    assert.ok(stored.pendingGate?.nodeIds?.includes("gate"));
    assert.ok(project.channels.some((channel) => channel.graphId === stored.graphId && channel.name === "First-workspace activation"));
  });

  it("keeps failure history inside the isolated home and attributes it to the active project", () => {
    const priorHome = process.env.GTM_IDE_HOME;
    process.env.GTM_IDE_HOME = options.root;
    try {
      logFailure({ category: "run-crash", error: new Error("boom"), session: { id: "s1", projectId: "venture-a", goal: "Private founder request" } }, { now: "2026-07-12T20:00:00Z", gitSha: "test" });
      const queueDir = resolveFrictionQueueDir();
      assert.equal(queueDir, path.join(options.root, "dogfood", "queue"));
      const reports = listFrictionQueue();
      assert.equal(reports.reports.length, 1);
      assert.equal(reports.reports[0].projectId, "venture-a");
    } finally {
      if (priorHome == null) delete process.env.GTM_IDE_HOME;
      else process.env.GTM_IDE_HOME = priorHome;
    }
  });
});
