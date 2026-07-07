// The plan roster's row state — the binding between a composed plan row and the streamed run.
//
// The composed plan is known the instant a build/run starts, so it renders as a checklist: one row per
// step. Each row's state derives PURELY from three real signals — whether the step is still a proposal,
// the id of the node running right now, and the run's per-node results so far — never from fabricated
// progress. A row only advances on a real streamed event, in lockstep with the canvas node that the
// same `runningNodeId` lights. Kept as a pure function so it's testable in isolation and so the roster
// (ComposerDock) and any other surface read a row's state the same way.

import type { GTMNode, GTMRunResult } from "@/types";

export type RosterState = "ghost" | "working" | "gate" | "stuck" | "done" | "pending";

export function rosterState(
  node: GTMNode,
  runningNodeId: string | null,
  result: GTMRunResult | null | undefined,
  proposed: boolean,
): RosterState {
  if (proposed) return "ghost";
  if (node.id === runningNodeId) return "working";
  const nr = result?.nodes[node.id];
  if (nr) {
    // Awaiting the founder's call — the same two honest signals the canvas gate blooms on.
    const awaiting = nr.pendingReview === true
      || (typeof nr.meta?.awaitingReview === "number" && (nr.meta.awaitingReview as number) > 0);
    if (awaiting) return "gate";
    if (!nr.ok && !nr.blocked) return "stuck"; // ran and errored — never dress it up as done
    return "done";
  }
  return "pending";
}
