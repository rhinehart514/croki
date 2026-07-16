import type { AtlasNode } from "./atlasTypes";

export const ATLAS_EASE = [0.22, 1, 0.36, 1] as const;
export const ATLAS_MOTION = {
  fast: 0.18,
  settle: 0.22,
  focus: 0.26,
} as const;

function durableReceiptId(node: AtlasNode) {
  if (node.data.kind === "theory") {
    const revision = node.data.theoryRevision ?? 0;
    return `${node.id}:revision:${revision}`;
  }
  if (node.data.kind === "work" || node.data.kind === "outcome") return node.id;
  return null;
}

export function trackAtlasArrivals(previous: ReadonlySet<string> | null, nodes: AtlasNode[]) {
  const known = new Set(previous ?? []);
  const arrivals = new Map<string, string>();
  for (const node of nodes) {
    const receiptId = durableReceiptId(node);
    if (!receiptId) continue;
    if (previous && !previous.has(receiptId)) arrivals.set(node.id, receiptId);
    known.add(receiptId);
  }
  return { known, arrivals };
}
