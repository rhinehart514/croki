// Deterministic projections of the durable Work continuity journal. Product and Canvas truth never
// enter this reducer: it projects only the founder-facing Project/Thread/Run/Review continuity needed
// to recover exact work. All identities come from accepted events; rebuilding mints nothing.

export const WORK_JOURNAL_PROJECTION_SCHEMA_VERSION = 1;
export const RUN_LAYER_RECEIPT_TYPES = Object.freeze([
  "provider-settled",
  "checkpoint-captured",
  "diff-finalized",
  "commands-settled",
  "verification-settled",
  "timeline-settled",
  "projection-persisted",
]);

export const WORK_JOURNAL_EVENT_KINDS = Object.freeze([
  "founder-turn-accepted",
  "provider-session-bound",
  "run-started",
  "run-stopping",
  "run-paused",
  "factual-activity-recorded",
  "intervention-opened",
  "intervention-resolved",
  "checkpoint-recorded",
  "command-receipt-recorded",
  "verification-receipt-recorded",
  "review-readiness-changed",
  "usage-recorded",
  "forming-reply-checkpointed",
  "run-layer-receipt-recorded",
  "run-quiescent",
  "run-recovery-attempted",
  "run-recovery-settled",
  "run-tombstoned",
  "run-interrupted",
  "run-completed",
  "run-failed",
]);

const EVENT_KINDS = new Set(WORK_JOURNAL_EVENT_KINDS);
const RUN_LAYER_RECEIPTS = new Set(RUN_LAYER_RECEIPT_TYPES);
const USAGE_FIELDS = ["inputTokens", "outputTokens", "cachedInputTokens", "costUsd"];

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function text(value) {
  return String(value ?? "").trim() || null;
}

function sortedValues(map) {
  return [...map.values()].sort((left, right) => String(left.id).localeCompare(String(right.id)));
}

function fail(message, detail = {}) {
  throw Object.assign(new Error(message), { code: "work_journal_projection_invalid", ...detail });
}

function ensureThread(state, event) {
  const id = text(event.threadId);
  if (!id) fail(`${event.kind} needs a threadId.`, { eventId: event.eventId });
  if (!state.threads.has(id)) {
    state.threads.set(id, {
      id,
      ventureId: state.ventureId,
      messageIds: [],
      runIds: [],
      createdAt: event.occurredAt,
      updatedAt: event.occurredAt,
      throughSequence: event.sequence,
    });
  }
  const thread = state.threads.get(id);
  thread.updatedAt = event.occurredAt;
  thread.throughSequence = event.sequence;
  return thread;
}

function ensureRun(state, event) {
  const id = text(event.runId);
  if (!id) fail(`${event.kind} needs a runId.`, { eventId: event.eventId });
  const thread = ensureThread(state, event);
  if (!state.runs.has(id)) {
    state.runs.set(id, {
      id,
      ventureId: state.ventureId,
      threadId: thread.id,
      status: "accepted",
      founderTurnIds: [],
      providerSession: null,
      activity: [],
      interventions: [],
      checkpoints: [],
      commands: [],
      verifications: [],
      formingReply: null,
      layerReceipts: [],
      quiescence: null,
      recovery: [],
      tombstone: null,
      reviewId: null,
      startedAt: null,
      interruptedAt: null,
      completedAt: null,
      failedAt: null,
      updatedAt: event.occurredAt,
      throughSequence: event.sequence,
    });
    thread.runIds.push(id);
  }
  const run = state.runs.get(id);
  if (run.threadId !== thread.id) {
    fail(`Run ${id} cannot move from Thread ${run.threadId} to ${thread.id}.`, { eventId: event.eventId });
  }
  run.updatedAt = event.occurredAt;
  run.throughSequence = event.sequence;
  return run;
}

function addUsage(state, event) {
  const usage = event.payload?.usage ?? (event.kind === "usage-recorded" ? event.payload : null);
  if (!usage || typeof usage !== "object") return;
  const runId = text(event.runId);
  if (!runId) fail("Usage needs a runId.", { eventId: event.eventId });
  const current = state.usageByRun.get(runId) ?? {
    id: runId,
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    costUsd: 0,
  };
  for (const field of USAGE_FIELDS) {
    const amount = Number(usage[field] ?? 0);
    if (!Number.isFinite(amount) || amount < 0) {
      fail(`Usage ${field} must be a non-negative number.`, { eventId: event.eventId });
    }
    current[field] += amount;
  }
  state.usageByRun.set(runId, current);
}

function upsertById(values, value) {
  const prior = values.findIndex((entry) => entry.id === value.id);
  if (prior === -1) values.push(value);
  else values[prior] = value;
}

function applyEvent(state, event) {
  if (!EVENT_KINDS.has(event.kind)) fail(`Unsupported Work journal event: ${event.kind}.`, { eventId: event.eventId });
  const payload = event.payload ?? {};
  const run = event.runId ? ensureRun(state, event) : null;

  switch (event.kind) {
    case "founder-turn-accepted": {
      const messageId = text(payload.messageId);
      if (!messageId) fail("A founder turn needs payload.messageId.", { eventId: event.eventId });
      const thread = ensureThread(state, event);
      if (!thread.messageIds.includes(messageId)) thread.messageIds.push(messageId);
      if (!run.founderTurnIds.includes(messageId)) run.founderTurnIds.push(messageId);
      break;
    }
    case "provider-session-bound":
      if (!text(payload.provider) || !text(payload.sessionId)) {
        fail("A provider session binding needs provider and sessionId.", { eventId: event.eventId });
      }
      run.providerSession = {
        provider: text(payload.provider),
        sessionId: text(payload.sessionId),
        participantRef: text(payload.participantRef),
        model: text(payload.model),
        effort: text(payload.effort),
        interactionMode: text(payload.interactionMode),
        machineRef: text(payload.machineRef),
        spendReservationId: text(payload.spendReservationId),
        boundAt: event.occurredAt,
      };
      break;
    case "run-started":
      Object.assign(run, { status: "running", startedAt: run.startedAt ?? event.occurredAt });
      if (payload.workScopeRef) run.workScopeRef = text(payload.workScopeRef);
      if (payload.worktreeRef) run.worktreeRef = text(payload.worktreeRef);
      break;
    case "run-stopping":
      run.status = "stopping";
      break;
    case "run-paused":
      run.status = "paused";
      break;
    case "factual-activity-recorded": {
      const id = text(payload.activityId) ?? event.eventId;
      upsertById(run.activity, {
        id,
        label: text(payload.label),
        tone: text(payload.tone),
        durationMs: Number.isFinite(payload.durationMs) ? payload.durationMs : null,
        sourceRefs: Array.isArray(payload.sourceRefs) ? [...payload.sourceRefs] : [],
        at: event.occurredAt,
      });
      break;
    }
    case "intervention-opened": {
      const id = text(payload.interventionId);
      if (!id) fail("An intervention needs payload.interventionId.", { eventId: event.eventId });
      upsertById(run.interventions, {
        id,
        kind: text(payload.kind),
        questionRef: text(payload.questionRef),
        status: "open",
        openedAt: event.occurredAt,
        resolvedAt: null,
        decisionRef: null,
      });
      break;
    }
    case "intervention-resolved": {
      const id = text(payload.interventionId);
      const intervention = run.interventions.find((entry) => entry.id === id);
      if (!intervention) fail(`No open intervention ${id} exists.`, { eventId: event.eventId });
      Object.assign(intervention, {
        status: text(payload.outcome) ?? "resolved",
        decisionRef: text(payload.decisionRef),
        resolvedAt: event.occurredAt,
      });
      break;
    }
    case "checkpoint-recorded": {
      const id = text(payload.checkpointId);
      if (!id) fail("A checkpoint needs payload.checkpointId.", { eventId: event.eventId });
      upsertById(run.checkpoints, {
        id,
        checkpointRef: text(payload.checkpointRef),
        treeRef: text(payload.treeRef),
        diffRef: text(payload.diffRef),
        at: event.occurredAt,
      });
      break;
    }
    case "command-receipt-recorded": {
      const id = text(payload.commandId);
      if (!id) fail("A command receipt needs payload.commandId.", { eventId: event.eventId });
      upsertById(run.commands, {
        id,
        status: text(payload.status),
        receiptRef: text(payload.receiptRef),
        at: event.occurredAt,
      });
      break;
    }
    case "verification-receipt-recorded": {
      const id = text(payload.verificationId);
      if (!id) fail("A verification receipt needs payload.verificationId.", { eventId: event.eventId });
      upsertById(run.verifications, {
        id,
        status: text(payload.status),
        receiptRef: text(payload.receiptRef),
        at: event.occurredAt,
      });
      break;
    }
    case "review-readiness-changed": {
      const id = text(event.reviewId) ?? text(payload.reviewId);
      if (!id) fail("Review readiness needs a reviewId.", { eventId: event.eventId });
      run.reviewId = id;
      state.reviews.set(id, {
        id,
        ventureId: state.ventureId,
        threadId: run.threadId,
        runId: run.id,
        ready: payload.ready === true,
        checkpointId: text(payload.checkpointId),
        receiptRefs: Array.isArray(payload.receiptRefs) ? [...payload.receiptRefs] : [],
        reasons: Array.isArray(payload.reasons) ? [...payload.reasons] : [],
        updatedAt: event.occurredAt,
        throughSequence: event.sequence,
      });
      break;
    }
    case "forming-reply-checkpointed":
      if (!text(payload.replyId) || (!text(payload.contentRef) && !text(payload.boundedText))) {
        fail("A forming reply checkpoint needs replyId and bounded content or a contentRef.", { eventId: event.eventId });
      }
      run.formingReply = {
        replyId: text(payload.replyId),
        contentRef: text(payload.contentRef),
        boundedText: text(payload.boundedText),
        at: event.occurredAt,
      };
      break;
    case "run-layer-receipt-recorded": {
      const id = text(payload.receiptId) ?? event.eventId;
      if (!RUN_LAYER_RECEIPTS.has(text(payload.receiptType)) || !["succeeded", "failed"].includes(payload.status)) {
        fail("A Run layer receipt needs receiptType and succeeded/failed status.", { eventId: event.eventId });
      }
      upsertById(run.layerReceipts, {
        id,
        type: text(payload.receiptType),
        status: payload.status,
        artifactRefs: Array.isArray(payload.artifactRefs) ? [...payload.artifactRefs] : [],
        error: payload.error && typeof payload.error === "object" ? clone(payload.error) : null,
        at: event.occurredAt,
      });
      break;
    }
    case "run-quiescent":
      run.quiescence = {
        receiptId: text(payload.receiptId) ?? event.eventId,
        status: payload.status === "ready" ? "ready" : "failed",
        requiredReceipts: Array.isArray(payload.requiredReceipts) ? [...payload.requiredReceipts] : [],
        failedReceipts: Array.isArray(payload.failedReceipts) ? [...payload.failedReceipts] : [],
        at: event.occurredAt,
      };
      break;
    case "run-recovery-attempted":
      upsertById(run.recovery, {
        id: text(payload.attemptId) ?? event.eventId,
        outcome: "attempted",
        reasonCodes: Array.isArray(payload.reasonCodes) ? [...payload.reasonCodes] : [],
        at: event.occurredAt,
      });
      break;
    case "run-recovery-settled": {
      const outcome = text(payload.outcome);
      if (!["resumed", "held-for-founder", "completed", "failed-with-recovery"].includes(outcome)) {
        fail("A recovery settlement needs an exact supported outcome.", { eventId: event.eventId });
      }
      upsertById(run.recovery, {
        id: text(payload.attemptId) ?? event.eventId,
        outcome,
        reasonCodes: Array.isArray(payload.reasonCodes) ? [...payload.reasonCodes] : [],
        at: event.occurredAt,
      });
      break;
    }
    case "run-tombstoned":
      run.tombstone = {
        reasonCode: text(payload.reasonCode),
        authorityRef: text(payload.authorityRef),
        at: event.occurredAt,
      };
      break;
    case "run-interrupted":
      Object.assign(run, {
        status: "interrupted",
        interruptedAt: event.occurredAt,
        interruption: {
          reasonCode: text(payload.reasonCode),
          recovery: clone(payload.recovery ?? null),
        },
      });
      break;
    case "run-completed":
      Object.assign(run, {
        status: "completed",
        completedAt: event.occurredAt,
        outcomeRefs: Array.isArray(payload.outcomeRefs) ? [...payload.outcomeRefs] : [],
        formingReply: null,
      });
      break;
    case "run-failed":
      Object.assign(run, {
        status: "failed",
        failedAt: event.occurredAt,
        failure: { layer: text(payload.layer), receiptRef: text(payload.receiptRef) },
      });
      break;
    case "usage-recorded":
      break;
    default:
      fail(`Unhandled Work journal event: ${event.kind}.`, { eventId: event.eventId });
  }
  addUsage(state, event);
}

export function projectWorkJournal(events, { ventureId, journalHeadHash = null } = {}) {
  const exactVentureId = text(ventureId);
  if (!exactVentureId) fail("Projecting a Work journal needs a ventureId.");
  const state = {
    ventureId: exactVentureId,
    threads: new Map(),
    runs: new Map(),
    reviews: new Map(),
    usageByRun: new Map(),
  };
  let expectedSequence = 1;
  for (const event of events ?? []) {
    if (event.ventureId !== exactVentureId) fail("A projection cannot cross ventures.", { eventId: event.eventId });
    if (event.sequence !== expectedSequence) {
      fail(`Work journal sequence ${event.sequence} is not the expected ${expectedSequence}.`, { eventId: event.eventId });
    }
    applyEvent(state, event);
    expectedSequence += 1;
  }

  const usageByRun = sortedValues(state.usageByRun);
  const total = Object.fromEntries(USAGE_FIELDS.map((field) => [
    field,
    usageByRun.reduce((sum, entry) => sum + entry[field], 0),
  ]));
  const attention = [];
  for (const run of state.runs.values()) {
    for (const intervention of run.interventions.filter((entry) => entry.status === "open")) {
      attention.push({
        id: `intervention:${intervention.id}`,
        kind: "intervention",
        threadId: run.threadId,
        runId: run.id,
        interventionId: intervention.id,
        at: intervention.openedAt,
      });
    }
    if (["interrupted", "failed"].includes(run.status)) {
      attention.push({
        id: `run:${run.id}:${run.status}`,
        kind: run.status,
        threadId: run.threadId,
        runId: run.id,
        at: run.interruptedAt ?? run.failedAt,
      });
    }
  }

  return {
    schemaVersion: WORK_JOURNAL_PROJECTION_SCHEMA_VERSION,
    ventureId: exactVentureId,
    throughSequence: expectedSequence - 1,
    journalHeadHash,
    threads: sortedValues(state.threads),
    runs: sortedValues(state.runs),
    reviews: sortedValues(state.reviews),
    usage: { byRun: usageByRun, total },
    attention: attention.sort((left, right) => left.id.localeCompare(right.id)),
  };
}
