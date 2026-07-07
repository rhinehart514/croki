import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createProject } from "../src/project-store.mjs";
import { createOperatorSession, saveOperatorSession, getOperatorSession } from "../src/operator-store.mjs";
import { appendInput, markRouted } from "../src/inputs-store.mjs";
import { getPendingInbox } from "../src/pending-inbox.mjs";

// Drive a fresh session into one of the founder-decision statuses and persist it, mirroring how the
// runtime pauses a session (status flip + pending payload) without importing the runtime.
function pauseSession(projectId, { goal, graphId, status, patch }, options) {
  const session = createOperatorSession({ goal, graphId, projectId }, options);
  return saveOperatorSession({ ...session, status, ...patch }, options);
}

describe("pending-decision inbox projection", () => {
  let parent;
  let options;
  let p1;
  let p2;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-pending-inbox-"));
    options = { root: parent };
    p1 = createProject({ name: "RodentRadar" }, options).project.id;
    p2 = createProject({ name: "Strelva" }, options).project.id;
  });

  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  it("aggregates pending items of several kinds across pipelines and projects into one list", () => {
    // Project 1, pipeline A: a run staged at the gate.
    pauseSession(p1, {
      goal: "Land a pest-control pilot", graphId: "pipeline-a", status: "waiting_for_gate",
      patch: { pendingGate: { runId: "run-1", nodeIds: ["gate-1"], graphId: "pipeline-a" } },
    }, options);
    // Project 1, pipeline B: an ideate pause with two directions to build or cut.
    pauseSession(p1, {
      goal: "Find a content angle", graphId: "pipeline-b", status: "waiting_for_ideas",
      patch: { pendingIdeas: { goal: "content", ideas: [{ id: "i1" }, { id: "i2" }], cut: [{ id: "i3" }] } },
    }, options);
    // Project 2, pipeline C: a run that died.
    pauseSession(p2, {
      goal: "Warm intro sequence", graphId: "pipeline-c", status: "failed",
      patch: { error: "The research step could not reach the source." },
    }, options);
    // Noise that must NOT appear: a running session and a completed one.
    pauseSession(p2, { goal: "in flight", graphId: "pipeline-c", status: "running", patch: {} }, options);
    pauseSession(p1, { goal: "done", graphId: "pipeline-a", status: "completed", patch: {} }, options);
    // An unrouted world-signal (pending) and a routed one (decided — excluded).
    const pending = appendInput(p1, { kind: "signup", source: "landing" }, options);
    const routed = appendInput(p1, { kind: "star", source: "github" }, options);
    markRouted(p1, routed.id, "pipeline-a", options);

    const inbox = getPendingInbox({}, options);

    // Four things wait: gate + ideas + failed + the one unrouted signal.
    assert.equal(inbox.total, 4);
    assert.equal(inbox.decisions.length, 4);
    assert.equal(inbox.byKind.gate, 1);
    assert.equal(inbox.byKind.ideas, 1);
    assert.equal(inbox.byKind.failed, 1);
    assert.equal(inbox.byKind.signal, 1);

    const kinds = inbox.decisions.map((d) => d.kind).sort();
    assert.deepEqual(kinds, ["failed", "gate", "ideas", "signal"]);

    // Nothing running or completed leaked in.
    assert.ok(!inbox.decisions.some((d) => d.title === "in flight"));
    assert.ok(!inbox.decisions.some((d) => d.title === "done"));

    // Each item names its product and carries a summary + waiting timestamp.
    const gate = inbox.decisions.find((d) => d.kind === "gate");
    assert.equal(gate.projectId, p1);
    assert.equal(gate.projectName, "RodentRadar");
    assert.equal(gate.pipelineId, "pipeline-a");
    assert.equal(gate.sessionId != null, true);
    assert.ok(gate.summary && gate.waitingSince);

    // The ideate item reports its option count.
    const ideas = inbox.decisions.find((d) => d.kind === "ideas");
    assert.equal(ideas.optionCount, 2);

    const failed = inbox.decisions.find((d) => d.kind === "failed");
    assert.equal(failed.projectName, "Strelva");
    assert.match(failed.summary, /research step/);
  });

  it("scopes to one project when a projectId is passed", () => {
    pauseSession(p1, {
      goal: "gate here", graphId: "pipeline-a", status: "waiting_for_gate",
      patch: { pendingGate: { runId: "r", nodeIds: ["g"], graphId: "pipeline-a" } },
    }, options);
    pauseSession(p2, {
      goal: "gate there", graphId: "pipeline-c", status: "waiting_for_gate",
      patch: { pendingGate: { runId: "r2", nodeIds: ["g2"], graphId: "pipeline-c" } },
    }, options);
    appendInput(p2, { kind: "reply", source: "email" }, options);

    const scoped = getPendingInbox({ projectId: p1 }, options);
    assert.equal(scoped.total, 1);
    assert.equal(scoped.projectId, p1);
    assert.ok(scoped.decisions.every((d) => d.projectId === p1));
  });

  it("reports an empty inbox honestly when nothing is waiting", () => {
    // Projects exist, but no session is paused and no signal is unrouted.
    pauseSession(p1, { goal: "running", graphId: "pipeline-a", status: "running", patch: {} }, options);
    const inbox = getPendingInbox({}, options);
    assert.equal(inbox.total, 0);
    assert.deepEqual(inbox.decisions, []);
    assert.deepEqual(inbox.byKind, {});
  });

  it("re-checks the full session so a just-resolved decision drops off", () => {
    const session = pauseSession(p1, {
      goal: "was at gate", graphId: "pipeline-a", status: "waiting_for_gate",
      patch: { pendingGate: { runId: "r", nodeIds: ["g"], graphId: "pipeline-a" } },
    }, options);
    // Resolve it: status moves on and the pending payload clears.
    const full = getOperatorSession(session.id, options);
    saveOperatorSession({ ...full, status: "completed", pendingGate: null }, options);

    const inbox = getPendingInbox({}, options);
    assert.equal(inbox.total, 0);
  });
});
