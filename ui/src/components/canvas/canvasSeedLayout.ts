// Seed placement for the venture canvas. The layout engine is DEMOTED to a seed here: it decides where
// a node first appears, but a stored founder placement overrides it absolutely (DESIGN.md Exp Law 6 /
// rule 9: generated layouts never overwrite founder placement). So this folds three sources in strict
// precedence: stored placement > territory-biased seed > engine origin — and a node that has ever been
// dragged (has a stored position) is never re-seeded.
//
// Reuses `computeAtlasLayout`/`layoutKindFor` verbatim (the collision-free d3-force constellation, the
// same seed the shipped atlas uses) so the resting field reads identically. Two things make the resting
// canvas read as the Product+GTM MACHINE rather than a crowded scatter:
//
//   1. COLLISION-FREE BY CONSTRUCTION. Every node is sized from `nodeDimensions.reservedFootprint` — its
//      LARGEST band footprint (monotonic by construction), matching the real CSS card widths (bet 340px,
//      work 250px, intent 280px, product-loop 480px …) instead of one uniform 204px fallback that let the
//      engine separate boxes far narrower than the cards it placed. The exact separation pass now clears
//      the footprint each card will ever grow to, so no two cards overlap at the arrival fit and a band
//      swap never reflows into a neighbour.
//
//   2. TERRITORY SIDEDNESS INSIDE THE SIM. Territory is fed to the engine as a per-node half-plane bias
//      (territorySide), NOT as a post-separation x-shift. The engine seeds each node into its territory's
//      half-plane and pulls it there with a forceX, then runs the exact separation pass LAST — so Product
//      settles clearly on one side and GTM on the other (a felt spatial split) while the field stays
//      collision-free. The intent hub stays pinned on the seam at the origin.
//
// Pure: no React, no persistence, no xyflow runtime.

import type { Node } from "@xyflow/react";
import { computeAtlasLayout, layoutKindFor, type LayoutInput } from "@/lib/atlasLayoutEngine";
import { reservedFootprint, type NodeArchetype } from "@/components/atlas/nodeDimensions";
import { resolveTerritories, TERRITORY_SIDE, type Territory } from "./canvasTerritory";

// The visual kind a scene node carries → the nodeDimensions archetype whose LARGEST-band footprint the
// seed reserves. This is the single size source for the canvas seed path (replacing the uniform 204px
// fallback): every kind resolves to the archetype whose reservedFootprint matches its real card width, so
// the engine separates the footprint each card will actually occupy. Kinds that are not placed by the
// engine (group frames, the orbit field) never reach seedInput.
const KIND_ARCHETYPE: Record<string, NodeArchetype> = {
  intent: "intent",
  theory: "intent",
  bet: "bet",
  teammate: "crew",
  capability: "capability",
  wall: "wall",
  work: "bet",
  outcome: "bet",
  // Architecture roles render as the architecture card family.
  concept: "architecture",
  system: "architecture",
  "product-loop": "architecture",
  motion: "architecture",
  campaign: "architecture",
  release: "architecture",
  implementation: "architecture",
  audience: "architecture",
  offer: "architecture",
  channel: "architecture",
};

function archetypeForKind(kind: string): NodeArchetype {
  return KIND_ARCHETYPE[kind] ?? "architecture";
}

function seedInput(node: Node, side: -1 | 0 | 1): LayoutInput | null {
  const kind = layoutKindFor(String((node.data as { kind?: unknown }).kind ?? ""));
  if (!kind) return null;
  // Reserve the largest band footprint for this archetype so a later band swap never reflows or collides;
  // a real measured size still wins downstream for camera framing (carryMeasuredDimensions), but the seed
  // must reserve the WIDEST footprint the card can grow to, which is exactly reservedFootprint.
  const footprint = reservedFootprint(archetypeForKind(String((node.data as { kind?: unknown }).kind ?? "")));
  const width = typeof node.width === "number" ? node.width : footprint.width;
  const height = typeof node.height === "number" ? node.height : footprint.height;
  // The hub sits on the seam; give it no territory bias so it pins at the origin.
  return { id: node.id, kind, width, height, pinned: kind === "hub", territorySide: kind === "hub" ? 0 : side };
}

export type SeededPositions = Record<string, { x: number; y: number }>;

// Compute seed positions for the given placeable nodes, biased by territory. The hub stays pinned at the
// origin seam; product-rooted nodes settle on their side, gtm-rooted on theirs, indeterminate nodes keep
// the engine's origin-centred placement. Territory is a simulation-time bias (see atlasLayoutEngine), so
// the exact separation pass still runs last and the result is collision-free.
export function seedCanvasPositions(nodes: Node[]): SeededPositions {
  const territoryById: Map<string, Territory | null> = resolveTerritories(nodes);
  const inputs = nodes
    .map((node) => {
      const territory = territoryById.get(node.id) ?? null;
      const side: -1 | 0 | 1 = territory ? TERRITORY_SIDE[territory] : 0;
      return seedInput(node, side);
    })
    .filter((input): input is LayoutInput => Boolean(input));
  if (!inputs.length) return {};
  const { positions } = computeAtlasLayout(inputs);
  const seeded: SeededPositions = {};
  for (const [id, position] of positions) seeded[id] = { x: position.x, y: position.y };
  return seeded;
}

// Fold stored placement over the seed: a node with a stored position keeps it exactly (the founder's
// hand is final); everything else takes its territory-biased seed. A stored node is EXCLUDED from the seed
// simulation so it never occupies an engine slot the seeded cards must route around (no double-occupancy,
// no wasted space), and a seeded card is never placed onto a dragged card's coordinates. This is the
// single source of node positions the canvas renders.
export function foldPlacement(
  nodes: Node[],
  stored: SeededPositions,
): SeededPositions {
  const unstored = nodes.filter((node) => !(node.id in stored));
  const seed = seedCanvasPositions(unstored);
  const positions: SeededPositions = { ...seed };
  for (const [id, position] of Object.entries(stored)) {
    positions[id] = position;
  }
  return positions;
}
