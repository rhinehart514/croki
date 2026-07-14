# F6 — The lens

**Goal:** the canvas renders crew, bets, the wall, and the market's returns over the firm store.
Placement memory only. Divergence below the fold; pull, not push.

## Context (scout receipts — survival map, verified against current source)

**Survives unchanged:**
- Crew identity: `ui/src/components/crew/CrewFace.tsx` + `CrewAvatar.tsx` +
  `ui/src/lib/agentPersona.ts` — deterministic face keyed only on `agentRef`; DESIGN.md names
  CrewFace as the only teammate portrait door. Feed it crew refs; touch nothing.
- ReactFlow substrate: `ui/src/lib/canvasPerformance.ts`, and in `GraphCanvas.tsx` the pure
  viewport machinery (`NodeFocuser` 2615-2672, `Refitter`, `ViewportRestorer`, `MeasureGuard`,
  `CanvasVisibilityGuard`, `useCanvasFrame`) — extract these into the new lens component.
- `ui/src/lib/canvasNativeActions.ts` and `canvasRegionGrouping.ts` — generic `StableRef`
  anchor/region placement; swap the type vocabulary to `crew`/`bet`.
- `DESIGN.md` token doctrine (color rationed, type/spacing ramps, hairlines over stacked cards,
  no ambient motion) governs everything new.

**Survives with small changes:**
- `ui/src/components/gate/GateReview.tsx` + `gateItem.ts` + `gateDelta.ts` + `GateDeltaCard.tsx` —
  already pure-props and free-form-field tolerant (tested standalone with just
  `{items, onSubmit, learned}`). Changes: `GTMItem` → a slim open `BetEffect` type (keep the
  `[key: string]: unknown` shape), trim `itemKey.ts` priority list to bet ids, rename
  `GatePromotePanel`'s channel-typed prop. This becomes the wall queue's review surface.
- `ComposerDock.tsx` message core — `speakerOf`, `segmentEvents`, `CrewBeat`, `ToolCluster`,
  `AskCard` (lines 132-338) operate on the flat `OperatorEvent {id, createdAt, type, title,
  detail?, data?}` log. Keep the reducer; re-point the event vocabulary at the F2 work-loop
  events. Kill the pipeline-shaped props (`graph`, `onReviewGate(nodeId)`,
  `onSubmitGateReview`, `onResolveProposal`, `gatePromote.channel`).
- The adaptive poll in `App.tsx:1279-1300` (400ms running / 900ms idle full-snapshot) — reuse the
  transport pattern against the new lens endpoint.

**Dies:** `wovenOverlay.ts`, `canvas/wovenNodes.tsx`, `channelLanes.ts`, `GraphCanvas.tsx`'s
node-category components + DAG layout (`buildFlowGraph`/`computeLayout`/`longestPathRank`) + its
channel-graph prop contract, `canvasSelection.ts`'s concrete union (the tagged-union pattern is
reusable), `woven-canvas.css` where it targets dead classes, and `OperatorSession`'s pipeline
fields in `ui/src/types.ts`.

## Build

1. **Backend**: `GET /api/ventures/:id/lens` → `{ crew, bets (with positions + staged + latest
   voice), wall (queue summary), placement, events cursor }` — a pure projection over the firm
   store. `PUT .../placement` persists founder placement (compareAndSet).
2. **`ui/src/components/lens/FirmLens.tsx`** — a new, small ReactFlow surface: crew faces at
   their working positions, bet cards (intent + staged count + latest voice + lineage thread to
   `forkedFrom`), one wall band (the unmistakable boundary — DESIGN.md's "founder gate as a real
   wall"), market voices drawn as calm returns to their bets. Divergence below the fold: far zoom
   shows crew + active bet clusters; near shows one bet's evidence and staged content. No lanes,
   no chips, no kind clusters.
3. **Wall surface**: the F3 queue renders through the adapted GateReview; deciding an item is the
   same bloom interaction as today.
4. **Composer**: the surviving message core streams the F2 event log; the wall queue count is the
   only push; everything else is pull.
5. Keyboard + outline access carries over for the new anchors (reuse the CanvasOutline pattern
   against crew/bets).

## Acceptance

- A fixture venture (crew of 3, seven bets with lineage, two wall items, one voice) renders,
  pans, zooms, restores placement after refresh, and virtualizes at the existing thresholds.
- Deleting the placement document loses only positions — bets, crew, decisions untouched.
- GateReview reviews a message effect and a code-diff effect from the same queue.
- No founder-facing surface shows counts/scores from the market. `npm --prefix ui run test:unit`
  green for surviving suites; dead suites deleted with their surfaces. Nothing committed.
