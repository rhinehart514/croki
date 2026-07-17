// Seed placement for the venture canvas. The layout engine is DEMOTED to a seed here: it decides where
// a node first appears, but a stored founder placement overrides it absolutely (DESIGN.md Exp Law 6 /
// rule 9: generated layouts never overwrite founder placement). So this folds three sources in strict
// precedence: stored placement > territory-biased seed > engine origin — and a node that has ever been
// dragged (has a stored position) is never re-seeded.
//
// Reuses `computeAtlasLayout`/`layoutKindFor` verbatim (the collision-free d3-force constellation, the
// same seed the shipped atlas uses) so the resting field reads identically; the only addition is a
// horizontal territory bias so Product-rooted objects settle on one side and GTM on the other, with the
// intent hub pinned on the seam at the origin. Pure: no React, no persistence, no xyflow runtime.

import type { Node } from "@xyflow/react";
import { computeAtlasLayout, layoutKindFor, type LayoutInput } from "@/lib/atlasLayoutEngine";
import { nodeTerritory, TERRITORY_SIDE, type Territory } from "./canvasTerritory";

// How far each territory's seed is pushed off the seam, in flow units. Large enough that the two
// populations read as distinct geography under the region kickers, small enough that cross-territory
// causal edges stay legible seams rather than long hauls across empty canvas.
const TERRITORY_BIAS = 260;

const KIND_SIZE_FALLBACK = { width: 204, height: 210 };

function seedInput(node: Node): LayoutInput | null {
  const kind = layoutKindFor(String((node.data as { kind?: unknown }).kind ?? ""));
  if (!kind) return null;
  const width = typeof node.width === "number" ? node.width : KIND_SIZE_FALLBACK.width;
  const height = typeof node.height === "number" ? node.height : KIND_SIZE_FALLBACK.height;
  return { id: node.id, kind, width, height, pinned: kind === "hub" };
}

export type SeededPositions = Record<string, { x: number; y: number }>;

// Compute seed positions for every placeable node, biased by territory. The hub stays at the origin
// seam; product-rooted nodes shift toward their side, gtm-rooted toward theirs, indeterminate nodes
// keep the engine's own placement.
export function seedCanvasPositions(nodes: Node[]): SeededPositions {
  const inputs = nodes.map(seedInput).filter((input): input is LayoutInput => Boolean(input));
  if (!inputs.length) return {};
  const { positions } = computeAtlasLayout(inputs);
  const territoryById = new Map<string, Territory | null>(nodes.map((node) => [node.id, nodeTerritory(node)]));
  const seeded: SeededPositions = {};
  for (const [id, position] of positions) {
    const territory = territoryById.get(id) ?? null;
    const bias = territory ? TERRITORY_SIDE[territory] * TERRITORY_BIAS : 0;
    seeded[id] = { x: position.x + bias, y: position.y };
  }
  return seeded;
}

// Fold stored placement over the seed: a node with a stored position keeps it exactly (the founder's
// hand is final); everything else takes its territory-biased seed. This is the single source of node
// positions the canvas renders.
export function foldPlacement(
  nodes: Node[],
  stored: SeededPositions,
): SeededPositions {
  const seed = seedCanvasPositions(nodes);
  const positions: SeededPositions = { ...seed };
  for (const [id, position] of Object.entries(stored)) {
    positions[id] = position;
  }
  return positions;
}
