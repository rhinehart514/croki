// work-loop-run.mjs — the durable Run lifecycle for one live founder-authorized drive.
//
// A founder (or agent-continued) drive is the only thing that mints a run (FIRM-SPEC rail #1 / Law 1):
// founder intent → run → returned evidence, joined to the venture root Thread so the whole drive becomes
// inspectable history. This module is the two seams work-loop.mjs calls — begin (before provider dispatch)
// and finish (after terminal completion) — lifted out so the work loop stays under its LOC ceiling and so
// EVERY run-recording call is wrapped in the same fail-safe: a run-recording error degrades honestly and
// NEVER aborts or changes a drive (the same discipline runFirstRun uses in lens-routes.mjs). An interrupted
// or cancelled drive never reaches finish, so its run stays completedAt:null — historical-unknown, never a
// false completion.
//
// The run id is the activeDrive.id, so a run is 1:1 with the drive that produced it and never collides.
// Legacy drives are not backfilled: only a drive that begins a run here can complete one.

import { ensureRootThread, recordRun, completeDriveRun } from "./semantic-model-store.mjs";
import { createWorkflowExecutionReceipt } from "./workflow-execution-receipt.mjs";
import { normalizeWorkflowOutcome } from "./workflow-outcome.mjs";

function conversationRef(messageId) {
  const id = String(messageId ?? "").trim();
  if (!id) return null;
  return id.startsWith("conversation:") ? id : `conversation:${id}`;
}

// Only a founder-initiated or agent-continued drive records a run. Coordination/nested drives
// (initiatedBy === null) and any legacy/ambient path do not — Law 1.
export function driveRecordsRun(initiatedBy) {
  return initiatedBy === "founder" || initiatedBy === "agent";
}

// begin — form the root thread lazily and persist the canonical run BEFORE provider dispatch, after all
// input/config/runtime validation. Returns a handle the finish seam completes, or null when this drive
// does not record (not founder-authorized) or when recording failed. A failure here is swallowed: the
// drive proceeds untouched, exactly as if no run substrate existed.
export function beginDriveRun({
  ventureId,
  runId,
  initiatedBy,
  betId = null,
  originMessageId = null,
  at = null,
  options = {},
}) {
  if (!driveRecordsRun(initiatedBy)) return null;
  try {
    const { threadRef } = ensureRootThread(ventureId, { at: at ?? undefined }, options);
    const betRefs = betId ? [`bet:${betId}`] : [];
    const originMessageRef = conversationRef(originMessageId);
    recordRun(ventureId, {
      id: runId,
      threadRef,
      betRefs,
      ...(originMessageRef ? { originMessageRef } : {}),
    }, { at: at ?? undefined }, options);
    return { ventureId, runId, betId, options };
  } catch {
    // Honest degrade: the drive must never be aborted or changed by a run-recording error.
    return null;
  }
}

// A wall item is a durable decision record even while it waits for the founder's release. New pending items
// parked during this drive (present in afterWallItems but not beforeWallItems) are the decisions this run
// produced — cited as decision: refs, which the atlas admits for any wall-item id.
function newDecisionRefs(beforeWallItems, afterWallItems) {
  const before = new Set((beforeWallItems ?? []).map((item) => item.id));
  return (afterWallItems ?? [])
    .filter((item) => item?.id && !before.has(item.id))
    .map((item) => `decision:${item.id}`);
}

// finish — complete the run after terminal completion, adding durable decision joins from the wall diff, and
// mint an immutable WorkflowExecutionReceipt for a bet-scoped terminal outcome. Betless runs settle on the
// run's own completedAt (a receipt requires a bet ref). Wrapped fail-safe: a completion error leaves the run
// at completedAt:null (historical-unknown) rather than aborting the drive's already-finished return.
export function finishDriveRun(handle, {
  outcome,
  beforeWallItems = [],
  afterWallItems = [],
  runtime = null,
  modelRevision = null,
  at = null,
}) {
  if (!handle) return null;
  const { ventureId, runId, betId, options } = handle;
  try {
    const decisionRefs = newDecisionRefs(beforeWallItems, afterWallItems);
    completeDriveRun(ventureId, runId, { at: at ?? undefined, decisionRefs }, options);
    let receipt = null;
    if (betId) {
      // Only a bet-scoped drive can mint a receipt (a receipt requires a bet ref). The normalized outcome
      // is honest about interrupted/cancelled terminals — never a false completed/done.
      receipt = createWorkflowExecutionReceipt({
        ventureId,
        runId,
        betRef: `bet:${betId}`,
        outcome: normalizeWorkflowOutcome(outcome ?? { kind: "completed" }),
        decisionRefs,
        runtime,
        modelRevision: Number.isInteger(modelRevision) ? modelRevision : null,
      });
    }
    return { runRef: `run:${runId}`, decisionRefs, receipt };
  } catch {
    return null;
  }
}
