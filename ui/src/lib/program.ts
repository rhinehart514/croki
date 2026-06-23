// Programs are the first-class surface. Newer programs carry their workflow graph directly;
// older records may still point at a sidecar flow by graphId or channelId. Keep that compatibility
// in one resolver so the rest of the shell can treat the program as the owner.

import type { GTMGraph, OutcomeProgram } from "@/types";

// The id a program's graph is stored under. Prefer the owned workflow, then legacy pointers.
export function programGraphId(program: OutcomeProgram | null | undefined): string | null {
  return program?.workflowGraph?.id ?? program?.graphId ?? program?.channelId ?? null;
}

// Does this loaded graph belong to this program? True when the graph names the program, or the
// program names the graph (by either of its graph-bearing fields).
export function graphBelongsToProgram(
  graph: GTMGraph | null | undefined,
  program: OutcomeProgram | null | undefined,
): boolean {
  if (!graph || !program) return false;
  return graph.outcomeProgramId === program.id || graph.id === programGraphId(program);
}

// The program a given graph/channel id resolves to, by either of its graph-bearing fields.
export function findProgramForGraph(
  programs: OutcomeProgram[],
  graphId: string | null | undefined,
): OutcomeProgram | null {
  if (!graphId) return null;
  return programs.find((program) => programGraphId(program) === graphId) ?? null;
}
