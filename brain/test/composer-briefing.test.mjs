import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { buildComposerBriefing } from "../src/composer-briefing.mjs";
import { loadFlow, recordFlowRun } from "../src/flow-store.mjs";
import { resultStore } from "../src/gtm-store.mjs";
import { createOperatorSession, listOperatorSessions, saveOperatorSession } from "../src/operator-store.mjs";
import {
  createChannel,
  createProject,
  loadProjectCatalog,
  setActiveProject,
} from "../src/project-store.mjs";

function waitForNextMillisecond() {
  const start = Date.now();
  while (Date.now() === start) {
    // Keep fixture ordering deterministic for stores sorted by updatedAt.
  }
}

function recordRun(graphId, runId, options, nodes) {
  const flow = loadFlow(graphId, null, options);
  recordFlowRun(flow.graph, {
    runId,
    ok: true,
    targetNodeId: "n1",
    pendingGates: [],
    nodes,
  }, options);
}

function completeSession({ goal, projectId, graphId, runId, summary = "finished" }, options) {
  const session = createOperatorSession({ goal, projectId }, options);
  return saveOperatorSession({
    ...session,
    status: "completed",
    graphId,
    lastRunId: runId,
    completedAt: new Date().toISOString(),
    summary,
  }, options);
}

describe("composer briefing", () => {
  let parent;
  let options;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-composer-briefing-"));
    options = { root: parent };
  });

  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  it("reports empty project honesty", () => {
    const { activeProjectId: projectId } = createProject({ name: "Alpha" }, options);

    const briefing = buildComposerBriefing({ projectId }, options);

    assert.equal(briefing.gatesWaiting.length, 0);
    assert.equal(briefing.recentlyFinished.length, 0);
    assert.equal(briefing.stuck.length, 0);
    assert.equal(briefing.perPipeline.length, 0);
    assert.equal(briefing.summary, "Nothing is waiting at your gate, and no pipeline has run yet.");
  });

  it("populates gates waiting from the Wall projection", () => {
    const { activeProjectId: projectId } = createProject({ name: "Alpha" }, options);
    const session = createOperatorSession({ goal: "Review launch draft", projectId }, options);
    saveOperatorSession({
      ...session,
      status: "waiting_for_gate",
      graphId: "g1",
      lastRunId: "run-9",
      pendingGate: { graphId: "g1", runId: "run-9", nodeIds: ["gate-1"] },
    }, options);

    const briefing = buildComposerBriefing({ projectId }, options);

    assert.equal(briefing.gatesWaiting.length, 1);
    assert.equal(briefing.gatesWaiting[0].sessionId, session.id);
    assert.equal(briefing.gatesWaiting[0].graphId, "g1");
    assert.equal(briefing.gatesWaiting[0].runId, "run-9");
    assert.deepEqual(briefing.gatesWaiting[0].gateNodeIds, ["gate-1"]);
    assert.equal(briefing.gatesWaiting[0].label, "Review launch draft");
  });

  it("does not double-count gate waiting sessions as stuck", () => {
    const { activeProjectId: projectId } = createProject({ name: "Alpha" }, options);
    const session = createOperatorSession({ goal: "Approve the batch", projectId }, options);
    saveOperatorSession({
      ...session,
      status: "waiting_for_gate",
      graphId: "g1",
      lastRunId: "run-9",
      pendingGate: { graphId: "g1", runId: "run-9", nodeIds: ["gate-1"] },
    }, options);

    const briefing = buildComposerBriefing({ projectId }, options);

    assert.equal(briefing.gatesWaiting.length, 1);
    assert.equal(briefing.stuck.length, 0);
  });

  it("reports recently finished production counts from persisted runs", () => {
    const { activeProjectId: projectId } = createProject({ name: "Alpha" }, options);
    const { channel: emptyChannel } = createChannel({ name: "Empty run" }, options);
    recordRun(emptyChannel.graphId, "run-empty", options, {
      n1: { ok: true, category: "research", items: [] },
    });
    const emptySession = completeSession({
      goal: "Empty finished",
      projectId,
      graphId: emptyChannel.graphId,
      runId: "run-empty",
    }, options);

    waitForNextMillisecond();

    const { channel } = createChannel({ name: "Research" }, options);
    recordRun(channel.graphId, "run-fin", options, {
      n1: { ok: true, category: "research", items: [{ a: 1 }, { a: 2 }, { a: 3 }, { a: 4 }] },
    });
    completeSession({
      goal: "Research finished",
      projectId,
      graphId: channel.graphId,
      runId: "run-fin",
    }, options);

    const briefing = buildComposerBriefing({ projectId }, options);
    const emptyFinished = briefing.recentlyFinished.find((item) => item.sessionId === emptySession.id);

    assert.equal(briefing.recentlyFinished[0].produced, 4);
    assert.equal(briefing.recentlyFinished[0].byCategory.research, 4);
    assert.equal(emptyFinished.produced, 0);
  });

  it("joins recently finished sessions to real outcomes", () => {
    const { activeProjectId: projectId } = createProject({ name: "Alpha" }, options);
    const { channel } = createChannel({ name: "Research" }, options);
    recordRun(channel.graphId, "run-fin", options, {
      n1: { ok: true, category: "research", items: [{ a: 1 }] },
    });
    const finished = completeSession({
      goal: "Research finished",
      projectId,
      graphId: channel.graphId,
      runId: "run-fin",
    }, options);

    const { channel: noOutcomeChannel } = createChannel({ name: "No outcome" }, options);
    recordRun(noOutcomeChannel.graphId, "run-no-outcome", options, {
      n1: { ok: true, category: "research", items: [{ a: 1 }] },
    });
    const noOutcome = completeSession({
      goal: "No outcome finished",
      projectId,
      graphId: noOutcomeChannel.graphId,
      runId: "run-no-outcome",
    }, options);

    resultStore.create({
      projectId,
      runId: "run-fin",
      joinKey: "run-fin",
      outcomeKind: "reply",
      value: { count: 2 },
      observedAt: "2026-07-07T12:00:00.000Z",
    }, options);

    const briefing = buildComposerBriefing({ projectId }, options);
    const withOutcome = briefing.recentlyFinished.find((item) => item.sessionId === finished.id);
    const withoutOutcome = briefing.recentlyFinished.find((item) => item.sessionId === noOutcome.id);

    assert.deepEqual(withOutcome.outcomes, [{
      outcomeKind: "reply",
      value: { count: 2 },
      observedAt: "2026-07-07T12:00:00.000Z",
    }]);
    assert.deepEqual(withoutOutcome.outcomes, []);
  });

  it("buckets stuck sessions by status with fixed plain reasons", () => {
    const { activeProjectId: projectId } = createProject({ name: "Alpha" }, options);
    const statuses = ["failed", "interrupted", "blocked", "waiting_for_input"];
    const sessions = statuses.map((status) => {
      const session = createOperatorSession({ goal: `Goal ${status}`, projectId }, options);
      return saveOperatorSession({
        ...session,
        status,
        error: status === "failed" ? "boom" : null,
      }, options);
    });

    const briefing = buildComposerBriefing({ projectId }, options);
    const byStatus = new Map(briefing.stuck.map((item) => [item.status, item]));

    assert.equal(briefing.stuck.length, statuses.length);
    assert.equal(byStatus.get("failed").reason, "hit an error and stopped");
    assert.equal(byStatus.get("failed").error, "boom");
    assert.equal(byStatus.get("interrupted").reason, "was interrupted and can be resumed");
    assert.equal(byStatus.get("blocked").reason, "is blocked on an earlier step");
    assert.equal(byStatus.get("waiting_for_input").reason, "is waiting for your answer");
    assert.deepEqual(new Set(briefing.stuck.map((item) => item.sessionId)), new Set(sessions.map((item) => item.id)));
  });

  it("reflects real per-pipeline state", () => {
    const { activeProjectId: projectId } = createProject({ name: "Alpha" }, options);
    const { channel: runChannel } = createChannel({ name: "Moved" }, options);
    const { channel: idleChannel } = createChannel({ name: "Untouched" }, options);
    recordRun(runChannel.graphId, "run-1", options, {
      n1: { ok: true, category: "research", items: [{ a: 1 }, { a: 2 }] },
    });

    const briefing = buildComposerBriefing({ projectId }, options);
    const moved = briefing.perPipeline.find((item) => item.id === runChannel.id);
    const untouched = briefing.perPipeline.find((item) => item.id === idleChannel.id);

    assert.ok(moved.runCount >= 1);
    assert.ok(new Set(["done", "waiting", "error"]).has(moved.status));
    assert.equal(untouched.runCount, 0);
    assert.equal(untouched.status, "idle");
    assert.equal(untouched.produced, 0);
    assert.match(briefing.summary, /nothing moved on Untouched/);
  });

  it("scopes gates, pipelines, finished sessions, and stuck sessions to one project", () => {
    const { activeProjectId: projectIdA } = createProject({ name: "A" }, options);
    const { channel: channelA } = createChannel({ name: "A pipe" }, options);
    recordRun(channelA.graphId, "run-a", options, {
      n1: { ok: true, category: "research", items: [{ a: 1 }] },
    });
    const finishedA = completeSession({
      goal: "A finished",
      projectId: projectIdA,
      graphId: channelA.graphId,
      runId: "run-a",
    }, options);
    const stuckA = createOperatorSession({ goal: "A stuck", projectId: projectIdA }, options);
    saveOperatorSession({ ...stuckA, status: "blocked" }, options);
    const gateA = createOperatorSession({ goal: "A gate", projectId: projectIdA }, options);
    saveOperatorSession({
      ...gateA,
      status: "waiting_for_gate",
      graphId: "ga",
      lastRunId: "run-ga",
      pendingGate: { graphId: "ga", runId: "run-ga", nodeIds: ["gate-a"] },
    }, options);

    const { activeProjectId: projectIdB } = createProject({ name: "B" }, options);
    setActiveProject(projectIdB, options);
    const { channel: channelB } = createChannel({ name: "B pipe" }, options);
    recordRun(channelB.graphId, "run-b", options, {
      n1: { ok: true, category: "research", items: [{ b: 1 }] },
    });
    completeSession({
      goal: "B finished",
      projectId: projectIdB,
      graphId: channelB.graphId,
      runId: "run-b",
    }, options);
    const gateB = createOperatorSession({ goal: "B gate", projectId: projectIdB }, options);
    saveOperatorSession({
      ...gateB,
      status: "waiting_for_gate",
      graphId: "gb",
      lastRunId: "run-gb",
      pendingGate: { graphId: "gb", runId: "run-gb", nodeIds: ["gate-b"] },
    }, options);

    const briefing = buildComposerBriefing({ projectId: "a" }, options);

    assert.deepEqual(briefing.perPipeline.map((item) => item.id), [channelA.id]);
    assert.deepEqual(briefing.gatesWaiting.map((item) => item.sessionId), [gateA.id]);
    assert.ok(briefing.recentlyFinished.some((item) => item.sessionId === finishedA.id));
    assert.equal(briefing.recentlyFinished.some((item) => item.label === "B finished"), false);
    assert.deepEqual(briefing.stuck.map((item) => item.sessionId), [stuckA.id]);
  });

  it("uses the active project when no project id is passed", () => {
    const { activeProjectId: firstProjectId } = createProject({ name: "First" }, options);
    setActiveProject(firstProjectId, options);
    createChannel({ name: "First pipe" }, options);

    const { activeProjectId: activeProjectId } = createProject({ name: "Second" }, options);
    createChannel({ name: "Second pipe" }, options);

    const briefing = buildComposerBriefing({}, options);

    assert.equal(briefing.projectId, loadProjectCatalog(options).activeProjectId);
    assert.equal(briefing.projectId, activeProjectId);
    assert.deepEqual(briefing.perPipeline.map((item) => item.name), ["Second pipe"]);
  });

  it("does not mutate operator sessions, flows, or the project catalog", () => {
    const { activeProjectId: projectId } = createProject({ name: "Alpha" }, options);
    const { channel } = createChannel({ name: "Research" }, options);
    recordRun(channel.graphId, "run-1", options, {
      n1: { ok: true, category: "research", items: [{ a: 1 }] },
    });
    completeSession({
      goal: "Research finished",
      projectId,
      graphId: channel.graphId,
      runId: "run-1",
    }, options);

    buildComposerBriefing({ projectId }, options);
    const beforeSessions = JSON.stringify(listOperatorSessions(options));
    const beforeFlow = JSON.stringify(loadFlow(channel.graphId, null, options));
    const beforeCatalog = JSON.stringify(loadProjectCatalog(options));

    buildComposerBriefing({ projectId }, options);

    assert.equal(JSON.stringify(listOperatorSessions(options)), beforeSessions);
    assert.equal(JSON.stringify(loadFlow(channel.graphId, null, options)), beforeFlow);
    assert.equal(JSON.stringify(loadProjectCatalog(options)), beforeCatalog);
  });

  it("keeps summary deterministic for identical state", () => {
    const { activeProjectId: projectId } = createProject({ name: "Alpha" }, options);
    createChannel({ name: "Research" }, options);
    const session = createOperatorSession({ goal: "Needs answer", projectId }, options);
    saveOperatorSession({ ...session, status: "waiting_for_input" }, options);

    const first = buildComposerBriefing({ projectId }, options);
    const second = buildComposerBriefing({ projectId }, options);

    assert.equal(first.summary, second.summary);
  });
});
