import type { TurnDiffSummary } from "../../types";

export function buildCrokiTurnUpdatePrompt(
  turn: Pick<TurnDiffSummary, "turnId" | "files">,
): string {
  const changedFiles = turn.files.map((file) => `- ${file.path}`).join("\n");
  return [
    `Review the completed turn ${turn.turnId} and decide whether its consequences should update the Croki Canvas.`,
    "",
    "Changed files:",
    changedFiles,
    "",
    "Inspect the turn and repository evidence before editing .croki/context.json.",
    "Only create or update provisional Canvas items. Never promote anything to current, retire current truth, or silently rewrite founder-approved canon.",
    "Keep proposals concise, deduplicate them against existing Canvas items, and include exact repository evidence in each proposed evidence item.",
  ].join("\n");
}

export function buildCrokiRepositoryBootstrapPrompt(): string {
  return [
    "Inspect this repository and propose an initial Croki Canvas in .croki/context.json.",
    "",
    "Infer the product intent, durable decisions, material evidence, and important work from the repository itself.",
    "Every new item must be provisional. Never mark an item current or claim founder approval.",
    "Keep the Canvas concise, deduplicate overlapping ideas, and cite exact repository files or URLs in evidence items.",
  ].join("\n");
}

export function mergePreparedComposerPrompt(currentPrompt: string, request: string): string {
  const current = currentPrompt.trim();
  const next = request.trim();
  if (!current) return next;
  if (!next || current.includes(next)) return current;
  return `${current}\n\n${next}`;
}
