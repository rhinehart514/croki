// objectGraphLayout.ts — the ordered left-to-right layout for the object graph.
//
// The graph's own causality sets the order: dagre ranks nodes by causal depth from the edges
// and lays them out left→right (rankdir "LR"), so the map reads as a flow because the edges
// flow — with no swimlane headers, lane borders, or hard columns (doctrine §3, "loose not laned":
// a well-kept desk, not a spreadsheet). It is deliberately NOT a stage×layer grid.
//
// Three disciplines:
//   1. Arrange on load. Dagre runs when the graph changes and hands back static positions — no
//      ongoing simulation to fight a founder drag or burn frames.
//   2. Drag wins. Any node the founder has placed (in `placed`) keeps that exact position; dagre
//      only positions the rest. A "reorganize" clears `placed` upstream to get a fresh full pass.
//   3. Tolerate loops. GTM feeds back (results update belief). Dagre breaks cycles internally for
//      ranking; back-edges are detected downstream by geometry (target.x <= source.x) and drawn
//      as return strokes, so a loop never scrambles the forward order.

import dagre from "@dagrejs/dagre";
import type { ObjectGraphEdge, ObjectGraphNode } from "@/types";

// Real card is 214×112; +8 vertical room for the weakest-pill overlay that hangs below the box.
const NODE_W = 214;
const NODE_H = 120;
const RANK_SEP = 96; // horizontal gap between causal ranks
const NODE_SEP = 38; // vertical gap between nodes sharing a rank (room for the pill)
const MARGIN = 48;

export type PositionMap = Record<string, { x: number; y: number }>;

// Compute ordered positions for the whole visible graph. `placed` holds founder-dragged positions
// (kept exactly); the lit path is not pinned — it reads as a left→right run from dagre's ordering and
// is highlighted downstream, not laid out specially.
export function layoutObjectGraph(
  nodes: ObjectGraphNode[],
  edges: ObjectGraphEdge[],
  placed: PositionMap = {},
): PositionMap {
  if (!nodes.length) return {};

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", ranksep: RANK_SEP, nodesep: NODE_SEP, marginx: MARGIN, marginy: MARGIN });
  g.setDefaultEdgeLabel(() => ({}));

  const ids = new Set(nodes.map((n) => n.id));
  for (const n of nodes) g.setNode(n.id, { width: NODE_W, height: NODE_H });

  // Feed forward edges to dagre for ranking. Self-loops are dropped; dagre breaks any remaining
  // cycles on its own (greedy feedback-arc set), so back-edges don't corrupt the ranks.
  for (const e of edges) {
    if (e.source === e.target) continue;
    if (ids.has(e.source) && ids.has(e.target)) g.setEdge(e.source, e.target);
  }

  dagre.layout(g);

  const out: PositionMap = {};
  for (const n of nodes) {
    if (placed[n.id]) {
      // Founder placement wins outright.
      out[n.id] = { x: Math.round(placed[n.id].x), y: Math.round(placed[n.id].y) };
      continue;
    }
    const d = g.node(n.id);
    // dagre gives box CENTER; React Flow wants TOP-LEFT.
    out[n.id] = d
      ? { x: Math.round(d.x - NODE_W / 2), y: Math.round(d.y - NODE_H / 2) }
      : { x: 0, y: 0 };
  }
  return out;
}
