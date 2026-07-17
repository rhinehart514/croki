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
//   1. COLLISION-FREE BY CONSTRUCTION. Every node is sized from `canvasReservedWidth` — its archetype's
//      LARGEST band footprint (monotonic by construction), WIDENED by a per-kind CSS override wherever the
//      real rendered card is wider than its archetype family. The architecture family tops out at 320px,
//      but the product-loop card renders at 480px; the override reserves 480 so the seed separates the
//      footprint that card ACTUALLY occupies, not the 320 its archetype implied (the latent overlap the
//      old reservedFootprint-only path let through). The exact separation pass then clears the footprint
//      each card will ever grow to, so no two cards overlap at the arrival fit and a band swap never
//      reflows into a neighbour. The no-overlap test drives its box widths from this same canvasReservedWidth
//      seam, so a future mapping/CSS drift fails the test instead of silently overlapping in the DOM.
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

// Per-kind WIDTH OVERRIDE — the single correction where a real rendered card is WIDER than its mapped
// archetype's reservedFootprint. The archetype family (architecture) tops out at 320px (nodeDimensions
// TABLE, artifacts band), but the product-loop card renders at 480px (venture-atlas.css
// [data-kind="product-loop"]). Reserving only 320 for a 480 card let the seed separate boxes ~160px
// narrower than the card, so two product-loops (or a loop and its neighbour) could physically overlap at
// the arrival fit even though the field was "collision-free" against the wrong footprint. Every OTHER
// kind's real CSS width is <= its archetype footprint (bet 340<=340, motion/campaign 300<=320, system
// 224<=320, intent 280<=440, theory 230<=440, work 250<=340, outcome 300<=340, teammate/capability
// 210<=240/250, concept 190<=320), so the archetype footprint already clears them; product-loop is the
// sole exception and the only override needed. canvasWidthFor is the seam the no-overlap test drives its
// box widths from, so the test and the seed can never drift apart again.
const KIND_WIDTH_OVERRIDE: Record<string, number> = {
  "product-loop": 480,
};

function archetypeForKind(kind: string): NodeArchetype {
  return KIND_ARCHETYPE[kind] ?? "architecture";
}

// The width the seed reserves for a kind: the larger of the mapped archetype's reserved footprint and any
// per-kind CSS override. Exported so the no-overlap test measures against the SAME truth the seed uses
// (never a hand-mirror) — a mapping or CSS drift that widened a card past its footprint would then fail
// the test instead of silently overlapping in the DOM.
export function canvasReservedWidth(kind: string): number {
  const footprint = reservedFootprint(archetypeForKind(kind)).width;
  return Math.max(footprint, KIND_WIDTH_OVERRIDE[kind] ?? 0);
}

function seedInput(node: Node, side: -1 | 0 | 1, pinAsHub: boolean): LayoutInput | null {
  const visualKind = String((node.data as { kind?: unknown }).kind ?? "");
  const layoutKind = layoutKindFor(visualKind);
  if (!layoutKind) return null;
  // Only the FIRST hub-kind node (the intent hub) pins at the origin seam; any later hub-kind node — a
  // working-theory subject, which also maps to "hub" in layoutKindFor — is demoted to the architecture
  // ring so it does not stack on top of the intent hub at (0,0). This is the exact hubClaimed demotion the
  // world path runs (layoutAtlasNodes), ported here so the canvas seed and the world atlas agree.
  const isHub = layoutKind === "hub";
  const kind = isHub && !pinAsHub ? "architecture" : layoutKind;
  // Reserve the largest band footprint for this archetype so a later band swap never reflows or collides;
  // a real measured size still wins downstream for camera framing (carryMeasuredDimensions), but the seed
  // must reserve the WIDEST footprint the card can grow to (reservedFootprint), widened by any per-kind
  // CSS override (product-loop) so a card wider than its archetype family still clears its neighbours.
  const footprint = reservedFootprint(archetypeForKind(visualKind));
  const reservedWidth = canvasReservedWidth(visualKind);
  const width = typeof node.width === "number" ? node.width : reservedWidth;
  const height = typeof node.height === "number" ? node.height : footprint.height;
  // The pinned hub sits on the seam; give it no territory bias so it pins at the origin. A demoted
  // theory subject rings like architecture and takes its territory bias (theory is territory-null → 0).
  const pinned = kind === "hub";
  return { id: node.id, kind, width, height, pinned, territorySide: pinned ? 0 : side };
}

export type SeededPositions = Record<string, { x: number; y: number }>;

// Build a pinned OBSTACLE input from a stored founder placement: a fixed box at the dragged coordinates
// that the seed simulation must route around but never moves. The engine already supports pinned inputs
// (fx/fy fixed, never displaced by separateBoxes) — this feeds a dragged card in as one so a newly
// appearing seeded card is separated away from it instead of landing on top of it. Stored positions are
// TOP-LEFT (what React Flow renders); the engine works in centres, so convert.
function obstacleInput(node: Node, position: { x: number; y: number }): LayoutInput | null {
  const visualKind = String((node.data as { kind?: unknown }).kind ?? "");
  const layoutKind = layoutKindFor(visualKind);
  if (!layoutKind) return null;
  const footprint = reservedFootprint(archetypeForKind(visualKind));
  const width = typeof node.width === "number" ? node.width : canvasReservedWidth(visualKind);
  const height = typeof node.height === "number" ? node.height : footprint.height;
  // A demoted theory subject rings as architecture; a dragged obstacle keeps whatever collision kind it
  // renders as (hub obstacle would re-pin at origin, so an obstacle is never the hub — the intent hub is
  // undraggable and so never appears in the stored set).
  const kind = layoutKind === "hub" ? "architecture" : layoutKind;
  return { id: node.id, kind, width, height, pinned: true, fixedX: position.x + width / 2, fixedY: position.y + height / 2 };
}

// Compute seed positions for the given placeable nodes, biased by territory. Only the first hub-kind node
// pins at the origin seam; later hub-kind nodes (theory subjects) demote to the architecture ring so they
// never stack on the hub. Product-rooted nodes settle on their side, gtm-rooted on theirs, indeterminate
// nodes keep the engine's origin-centred placement. Any `obstacles` (stored founder placements fed as
// pinned boxes) are separated around but never moved. Territory is a simulation-time bias (see
// atlasLayoutEngine), so the exact separation pass still runs last and the result is collision-free.
export function seedCanvasPositions(nodes: Node[], obstacles: LayoutInput[] = []): SeededPositions {
  const territoryById: Map<string, Territory | null> = resolveTerritories(nodes);
  let hubClaimed = false;
  const seedInputs = nodes
    .map((node) => {
      const territory = territoryById.get(node.id) ?? null;
      const side: -1 | 0 | 1 = territory ? TERRITORY_SIDE[territory] : 0;
      const layoutKind = layoutKindFor(String((node.data as { kind?: unknown }).kind ?? ""));
      const pinAsHub = layoutKind === "hub" && !hubClaimed;
      if (pinAsHub) hubClaimed = true;
      return seedInput(node, side, pinAsHub);
    })
    .filter((input): input is LayoutInput => Boolean(input));
  if (!seedInputs.length) return {};
  const seedIds = new Set(seedInputs.map((input) => input.id));
  // Obstacles never overwrite a real seed input for the same id (a node cannot be both seeded and an
  // obstacle), and never re-pin the hub.
  const inputs = [...seedInputs, ...obstacles.filter((obstacle) => !seedIds.has(obstacle.id))];
  const { positions } = computeAtlasLayout(inputs);
  const seeded: SeededPositions = {};
  for (const input of seedInputs) {
    const position = positions.get(input.id);
    if (position) seeded[input.id] = { x: position.x, y: position.y };
  }
  return seeded;
}

// Fold stored placement over the seed: a node with a stored position keeps it exactly (the founder's hand
// is final, DESIGN.md Exp Law 6 / rule 9); everything else takes its territory-biased seed. A stored node
// is not itself re-seeded, but it IS fed into the seed simulation as a PINNED OBSTACLE at its dragged
// coordinates — so a newly appearing seeded card is separated away from every dragged card instead of
// being placed on top of one (the double-occupancy the old exclude-entirely path could not prevent). This
// is the single source of node positions the canvas renders.
export function foldPlacement(
  nodes: Node[],
  stored: SeededPositions,
): SeededPositions {
  const unstored = nodes.filter((node) => !(node.id in stored));
  const obstacles = nodes
    .filter((node) => node.id in stored)
    .map((node) => obstacleInput(node, stored[node.id]))
    .filter((input): input is LayoutInput => Boolean(input));
  const seed = seedCanvasPositions(unstored, obstacles);
  const positions: SeededPositions = { ...seed };
  for (const [id, position] of Object.entries(stored)) {
    positions[id] = position;
  }
  return positions;
}
