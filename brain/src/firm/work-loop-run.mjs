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

import { ensureDirectionThread, extendDirectionThread, recordRun, completeDriveRun, attachDriveRunWork } from "./semantic-model-store.mjs";
import { setVentureDoc, listVentureDocs } from "./venture-store.mjs";
import { createWorkflowExecutionReceipt } from "./workflow-execution-receipt.mjs";
import { normalizeWorkflowOutcome } from "./workflow-outcome.mjs";
import { emitFirmEvent } from "./firm-events.mjs";

// Join a run to its durable settlement receipt by receipt.runRef, not by storage key. A receipt is
// STORED under its own content-addressed .id (workflow-execution-receipt.mjs) so the doc's id IS its
// storage key — the invariant that lets it survive export/import unchanged (importVenture re-keys every
// doc by its own .id via storageKeyFor). The run→receipt relationship therefore lives in the data
// (receipt.runRef === run:<runId>), scanned here, rather than in a storage key that transfer rewrites.
// This is why getVentureDoc("receipts", runId) is NEVER the read path: post-transfer it would miss.
export function findReceiptForRun(ventureId, runId, options = {}) {
  const runRef = `run:${String(runId ?? "").trim()}`;
  if (runRef === "run:") return null;
  return listVentureDocs(ventureId, "receipts", options).find((receipt) => receipt?.runRef === runRef) ?? null;
}

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

// begin — form/resume a child direction thread and persist the canonical run BEFORE provider dispatch, after all
// input/config/runtime validation. Returns a handle the finish seam completes, or null when this drive
// does not record (not founder-authorized) or when recording failed. A failure here is swallowed: the
// drive proceeds untouched, exactly as if no run substrate existed.
export function beginDriveRun({
  ventureId,
  runId,
  initiatedBy,
  betId = null,
  originMessageId = null,
  threadName = null,
  threadRef = null,
  target = null,
  at = null,
  options = {},
}) {
  if (!driveRecordsRun(initiatedBy)) return null;
  try {
    const originMessageRef = conversationRef(originMessageId);
    const betRefs = betId ? [`bet:${betId}`] : [];
    const architectureRef = target?.architectureId ? `architecture:${target.architectureId}` : null;
    const subjectRefs = [...betRefs, ...(architectureRef ? [architectureRef] : [])];
    const direction = ensureDirectionThread(ventureId, {
      name: threadName,
      originMessageRef,
      subjectRefs,
      resumeThreadRef: threadRef,
      identityKey: runId,
      at: at ?? undefined,
    }, options);
    recordRun(ventureId, {
      id: runId,
      threadRef: direction.threadRef,
      betRefs,
      ...(originMessageRef ? { originMessageRef } : {}),
    }, { at: at ?? undefined }, options);
    emitFirmEvent(ventureId, "timeline", { threadRef: direction.threadRef });
    return { ventureId, runId, betId, architectureRef, threadRef: direction.threadRef, options };
  } catch {
    // Honest degrade: the drive must never be aborted or changed by a run-recording error.
    return null;
  }
}

export function joinDriveRunToWork(handle, { workRef, participantRef, provider, repository, branch, worktree }, options = {}) {
  if (!handle) return null;
  try {
    const run = attachDriveRunWork(handle.ventureId, handle.runId, {
      workRef,
      participantRef,
      properties: { provider, repository, branch, worktree, workspaceKind: "native-code" },
    }, options);
    extendDirectionThread(handle.ventureId, handle.threadRef, { subjectRefs: [workRef] }, options);
    return run;
  } catch {
    return null;
  }
}

// A wall item is a durable decision record even while it waits for the founder's release. The decisions a
// run produced are every wall item whose decision state advanced inside the drive window — diffed across the
// WHOLE decisions collection, not the pending subset, so an item the founder decided BEFORE the drive
// terminated is still joined. An item is this run's decision when it is either newly present (parked during
// the drive) or was undecided before and carries a decision after (decided during the drive). Both snapshots
// are full-collection maps keyed by item id; a decision: ref is admitted by the atlas for any wall-item id.
function isDecided(item) {
  return item?.decision != null;
}

function newDecisionRefs(beforeWallItems, afterWallItems) {
  const before = new Map((beforeWallItems ?? []).filter((item) => item?.id).map((item) => [item.id, item]));
  return (afterWallItems ?? [])
    .filter((item) => {
      if (!item?.id) return false;
      const prior = before.get(item.id);
      if (!prior) return true; // parked during the drive
      return isDecided(item) && !isDecided(prior); // decided during the drive
    })
    .map((item) => `decision:${item.id}`);
}

// finish — complete the run after terminal completion, adding durable decision joins from the wall diff, and
// mint AND PERSIST an immutable WorkflowExecutionReceipt for a bet-scoped terminal outcome. The receipt is
// the durable home for the TERMINAL KIND (completed | cancelled | paused | budget-exhausted | failed) — a
// founder-cancelled drive that returns { kind: "cancelled" } DOES reach here and completes its run, so
// without a recorded terminal kind it would be indistinguishable from a full completion. The receipt is
// stored in the venture's own 'receipts' collection keyed by its own content-addressed .id, and the
// run→receipt join is read back by receipt.runRef === run:<id> (findReceiptForRun), so the trail reports
// the real terminal instead of 'unknown' — and survives export/import, which re-keys by .id. BETLESS runs
// mint a receipt too (betRef: null): without a recorded terminal kind a betless cancelled drive would be
// indistinguishable from a betless completion post-hoc. An interrupted drive throws before this seam and
// stays historical-unknown, never a false completion. Wrapped fail-safe: any error here —
// completion, mint, or persist — leaves the run at completedAt:null rather than aborting the drive's
// already-finished return.
export function finishDriveRun(handle, {
  outcome,
  beforeWallItems = [],
  afterWallItems = [],
  runtime = null,
  modelRevision = null,
  messageRefs = [],
  subjectRefs = [],
  at = null,
}) {
  if (!handle) return null;
  const { ventureId, runId, betId, architectureRef, threadRef, options } = handle;
  try {
    const decisionRefs = newDecisionRefs(beforeWallItems, afterWallItems);
    completeDriveRun(ventureId, runId, { at: at ?? undefined, decisionRefs }, options);
    // EVERY founder-authorized terminal — bet-scoped OR betless — mints a durable settlement receipt so its
    // terminal KIND (completed | cancelled | paused | budget-exhausted | failed) survives. Without this a
    // betless cancelled drive and a betless completed drive both reach here with completedAt set and are
    // indistinguishable post-hoc; the receipt's terminal kind is what keeps them apart. A bet-scoped receipt
    // carries betRef: bet:<id>; a betless receipt carries betRef: null. The normalized outcome is honest about
    // interrupted/cancelled terminals — never a false completed/done.
    const receipt = createWorkflowExecutionReceipt({
      ventureId,
      runId,
      betRef: betId ? `bet:${betId}` : null,
      outcome: normalizeWorkflowOutcome(outcome ?? { kind: "completed" }, at ? { at } : {}),
      decisionRefs,
      runtime,
      modelRevision: Number.isInteger(modelRevision) ? modelRevision : null,
    });
    // Persist the immutable receipt keyed by its OWN content-addressed .id so the doc's id IS its storage
    // key — the invariant importVenture's re-keying (storageKeyFor) relies on, so the receipt survives a
    // machine-to-machine transfer intact. The run→receipt join lives in receipt.runRef and is read back via
    // findReceiptForRun, never by storage key. Inside the fail-safe try: a persistence error degrades to
    // historical-unknown, never aborts the drive.
    setVentureDoc(ventureId, "receipts", receipt.id, receipt, options);
    // Returned messages and newly revealed subjects belong to the same direction. This enrichment is
    // best-effort after settlement: a bad optional ref must never erase an otherwise valid terminal receipt.
    try {
      extendDirectionThread(ventureId, threadRef, {
        messageRefs,
        subjectRefs: [...new Set([...(architectureRef ? [architectureRef] : []), ...subjectRefs])],
        at: at ?? undefined,
      }, options);
      emitFirmEvent(ventureId, "timeline", { threadRef });
    } catch {
      // The run + receipt remain truthful even if optional thread enrichment cannot be recorded.
    }
    return { runRef: `run:${runId}`, decisionRefs, receipt };
  } catch {
    return null;
  }
}
