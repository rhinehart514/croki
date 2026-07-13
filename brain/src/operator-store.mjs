import crypto from "node:crypto";
import { persistence } from "./persistence.mjs";
import { normalizeStableRef, normalizeStableRefs } from "./operator-tools.mjs";
import { graphIdForRef } from "./operator-project-scope.mjs";
import { now } from "./store-fs.mjs";

const SCHEMA_VERSION = 1;
const COLLECTION = "operator-sessions";
const MAX_OPERATOR_COMPARISON_GROUPS = 25;
const MAX_OPERATOR_BRANCHES_PER_GROUP = 4;

// The statuses that close a session for good — it becomes reopenable history, never the dock's live
// thread. Everything else (ready, running, waiting_*, interrupted, blocked, failed) is a session the
// founder can still drive, so it remains eligible to be the project's active conversation. Mirrors
// resumeOperatorSession, which only refuses completed/cancelled.
const TERMINAL_OPERATOR_STATUSES = new Set(["completed", "cancelled"]);
const HANDOFF_BLOCKED_STATUSES = new Set(["running", ...TERMINAL_OPERATOR_STATUSES]);
const RUNTIME_TARGETS = Object.freeze({
  auto: { runtime: null, defaultModel: null, modelPattern: null },
  claude: { runtime: "claude-code", defaultModel: "claude-opus-4-8", modelPattern: /^claude-/i },
  codex: { runtime: "codex", defaultModel: "gpt-5.5-codex", modelPattern: /^gpt-/i },
});

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

function safeId(value) {
  return String(value || "").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 100);
}

const VIEW_SURFACES = new Set(["terrain", "pipeline"]);
// `operator` and `engineer` remain readable for historical sessions. New clients write `canvas` only;
// pipeline/product altitude is represented by surface + focus on the same mounted canvas.
const VIEW_LENSES = new Set(["canvas", "operator", "engineer"]);

function semanticViewValue(input, current, key, allowed) {
  if (!Object.prototype.hasOwnProperty.call(input, key) || input[key] == null || input[key] === "") return current ?? null;
  const value = String(input[key] ?? "").trim().toLowerCase();
  if (!allowed.has(value)) throw new Error(`Operator ${key} must be one of: ${[...allowed].join(", ")}.`);
  return value;
}

// The canvas wire format is `type:id`; internal callers generally pass { type, id }. Decode only the
// typed wire form here, then hand both forms to the canonical stable-ref validator below. An untyped
// string still fails validation instead of being guessed into an object kind.
function stableRefInput(value) {
  if (typeof value !== "string") return value;
  const separator = value.indexOf(":");
  if (separator <= 0 || separator === value.length - 1) return value;
  return { type: value.slice(0, separator), id: value.slice(separator + 1) };
}

function contextFromInput(input = {}, current = {}, options = {}) {
  const currentProjectId = current.projectId ?? null;
  const requestedProjectId = input.projectId ?? currentProjectId;
  if (currentProjectId && requestedProjectId && requestedProjectId !== currentProjectId) {
    throw new Error(`Operator session belongs to project ${currentProjectId}, not ${requestedProjectId}.`);
  }
  const projectId = requestedProjectId ?? null;
  const surface = semanticViewValue(input, current.surface, "surface", VIEW_SURFACES);
  const lens = semanticViewValue(input, current.lens, "lens", VIEW_LENSES);
  const questionId = String(input.questionId ?? current.questionId ?? "").trim() || null;
  const requestedGraphId = String(input.graphId ?? input.workflowId ?? input.channelId ?? current.graphId ?? "").trim() || null;
  const requestedGraphType = input.pipelineId || input.workflowId || input.channelId ? "pipeline" : "graph";
  const graphId = requestedGraphId && projectId
    ? graphIdForRef({ type: requestedGraphType, id: requestedGraphId }, { ...options, projectId })
    : requestedGraphId;
  const lastRunId = String(input.lastRunId ?? input.runId ?? current.lastRunId ?? "").trim() || null;
  const hasFocusInput = Object.prototype.hasOwnProperty.call(input, "focusRef")
    || Object.prototype.hasOwnProperty.call(input, "ref");
  const focusInput = hasFocusInput ? (input.focusRef ?? input.ref ?? null) : (current.focusRef ?? null);
  const focusRef = focusInput ? normalizeStableRef(stableRefInput(focusInput), { projectId }) : null;
  const participantInput = input.participantRefs ?? input.crewRefs ?? current.participantRefs ?? [];
  const productInput = input.productRefs ?? current.productRefs ?? [];
  const participantRefs = normalizeStableRefs(Array.isArray(participantInput)
    ? participantInput.map((value) => typeof value === "string" ? { type: "teammate", id: value } : { type: value?.type ?? value?.kind ?? "teammate", id: value?.ref ?? value?.id })
    : [], { projectId });
  const productRefs = normalizeStableRefs(Array.isArray(productInput)
    ? productInput.map((value) => typeof value === "string" ? { type: "product-element", id: value } : value)
    : [], { projectId });
  const contextRefs = normalizeStableRefs([
    ...(current.contextRefs ?? []), ...(input.contextRefs ?? input.refs ?? []).map(stableRefInput), ...participantRefs, ...productRefs,
    ...(questionId ? [{ type: "question", id: questionId }] : []),
    ...(input.pipelineId || input.channelId || input.workflowId ? [{ type: "pipeline", id: input.pipelineId ?? input.channelId ?? input.workflowId }] : []),
    ...(graphId ? [{ type: "graph", id: graphId }] : []),
    ...(lastRunId ? [{ type: "run", id: lastRunId }] : []), ...(focusRef ? [focusRef] : []),
  ], { projectId });
  const threadRef = (String(input.threadRef ?? current.threadRef ?? "project").trim() || "project").slice(0, 200);
  return { projectId, surface, lens, questionId, participantRefs, productRefs, graphId, lastRunId, focusRef, contextRefs, threadRef };
}

export function operatorEventCursor(session) {
  const persisted = session?.eventCursor;
  if (Number.isSafeInteger(persisted) && persisted >= 0) return persisted;
  const sequenced = (session?.events ?? []).reduce((highest, event) => {
    const sequence = Number(event?.sequence);
    return Number.isSafeInteger(sequence) && sequence > highest ? sequence : highest;
  }, 0);
  // Legacy sessions have retained events but no monotonic cursor. Their current retained length is a safe
  // migration baseline: every event appended from here receives a stable sequence above it.
  return sequenced || (session?.events ?? []).length;
}

export function operatorMutationBoundary(session) {
  const lastEvent = (session?.events ?? []).at(-1);
  return {
    afterEventSequence: operatorEventCursor(session),
    afterEventId: lastEvent?.id ?? null,
  };
}

export function appendOperatorEvent(session, event) {
  const nextSequence = operatorEventCursor(session) + 1;
  const requestedSequence = Number(event.sequence);
  const sequence = Number.isSafeInteger(requestedSequence) && requestedSequence > 0
    ? requestedSequence
    : nextSequence;
  const entry = {
    id: event.id || `event-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
    sequence,
    createdAt: event.createdAt || now(),
    type: event.type,
    title: event.title,
    detail: event.detail ?? null,
    data: event.data ?? null,
  };
  return {
    ...session,
    eventCursor: Math.max(operatorEventCursor(session), sequence),
    events: [...(session.events ?? []), entry].slice(-500),
    updatedAt: entry.createdAt,
  };
}

export function createOperatorSession(input, options = {}) {
  const kind = sessionKind(input);
  const goal = String(input.goal || "").trim();
  const context = contextFromInput(input, {}, options);
  // An ambient session is woken by a standing brief, not a founder-typed goal, so it does NOT require a
  // goal at creation — the standing brief takes the goal's place as the wake instruction. A goal session
  // still requires a goal exactly as before. Loosening goal-required for ambient does NOT relax the
  // wall: an ambient drive still composes and runs only to the founder gate (enforced in graph.mjs /
  // workflow-composer.mjs), never past it.
  const standingBrief = String(input.standingBrief || "").trim();
  if (kind === "ambient") {
    if (!standingBrief) throw new Error("An ambient operator session requires a standing brief.");
  } else if (!goal && !context.questionId) {
    throw new Error("An operator goal or pinned question is required.");
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
    graphId: context.graphId,
    projectId: context.projectId,
    surface: context.surface,
    lens: context.lens,
    questionId: context.questionId,
    participantRefs: context.participantRefs,
    productRefs: context.productRefs,
    focusRef: context.focusRef,
    contextRefs: context.contextRefs,
    threadRef: context.threadRef,
    // The team that owns this session, optional and backward-compatible. Null for a solo founder's
    // local session (a team of one), set when the project is owned by a real multi-member team so the
    // Convex sync layer can attribute the conversation. Never gates anything on its own.
    teamId: input.teamId || null,
    workspaceId: input.workspaceId || null,
    model: input.model && input.model !== "auto" ? input.model : process.env.GTM_IDE_OPERATOR_MODEL || null,
    runtime: input.runtime || null,
    parentSessionId: input.parentSessionId || null,
    branchGroupId: input.branchGroupId || null,
    handoffRevision: Number.isInteger(input.handoffRevision) ? input.handoffRevision : 0,
    handoffs: Array.isArray(input.handoffs) ? input.handoffs : [],
    askBothReceipts: Array.isArray(input.askBothReceipts) ? input.askBothReceipts : [],
    handoffContext: input.handoffContext ?? null,
    status: "ready",
    createdAt,
    updatedAt: createdAt,
    startedAt: null,
    completedAt: null,
    stepCount: 0,
    // Cumulative model dollars spent across every drive of this session — the session-total budget the
    // runtime throttles against (Wave 6). Durable so it survives founder pauses and process restarts.
    spentUsd: 0,
    maxSteps: Math.max(4, Math.min(Number(input.maxSteps) || 18, 40)),
    graphRevision: Number(input.graphRevision) || 0,
    lastRunId: context.lastRunId,
    // The local runtime's persisted conversation id. Captured on the first drive and resumed on every
    // later one so Claude Code or Codex remembers the chat across founder gates, input pauses, and
    // full process restarts. GTM IDE still owns the durable state around it.
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

export function bindOperatorSessionContext(id, input = {}, options = {}) {
  const session = getOperatorSession(id, options);
  return saveOperatorSession({ ...session, ...contextFromInput(input, session, options) }, options);
}

function runtimeTarget(input = {}) {
  const target = String(input.target ?? "").trim().toLowerCase();
  const config = RUNTIME_TARGETS[target];
  if (!config) throw new Error("A runtime handoff target must be auto, claude, or codex.");
  if (target === "auto") return { target, runtime: null, model: null };
  const model = String(input.model ?? config.defaultModel).trim();
  if (!config.modelPattern.test(model)) throw new Error(`Model ${model} does not belong to the ${target} runtime.`);
  return { target, runtime: config.runtime, model };
}

function handoffSnapshot(session) {
  return {
    goal: session.goal ?? null,
    focusRef: session.focusRef ?? null,
    contextRefs: session.contextRefs ?? [],
    recentFounderDirections: (session.events ?? [])
      .filter((event) => event?.type === "founder_input_received")
      .slice(-5)
      .map((event) => ({ createdAt: event.createdAt, direction: event.detail ?? event.title ?? null })),
  };
}

function assertHandoffable(session, expectedRevision) {
  if (HANDOFF_BLOCKED_STATUSES.has(session.status)) {
    throw new Error(`Operator session ${session.id} cannot change runtime while ${session.status}.`);
  }
  const actual = Number.isInteger(session.handoffRevision) ? session.handoffRevision : 0;
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) throw new Error("expectedRevision must be a non-negative integer.");
  if (expectedRevision !== actual) {
    const error = new Error(`Stale runtime handoff revision: expected ${expectedRevision}, found ${actual}.`);
    error.code = "OPERATOR_HANDOFF_CONFLICT";
    error.expectedRevision = expectedRevision;
    error.actualRevision = actual;
    throw error;
  }
  return actual;
}

function workerFor(session) {
  const model = String(session?.model ?? "");
  if (/^gpt-/i.test(model) || session?.runtime === "codex") return { runtime: "codex", model: /^gpt-/i.test(model) ? model : null };
  if (/^claude-/i.test(model) || session?.runtime === "claude-code" || session?.runtime === "anthropic") {
    return { runtime: "claude", model: /^claude-/i.test(model) ? model : null };
  }
  return { runtime: "auto", model: null };
}

export function handoffOperatorSession(sessionId, input = {}, options = {}) {
  const session = assertOperatorSessionProject(sessionId, input.projectId, options);
  const key = String(input.idempotencyKey ?? "").trim();
  if (!key) throw new Error("An idempotencyKey is required for a runtime handoff.");
  const existing = (session.handoffs ?? []).find((item) => item.idempotencyKey === key);
  const target = runtimeTarget(input);
  if (existing) {
    if (existing.to.runtime !== target.target || existing.to.model !== target.model) {
      throw new Error(`Idempotency key ${key} was already used for a different runtime handoff.`);
    }
    return session;
  }
  const revision = assertHandoffable(session, input.expectedRevision);
  const createdAt = now();
  const from = workerFor(session);
  const receipt = {
    id: `handoff-${createdAt.replace(/\D/g, "").slice(0, 14)}-${crypto.randomBytes(3).toString("hex")}`,
    idempotencyKey: key,
    from,
    to: { runtime: target.target, model: target.model },
    contextRefs: session.contextRefs ?? [],
    focusRef: session.focusRef ?? null,
    createdAt,
    blocking: false,
  };
  let next = {
    ...session,
    runtime: target.runtime,
    model: target.model,
    runtimeSessionId: null,
    modelMessages: [],
    handoffContext: handoffSnapshot(session),
    handoffRevision: revision + 1,
    handoffs: [...(session.handoffs ?? []), receipt].slice(-50),
  };
  next = appendOperatorEvent(next, {
    type: "runtime_handed_off",
    title: `Work handed to ${target.target === "codex" ? "Codex" : target.target === "claude" ? "Claude" : "Auto"}`,
    detail: "The goal, selected canvas context, and durable work carry over. Provider-private conversation state does not.",
    data: { receiptId: receipt.id, from: from.runtime, to: target.target, model: target.model },
  });
  return saveOperatorSession(next, options);
}

export function branchOperatorSessionForBoth(sessionId, input = {}, options = {}) {
  let parent = assertOperatorSessionProject(sessionId, input.projectId, options);
  const key = String(input.idempotencyKey ?? "").trim();
  if (!key) throw new Error("An idempotencyKey is required for ask both.");
  const existing = (parent.askBothReceipts ?? []).find((item) => item.idempotencyKey === key);
  if (existing) return existing.branchIds.map((id) => getOperatorSession(id, options));
  const revision = assertHandoffable(parent, input.expectedRevision);
  const claudeTarget = runtimeTarget({ target: "claude", model: input.claudeModel });
  const codexTarget = runtimeTarget({ target: "codex", model: input.codexModel });
  const at = now();
  const groupId = `ask-both-${at.replace(/\D/g, "").slice(0, 14)}-${crypto.randomBytes(3).toString("hex")}`;
  const context = handoffSnapshot(parent);
  const common = {
    goal: parent.goal,
    projectId: parent.projectId,
    graphId: parent.graphId,
    surface: parent.surface,
    lens: parent.lens,
    questionId: parent.questionId,
    participantRefs: parent.participantRefs,
    productRefs: parent.productRefs,
    focusRef: parent.focusRef,
    contextRefs: parent.contextRefs,
    threadRef: parent.threadRef,
    parentSessionId: parent.id,
    branchGroupId: groupId,
    handoffContext: context,
    maxSteps: parent.maxSteps,
  };
  const claude = createOperatorSession({ ...common, runtime: claudeTarget.runtime, model: claudeTarget.model }, options);
  const codex = createOperatorSession({ ...common, runtime: codexTarget.runtime, model: codexTarget.model }, options);
  const receipt = { id: groupId, idempotencyKey: key, branchIds: [claude.id, codex.id], createdAt: at };
  parent = appendOperatorEvent({
    ...parent,
    handoffRevision: revision + 1,
    askBothReceipts: [...(parent.askBothReceipts ?? []), receipt].slice(-25),
  }, {
    type: "runtime_branches_created",
    title: "Claude and Codex branches created",
    detail: "Each branch received the same durable canvas context. Their work stays attributable and separate.",
    data: { branchGroupId: groupId, branchIds: receipt.branchIds },
  });
  saveOperatorSession(parent, options);
  return [claude, codex];
}

export function getOperatorSession(id, options = {}) {
  const session = persistence(options).get(COLLECTION, safeId(id));
  if (!session) throw new Error(`Operator session not found: ${id}`);
  return session;
}

// Codex's stdio MCP bridge is a separate process. Use this only at that runtime boundary so a tool's
// newly persisted founder wall is visible before the host appends narration or decides the turn ended.
export function getOperatorSessionFresh(id, options = {}) {
  const session = persistence(options).getFresh(COLLECTION, safeId(id));
  if (!session) throw new Error(`Operator session not found: ${id}`);
  return session;
}

// Permanently remove a session document. This is the founder deleting a chat from their history — a
// real delete, not the client-side dismissal the dock used to do. Returns whether a document was
// removed. The caller (route) is responsible for refusing to delete a still-running session; here we
// only touch durable state, so a deleted chat never reappears on the next project load.
export function deleteOperatorSession(id, options = {}) {
  return persistence(options).delete(COLLECTION, safeId(id));
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
        surface: session.surface ?? null,
        lens: session.lens ?? null,
        questionId: session.questionId ?? null,
        participantRefs: session.participantRefs ?? [],
        productRefs: session.productRefs ?? [],
        focusRef: session.focusRef ?? null,
        contextRefs: session.contextRefs ?? [],
        threadRef: session.threadRef ?? "project",
        lastRunId: session.lastRunId ?? null,
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

// Read-only, reconstructable projection for "Ask both". The branch sessions are the durable authority;
// this does not persist a second comparison document or infer a winner. Keeping the projection bounded
// prevents old experiments from making the canvas bootstrap grow without limit, while project scoping
// happens before grouping so a forged/reused group id can never join sessions across products.
export function listOperatorComparisonGroups(options = {}) {
  const projectId = String(options.projectId ?? "").trim();
  if (!projectId) return [];
  const groups = new Map();
  // Read the collection once. In particular, do not turn canvas bootstrap into one persistence lookup
  // per historical session before applying the response bound.
  for (const session of persistence(options).list(COLLECTION)) {
    if (!session || !session.id || session.projectId !== projectId) continue;
    const branchGroupId = String(session.branchGroupId ?? "").trim();
    const parentSessionId = String(session.parentSessionId ?? "").trim();
    if (!branchGroupId || !parentSessionId) continue;
    const key = `${parentSessionId}\u0000${branchGroupId}`;
    const current = groups.get(key) ?? {
      branchGroupId,
      parentSessionId,
      projectId,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      branches: [],
    };
    current.createdAt = current.createdAt < session.createdAt ? current.createdAt : session.createdAt;
    current.updatedAt = current.updatedAt > session.updatedAt ? current.updatedAt : session.updatedAt;
    current.branches.push(publicOperatorSession(session));
    groups.set(key, current);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      branches: group.branches
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
        .slice(0, MAX_OPERATOR_BRANCHES_PER_GROUP),
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.branchGroupId.localeCompare(a.branchGroupId))
    .slice(0, MAX_OPERATOR_COMPARISON_GROUPS);
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
  const threadRef = String(options.threadRef ?? "project").trim() || "project";
  const summaries = listOperatorSessions({ ...options, projectId: projectId ?? null });
  const live = summaries.find(
    (summary) => !TERMINAL_OPERATOR_STATUSES.has(summary.status)
      && sessionKind(summary) === kindFilter
      && String(summary.threadRef ?? "project") === threadRef,
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
  const existing = getActiveSessionForProject(projectId, { ...options, kind, threadRef: input.threadRef ?? "project" });
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

const PRIVATE_SESSION_KEY = /(?:prompt|soul|credential|transcript|internal|plumbing)|^_|^(runtimeSessionId|modelMessages|tokens?|apiKey|sourcePath|artifactPath|graphSnapshot|raw)$/i;

function sanitizePublicSessionValue(value, seen = new WeakSet()) {
  if (value == null || typeof value !== "object") return value;
  if (seen.has(value)) return null;
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => sanitizePublicSessionValue(item, seen));
  return Object.fromEntries(Object.entries(value).flatMap(([key, item]) =>
    PRIVATE_SESSION_KEY.test(key) ? [] : [[key, sanitizePublicSessionValue(item, seen)]]));
}

function publicGateRunResult(runResult) {
  if (!runResult || typeof runResult !== "object") return null;
  const nodes = Object.fromEntries(Object.entries(runResult.nodes ?? {}).map(([id, node]) => [id, {
    nodeId: node?.nodeId ?? id,
    category: node?.category ?? null,
    ok: node?.ok === true,
    blocked: node?.blocked === true,
    pendingReview: node?.pendingReview === true,
    error: node?.error ?? null,
    items: Array.isArray(node?.items) ? node.items : [],
  }]));
  return sanitizePublicSessionValue({
    runId: runResult.runId ?? null,
    graphId: runResult.graphId ?? null,
    graphRevision: runResult.graphRevision ?? null,
    createdAt: runResult.createdAt ?? null,
    completedAt: runResult.completedAt ?? null,
    ok: runResult.ok === true,
    targetNodeId: runResult.targetNodeId ?? null,
    pendingGates: Array.isArray(runResult.pendingGates) ? runResult.pendingGates : [],
    memoryApplied: runResult.memoryApplied ?? null,
    nodes,
  });
}

function publicPendingGate(pendingGate) {
  if (!pendingGate || typeof pendingGate !== "object") return pendingGate ?? null;
  const safe = sanitizePublicSessionValue(Object.fromEntries(Object.entries(pendingGate).filter(([key]) => key !== "runResult")));
  const runResult = publicGateRunResult(pendingGate.runResult);
  return runResult ? { ...safe, runResult } : safe;
}

export function publicOperatorSession(session) {
  const publicFields = [
    "id", "kind", "goal", "standingBrief", "wakeIntervalMs", "nextWakeAt", "graphId", "projectId",
    "surface", "lens", "questionId", "participantRefs", "productRefs", "focusRef", "contextRefs", "threadRef", "workspaceId", "status",
    "createdAt", "updatedAt", "startedAt", "completedAt", "stepCount", "maxSteps", "graphRevision",
    "lastRunId", "summary", "error", "pendingQuestion", "pendingGate", "pendingProposal", "pendingIdeas",
    "pendingCandidates", "events", "parentSessionId", "branchGroupId", "handoffRevision", "handoffs",
  ];
  const projected = Object.fromEntries(publicFields.flatMap((key) =>
    Object.prototype.hasOwnProperty.call(session, key) ? [[key, session[key]]] : []));
  if (Object.prototype.hasOwnProperty.call(projected, "pendingGate")) projected.pendingGate = publicPendingGate(projected.pendingGate);
  projected.worker = workerFor(session);
  return sanitizePublicSessionValue(projected);
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
      const gateNodeIds = Array.isArray(gate?.nodeIds) ? gate.nodeIds : [];
      const runNodes = gate?.runResult?.nodes ?? {};
      const itemCount = gateNodeIds.reduce((count, nodeId) => {
        const items = runNodes?.[nodeId]?.items;
        return count + (Array.isArray(items) ? items.length : 0);
      }, 0);
      return [{
        sessionId: session.id,
        kind: sessionKind(session),
        projectId: session.projectId ?? null,
        graphId: gate?.graphId ?? session.graphId ?? null,
        label: session.goal || session.standingBrief || null,
        runId: gate?.runId ?? session.lastRunId ?? null,
        gateNodeIds,
        itemCount,
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
