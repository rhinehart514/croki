import type { FirmLens } from "@/types";
import type { CanvasSelection } from "@/components/firm/directionTarget";

export type ComposerRoute = "direct" | "steer" | "correct";

export function composerRoute(selection: CanvasSelection): ComposerRoute {
  if (selection?.betId && selection.workRef) return "correct";
  if (selection?.betId) return "steer";
  return "direct";
}

export function composerScopeKey(ventureId: string, selection: CanvasSelection): string {
  if (!selection) return `${ventureId}:venture`;
  return [
    ventureId,
    selection.betId ?? "",
    selection.workRef ?? "",
    selection.threadRef ?? "",
    selection.objectId ?? "",
    selection.architectureId ?? "",
    selection.architectureStepId ?? "",
    selection.architectureRevision ?? "",
    selection.theoryId ?? "",
    selection.theorySubjectId ?? "",
    selection.theoryRevision ?? "",
    [...selection.teammateRefs].sort().join(","),
  ].join(":");
}

export function composerScopeLabel(selection: CanvasSelection, lens: FirmLens | null, architectureLabel: string | null = null): string | null {
  if (!selection) return null;
  if (selection.betId && lens) {
    const bet = lens.bets.find((candidate) => candidate.id === selection.betId);
    if (!bet) return null;
    if (!selection.workRef) return bet.intent;
    const work = bet.staged?.find((candidate) => candidate.id === selection.workRef);
    return work?.title?.trim() ? `${bet.intent} / ${work.title.trim()}` : `${bet.intent} / exact work`;
  }
  if (selection.theoryId) return selection.theoryLabel?.trim() || "Working theory";
  if (selection.architectureId) return architectureLabel ?? "Venture architecture";
  if (selection.objectId) return architectureLabel ?? "Venture context";
  if (selection.teammateRefs.length && lens) {
    const names = selection.teammateRefs.map((ref) => (
      lens.crew.find((member) => member.ref === ref)?.soul?.name ?? ref
    ));
    return names.join(", ");
  }
  return null;
}
