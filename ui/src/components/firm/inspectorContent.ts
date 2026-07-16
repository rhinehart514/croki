// The inspector's header projection: given the current canvas selection, decide the kicker, title, and
// note the docked inspector shows for that selection type (effort / draft / teammate / architecture /
// theory). Founder-facing copy only — ordinary language, never internal nouns. Kept out of FirmApp so
// the render root stays focused on wiring; the effort BODY renders through InspectorEffort separately.

import type { FirmArchitectureProjection, FirmLens } from "@/types";
import type { CanvasSelection } from "./directionTarget";

export type InspectorHeader = { kicker: string; title: string; note: string };

export function inspectorHeader(
  selection: CanvasSelection,
  lens: FirmLens | null,
  architecture: FirmArchitectureProjection | null,
): InspectorHeader {
  if (!selection) return { kicker: "Selection", title: "Nothing selected", note: "" };
  if (selection.theoryId) {
    return {
      kicker: "Drover’s current read",
      title: selection.theoryLabel ?? "A provisional idea",
      note: "A provisional read of the venture — it changes as real work and evidence return.",
    };
  }
  if (selection.architectureId) {
    const element = architecture?.elements.find((candidate) => candidate.id === selection.architectureId);
    return {
      kicker: "Venture direction",
      title: element?.name ?? "Selected direction",
      note: element?.does ?? "A part of how this venture creates and reaches value.",
    };
  }
  if (selection.betId) {
    const bet = lens?.bets.find((candidate) => candidate.id === selection.betId);
    return {
      kicker: selection.workRef ? "Draft" : "Effort",
      title: bet?.intent ?? "Selected effort",
      note: selection.workRef
        ? "A draft prepared for this. The exact payload and its record open here."
        : "Work underway toward this. Selecting it opens what it can reach.",
    };
  }
  if (selection.teammateRefs.length) {
    const member = lens?.crew.find((candidate) => selection.teammateRefs.includes(candidate.ref));
    return {
      kicker: "Teammate",
      title: member?.soul?.name?.trim() || selection.teammateRefs.join(", "),
      note: "What this teammate is working on right now.",
    };
  }
  return { kicker: "Selection", title: "Selected", note: "" };
}
