# 06 — Ordered left-to-right layout

Status: BUILT & browser-verified (2026-07-03). Owner: canvas. Supersedes the d3-force physics scatter in `ui/src/lib/objectGraphLayout.ts`. `npm test` green (1091 pass / 0 fail).

## Why

The physics scatter read as "scrambled" — nodes float with no legible order, so the causal argument (the whole point of the graph) is unreadable. Founder call: **ordered, left-to-right flow.** The fix is not a bigger physics tuning pass — it is to stop simulating and let the graph's own causality set the columns.

## Reconciling with doctrine §3 ("loose, not laned")

Doctrine §3 says arrangement is a well-kept desk, not a spreadsheet — no swimlane headers, no lane borders, no hard columns. Left-to-right dagre honors this: it ranks nodes by **causal depth from the edges**, not by painting domain lanes. The result reads as a flow because the edges flow, without any lane chrome. It is explicitly *not* the top-down stage×layer grid (that swimlane shape was offered and rejected). And free-drag + reorganize keeps it loose and playable. The founder's live "left-to-right" call and the doctrine's "loose not laned" agree here.

## The model — four moves, most already in the box

1. **Arrange on load.** When the graph arrives, dagre lays it out left-to-right, once. Clean from birth — this kills "scrambled."
2. **Drag freely.** Any card dragged is pinned exactly where dropped (`placed`), and that position persists to the per-project layout sidecar (the positions endpoint that already exists but the UI never called). Reload keeps your placement.
3. **Reorganize on a button.** One action clears manual placements and re-runs dagre — the "snap back to order." Persists the fresh layout.
4. **One feedback line for loops.** GTM loops (results updating belief). Any edge that points backward in the flow — its target sits left of or level with its source — renders as a dashed, muted, curved return stroke instead of a forward edge. The `updates` edge type (learning→belief) is always feedback. Everything else flows forward.

## Data-model facts the layout consumes (from the backend map)

- **Domain lifecycle order** (left→right ranking hint): `external, market, product, strategy, audience, assets, runs, pipeline, customer, measurement, learning` (`OBJECT_NODE_DOMAINS`). Dagre's edge-derived ranks usually match this; domain order is only a tiebreaker, never a hard lane.
- **Edges are a closed union of 12.** Forward-walk set: `leads_to, targets, uses, produced`. The feedback/loop type: `updates`. The graph can legitimately contain cycles (9 of 12 types are not acyclic-enforced), so the layout must tolerate back-edges — dagre breaks cycles internally for ranking; we detect them by geometry (target.x ≤ source.x) for rendering.
- **Highlighted path** is the top-scored route with ≥2 nodes (array, can be empty/single). No longer force-pinned as a spine — dagre's ordering already makes it read as a left-to-right run; the path just lights (thick + glow), it doesn't drive layout.
- **Positions** persist via `POST /api/projects/:id/object-graph/positions` and read back as `view.positions` on `GET .../object-graph`. Keyed by node id. Projection state, never in the object-graph store, never knowledge.
- **Card box for dagre:** 214 × 120 (real card 214 × 112; +8 vertical for the weakest-pill overlay that hangs below).

## What changes (scoped)

- `ui/src/lib/objectGraphLayout.ts` — rewrite internals to dagre `rankdir: "LR"`. Same signature `layoutObjectGraph(nodes, edges, pathNodeIds, placed) → PositionMap`. `placed` overrides dagre per node (drag wins). Drop d3-force.
- `ui/src/api.ts` — add `saveObjectGraphPositions(projectId, positions)` POST wrapper.
- `ui/src/components/ObjectGraphCanvas.tsx` — seed `placed` from `view.positions` on load; debounced save on `onNodeDragStop`; add a **Reorganize** button to the path-header actions that clears `placed` + re-runs + persists; in `layoutEdges`, flag back-edges (geometry or `type==='updates'`) with a `feedback` class.
- `ui/src/styles/object-graph.css` — add `.object-edge.feedback` (dashed, muted, curved).

## Out of scope (do not build now — less is more)

No layout mode-picker (one direction only). No stage/hierarchy alternate layouts. No pin-lock UI beyond drag-persists. No cycle-detection engine — geometry is enough. Add a second arrange direction only if the single one proves insufficient in use.

## Done when

Graph arrives ordered left-to-right with no lane chrome; drag persists across reload; Reorganize snaps back to order and persists; the learning/`updates` loop draws as a distinct return stroke; reveal, LOD/coin, gate bloom, and the lit-path highlight all still work; `npm test` green; browser-verified.
