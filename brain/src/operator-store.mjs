import crypto from "node:crypto";
import { persistence } from "./persistence.mjs";

const SCHEMA_VERSION = 1;
const COLLECTION = "operator-sessions";

// The statuses that close a session for good — it becomes reopenable history, never the dock's live
// thread. Everything else (ready, running, waiting_*, interrupted, blocked, failed) is a session the
// founder can still drive, so it remains eligible to be the project's active conversation. Mirrors
// resumeOperatorSession, which only refuses completed/cancelled.
const TERMINAL_OPERATOR_STATUSES = new Set(["completed", "cancelled"]);

export function isTerminalOperatorSession(session) {
  return TERMINAL_OPERATOR_STATUSES.has(session?.status);
}

// A session is one of two KINDS, and the per-project lock is scoped by it (see
// getActiveSessionForProject). A "goal" session is the founder-driven dock thread: it is opened with a
// concrete goal and there is at most one live one per project. An "ambient" session is a standing-brief
// wake (an event trigger or a recurring brief): it is opened WITHOUT a goal and may run concurrently
// with the goal thread. Legacy sessions written before this field default to "goal".
export function sessionKind(session) {
  return session?.kind === "ambient" ? "ambient" : "goal";
}

export function isAmbientSession(session) {
  return sessionKind(session) === "ambient";
}

// Compute an ambient session's NEXT scheduled standing-brief wake from its recurring cadence. This is
// the ONE place the next fire time is derived, so the store owns the schedule and the runtime only
// consumes it (createOperatorSession arms it, wakeAmbientSession re-arms it after each wake, the
// standing-brief tick fires when it arrives). A brief that carries a wakeIntervalMs is RECURRING — after
// a wake consumes the due time, the next fire is armed this far out, so a standing brief keeps standing
// instead of going silent after one fire. A brief with NO cadence is event-only: it is woken by the
// input router on a real-world signal and never by the tick, so it re-arms to null.
export function armNextWake(session, fromMs = Date.now()) {
  const interval = Number(session?.wakeIntervalMs);
  if (!Number.isFinite(interval) || interval <= 0) return null;
  const from = Number.isFinite(fromMs) ? fromMs : Date.now();
  return new Date(from + interval).toISOString();
}

function now() {
  return new Date().toISOString();
}

function safeId(value) {
  return String(value || "").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 100);
}

export function appendOperatorEvent(session, event) {
  const entry = {
    id: event.id || `event-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
    createdAt: event.createdAt || now(),
    type: event.type,
    title: event.title,
    detail: event.detail ?? null,
    data: event.data ?? null,
  };
  return {
    ...session,
    events: [...(session.events ?? []), entry].slice(-500),
    updatedAt: entry.createdAt,
  };
}

export function createOperatorSession(input, options = {}) {
  const kind = sessionKind(input);
  const goal = String(input.goal || "").trim();
  // An ambient session is woken by a standing brief, not a founder-typed goal, so it does NOT require a
  // goal at creation — the standing brief takes the goal's place as the wake instruction. A goal session
  // still requires a goal exactly as before. Loosening goal-required for ambient does NOT relax the
  // wall: an ambient drive still composes and runs only to the founder gate (enforced in graph.mjs /
  // workflow-composer.mjs), never past it.
  const standingBrief = String(input.standingBrief || "").trim();
  if (kind === "ambient") {
    if (!standingBrief) throw new Error("An ambient operator session requires a standing brief.");
  } else if (!goal) {
    throw new Error("An operator goal is required.");
  }
  // A recurring standing brief carries a cadence in ms (e.g. hourly). Null for an event-only ambient
  // session (the input router wakes it on a signal) and for every goal session. Owned here as durable
  // founder-set state, never composed.
  const wakeIntervalMs = Number(input.wakeIntervalMs) > 0 ? Number(input.wakeIntervalMs) : null;
  const createdAt = now();
  const id = `op-${createdAt.replace(/\D/g, "").slice(0, 14)}-${crypto.randomBytes(4).toString("hex")}`;
  let session = {
    schemaVersion: SCHEMA_VERSION,
    id,
    kind,
    goal: goal || null,
    // The wake instruction for an ambient session — the standing brief the founder set, NOT a one-off
    // typed goal. Null for a goal session. Both kinds drive only to the founder gate.
    standingBrief: standingBrief || null,
    // A recurring standing brief's cadence in ms; null for an event-only ambient session or a goal one.
    wakeIntervalMs: kind === "ambient" ? wakeIntervalMs : null,
    // The next scheduled standing-brief wake. Armed from the cadence at creation and re-armed by the
    // store's armNextWake after each wake; the standing-brief tick fires when it arrives. Null when
    // there is no cadence (event-only) — that session is woken only by the input router, never the tick.
    nextWakeAt: kind === "ambient" ? armNextWake({ wakeIntervalMs }, Date.parse(createdAt)) : null,
    graphId: input.graphId || null,
    // The program this session is driving, when the founder opened it from a program (e.g. the
    // "Build the first agent" button). Lets the program tools bind to the intended program instead
    // of guessing the newest one.
    programId: input.programId || null,
    projectId: input.projectId || null,
    // The team that owns this session, optional and backward-compatible. Null for a solo founder's
    // local session (a team of one), set when the project is owned by a real multi-member team so the
    // Convex sync layer can attribute the conversation. Never gates anything on its own.
    teamId: input.teamId || null,
    workspaceId: input.workspaceId || null,
    model: input.model || process.env.GTM_IDE_OPERATOR_MODEL || "claude-opus-4-8",
    runtime: null,
    status: "ready",
    createdAt,
    updatedAt: createdAt,
    startedAt: null,
    completedAt: null,
    stepCount: 0,
    maxSteps: Math.max(4, Math.min(Number(input.maxSteps) || 18, 40)),
    graphRevision: Number(input.graphRevision) || 0,
    lastRunId: null,
    // The Claude Code (subscription) runtime's persisted SDK session id. Captured on the first
    // drive and resumed on every later one so the operator's conversation survives founder gates,
    // input pauses, and full process restarts — the model remembers the chat, GTM IDE owns the
    // durable state around it. Null until a Claude Code drive establishes a session.
    runtimeSessionId: null,
    summary: null,
    error: null,
    pendingQuestion: null,
    pendingGate: null,
    // A staged set of typed graph operations the operator wants to make, held for founder review on
    // the canvas (ghost nodes/edges + accept/discard) instead of applied silently. Mirrors
    // pendingGate: durable, pauses the session, resolved by the founder. "Vibe up to the gate" now
    // covers the agent editing the graph too.
    pendingProposal: null,
    events: [],
    // Usually empty (the goal becomes the first prompt). The autonomous "give it a goal and go" door
    // (/api/operator/go) seeds one priming user message so the first model turn reaches for
    // compose_and_run and drives the goal to the gate without per-step micromanagement.
    modelMessages: Array.isArray(input.modelMessages) ? input.modelMessages : [],
  };
  session = appendOperatorEvent(session, {
    type: "session_created",
    title: kind === "ambient" ? "Ambient operator session created" : "Operator session created",
    detail: goal || standingBrief,
  });
  persistence(options).set(COLLECTION, safeId(id), session);
  return session;
}

export function saveOperatorSession(session, options = {}) {
  const updated = { ...session, updatedAt: now() };
  persistence(options).set(COLLECTION, safeId(updated.id), updated);
  return updated;
}

export function getOperatorSession(id, options = {}) {
  const session = persistence(options).get(COLLECTION, safeId(id));
  if (!session) throw new Error(`Operator session not found: ${id}`);
  return session;
}

export function listOperatorSessions(options = {}) {
  // When a projectId is passed, scope the list to that project's sessions.
  // Legacy sessions written before project scoping have projectId === null and
  // surface only in the unscoped list.
  const projectFilter = options.projectId ?? null;
  return persistence(options).list(COLLECTION)
    .flatMap((session) => {
      if (!session || !session.id) return [];
      if (projectFilter && (session.projectId ?? null) !== projectFilter) return [];
      return [{
        id: session.id,
        kind: sessionKind(session),
        goal: session.goal,
        standingBrief: session.standingBrief ?? null,
        graphId: session.graphId,
        projectId: session.projectId ?? null,
        workspaceId: session.workspaceId,
        status: session.status,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        summary: session.summary,
        error: session.error,
      }];
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

// The project's current durable operator conversation of a given KIND — the dock's default thread.
// Returns the most recently updated NON-terminal session of that kind for the project, or null if none
// exist. Project-scoped (explicit projectId), so one product's thread never bleeds into another's, and
// terminal (completed/cancelled) sessions are passed over so a finished thread is never reused live.
//
// THE LOCK, AND HOW AMBIENT LOOSENS IT. The one-session-per-project rule is enforced HERE, not by a
// mutex: there is at most one live session per (project, kind) slot. It is scoped by kind, so a "goal"
// thread and an "ambient" wake are independent slots and may be live at the same time. options.kind
// selects the slot and DEFAULTS to "goal", so every existing caller keeps getting the goal thread and
// can never accidentally pick up an ambient session. This lookup is a per-kind READ — which session is
// the active thread — never a write-mutex, so it has never been the thing that serializes store writes.
//
// CONCURRENCY UNDER TWO LIVE DRIVES. Allowing a goal drive and an ambient drive to run at once is the
// first time two drives mutate one project's state concurrently, so spell out why nothing is lost.
//   - Per-id SESSION documents are disjoint: each session is its own durable doc keyed by its id, so the
//     two drives never clobber each other's events or status. Cancellation is a per-session status flip
//     and restart recovery walks each session independently — both per session, regardless of kind.
//   - SHARED, project-scoped documents that BOTH drives write — the feedback ledger (one signals[] per
//     project, feedback-ledger.mjs), the shared project context (the single project.json, written by
//     update_shared_context mid-drive), and the run derivations (person/experiment/idea) — are NOT
//     per-id-disjoint. They are safe because every one of those mutations is a SYNCHRONOUS
//     load-modify-save (updateSharedContext, recordFeedbackSignals, recordRunDerivations): under Node's
//     single-threaded event loop a synchronous function runs to completion without yielding, so two
//     concurrent drives can never interleave a read and a write of the same shared document — each RMW
//     is atomic at the store boundary and the writes serialize. The protection is synchronous atomicity,
//     not the session lock and not per-id disjointness; proven in brain/test/ambient-concurrency.test.mjs.
//     (A future RMW that awaits BETWEEN its read and its write would break this — that test guards it.)
export function getActiveSessionForProject(projectId, options = {}) {
  const kindFilter = sessionKind({ kind: options.kind });
  const summaries = listOperatorSessions({ ...options, projectId: projectId ?? null });
  const live = summaries.find(
    (summary) => !TERMINAL_OPERATOR_STATUSES.has(summary.status) && sessionKind(summary) === kindFilter,
  );
  if (!live) return null;
  return getOperatorSession(live.id, options);
}

// Get-or-create the project's durable operator conversation for a kind. If a non-terminal session of
// the requested kind already exists for this project it is returned untouched (the dock reuses the one
// locked conversation per kind); otherwise a fresh session of that kind is created bound to the
// project. The kind comes from input.kind and defaults to "goal", so an ambient get-or-create never
// reuses or displaces the goal thread and vice versa. The projectId is authoritative and threaded
// EXPLICITLY here — never inherited from a mutable global active project.
export function getOrCreateSessionForProject(projectId, input = {}, options = {}) {
  const kind = sessionKind(input);
  const existing = getActiveSessionForProject(projectId, { ...options, kind });
  if (existing) return { session: existing, created: false };
  const session = createOperatorSession({ ...input, projectId, kind }, options);
  return { session, created: true };
}

// Assert a session belongs to the requested project before driving it. The session's stored projectId
// is authoritative; a resume/gate/proposal/cancel that names a different project is rejected loudly
// rather than letting the composer drive another project's conversation. Returns the session on match.
export function assertOperatorSessionProject(sessionId, projectId, options = {}) {
  const session = getOperatorSession(sessionId, options);
  const owner = session.projectId ?? null;
  if (owner !== projectId) {
    throw new Error(`Operator session ${sessionId} belongs to project ${owner ?? "none"}, not ${projectId}.`);
  }
  return session;
}

export function publicOperatorSession(session) {
  const { modelMessages: _modelMessages, ...publicSession } = session;
  return publicSession;
}

// Cross-flow projection: "which flows need you". Every session currently PAUSED at a founder gate,
// across the project (or the whole store when no projectId is given), regardless of kind — so a goal
// thread and an ambient wake both surface here when their run stops at the Wall. This is the read side
// of the gate: it tells the founder where their approval is the blocker. It is strictly READ-ONLY — it
// never approves, resolves, advances, or auto-decides a gate; loosening the lock did not give this any
// power past the Wall. Ordered most-recently-updated first.
export function listFlowsNeedingFounder(options = {}) {
  const projectFilter = options.projectId ?? null;
  return listOperatorSessions({ ...options, projectId: projectFilter })
    .filter((summary) => summary.status === "waiting_for_gate")
    .flatMap((summary) => {
      const session = getOperatorSession(summary.id, options);
      if (session.status !== "waiting_for_gate") return [];
      const gate = session.pendingGate ?? null;
      return [{
        sessionId: session.id,
        kind: sessionKind(session),
        projectId: session.projectId ?? null,
        graphId: gate?.graphId ?? session.graphId ?? null,
        label: session.goal || session.standingBrief || null,
        runId: gate?.runId ?? session.lastRunId ?? null,
        gateNodeIds: Array.isArray(gate?.nodeIds) ? gate.nodeIds : [],
        updatedAt: session.updatedAt,
      }];
    });
}

export function recoverInterruptedOperatorSessions(options = {}) {
  const summaries = listOperatorSessions(options);
  return summaries.flatMap((summary) => {
    if (summary.status !== "running") return [];
    const session = getOperatorSession(summary.id, options);
    const recovered = saveOperatorSession(appendOperatorEvent({
      ...session,
      status: "interrupted",
      error: "The process stopped while this session was running. Resume it to continue.",
    }, {
      type: "session_interrupted",
      title: "Session interrupted",
      detail: "The durable session can be resumed from its last completed tool result.",
    }), options);
    return [recovered];
  });
}
