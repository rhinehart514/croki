import { useSyncExternalStore } from "react";

// ─── Ghost proposals (slice 4) — Claude's proposed canvas edits, accepted in place ─────────────────
// Distinct from the operator's all-or-nothing pendingProposal path: these are CLIENT-staged ghosts —
// a node or edge Claude proposes, held translucent/dashed on the canvas until the founder accepts or
// discards it, per item, right where the change is. The resolve handlers travel through this tiny
// module store (not React props) so the inline controls inside GraphCanvas reach them WITHOUT threading
// a new prop through GtmCanvas (outside this slice's files). App registers the handlers; the controls
// subscribe. Lives in its own module so GraphCanvas keeps exporting only components (react-refresh).
export type GhostResolve = {
  acceptNode: (id: string) => void;
  rejectNode: (id: string) => void;
  acceptEdge: (id: string) => void;
  rejectEdge: (id: string) => void;
  // Which ids are still staged (unresolved) — drives whether a control renders for a given node/edge.
  stagedNodeIds: Set<string>;
  stagedEdgeIds: Set<string>;
};

let ghostResolveState: GhostResolve | null = null;
const ghostResolveListeners = new Set<() => void>();

// App calls this to publish the current staged set + resolve handlers (or null when nothing is staged).
export function setGhostResolve(next: GhostResolve | null): void {
  ghostResolveState = next;
  ghostResolveListeners.forEach((listener) => listener());
}

function subscribeGhostResolve(listener: () => void): () => void {
  ghostResolveListeners.add(listener);
  return () => ghostResolveListeners.delete(listener);
}

export function useGhostResolve(): GhostResolve | null {
  return useSyncExternalStore(subscribeGhostResolve, () => ghostResolveState, () => ghostResolveState);
}
