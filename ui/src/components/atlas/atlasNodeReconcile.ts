import type { AtlasNode } from "./atlasTypes";

// React Flow reveals a node only once it has dimensions (`nodeHasDimensions`: measured ?? width ??
// initialWidth). It stores the measured size on its *internal* node and mirrors it back onto the
// controlled `nodes` array via the `dimensions` change. But when the array is replaced with fresh node
// objects — which the projection poll does on every tick, and every reframe/lens change triggers —
// `adoptUserNodes` rebuilds each internal node from `incoming.measured`, NOT from the prior internal
// node. Our rebuilt scene nodes come from the projection and carry no `measured`, so every node drops to
// `visibility:hidden` and does not reliably re-measure (the ResizeObserver never fires when the DOM box
// is unchanged) — the empty-canvas bug (F1).
//
// Carry the last known measured size per id onto the rebuilt nodes so React Flow keeps them revealed
// across every poll/reframe at every viewport. This is exactly what React Flow itself preserves for an
// identity-stable node; we restore it for the identity-churned case. React Flow still re-measures and
// overwrites `measured` whenever a card's real rendered size actually changes, so this cannot pin a
// stale size — it only prevents the spurious hidden flash from becoming permanent.
export function carryMeasuredDimensions(previous: AtlasNode[], next: AtlasNode[]): AtlasNode[] {
  const measuredById = new Map<string, AtlasNode["measured"]>();
  for (const node of previous) {
    if (node.measured?.width && node.measured?.height) measuredById.set(node.id, node.measured);
  }
  if (!measuredById.size) return next;
  return next.map((node) => {
    if (node.measured?.width && node.measured?.height) return node;
    const measured = measuredById.get(node.id);
    return measured ? { ...node, measured } : node;
  });
}
