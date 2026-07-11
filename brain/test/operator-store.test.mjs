import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { defaultGraphTemplate } from "../src/graph.mjs";
import { saveFlow } from "../src/flow-store.mjs";
import { createProject, saveProject } from "../src/project-store.mjs";
import {
  appendOperatorEvent,
  armNextWake,
  assertOperatorSessionProject,
  bindOperatorSessionContext,
  branchOperatorSessionForBoth,
  createOperatorSession,
  getActiveSessionForProject,
  getOperatorSession,
  getOrCreateSessionForProject,
  handoffOperatorSession,
  isAmbientSession,
  listFlowsNeedingFounder,
  listOperatorComparisonGroups,
  listOperatorSessions,
  publicOperatorSession,
  recoverInterruptedOperatorSessions,
  saveOperatorSession,
  sessionKind,
} from "../src/operator-store.mjs";

describe("durable operator sessions", () => {
  let parent;
  let options;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-operator-"));
    options = { root: parent };
  });

  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  it("creates, updates, lists, and reloads a session", () => {
    let session = createOperatorSession({ goal: "Build and run a Buffalo founder outreach loop." }, options);
    session = appendOperatorEvent(session, { type: "observation", title: "Inspected graph" });
    session = saveOperatorSession({ ...session, status: "waiting_for_input" }, options);

    recoverInterruptedOperatorSessions(options);
    const loaded = getOperatorSession(session.id, options);
    assert.equal(loaded.status, "waiting_for_input");
    assert.equal(loaded.events.length, 2);
    assert.equal(listOperatorSessions(options)[0].id, session.id);
    assert.equal(publicOperatorSession(loaded).modelMessages, undefined);
  });

  it("marks a persisted running session as interrupted and resumable", () => {
    const session = createOperatorSession({ goal: "Inspect the current loop." }, options);
    saveOperatorSession({ ...session, status: "running" }, options);
    recoverInterruptedOperatorSessions(options);
    const loaded = getOperatorSession(session.id, options);
    assert.equal(loaded.status, "interrupted");
    assert.match(loaded.error, /resume/i);
  });

  it("binds semantic view context and stable pointers without copying their records", () => {
    const graph = { ...defaultGraphTemplate(), id: "graph-1" };
    saveFlow(graph, options);
    const project = createProject({ id: "product-a", name: "Product A" }, options).project;
    saveProject({ ...project, channels: [{ id: "pipeline-1", graphId: graph.id, name: "Pipeline 1", objective: "Activation", kind: "custom", enabled: true }] }, options);
    const session = createOperatorSession({
      goal: "Investigate activation.", projectId: "product-a", questionId: "q-1",
      participantRefs: [{ type: "teammate", id: "researcher" }],
      productRefs: [{ type: "product-element", id: "activation" }],
      surface: "terrain", lens: "canvas", focusRef: "question:q-1", graphId: "graph-1", runId: "run-1",
      contextRefs: ["product-truth:truth-1"],
    }, options);
    assert.equal(session.surface, "terrain");
    assert.equal(session.lens, "canvas");
    assert.equal(session.questionId, "q-1");
    assert.deepEqual(session.focusRef, { type: "question", id: "q-1" });
    assert.deepEqual(session.participantRefs, [{ type: "teammate", id: "researcher" }]);
    assert.deepEqual(session.productRefs, [{ type: "product-element", id: "activation" }]);
    assert.ok(session.contextRefs.some((ref) => ref.type === "graph" && ref.id === "graph-1"));
    assert.ok(session.contextRefs.some((ref) => ref.type === "run" && ref.id === "run-1"));
    assert.ok(session.contextRefs.some((ref) => ref.type === "product-truth" && ref.id === "truth-1"));
    assert.equal(listOperatorSessions({ ...options, projectId: "product-a" })[0].surface, "terrain");
    assert.equal(publicOperatorSession(session).lens, "canvas");

    const focused = bindOperatorSessionContext(session.id, {
      surface: "pipeline", lens: "canvas", focusRef: "pipeline:pipeline-1",
    }, options);
    assert.equal(focused.surface, "pipeline");
    assert.equal(focused.lens, "canvas");
    assert.equal(focused.focusRef.type, "pipeline");
    const cleared = bindOperatorSessionContext(session.id, { surface: "terrain", lens: "canvas", focusRef: null }, options);
    assert.equal(cleared.focusRef, null, "an explicit empty focus clears stale question or pipeline focus");
    assert.throws(() => bindOperatorSessionContext(session.id, { focusRef: { type: "question", id: "q-other", projectId: "product-b" } }, options), /belongs to project product-b, not product-a/);
    assert.throws(() => bindOperatorSessionContext(session.id, { projectId: "product-b" }, options), /belongs to project product-a, not product-b/);
    assert.throws(() => bindOperatorSessionContext(session.id, { surface: "viewport", lens: "canvas" }, options), /surface must be one of/);
    assert.throws(() => bindOperatorSessionContext(session.id, { focusRef: "untyped-focus" }, options), /requires type and id/);
  });

  it("refuses cross-project graph ids when a session is created or rebound", () => {
    const graphA = { ...defaultGraphTemplate(), id: "graph-a" };
    const graphB = { ...defaultGraphTemplate(), id: "graph-b" };
    saveFlow(graphA, options);
    saveFlow(graphB, options);
    const projectA = createProject({ id: "project-a", name: "Project A" }, options).project;
    const projectB = createProject({ id: "project-b", name: "Project B" }, options).project;
    saveProject({ ...projectA, channels: [{ id: "pipeline-a", graphId: graphA.id, name: "A", objective: "A", kind: "custom", enabled: true }] }, options);
    saveProject({ ...projectB, channels: [{ id: "pipeline-b", graphId: graphB.id, name: "B", objective: "B", kind: "custom", enabled: true }] }, options);

    assert.throws(
      () => createOperatorSession({ goal: "Cross the boundary.", projectId: projectA.id, graphId: graphB.id }, options),
      /Graph graph-b does not belong to project project-a/,
    );
    const session = createOperatorSession({ goal: "Stay in A.", projectId: projectA.id, graphId: graphA.id }, options);
    assert.throws(
      () => bindOperatorSessionContext(session.id, { graphId: graphB.id }, options),
      /Graph graph-b does not belong to project project-a/,
    );
    assert.equal(getOperatorSession(session.id, options).graphId, graphA.id);
  });

  it("sanitizes the entire public session envelope while preserving founder-useful state and refs", () => {
    const session = createOperatorSession({ goal: "Review this.", projectId: "product-a", questionId: "q-1" }, options);
    const publicSession = publicOperatorSession({
      ...session,
      runtimeSessionId: "sdk-secret",
      runtime: "claude-code",
      model: "internal-model",
      spentUsd: 9,
      modelMessages: [{ role: "user", content: "raw transcript" }],
      pendingGate: {
        runId: "run-1",
        nodeIds: ["gate-1"],
        runResult: {
          runId: "run-1", graphId: "graph-1", ok: true, pendingGates: ["gate-1"], runtimeSessionId: "nested-runtime",
          nodes: {
            "gate-1": {
              nodeId: "gate-1", category: "gate", ok: true, pendingReview: true,
              items: [{ id: "draft-1", subject: "Founder review", plainLanguageTitle: "Send this note", whatYourYesDoes: "Stages this note for release", agentPrompt: "raw prompt", transcript: "raw transcript" }],
              credentials: { token: "secret" },
            },
          },
        },
      },
      pendingProposal: { id: "proposal-1", rationale: "Try this", preview: { nodes: [{ id: "n-1", soul: "raw soul", label: "Research" }] } },
      events: [{ type: "note", title: "Useful", data: { systemPrompt: "raw", status: "ready" } }],
    });
    assert.equal(publicSession.status, "ready");
    assert.equal(publicSession.surface, null);
    assert.equal(publicSession.lens, null);
    assert.equal(publicSession.questionId, "q-1");
    const gateItem = publicSession.pendingGate.runResult.nodes["gate-1"].items[0];
    assert.equal(gateItem.id, "draft-1");
    assert.equal(gateItem.plainLanguageTitle, "Send this note");
    assert.equal(gateItem.whatYourYesDoes, "Stages this note for release");
    assert.deepEqual(publicSession.pendingGate.runResult.pendingGates, ["gate-1"]);
    assert.equal(publicSession.pendingProposal.preview.nodes[0].label, "Research");
    const json = JSON.stringify(publicSession);
    for (const privateValue of ["runtimeSessionId", "sdk-secret", "nested-runtime", "raw transcript", "credentials", "secret", "agentPrompt", "raw prompt", "raw soul", "systemPrompt", "internal-model"]) {
      assert.ok(!json.includes(privateValue), `public session leaked ${privateValue}`);
    }
  });

  it("hands durable canvas context between runtimes without carrying provider conversation state", () => {
    const project = createProject({ id: "handoff-project", name: "Handoff" }, options).project;
    const session = createOperatorSession({
      goal: "Fix activation", projectId: project.id, runtime: "claude-code", model: "claude-opus-4-8",
      focusRef: { type: "goal", id: "activation" },
      contextRefs: [{ type: "work-artifact", id: "onboarding-read" }],
      modelMessages: [{ role: "assistant", content: "provider-private continuity" }],
    }, options);
    const handed = handoffOperatorSession(session.id, {
      projectId: project.id, target: "codex", model: "gpt-5.5-codex",
      expectedRevision: 0, idempotencyKey: "handoff-1",
    }, options);

    assert.equal(handed.runtime, "codex");
    assert.equal(handed.model, "gpt-5.5-codex");
    assert.equal(handed.runtimeSessionId, null);
    assert.deepEqual(handed.modelMessages, []);
    assert.deepEqual(handed.focusRef, { type: "goal", id: "activation" });
    assert.ok(handed.contextRefs.some((ref) => ref.type === "work-artifact" && ref.id === "onboarding-read"));
    assert.equal(handed.handoffRevision, 1);
    assert.equal(handed.handoffs[0].blocking, false);
    assert.equal(publicOperatorSession(handed).worker.runtime, "codex");
    assert.equal(JSON.stringify(publicOperatorSession(handed)).includes("provider-private continuity"), false);
    assert.equal(handoffOperatorSession(session.id, {
      projectId: project.id, target: "codex", model: "gpt-5.5-codex",
      expectedRevision: 0, idempotencyKey: "handoff-1",
    }, options).handoffRevision, 1, "retry returns the existing receipt before revision validation");
    assert.throws(() => handoffOperatorSession(session.id, {
      projectId: project.id, target: "claude", expectedRevision: 0, idempotencyKey: "stale",
    }, options), /Stale runtime handoff revision/);
    assert.throws(() => handoffOperatorSession(session.id, {
      projectId: "another-project", target: "claude", expectedRevision: 1, idempotencyKey: "foreign",
    }, options), /belongs to project/);

    const automatic = handoffOperatorSession(session.id, {
      projectId: project.id, target: "auto", expectedRevision: 1, idempotencyKey: "handoff-auto",
    }, options);
    assert.equal(automatic.runtime, null);
    assert.equal(automatic.model, null);
    assert.equal(publicOperatorSession(automatic).worker.runtime, "auto");
  });

  it("creates explicit Claude and Codex branches from one identical durable context", () => {
    const project = createProject({ id: "both-project", name: "Both" }, options).project;
    const parent = createOperatorSession({
      goal: "Challenge this positioning", projectId: project.id,
      focusRef: { type: "work-artifact", id: "positioning" },
      contextRefs: [{ type: "goal", id: "positioning-goal" }],
    }, options);
    const branches = branchOperatorSessionForBoth(parent.id, {
      projectId: project.id, expectedRevision: 0, idempotencyKey: "both-1",
    }, options);
    assert.equal(branches.length, 2);
    assert.deepEqual(branches.map((item) => item.runtime).sort(), ["claude-code", "codex"]);
    assert.equal(branches[0].branchGroupId, branches[1].branchGroupId);
    assert.ok(branches.every((item) => item.parentSessionId === parent.id));
    assert.ok(branches.every((item) => item.focusRef.id === "positioning"));
    assert.ok(branches.every((item) => item.contextRefs.some((ref) => ref.id === "positioning-goal")));
    assert.equal(branchOperatorSessionForBoth(parent.id, {
      projectId: project.id, expectedRevision: 0, idempotencyKey: "both-1",
    }, options)[0].id, branches[0].id, "ask-both retry does not duplicate branches");
  });

  it("reconstructs bounded, project-scoped ask-both comparisons without creating or choosing work", () => {
    const a = createProject({ id: "comparison-a", name: "A" }, options).project;
    const b = createProject({ id: "comparison-b", name: "B" }, options).project;
    const parentA = createOperatorSession({ goal: "Compare A", projectId: a.id }, options);
    const parentB = createOperatorSession({ goal: "Compare B", projectId: b.id }, options);
    const branchesA = branchOperatorSessionForBoth(parentA.id, {
      projectId: a.id, expectedRevision: 0, idempotencyKey: "compare-a",
    }, options);
    branchOperatorSessionForBoth(parentB.id, {
      projectId: b.id, expectedRevision: 0, idempotencyKey: "compare-b",
    }, options);
    const sessionCount = listOperatorSessions(options).length;

    const groups = listOperatorComparisonGroups({ ...options, projectId: a.id });
    assert.equal(groups.length, 1);
    assert.equal(groups[0].parentSessionId, parentA.id);
    assert.equal(groups[0].projectId, a.id);
    assert.deepEqual(groups[0].branches.map((branch) => branch.id).sort(), branchesA.map((branch) => branch.id).sort());
    assert.ok(groups[0].branches.every((branch) => branch.projectId === a.id));
    assert.ok(groups[0].branches.every((branch) => branch.worker?.runtime === "claude" || branch.worker?.runtime === "codex"));
    assert.equal(groups[0].selectedSessionId, undefined);
    assert.equal(groups[0].winner, undefined);
    assert.equal(listOperatorSessions(options).length, sessionCount, "the projection performs no writes or duplicate drives");
    assert.deepEqual(listOperatorComparisonGroups({ ...options, projectId: "missing" }), []);
    assert.deepEqual(listOperatorComparisonGroups(options), [], "an unscoped comparison read is refused closed");

    const capped = createProject({ id: "comparison-cap", name: "Cap" }, options).project;
    for (let index = 0; index < 27; index += 1) {
      const parent = createOperatorSession({ goal: `Compare ${index}`, projectId: capped.id }, options);
      branchOperatorSessionForBoth(parent.id, {
        projectId: capped.id, expectedRevision: 0, idempotencyKey: `cap-${index}`,
      }, options);
    }
    assert.equal(listOperatorComparisonGroups({ ...options, projectId: capped.id }).length, 25,
      "the bootstrap projection remains bounded while durable sessions stay intact");
  });
});

describe("durable operator conversations per canvas work thread", () => {
  let parent;
  let options;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-operator-project-"));
    options = { root: parent };
  });

  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  it("get-or-create returns the same session for a project across calls", () => {
    const first = getOrCreateSessionForProject("rodentradar", { goal: "Stand up the outbound channel." }, options);
    assert.equal(first.created, true);
    assert.equal(first.session.projectId, "rodentradar");

    const second = getOrCreateSessionForProject("rodentradar", { goal: "A different prompt entirely." }, options);
    assert.equal(second.created, false);
    assert.equal(second.session.id, first.session.id, "the project's existing live thread is reused, not duplicated");

    // The active-session lookup agrees with get-or-create.
    assert.equal(getActiveSessionForProject("rodentradar", options).id, first.session.id);
  });

  it("a second project gets its own session", () => {
    const a = getOrCreateSessionForProject("rodentradar", { goal: "Outbound." }, options);
    const b = getOrCreateSessionForProject("other-product", { goal: "Referral." }, options);
    assert.notEqual(a.session.id, b.session.id);
    assert.equal(b.session.projectId, "other-product");
    // Each project resolves only its own thread.
    assert.equal(getActiveSessionForProject("rodentradar", options).id, a.session.id);
    assert.equal(getActiveSessionForProject("other-product", options).id, b.session.id);
  });

  it("keeps simultaneous goal and work threads independent inside one project", () => {
    const activation = getOrCreateSessionForProject("rodentradar", {
      goal: "Fix activation.", threadRef: "goal:activation",
    }, options);
    const positioning = getOrCreateSessionForProject("rodentradar", {
      goal: "Rework positioning.", threadRef: "goal:positioning",
    }, options);
    const activationAgain = getOrCreateSessionForProject("rodentradar", {
      goal: "Continue activation.", threadRef: "goal:activation",
    }, options);

    assert.notEqual(activation.session.id, positioning.session.id);
    assert.equal(activationAgain.created, false);
    assert.equal(activationAgain.session.id, activation.session.id);
    assert.equal(getActiveSessionForProject("rodentradar", { ...options, threadRef: "goal:positioning" }).id, positioning.session.id);
  });

  it("honors the explicit projectId regardless of any global default", () => {
    // No active-project global is consulted here — the projectId passed IS the binding.
    const { session } = getOrCreateSessionForProject("explicit-project", { goal: "Explicit binding." }, options);
    assert.equal(session.projectId, "explicit-project");
    assert.equal(getActiveSessionForProject("explicit-project", options).id, session.id);
  });

  it("does not reuse a terminal session as the active thread", () => {
    const first = getOrCreateSessionForProject("rodentradar", { goal: "First run." }, options);
    // Complete it — terminal sessions become reopenable history, never the live thread.
    saveOperatorSession({ ...getOperatorSession(first.session.id, options), status: "completed" }, options);

    assert.equal(getActiveSessionForProject("rodentradar", options), null, "a completed session is not the active thread");

    const next = getOrCreateSessionForProject("rodentradar", { goal: "Pick up the next goal." }, options);
    assert.equal(next.created, true);
    assert.notEqual(next.session.id, first.session.id);

    // The terminal session still lists as history.
    const ids = listOperatorSessions({ ...options, projectId: "rodentradar" }).map((summary) => summary.id);
    assert.ok(ids.includes(first.session.id), "the completed session remains listable history");
    assert.ok(ids.includes(next.session.id));
  });

  it("asserts a session belongs to the requested project before driving it", () => {
    const { session } = getOrCreateSessionForProject("rodentradar", { goal: "Owned by rodentradar." }, options);
    assert.equal(assertOperatorSessionProject(session.id, "rodentradar", options).id, session.id);
    assert.throws(
      () => assertOperatorSessionProject(session.id, "some-other-project", options),
      /belongs to project rodentradar, not some-other-project/,
    );
  });
});

describe("ambient (standing-brief) operator sessions", () => {
  let parent;
  let options;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-operator-ambient-"));
    options = { root: parent };
  });

  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  it("creates an ambient session WITHOUT a goal, from a standing brief", () => {
    const session = createOperatorSession(
      { kind: "ambient", standingBrief: "Watch the repo for new contributors and draft a welcome.", projectId: "rodentradar" },
      options,
    );
    assert.equal(sessionKind(session), "ambient");
    assert.equal(isAmbientSession(session), true);
    assert.equal(session.goal, null, "an ambient session carries no goal");
    assert.match(session.standingBrief, /new contributors/);
    // The created event reflects the standing brief, not a goal.
    assert.equal(session.events[0].detail, session.standingBrief);
    // Round-trips durably.
    assert.equal(getOperatorSession(session.id, options).standingBrief, session.standingBrief);
  });

  it("arms a recurring brief's next wake from its cadence, and leaves an event-only brief unscheduled", () => {
    // A recurring standing brief carries a cadence — the store arms nextWakeAt one cadence out at
    // creation, so the standing-brief tick has a real fire time to wake it on (the re-arm mechanism the
    // wake runtime depends on, owned HERE in the store, not claimed elsewhere).
    const hourly = 3_600_000;
    const recurring = createOperatorSession(
      { kind: "ambient", standingBrief: "Hourly: scan for new signups.", wakeIntervalMs: hourly },
      options,
    );
    assert.equal(recurring.wakeIntervalMs, hourly);
    const armed = new Date(recurring.nextWakeAt).getTime();
    const createdMs = new Date(recurring.createdAt).getTime();
    assert.ok(Number.isFinite(armed) && armed === createdMs + hourly, "the first wake is armed one cadence after creation");
    // It survives a reload (durable founder-set schedule).
    assert.equal(getOperatorSession(recurring.id, options).nextWakeAt, recurring.nextWakeAt);

    // An event-only brief (no cadence) is never auto-scheduled — only the input router wakes it.
    const eventOnly = createOperatorSession(
      { kind: "ambient", standingBrief: "Wake on each new GitHub issue." },
      options,
    );
    assert.equal(eventOnly.wakeIntervalMs, null);
    assert.equal(eventOnly.nextWakeAt, null, "no cadence means no scheduled wake — the tick leaves it alone");

    // armNextWake is the one place the next fire is computed: a cadence yields a future ISO time, no
    // cadence yields null.
    assert.equal(armNextWake({ wakeIntervalMs: hourly }, 0), new Date(hourly).toISOString());
    assert.equal(armNextWake({}), null);
    assert.equal(armNextWake({ wakeIntervalMs: 0 }), null);
  });

  it("still requires a goal for a goal session, and a standing brief for an ambient one", () => {
    assert.throws(() => createOperatorSession({}, options), /goal or pinned question is required/);
    assert.throws(() => createOperatorSession({ kind: "ambient" }, options), /standing brief/i);
    // A legacy session (no kind) defaults to "goal".
    assert.equal(sessionKind({}), "goal");
    assert.equal(sessionKind({ goal: "x" }), "goal");
  });

  it("lets a goal session and an ambient session coexist for one project without clobbering", () => {
    const goal = getOrCreateSessionForProject("rodentradar", { goal: "Stand up outbound." }, options);
    const ambient = getOrCreateSessionForProject(
      "rodentradar",
      { kind: "ambient", standingBrief: "Wake on each new GitHub issue." },
      options,
    );
    assert.notEqual(goal.session.id, ambient.session.id, "the two kinds are separate sessions");
    assert.equal(ambient.session.kind, "ambient");

    // The per-kind lock resolves each slot independently — neither displaces the other.
    assert.equal(getActiveSessionForProject("rodentradar", options).id, goal.session.id, "default lookup is the goal slot");
    assert.equal(getActiveSessionForProject("rodentradar", { ...options, kind: "goal" }).id, goal.session.id);
    assert.equal(getActiveSessionForProject("rodentradar", { ...options, kind: "ambient" }).id, ambient.session.id);

    // get-or-create reuses each slot's live session, never spawning a parallel one of the same kind.
    assert.equal(getOrCreateSessionForProject("rodentradar", { goal: "again" }, options).session.id, goal.session.id);
    assert.equal(
      getOrCreateSessionForProject("rodentradar", { kind: "ambient", standingBrief: "again" }, options).session.id,
      ambient.session.id,
    );

    // Drive each session independently; the writes are disjoint (per-id documents), so neither
    // clobbers the other's events or status.
    saveOperatorSession(appendOperatorEvent({ ...goal.session, status: "running" }, { type: "goal_event", title: "goal moved" }), options);
    saveOperatorSession(appendOperatorEvent({ ...ambient.session, status: "waiting_for_input" }, { type: "ambient_event", title: "ambient moved" }), options);

    const goalReloaded = getOperatorSession(goal.session.id, options);
    const ambientReloaded = getOperatorSession(ambient.session.id, options);
    assert.equal(goalReloaded.status, "running");
    assert.equal(ambientReloaded.status, "waiting_for_input");
    assert.ok(goalReloaded.events.some((e) => e.type === "goal_event"));
    assert.ok(!goalReloaded.events.some((e) => e.type === "ambient_event"), "the ambient event did not bleed into the goal session");
    assert.ok(ambientReloaded.events.some((e) => e.type === "ambient_event"));
    assert.ok(!ambientReloaded.events.some((e) => e.type === "goal_event"), "the goal event did not bleed into the ambient session");
  });

  it("cancellation and restart recovery still work per session across kinds", () => {
    const goal = getOrCreateSessionForProject("rodentradar", { goal: "Outbound." }, options);
    const ambient = getOrCreateSessionForProject(
      "rodentradar",
      { kind: "ambient", standingBrief: "Wake on each new release." },
      options,
    );

    // Cancel the ambient session only — the goal session is untouched (per-session status flip).
    saveOperatorSession({ ...getOperatorSession(ambient.session.id, options), status: "cancelled" }, options);
    assert.equal(getOperatorSession(ambient.session.id, options).status, "cancelled");
    assert.equal(getActiveSessionForProject("rodentradar", { ...options, kind: "ambient" }), null, "a cancelled ambient session is no longer the live ambient thread");
    assert.equal(getActiveSessionForProject("rodentradar", options).id, goal.session.id, "the goal thread survives the ambient cancel");

    // Both kinds participate in restart recovery: a running session of either kind is marked interrupted.
    saveOperatorSession({ ...getOperatorSession(goal.session.id, options), status: "running" }, options);
    const ambient2 = createOperatorSession(
      { kind: "ambient", standingBrief: "Another standing brief.", projectId: "rodentradar" },
      options,
    );
    saveOperatorSession({ ...ambient2, status: "running" }, options);

    recoverInterruptedOperatorSessions(options);
    assert.equal(getOperatorSession(goal.session.id, options).status, "interrupted");
    assert.equal(getOperatorSession(ambient2.id, options).status, "interrupted");
  });

  it("lists the flows currently paused at a founder gate, across kinds", () => {
    const goal = getOrCreateSessionForProject("rodentradar", { goal: "Outbound." }, options);
    const ambient = getOrCreateSessionForProject(
      "rodentradar",
      { kind: "ambient", standingBrief: "Wake on each new issue." },
      options,
    );
    const other = getOrCreateSessionForProject("other-product", { goal: "Referral." }, options);

    // Pause the goal session at a gate, the ambient one at a gate, leave the other-product one ready.
    saveOperatorSession(
      { ...goal.session, status: "waiting_for_gate", graphId: "flow-goal", pendingGate: { runId: "run-g", nodeIds: ["gate-1"] } },
      options,
    );
    saveOperatorSession(
      { ...ambient.session, status: "waiting_for_gate", graphId: "flow-ambient", pendingGate: { runId: "run-a", nodeIds: ["gate-2", "gate-3"] } },
      options,
    );

    const needs = listFlowsNeedingFounder({ ...options, projectId: "rodentradar" });
    assert.equal(needs.length, 2, "both gate-paused sessions in the project surface");
    const byKind = Object.fromEntries(needs.map((n) => [n.kind, n]));
    assert.equal(byKind.goal.graphId, "flow-goal");
    assert.equal(byKind.goal.runId, "run-g");
    assert.deepEqual(byKind.goal.gateNodeIds, ["gate-1"]);
    assert.equal(byKind.ambient.graphId, "flow-ambient");
    assert.deepEqual(byKind.ambient.gateNodeIds, ["gate-2", "gate-3"]);
    assert.equal(byKind.ambient.label, ambient.session.standingBrief, "an ambient flow is labeled by its standing brief");

    // Scoped to the project: the other-product (non-gated) session does not appear.
    assert.ok(!needs.some((n) => n.projectId === "other-product"));
    // And across the whole store both projects are visible, still only the gated ones.
    saveOperatorSession({ ...other.session, status: "ready" }, options);
    assert.equal(listFlowsNeedingFounder(options).length, 2);
  });
});
