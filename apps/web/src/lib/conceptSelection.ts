import type { UiHistoryEntry } from "@croki/contracts";

export type ConceptDisposition = "unreviewed" | "keep" | "question" | "reject";

export interface RankedConceptSelection {
  readonly entry: UiHistoryEntry;
  readonly rank: number;
  readonly disposition: ConceptDisposition;
}

export interface ConceptSelectionInput {
  readonly action: "continue" | "remix";
  readonly concepts: ReadonlyArray<RankedConceptSelection>;
}

const CONCEPT_SELECTION_HEADING = "Concept selection\n";
const CONCEPT_SELECTION_MARKER = `\n\n${CONCEPT_SELECTION_HEADING}`;

function singleLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Serializes only stable concept and UI-history references into visible draft
 * text. The provider can inspect the exact retained screen through ui_history;
 * Croki does not inject image bodies or private rationale behind the draft.
 */
export function formatConceptSelection(input: ConceptSelectionInput): string {
  const concepts = input.concepts
    .filter((concept) => concept.entry.concept !== undefined)
    .toSorted((left, right) => left.rank - right.rank)
    .slice(0, 10);
  if (concepts.length === 0) return "";

  const heading = input.action === "continue" ? "Continue with concept" : "Remix concepts";
  const lines = [
    "Concept selection",
    `Action: ${heading}`,
    ...concepts.map(({ entry, rank, disposition }) => {
      const concept = entry.concept!;
      return `- #${rank} ${singleLine(concept.title)} · concept: ${singleLine(concept.id)} · ui_history: ${entry.id} · ${disposition}`;
    }),
  ];
  return lines.join("\n");
}

export function replaceTrailingConceptSelection(prompt: string, selection: string): string {
  const trimmed = prompt.trim();
  const existingSelection = trimmed.startsWith(CONCEPT_SELECTION_HEADING)
    ? 0
    : trimmed.lastIndexOf(CONCEPT_SELECTION_MARKER);
  const visiblePrompt =
    existingSelection >= 0 ? trimmed.slice(0, existingSelection).trimEnd() : trimmed;
  return visiblePrompt.length > 0 ? `${visiblePrompt}\n\n${selection}` : selection;
}

export function appendConceptSelectionToPrompt(
  prompt: string,
  input: ConceptSelectionInput,
): string {
  const selection = formatConceptSelection(input);
  if (selection.length === 0) return prompt;
  return replaceTrailingConceptSelection(prompt, selection);
}
