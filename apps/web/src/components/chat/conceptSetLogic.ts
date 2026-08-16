import type { UiHistoryEntry } from "@croki/contracts";

export const MAX_CONCEPT_SET_OPTIONS = 10;

export type ConceptDisposition = "keep" | "question" | "reject";
export type ConceptDispositions = Readonly<Record<string, ConceptDisposition>>;
export interface RankedConceptChoice {
  readonly entry: ConceptScreenEntry;
  readonly rank: number;
  readonly disposition: ConceptDisposition | "unreviewed";
}
export type ConceptSetAction = (selected: ReadonlyArray<RankedConceptChoice>) => void;

export type ConceptScreenEntry = UiHistoryEntry & {
  readonly concept: NonNullable<UiHistoryEntry["concept"]>;
};

export function isConceptScreen(entry: UiHistoryEntry): entry is ConceptScreenEntry {
  return entry.concept !== undefined;
}

export function rankConceptScreens(screens: ReadonlyArray<UiHistoryEntry>): ConceptScreenEntry[] {
  return screens
    .flatMap((screen, sourceIndex) => (isConceptScreen(screen) ? [{ screen, sourceIndex }] : []))
    .toSorted((left, right) => {
      const rankDelta = left.screen.concept.initialRank - right.screen.concept.initialRank;
      if (rankDelta !== 0) return rankDelta;
      const observedDelta = left.screen.observedAt.localeCompare(right.screen.observedAt);
      return observedDelta !== 0 ? observedDelta : left.sourceIndex - right.sourceIndex;
    })
    .slice(0, MAX_CONCEPT_SET_OPTIONS)
    .map(({ screen }) => screen);
}

export function moveConceptScreen(
  screens: ReadonlyArray<ConceptScreenEntry>,
  fromIndex: number,
  toIndex: number,
): ConceptScreenEntry[] {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= screens.length ||
    toIndex >= screens.length ||
    fromIndex === toIndex
  ) {
    return [...screens];
  }
  const next = [...screens];
  const [moved] = next.splice(fromIndex, 1);
  if (!moved) return next;
  next.splice(toIndex, 0, moved);
  return next;
}

export function toggleConceptComparison(selectedIds: ReadonlyArray<string>, id: string): string[] {
  if (selectedIds.includes(id)) return selectedIds.filter((selectedId) => selectedId !== id);
  return selectedIds.length < 2 ? [...selectedIds, id] : [...selectedIds];
}

export function setConceptDisposition(
  dispositions: ConceptDispositions,
  id: string,
  disposition: ConceptDisposition,
): ConceptDispositions {
  if (dispositions[id] === disposition) {
    const next = { ...dispositions };
    delete next[id];
    return next;
  }
  return { ...dispositions, [id]: disposition };
}

export function conceptLabel(screen: ConceptScreenEntry): string {
  return screen.concept.title.trim() || screen.title.trim() || "Untitled option";
}

export function conceptImageName(screen: ConceptScreenEntry): string {
  return `${conceptLabel(screen)} · ${screen.concept.summary}`;
}

export function conceptIssueCount(screen: UiHistoryEntry): number {
  return screen.consoleErrorCount + screen.networkFailureCount;
}
