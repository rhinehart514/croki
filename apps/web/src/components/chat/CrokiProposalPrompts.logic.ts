import type { TurnDiffSummary } from "../../types";

function buildCanonicalCanvasInstruction(workspaceRoot: string): string {
  return [
    `The canonical project root is ${JSON.stringify(workspaceRoot)} and its Canvas file is .croki/context.json.`,
    "Read and edit that project-root file directly. Never create or update a worktree-local .croki/context.json.",
  ].join("\n");
}

export function buildCrokiTurnUpdatePrompt(
  turn: Pick<TurnDiffSummary, "turnId" | "files">,
  workspaceRoot: string,
): string {
  const changedFiles = turn.files.map((file) => `- ${file.path}`).join("\n");
  return [
    `Review the completed turn ${turn.turnId} and decide whether its consequences should update the Croki Canvas.`,
    "",
    "Changed files:",
    changedFiles,
    "",
    buildCanonicalCanvasInstruction(workspaceRoot),
    "Inspect the turn and repository evidence before editing the canonical Canvas file.",
    "Only create or update provisional Canvas items. Never promote anything to current, retire current truth, or silently rewrite founder-approved canon.",
    "Mark new items with the relevant product, gtm, workflow, or shared domain and an honest origin.",
    "Keep proposals concise, deduplicate them against existing Canvas items, and include exact repository evidence in each proposed evidence item.",
  ].join("\n");
}

export function buildCrokiRepositoryBootstrapPrompt(workspaceRoot: string): string {
  return [
    "Inspect this repository and propose an initial Croki Canvas.",
    "",
    buildCanonicalCanvasInstruction(workspaceRoot),
    "Infer the product intent, durable decisions, material evidence, and important work from the repository itself.",
    "Every new item must be provisional. Never mark an item current or claim founder approval.",
    "Use domain product and origin repository for repository-derived proposals.",
    "Keep the Canvas concise, deduplicate overlapping ideas, and cite exact repository files or URLs in evidence items.",
  ].join("\n");
}

export function buildCrokiGtmExplorationPrompt(workspaceRoot: string): string {
  return [
    "Reason about this product's GTM from the founder perspective using the current Croki Canvas and repository evidence.",
    "",
    buildCanonicalCanvasInstruction(workspaceRoot),
    "Distinguish audiences, market claims, observed signals, and concrete experiments. Surface contradictions and missing evidence instead of forcing certainty.",
    "If durable GTM understanding should be added to the canonical Canvas file, create concise provisional items with domain gtm and an honest origin. Cite HTTP(S) sources for external evidence.",
    "Never promote proposals to current or rewrite founder-approved canon.",
  ].join("\n");
}

export function buildCrokiWorkflowCompositionPrompt(workspaceRoot: string): string {
  return [
    "Turn the desired work into an explicit plan in this existing Croki Thread.",
    "",
    buildCanonicalCanvasInstruction(workspaceRoot),
    "Define the outcome, assignments, parallel steps, decision gates, required evidence, and final synthesis. Use native agent capabilities, worktrees, tests, and Review.",
    "Do not create a second workflow engine, conversation system, memory system, or review system.",
    "If a reusable workflow insight belongs in the canonical Canvas file, keep it provisional with domain workflow and an honest origin.",
  ].join("\n");
}

export function buildCrokiReleaseLineagePrompt(workspaceRoot: string): string {
  return [
    "Prepare the next application release from the verified project evidence Croki has derived.",
    "",
    `The canonical project root is ${JSON.stringify(workspaceRoot)} and its application brief is .croki/application.croki.`,
    "Inspect the current application lineage, relevant source Threads, checkpoints, Git diff and history, focused test results, preview evidence, and release notes before editing anything.",
    "Update the released and building application facts only when the repository evidence supports them. Do not promote Thread reports into released truth without verification.",
    "Keep the provider's native behavior, preserve the original user request, and make the lineage edit through the normal repository and Review path.",
    "Update or create the release notes for the building version when the evidence supports a release.",
  ].join("\n");
}

export function mergePreparedComposerPrompt(currentPrompt: string, request: string): string {
  const current = currentPrompt.trim();
  const next = request.trim();
  if (!current) return next;
  if (!next || current.includes(next)) return current;
  return `${current}\n\n${next}`;
}
