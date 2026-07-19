import type { FirmConversationMessage, FirmLens } from "@/types";
import type { CanvasSelection } from "./GoalComposer";

function configurationDiffPaths(message: FirmConversationMessage) {
  return [
    ...(message.configurationProposal?.diff ?? []),
    ...(message.configurationReceipt?.diff ?? []),
  ].map((entry) => entry.path.toLowerCase());
}

function configurationRevision(message: FirmConversationMessage) {
  if (message.configurationReceipt) return message.configurationReceipt.revision;
  if (message.configurationProposal?.status === "applied") {
    return message.configurationProposal.appliedRevision ?? message.configurationProposal.proposedRevision;
  }
  return null;
}

function configurationAffectsSelection(
  message: FirmConversationMessage,
  selection: Exclude<CanvasSelection, null>,
  lens: FirmLens,
) {
  if (message.kind !== "configuration-proposal" && message.kind !== "configuration-receipt") return false;
  if (selection.betId) {
    if (message.betId === selection.betId) return true;
    const bet = lens.bets.find((candidate) => candidate.id === selection.betId);
    const revision = configurationRevision(message);
    return Boolean(bet?.configurationRevision && revision === bet.configurationRevision);
  }

  if (message.teammateRef && selection.teammateRefs.includes(message.teammateRef)) return true;
  return selection.teammateRefs.some((selectedRef) => {
    const participantIndex = lens.configuration?.agents.findIndex((participant) => participant.ref === selectedRef) ?? -1;
    const ref = selectedRef.toLowerCase();
    return configurationDiffPaths(message).some((path) => (
      path.startsWith(`agents.${ref}.`)
      || path.startsWith(`agents[${ref}].`)
      || (participantIndex >= 0 && (path.startsWith(`agents.${participantIndex}.`) || path.startsWith(`agents[${participantIndex}].`)))
    ));
  });
}

export function conversationBetIds(lens: FirmLens, selection: CanvasSelection) {
  if (!selection) return lens.bets.map((bet) => bet.id);
  if (selection.betId) return [selection.betId];
  if (selection.architectureId || selection.objectId) return [];
  return lens.bets.filter((bet) => bet.teammateRef && selection.teammateRefs.includes(bet.teammateRef)).map((bet) => bet.id);
}

function messageInScope(
  message: FirmConversationMessage,
  selection: Exclude<CanvasSelection, null>,
  scopedBetIds: Set<string>,
  lens: FirmLens,
) {
  // Exact work is an identity boundary, not a narrower visual hint. Nothing may
  // enter this thread through bet, teammate, or configuration-revision affinity.
  if (selection.workRef) {
    return message.target?.betId === selection.betId
      && message.target.workRef === selection.workRef;
  }
  if (selection.architectureId) {
    return message.target?.architectureId === selection.architectureId
      && (!selection.architectureStepId || message.target?.architectureStepId === selection.architectureStepId);
  }
  if (message.kind === "configuration-proposal" || message.kind === "configuration-receipt") {
    return configurationAffectsSelection(message, selection, lens);
  }
  if (message.teammateRef && selection.teammateRefs.includes(message.teammateRef)) return true;
  if (message.target?.teammateRefs?.some((ref) => selection.teammateRefs.includes(ref))) return true;
  if (message.betId && scopedBetIds.has(message.betId)) return true;
  return [
    ...(message.changes?.openedBetIds ?? []),
    ...(message.changes?.stagedBetIds ?? []),
    ...(message.changes?.wallBetIds ?? []),
  ].some((id) => scopedBetIds.has(id));
}

export function focusedConversationMessages(
  messages: FirmConversationMessage[],
  lens: FirmLens,
  selection: CanvasSelection,
  scopedBetIds: Set<string>,
) {
  if (!selection) return messages;
  return messages.filter((message, index) => {
    if (messageInScope(message, selection, scopedBetIds, lens)) return true;
    if (!selection.betId || selection.workRef || (message.role !== "founder" && message.role !== "agent")) return false;
    for (let next = index + 1; next < messages.length; next += 1) {
      const candidate = messages[next];
      if (candidate.role === "founder" || candidate.role === "agent") break;
      if (messageInScope(candidate, selection, scopedBetIds, lens)) return true;
    }
    return false;
  });
}
