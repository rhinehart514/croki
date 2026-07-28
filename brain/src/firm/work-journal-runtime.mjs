// The bounded adapter between existing Work lifecycle seams and the durable journal. It translates
// existing receipts into small reference-bearing envelopes; provider payloads, repository blobs, and
// Product/Canvas truth remain in their authoritative stores.

import crypto from "node:crypto";

import { createWorkJournal } from "./work-journal.mjs";
import { listVentures } from "./venture-store.mjs";

function text(value) {
  return String(value ?? "").trim() || null;
}

function bare(value, prefix) {
  return String(value ?? "").replace(new RegExp(`^${prefix}:`), "").trim() || null;
}

function stableId(kind, ...parts) {
  const readable = parts.map(text).filter(Boolean).join(":");
  const digest = crypto.createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 16);
  return `${kind}:${readable.slice(0, 120)}:${digest}`;
}

function scope(handle) {
  if (!handle) return null;
  const threadId = bare(handle.threadRef ?? handle.threadId, "thread");
  const runId = bare(handle.runId ?? handle.runRef, "run");
  return threadId && runId ? { threadId, runId } : null;
}

export function appendWorkJournalEvent(ventureId, handle, kind, payload, {
  eventId = null,
  reviewId = null,
  at = null,
} = {}, options = {}) {
  const exact = scope(handle);
  if (!exact) return null;
  return createWorkJournal(options).append(ventureId, {
    eventId: eventId ?? stableId(kind, exact.runId, at, JSON.stringify(payload ?? null)),
    ventureId,
    ...exact,
    ...(reviewId ? { reviewId: bare(reviewId, "review") } : {}),
    kind,
    ...(at ? { occurredAt: at } : {}),
    payload,
  }).event;
}

export function recordAcceptedRun(handle, {
  originMessageRef = null,
  participantRef = null,
  workScopeRef = null,
  worktreeRef = null,
  at = null,
} = {}) {
  const exact = scope(handle);
  if (!exact) return null;
  const messageId = bare(originMessageRef, "conversation");
  if (messageId) {
    appendWorkJournalEvent(handle.ventureId, handle, "founder-turn-accepted", {
      messageId,
      contentRef: `conversation:${messageId}`,
    }, {
      eventId: stableId("founder-turn", exact.runId, messageId),
      at,
    }, handle.options);
  }
  return appendWorkJournalEvent(handle.ventureId, handle, "run-started", {
    ...(participantRef ? { participantRef } : {}),
    ...(workScopeRef ? { workScopeRef } : {}),
    ...(worktreeRef ? { worktreeRef } : {}),
  }, {
    eventId: stableId("run-started", exact.runId),
    at,
  }, handle.options);
}

export function recordProviderSession(handle, {
  provider,
  sessionId,
  participantRef = null,
  model = null,
  effort = null,
  interactionMode = null,
  machineRef = null,
  spendReservationId = null,
  at = null,
} = {}) {
  if (!sessionId) return null;
  return appendWorkJournalEvent(handle?.ventureId, handle, "provider-session-bound", {
    provider,
    sessionId,
    participantRef,
    model,
    effort,
    interactionMode,
    machineRef,
    spendReservationId,
  }, {
    eventId: stableId("provider-session", handle?.runId, provider, sessionId),
    at,
  }, handle?.options);
}

export function recordRunTombstone(handle, reasonCode, {
  authorityRef = "founder",
  at = null,
} = {}) {
  if (!handle || !reasonCode) return null;
  return appendWorkJournalEvent(handle.ventureId, handle, "run-tombstoned", {
    reasonCode,
    authorityRef,
  }, {
    eventId: stableId("run-tombstone", handle.runId, reasonCode),
    at,
  }, handle.options);
}

export function recordMatchingRunTombstones(ventureId, {
  runIds = [],
  threadRef = null,
  workScopeRef = null,
  reasonCode,
  authorityRef = "founder",
} = {}, options = {}) {
  const projection = createWorkJournal(options).readProjections(ventureId);
  const exactRuns = new Set(runIds.map((id) => bare(id, "run")).filter(Boolean));
  const exactThread = bare(threadRef, "thread");
  const exactScope = text(workScopeRef);
  const matches = (projection.runs ?? []).filter((run) => (
    exactRuns.has(run.id)
    || (exactThread && run.threadId === exactThread)
    || (exactScope && run.workScopeRef === exactScope)
  ));
  return matches.map((run) => recordRunTombstone({
    ventureId,
    runId: run.id,
    threadRef: `thread:${run.threadId}`,
    options,
  }, reasonCode, { authorityRef }));
}

export function recordRunRecovery(handle, {
  attemptId,
  outcome = null,
  reasonCodes = [],
  at = null,
} = {}) {
  if (!handle || !attemptId) return null;
  const kind = outcome ? "run-recovery-settled" : "run-recovery-attempted";
  return appendWorkJournalEvent(handle.ventureId, handle, kind, {
    attemptId,
    ...(outcome ? { outcome } : {}),
    reasonCodes,
  }, {
    eventId: stableId(kind, handle.runId, attemptId, outcome),
    at,
  }, handle.options);
}

export function recordFactualActivity(handle, {
  activityId,
  label,
  tone = null,
  durationMs = null,
  sourceRefs = [],
  usage = null,
  at = null,
} = {}) {
  if (!handle || !activityId || !label) return null;
  return appendWorkJournalEvent(handle.ventureId, handle, "factual-activity-recorded", {
    activityId,
    label,
    tone,
    durationMs,
    sourceRefs,
    ...(usage ? { usage } : {}),
  }, {
    eventId: stableId("activity", handle.runId, activityId),
    at,
  }, handle.options);
}

export function recordFormingReplyCheckpoint(handle, {
  replyId,
  boundedText,
  checkpoint,
  at = null,
} = {}) {
  if (!handle || !replyId || !boundedText) return null;
  return appendWorkJournalEvent(handle.ventureId, handle, "forming-reply-checkpointed", {
    replyId,
    boundedText: String(boundedText).slice(-12 * 1024),
  }, {
    eventId: stableId("forming-reply", handle.runId, replyId, checkpoint),
    at,
  }, handle.options);
}

export function recordInterventionOpened(ventureId, item, options = {}) {
  const continuation = item?.effect?.continuation;
  const handle = continuation?.runId && continuation?.target?.threadRef
    ? { ventureId, runId: continuation.runId, threadRef: continuation.target.threadRef }
    : null;
  if (!handle) return null;
  return appendWorkJournalEvent(ventureId, handle, "intervention-opened", {
    interventionId: item.id,
    kind: item.effect.kind,
    questionRef: `decision:${item.id}`,
  }, {
    eventId: stableId("intervention-opened", item.id),
    at: item.parkedAt,
  }, options);
}

export function recordInterventionResolved(ventureId, item, options = {}) {
  if (!["provider-question", "provider-permission"].includes(item?.effect?.kind)) return null;
  const continuation = item?.effect?.continuation;
  const handle = continuation?.runId && continuation?.target?.threadRef
    ? { ventureId, runId: continuation.runId, threadRef: continuation.target.threadRef }
    : null;
  if (!handle || item?.decision == null) return null;
  return appendWorkJournalEvent(ventureId, handle, "intervention-resolved", {
    interventionId: item.id,
    outcome: item.decision,
    decisionRef: `decision:${item.id}`,
  }, {
    eventId: stableId("intervention-resolved", item.id, item.decision),
    at: item.decidedAt,
  }, options);
}

export function recordRunInterrupted(handle, error, { layer = "provider", at = null } = {}) {
  if (!handle) return null;
  return appendWorkJournalEvent(handle.ventureId, handle, "run-interrupted", {
    reasonCode: `${layer}-interrupted`,
    recovery: {
      action: "resume",
      message: String(error?.message ?? error ?? "Work was interrupted."),
    },
  }, {
    eventId: stableId("run-interrupted", handle.runId, layer),
    at,
  }, handle.options);
}

export function recordRunTerminal(handle, outcome, receipt, { at = null } = {}) {
  if (!handle) return null;
  const rawKind = text(outcome?.kind) ?? "completed";
  const kind = rawKind === "budget" ? "budget-exhausted" : rawKind;
  const receiptRef = receipt?.id ? `receipt:${receipt.id}` : null;
  if (kind === "paused" || kind === "budget-exhausted") {
    const event = appendWorkJournalEvent(handle.ventureId, handle, "run-paused", {
      reasonCode: kind,
      receiptRef,
    }, { eventId: stableId("run-paused", handle.runId, receipt?.id, kind), at }, handle.options);
    if (kind === "budget-exhausted") recordRunTombstone(handle, "budget-exhausted", { authorityRef: receiptRef, at });
    return event;
  }
  if (kind === "cancelled") {
    return appendWorkJournalEvent(handle.ventureId, handle, "run-interrupted", {
      reasonCode: "founder-cancelled",
      recovery: { action: "hold", receiptRef },
    }, { eventId: stableId("run-cancelled", handle.runId, receipt?.id), at }, handle.options);
  }
  if (kind === "failed") {
    return appendWorkJournalEvent(handle.ventureId, handle, "run-failed", {
      layer: "provider",
      receiptRef,
    }, { eventId: stableId("run-failed", handle.runId, receipt?.id), at }, handle.options);
  }
  return appendWorkJournalEvent(handle.ventureId, handle, "run-completed", {
    receiptRef,
    outcomeRefs: [],
  }, { eventId: stableId("run-completed", handle.runId, receipt?.id), at }, handle.options);
}

export function recordRunLayerReceipt(handle, receiptType, {
  status,
  artifactRefs = [],
  error = null,
  at = null,
} = {}) {
  if (!handle || !receiptType) return null;
  const receiptId = stableId("run-layer", handle.runId, receiptType);
  return appendWorkJournalEvent(handle.ventureId, handle, "run-layer-receipt-recorded", {
    receiptId,
    receiptType,
    status,
    artifactRefs,
    error: error ? {
      name: text(error.name) ?? "Error",
      message: text(error.message ?? error) ?? "The Run layer failed.",
      code: text(error.code),
    } : null,
  }, {
    eventId: receiptId,
    at,
  }, handle.options);
}

export function recordRunQuiescent(handle, {
  requiredReceipts,
  failedReceipts = [],
  reviewId = null,
  checkpointId = null,
  at = null,
} = {}) {
  if (!handle) return null;
  const ready = failedReceipts.length === 0;
  const receiptId = stableId("run-quiescent", handle.runId);
  const event = appendWorkJournalEvent(handle.ventureId, handle, "run-quiescent", {
    receiptId,
    status: ready ? "ready" : "failed",
    requiredReceipts,
    failedReceipts,
  }, { eventId: receiptId, at }, handle.options);
  if (reviewId) {
    appendWorkJournalEvent(handle.ventureId, handle, "review-readiness-changed", {
      ready,
      checkpointId,
      receiptRefs: requiredReceipts.map((type) => stableId("run-layer", handle.runId, type)),
      reasons: failedReceipts.map((type) => `${type} did not settle successfully.`),
    }, {
      eventId: stableId("quiescent-review", handle.runId, ready),
      reviewId,
      at,
    }, handle.options);
  }
  return event;
}

export function persistRunJournalProjection(handle) {
  if (!handle) return null;
  return createWorkJournal(handle.options).rebuildProjections(handle.ventureId);
}

export function readRunJournalProjection(handle) {
  if (!handle) return null;
  const projection = createWorkJournal(handle.options).readProjections(handle.ventureId);
  const runId = bare(handle.runId ?? handle.runRef, "run");
  return projection?.runs?.find((run) => run.id === runId) ?? null;
}

function normalizedUsage(usage) {
  if (!usage || typeof usage !== "object") return null;
  return {
    inputTokens: Number(usage.inputTokens) || 0,
    outputTokens: Number(usage.outputTokens) || 0,
    cachedInputTokens: (Number(usage.cachedInputTokens) || 0)
      + (Number(usage.cacheReadInputTokens) || 0)
      + (Number(usage.cacheCreationInputTokens) || 0),
    costUsd: Number(usage.costUsd) || 0,
  };
}

export function recordCodingSettlement(ventureId, workspace, runRef, options = {}) {
  const handle = { ventureId, runRef, threadRef: workspace?.threadRef };
  if (!scope(handle)) return null;
  const entriesForRun = (entries) => {
    const indexed = (entries ?? []).map((entry, index) => ({ entry, index }));
    const attributed = indexed.filter(({ entry }) => entry.runRef === runRef);
    // Compatibility for a pre-attribution workspace that has only ever carried this one Run. Once
    // multiple Runs share the workspace, an unscoped legacy receipt must not be guessed onto a later
    // turn: omit it from that Run's journal settlement rather than falsifying lineage.
    return attributed.length || (workspace.runRefs ?? []).length > 1 ? attributed : indexed;
  };
  const checkpoint = (workspace.checkpoints ?? []).filter((entry) => entry.runRef === runRef).at(-1);
  if (checkpoint) {
    appendWorkJournalEvent(ventureId, handle, "checkpoint-recorded", {
      checkpointId: checkpoint.id,
      checkpointRef: checkpoint.ref ?? null,
      treeRef: checkpoint.tree ?? null,
      diffRef: `work:${workspace.id}#diff`,
    }, {
      eventId: stableId("checkpoint", workspace.id, checkpoint.id),
      at: checkpoint.capturedAt,
    }, options);
  }
  for (const { entry: command, index } of entriesForRun(workspace.commands)) {
    const commandId = text(command.id) ?? stableId("command", workspace.id, index, command.command, command.startedAt);
    appendWorkJournalEvent(ventureId, handle, "command-receipt-recorded", {
      commandId,
      status: text(command.status) ?? (command.completedAt ? "completed" : "recorded"),
      receiptRef: `work:${workspace.id}#command-${index + 1}`,
    }, {
      eventId: stableId("command-receipt", workspace.id, commandId),
      at: command.completedAt ?? command.startedAt,
    }, options);
  }
  for (const { entry: verification, index } of entriesForRun(workspace.verification)) {
    const verificationId = stableId("verification", workspace.id, index, verification.kind, verification.command);
    appendWorkJournalEvent(ventureId, handle, "verification-receipt-recorded", {
      verificationId,
      status: text(verification.status) ?? "recorded",
      receiptRef: `work:${workspace.id}#verification-${index + 1}`,
    }, {
      eventId: stableId("verification-receipt", workspace.id, verificationId),
      at: verification.completedAt ?? verification.startedAt,
    }, options);
  }
  return { checkpointId: checkpoint?.id ?? null, reviewId: `review:${workspace.id}` };
}

export function recordCheckpointRestored(ventureId, workspace, sourceRunRef, checkpoint, options = {}) {
  const handle = { ventureId, runRef: sourceRunRef, threadRef: workspace?.threadRef };
  if (!scope(handle) || !checkpoint) return null;
  return appendWorkJournalEvent(ventureId, handle, "checkpoint-recorded", {
    checkpointId: checkpoint.id,
    checkpointRef: checkpoint.ref ?? null,
    treeRef: checkpoint.tree ?? null,
    diffRef: `work:${workspace.id}#diff`,
    restoredFrom: checkpoint.restoredFrom ?? null,
    restoredBy: checkpoint.restoredBy ?? null,
  }, {
    eventId: stableId("checkpoint-restore", workspace.id, checkpoint.id),
    at: checkpoint.capturedAt,
  }, options);
}

export function recoverWorkJournals(options = {}) {
  return listVentures(options).map((venture) => {
    const journal = createWorkJournal(options);
    const state = journal.inspect(venture.id);
    if (state.mode !== "writable") {
      return { ventureId: venture.id, ...state, diagnostics: journal.exportDiagnostics(venture.id) };
    }
    const projection = journal.readProjections(venture.id);
    return {
      ventureId: venture.id,
      ...state,
      projection: {
        schemaVersion: projection.schemaVersion,
        throughSequence: projection.throughSequence,
        journalHeadHash: projection.journalHeadHash,
        threads: projection.threads.length,
        runs: projection.runs.length,
        reviews: projection.reviews.length,
      },
    };
  });
}
