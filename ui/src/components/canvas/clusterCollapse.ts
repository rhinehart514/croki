// clusterCollapse — PURE tail-collapse for the dense-map rank-and-reveal (SPEC C). Given the ranker's
// surfaced/tail verdict (rankAtlasNodes) it groups the TAIL by territory into at most N cluster groups, marks
// each tail node `hidden:true` with the `clusterId` of its group, and emits one glyph descriptor per group
// carrying a count. Surfaced nodes are returned untouched.
//
// THE INVARIANT this module's test guards: surfaced ∪ clustered === allNodes. Nothing is ever dropped — a
// hidden node stays in the array feeding AtlasOutline (Law 4: every object reachable at every altitude), it
// merely renders behind a glyph. `hidden` is set on the node; the array length never shrinks.
//
// PURE: no store reads, no mutation. It returns a new decorated node array plus the glyph descriptors; the
// stage feeds the glyphs into foldPlacement as pinned obstacles so surfaced nodes route around them.

import type { AtlasNode } from "@/components/atlas/atlasTypes";
import type { RankedNode } from "./rankAtlasNodes";
import { nodeTerritory, TERRITORY_LABEL, type Territory } from "./canvasTerritory";

// The most cluster glyphs the map read shows. The tail is grouped by territory first; if a single territory's
// tail would exceed this budget it is still ONE glyph (territory is the grouping key), so the count never
// exceeds the number of distinct territory buckets (product / gtm / unassigned) which is already ≤ N.
export const MAX_CLUSTERS = 3;

// SPEC C folds the QUIET TAIL of a DENSE venture (the ~100-direction wall) — not a handful of cards. A
// venture with only a few tail directions has no dense tail to fold: collapsing it would hide the readable
// machine behind a glyph and leave nothing to read. The stage gates the CALL on this floor (it owns the
// density policy); this pure collapser folds whatever tail it is handed. Exported so the stage and the
// collapser agree on the one threshold.
export const MIN_TAIL_TO_COLLAPSE = 8;

// The bucket key a tail node collapses into. Territory is the grouping facet (SPEC C: "group the tail by
// territory"); a territory-null tail node falls into a shared "unassigned" bucket so it is never dropped.
type ClusterKey = Territory | "unassigned";

export type ClusterGlyphDescriptor = {
  // Stable id for the glyph node — deterministic per bucket so re-collapse keeps the same glyph identity.
  id: string;
  clusterKey: ClusterKey;
  // Founder-facing label, e.g. "34 more Go-to-market directions".
  label: string;
  count: number;
  // The territory tint the glyph renders with (null for the unassigned bucket), greyscale-safe downstream.
  territory: Territory | null;
  // The ids this glyph stands in for — so approach/click can reveal exactly this group.
  memberIds: string[];
};

export type ClusterCollapseResult = {
  // Every node, in input order, with tail nodes marked hidden + clusterId. surfaced ∪ clustered === input.
  nodes: AtlasNode[];
  glyphs: ClusterGlyphDescriptor[];
};

function clusterKeyFor(node: AtlasNode): ClusterKey {
  return nodeTerritory(node) ?? "unassigned";
}

function glyphLabel(key: ClusterKey, count: number): string {
  const noun = count === 1 ? "direction" : "directions";
  if (key === "unassigned") return `${count} more ${noun}`;
  return `${count} more ${TERRITORY_LABEL[key]} ${noun}`;
}

export type ClusterCollapseInput = {
  nodes: AtlasNode[];
  ranked: RankedNode[];
};

// Collapse the tail. PURE. Returns the full node array (surfaced untouched, tail hidden+clusterId) and the
// glyph descriptors. The invariant surfaced ∪ clustered === allNodes holds by construction: every input node
// is emitted exactly once, either surfaced (unchanged) or clustered (hidden, in exactly one glyph's members).
export function clusterCollapse({ nodes, ranked }: ClusterCollapseInput): ClusterCollapseResult {
  const surfacedById = new Map<string, boolean>();
  for (const entry of ranked) surfacedById.set(entry.id, entry.surfaced);

  // First pass: bucket the tail by territory, preserving input order within each bucket.
  const buckets = new Map<ClusterKey, AtlasNode[]>();
  for (const node of nodes) {
    // A node with no ranking verdict is treated as surfaced (fail-open — never silently collapse an
    // unranked node), so it is never lost from the surfaced side of the invariant.
    if (surfacedById.get(node.id) !== false) continue;
    const key = clusterKeyFor(node);
    const bucket = buckets.get(key) ?? [];
    bucket.push(node);
    buckets.set(key, bucket);
  }

  // Build a glyph per non-empty bucket, and index each tail node → its clusterId. Deterministic bucket order
  // (product, gtm, unassigned) so the glyph ids are stable across renders. MAX_CLUSTERS bounds the bucket
  // set; territory grouping already yields ≤ 3 buckets, so this is an assertion, not a lossy cap.
  const BUCKET_ORDER: ClusterKey[] = ["product", "gtm", "unassigned"];
  const glyphs: ClusterGlyphDescriptor[] = [];
  const clusterIdByNode = new Map<string, string>();
  for (const key of BUCKET_ORDER) {
    const members = buckets.get(key);
    if (!members || members.length === 0) continue;
    if (glyphs.length >= MAX_CLUSTERS) break;
    const id = `cluster:${key}`;
    const memberIds = members.map((node) => node.id);
    for (const memberId of memberIds) clusterIdByNode.set(memberId, id);
    glyphs.push({
      id,
      clusterKey: key,
      label: glyphLabel(key, members.length),
      count: members.length,
      territory: key === "unassigned" ? null : key,
      memberIds,
    });
  }

  // Second pass: emit every node once. Surfaced nodes pass through; clustered nodes gain hidden + clusterId.
  // A tail node whose bucket overflowed MAX_CLUSTERS (cannot happen with ≤3 territory buckets, but guarded)
  // has no clusterId → it stays surfaced rather than vanishing, preserving the invariant.
  const out = nodes.map((node) => {
    const clusterId = clusterIdByNode.get(node.id);
    if (!clusterId) return node;
    return { ...node, hidden: true, data: { ...node.data, clusterId } };
  });

  return { nodes: out, glyphs };
}
