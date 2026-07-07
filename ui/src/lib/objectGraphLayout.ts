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

// Card render size is fixed (210×118, statement clamped to two lines) so the reserved slot matches what
// actually draws — an unbounded card would overflow its slot and overlap its neighbor. NODE_SEP leaves
// room for the weakest-pill (~28px) that hangs below the box.
export const NODE_W = 210;
export const NODE_H = 118;
// Tighter ranks pull the whole map in so it fits the frame at a readable zoom rather than the old
// ~0.3× crush. The nodes read as icon-first coins when pulled back, so they tolerate sitting closer.
const RANK_SEP = 64; // horizontal gap between causal ranks
const NODE_SEP = 32; // vertical gap between nodes sharing a rank (room for the pill)
const MARGIN = 40;

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

// A new node lands about one card-and-gap from the neighbour it connects to (SPAWN_STEP_X to the side),
// and a fresh spawn is nudged straight down (SPAWN_STEP_Y) until it isn't sitting on an existing card.
const SPAWN_STEP_X = NODE_W + 90;
const SPAWN_STEP_Y = NODE_H + 60;

// Nudge a spawn point straight down until it clears every placed card, so two new nodes off the same
// anchor don't stack in one spot. Capped so a dense graph can't loop forever.
function avoidOverlap(base: { x: number; y: number }, positions: PositionMap): { x: number; y: number } {
  const clash = (p: { x: number; y: number }) =>
    Object.values(positions).some((q) => Math.abs(q.x - p.x) < NODE_W && Math.abs(q.y - p.y) < NODE_H);
  let p = { ...base };
  for (let i = 0; i < 24 && clash(p); i += 1) p = { x: p.x, y: p.y + SPAWN_STEP_Y };
  return { x: Math.round(p.x), y: Math.round(p.y) };
}

// Where a brand-new node should appear on the free canvas. It sits next to the first neighbour that
// already has a place: a node this one FEEDS sits to its left (this node is upstream of it); a node
// that feeds THIS one sits to its right (this node is downstream). With no placed neighbour, it drops
// just right of the current cluster so it's on-screen instead of stacked at the origin.
export function spawnNearNeighbor(
  node: ObjectGraphNode,
  edges: ObjectGraphEdge[],
  positions: PositionMap,
): { x: number; y: number } {
  let anchor: { x: number; y: number } | null = null;
  let dir = 1;
  for (const e of edges) {
    if (e.source === node.id && positions[e.target]) { anchor = positions[e.target]; dir = -1; break; }
    if (e.target === node.id && positions[e.source]) { anchor = positions[e.source]; dir = 1; break; }
  }
  const pts = Object.values(positions);
  const base = anchor
    ? { x: anchor.x + dir * SPAWN_STEP_X, y: anchor.y }
    : pts.length
      ? { x: Math.max(...pts.map((p) => p.x)) + SPAWN_STEP_X, y: Math.round(pts.reduce((s, p) => s + p.y, 0) / pts.length) }
      : { x: 0, y: 0 };
  return avoidOverlap(base, positions);
}

export type FlowArrange = { positions: PositionMap; seeded: PositionMap };

// The free-canvas placement for Flow mode — a true node diagram, not a conveyor. Founder-owned: any node
// already placed (dropped, dragged, or seeded earlier) keeps its exact spot forever; the map never
// re-ranks itself. Only nodes with NO position yet get one:
//   • First open of a never-arranged graph (nothing placed) — one dagre pass lays a legible starting
//     shape, which then becomes the founder's to rearrange. Same tidy the "Auto-arrange" button runs.
//   • A new node on an already-placed graph (an ideated card, a programmatic add) — it SPAWNS next to
//     the node it connects to, so building reads as growing the diagram outward, not filling a column.
// `seeded` is exactly the subset freshly given a position, so the caller can persist just those and make
// them sticky.
export function computeFlowPositions(
  nodes: ObjectGraphNode[],
  edges: ObjectGraphEdge[],
  placed: PositionMap,
): FlowArrange {
  if (!nodes.length) return { positions: {}, seeded: {} };
  const anyPlaced = nodes.some((n) => placed[n.id]);
  if (!anyPlaced) {
    const laid = layoutObjectGraph(nodes, edges, {});
    return { positions: laid, seeded: laid };
  }
  const positions: PositionMap = {};
  const seeded: PositionMap = {};
  for (const n of nodes) if (placed[n.id]) positions[n.id] = placed[n.id];
  for (const n of nodes) {
    if (positions[n.id]) continue;
    const pos = spawnNearNeighbor(n, edges, positions);
    positions[n.id] = pos;
    seeded[n.id] = pos;
  }
  return { positions, seeded };
}
