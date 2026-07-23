// What one drive changed, turned into durable founder-facing truth. Two responsibilities, one subject:
// buildWorkHandoff reads the before/after venture docs and says what landed on the canvas, and
// settleDriveIntoConversation runs the whole settle path a finished drive owes the Thread — the
// teammate messages it produced, their runtime stamp, that handoff, the working-theory check, and the
// terminal run receipt. It lives beside work-loop.mjs rather than inside it because the loop's own
// responsibility ends at the pause: reach it, then hand the consequence here.

import { appendConversationMessage, listConversation, stampConversationRuntime } from "./conversation.mjs";
import { checkWorkingTheoryCompletion } from "./working-theory-completion.mjs";
import { finishDriveRun } from "./work-loop-run.mjs";

export function buildWorkHandoff({ beforeBets, afterBets, beforeWallItems, afterWallItems }) {
  const beforeById = new Map(beforeBets.map((bet) => [bet.id, bet]));
  const beforeWallIds = new Set(beforeWallItems.map((item) => item.id));
  const openedBetIds = afterBets.filter((bet) => !beforeById.has(bet.id)).map((bet) => bet.id);
  const stagedBetIds = afterBets.filter((bet) => {
    const beforeCount = beforeById.get(bet.id)?.staged?.length ?? 0;
    return (bet.staged?.length ?? 0) > beforeCount;
  }).map((bet) => bet.id);
  const wallBetIds = afterWallItems.filter((item) => !beforeWallIds.has(item.id) && item.betId).map((item) => item.betId);
  const changes = { openedBetIds, stagedBetIds, wallBetIds };
  if (![...openedBetIds, ...stagedBetIds, ...wallBetIds].length) return null;
  const parts = [];
  if (openedBetIds.length) parts.push(`${openedBetIds.length} ${openedBetIds.length === 1 ? "bet" : "bets"} opened`);
  if (stagedBetIds.length) parts.push(`work staged on ${stagedBetIds.length}`);
  if (wallBetIds.length) parts.push(`${wallBetIds.length} waiting at the wall`);
  return { content: `Work landed on the canvas — ${parts.join(" · ")}.`, changes };
}

// settleDriveIntoConversation — everything a settled drive owes the Thread, in one place.
//
// The teammate messages are read back out of the conversation rather than taken from the adapter's
// return, because a turn is durable truth the moment a tool appends it. Only when a drive produced none
// does its last narration (or a completed outcome's summary) become the direct answer, so a founder who
// asked a question is never left looking at an empty Thread.
export function settleDriveIntoConversation({
  ventureId, teammateRef, betId, target, options,
  outcome, narration, priorTeammateMessageIds, runtimeReceipt, coordinationRequest = null,
  beforeBets, beforeWallItems, ventureStore,
  driveRun, configurationRevision, targetBetId, theoryBaseline, workingTheoryDrive,
}) {
  let newTeammateMessages = listConversation(ventureId, options)
    .filter((message) => (
      message.role === "teammate"
      && message.teammateRef === teammateRef
      && !priorTeammateMessageIds.has(message.id)
    ));
  if (!newTeammateMessages.length) {
    const directAnswer = narration.at(-1)
      ?? (outcome.kind === "completed" ? String(outcome.summary ?? "").trim() : "");
    if (directAnswer) {
      newTeammateMessages = [appendConversationMessage({
        ventureId,
        role: "teammate",
        content: directAnswer,
        teammateRef,
        betId,
        runtime: runtimeReceipt,
        coordination: coordinationRequest,
        target,
      }, options)];
    }
  }
  const stampedMessages = stampConversationRuntime(
    ventureId,
    newTeammateMessages.map((message) => message.id),
    runtimeReceipt,
    options,
    coordinationRequest,
  );

  const afterWallItems = ventureStore.listVentureDocs(ventureId, "decisions", options);
  const handoffDraft = buildWorkHandoff({
    beforeBets,
    afterBets: ventureStore.listVentureDocs(ventureId, "bets", options),
    beforeWallItems,
    afterWallItems,
  });
  const handoff = handoffDraft ? appendConversationMessage({
    ventureId,
    role: "system",
    kind: "handoff",
    content: handoffDraft.content,
    teammateRef,
    betId,
    target,
    changes: handoffDraft.changes,
  }, options) : null;
  const completion = checkWorkingTheoryCompletion(
    { ventureId, baseline: theoryBaseline, outcome, target, required: workingTheoryDrive },
    options,
  );

  // Terminal Run completion: add the durable decision joins parked during this drive and mint an immutable
  // WorkflowExecutionReceipt for EVERY founder-authorized terminal — bet-scoped OR betless (betRef null).
  // A drive that reached here completed OR cancelled (a cancelled outcome returned by adapter.drive still
  // arrives here and finishes its run with a terminal cancelled receipt, so cancelled stays distinct from
  // completed post-hoc). Only a truly INTERRUPTED drive — one that THREW before this point — leaves its run
  // completedAt:null, historical-unknown, never a false completion. Fail-safe: finishDriveRun swallows its
  // own errors so a completion failure never changes the drive's already-built return.
  finishDriveRun(driveRun, {
    outcome,
    beforeWallItems,
    afterWallItems,
    runtime: runtimeReceipt,
    modelRevision: configurationRevision,
    messageRefs: [...stampedMessages, ...(handoff ? [handoff] : [])].map((message) => `conversation:${message.id}`),
    subjectRefs: [...new Set([
      targetBetId,
      ...(handoffDraft?.changes?.openedBetIds ?? []),
      ...(handoffDraft?.changes?.stagedBetIds ?? []),
      ...(handoffDraft?.changes?.wallBetIds ?? []),
    ].filter(Boolean))].map((id) => `bet:${id}`),
  });

  return { messages: stampedMessages, handoff, completion };
}
