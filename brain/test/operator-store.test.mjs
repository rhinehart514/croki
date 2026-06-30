import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  appendOperatorEvent,
  armNextWake,
  assertOperatorSessionProject,
  createOperatorSession,
  getActiveSessionForProject,
  getOperatorSession,
  getOrCreateSessionForProject,
  isAmbientSession,
  listFlowsNeedingFounder,
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
});

describe("one durable operator conversation per project", () => {
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
    assert.throws(() => createOperatorSession({}, options), /goal is required/);
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
