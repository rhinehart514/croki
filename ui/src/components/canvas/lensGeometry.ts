// lensGeometry.ts — the shared packing primitives the four lens arrangements build from.
//
// Footprints come from the SAME canvasReservedWidth/Height seam the seed uses, so a packed slot reserves
// the widest anatomy a node can swap to and columns never overlap. Positions are TOP-LEFT (what React Flow
// renders). Pure: no React, no persistence, no xyflow runtime.

import type { Node } from "@xyflow/react";
import { canvasReservedWidth, canvasReservedHeight } from "./canvasSeedLayout";
import type { Territory } from "./canvasTerritory";

export type Positioned = { x: number; y: number };

// The node id → territory map the caller resolved once (resolveTerritories). bet/work/outcome inherit
// through the ownership chain there, so the arrangements never re-derive territory.
export type TerritoryMap = Map<string, Territory | null>;

// Gutters between packed slots. A slot reserves the node's own footprint; the gutter is the clear air the
// seed's separation pass would leave, so a packed column reads as a column, not a stack.
export const COL_GUTTER = 96;
export const ROW_GUTTER = 64;
export const BAND_GUTTER = 140;
// The half-width of the neutral gutter straddling the Product|GTM seam at x=0. The nearest product slot's
// RIGHT edge stops SEAM_GUTTER left of 0; the nearest gtm slot's LEFT edge starts SEAM_GUTTER right of 0.
export const SEAM_GUTTER = 120;

export function kindOf(node: Node): string {
  return String((node.data as { kind?: unknown }).kind ?? "");
}

export function footprint(node: Node): { width: number; height: number } {
  const kind = kindOf(node);
  return { width: canvasReservedWidth(kind), height: canvasReservedHeight(kind) };
}

// Stable ordering key so an arrangement is deterministic regardless of the incoming array order: sort by a
// caller-supplied rank, then by node id (a total order, no ties).
export function byRankThenId(rankOf: (node: Node) => number) {
  return (a: Node, b: Node) => rankOf(a) - rankOf(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

// Stack a set of nodes into a single vertical column with each node's own left anchored at `left`. Returns
// top-left positions; `startY` is the top of the first slot.
export function stackColumn(nodes: Node[], left: number, startY: number): Record<string, Positioned> {
  const out: Record<string, Positioned> = {};
  let y = startY;
  for (const node of nodes) {
    const { height } = footprint(node);
    out[node.id] = { x: left, y };
    y += height + ROW_GUTTER;
  }
  return out;
}
