# Reversible operating lens — build spec (?shell=canvas)

**Status:** build-ready. From a grounded read-only design pass (2026-07-17). Authority: root `DESIGN.md`
Experience Law 5 + Product Law 8 (rule 15 "switching lenses never duplicates objects"; rule 9 "generated
layouts never overwrite founder layouts"); design in `surface-bench-map-spec.md` ("Map — the reversible
operating lens"). This is the plan for one gated UI slice, additive to `?shell=canvas`; `NowShell` default
and `?shell=world/legacy` stay byte-unchanged.

**One-line:** the lens is a pure `scene → positions` layer + a scoped FLIP that reorganizes the SAME React
Flow node array and restores from `foldPlacement`, NEVER through placement — so exploration is free because
return is a pixel-exact `duration:0` covenant.

## Ground truth (reuse verbatim)

- Mount: `FirmApp.tsx:212` → `VentureWorkspace` → `VentureCanvasStage.tsx:241` → `VentureCanvasFlow`.
- One scene: `projectAtlas(projection, lens)` → `AtlasScene {nodes, edges, related}`; node ids stable/unique
  (`atlas:intent`, `bet:<id>`, `atlas:wall`, `work:<ref>`, `outcome:<id>`, `architecture:<id>`, `crew:<ref>`,
  `theory:<id>`). The id-set IS the lens's object identity — the lens REORDERS these, never adds/removes.
- Position truth (Law 6): `foldPlacement(scene.nodes, lens.placement.positions)` (`canvasSeedLayout.ts:193`)
  folds stored founder placement > territory-biased seed. Founder positions are written ONLY via
  `useCanvasPlacement.putPlacement`. **The lens must never call `putPlacement` and never feed lens positions
  into `foldPlacement`'s stored arg.**
- Territory sidedness (built): `resolveTerritories(nodes)` + `TERRITORY_SIDE {product:-1, gtm:1}`
  (`canvasTerritory.ts:69,110`), already on `node.data.territory`. Reuse for the L/R split.
- Band: `SemanticBandProvider` provides `{band, altitude}` + an `onBand` callback; `BAND_LABEL`
  (`semanticBand.ts:74`). The canvas surface does NOT yet pass `onBand` or dock an altimeter — add both.
- Camera: this surface uses React Flow `fitView`, NOT `useAtlasCamera` (which targets `.atlas-canvas` chrome
  the world owns — do not retrofit). Capture `instance.getViewport()` for exact restore.
- Pressure/evidence signals to reuse: `decisionBandForBet` (`betBand.ts:7`) for Execute pressure;
  `deriveEpistemicState` for Understand evidence order; `atlasTrace.projectAtlasTrace` (`atlasTrace.ts:11`)
  for generated-answer scope.

## 1. lensArrangement.ts — four pure `scene → positions`

`arrangeLens(lens, nodes, { territory, projection, lensModel }) → Record<id,{x,y}>`. Returns a position for
EVERY node id (id-set identity preserved). Footprints from `canvasReservedWidth/Height` so slots never
overlap (same seam the seed uses). Deterministic column/band packers (not d3-force):

- **Understand** — market claims/audiences/evidence into reading bands ordered by evidence strength
  (`deriveEpistemicState`: measured/repo-backed top, contested/unsupported bottom); bets/work recede.
- **Design** — capabilities/offers/positioning into composition clusters, Product one side / GTM the other
  (reuse `TERRITORY_SIDE`), clustered by architecture role.
- **Execute** (marquee) — TWO pressure-ordered columns: Product-rooted (left x), GTM-rooted (right x) from
  the territory map; ONE shared vertical pressure axis (equal y = equal decision pressure, from
  `decisionBandForBet` inherited to work/outcomes via `ownerBetId`); `atlas:wall` spans the seam at the
  urgency row; intent hub pins on the seam. Sidedness AND single-pressure-ordering coexist by construction.
- **Learn** — returned outcomes chain cause→evidence along `join.basis` edges (walk `projection.joins`),
  chains as left→right rows grouped by territory root.

Invariant (unit-tested): output key-set === input node id-set, per lens.

## 2. LensControl.tsx + a 4-band altimeter

Four lens names AS WORDS (Understand/Design/Execute/Learn), active word emphasized, none = free arrangement.
Dock with an altimeter (new on this surface): pass `onBand` in `VentureCanvasStage`, render `BAND_LABEL[band]`
(Orbit/Ground/Inside/Artifacts). Active lens sets a one-word altimeter suffix ("Ground · Execute"). Keys:
`L` cycles null→understand→design→execute→learn→null; `Shift+L` reverses; `Escape` exits (call
`preventDefault` so the guarded workspace-broaden at `VentureWorkspace.tsx:145` stands down this press); skip
while typing. **Repoint the outline toggle:** drop `|| key === "l"` at `VentureCanvasStage.tsx:185` so `o` is
the outline key and `L` is unambiguously the lens. State home: a small `useOperatingLens()` hook.

## 3. useLensFlip.ts — snapshot, apply, invert-and-play; restore INSTANT

ENTER (free→lens or lens→lens): (1) snapshot every node's screen rect (`.react-flow__node[data-id]` →
`getBoundingClientRect()`) + the camera (`instance.getViewport()`; store the first free viewport as restore
target); (2) apply `arrangeLens` positions via the stage's `setNodes` — into the controlled node array ONLY,
never placement; (3) invert-and-play ~400ms (Tier-3, the one sanctioned ceiling exception) with `ATLAS_EASE`
so the founder SEES the reorganize; camera may tween to fit.

RESTORE (lens→free): **instant, `duration:0`.** Read positions from `foldPlacement(scene.nodes,
lens.placement.positions)` (the founder-position store) and `setNodes`; `setViewport(savedFreeViewport,
{duration:0})`. No tween, no persistence → pixel-exact by construction. Reduced motion: ENTER swaps to
instant-but-complete (positions set, no tween), every signal preserved.

## 4. Generated answers — same FLIP scoped by atlasTrace, three exits

A question computes scope = `projectAtlasTrace(projection, lensModel, originId)`; in-scope nodes reorganize
(evidence-strength arrangement over the trace), out-of-scope fade to 0.35. Dismiss = the same instant restore
to the exact prior frame. Three word-based exits: **save-as-live-view** (writes arrangement id + atlasTrace
scope, NEVER positions → the brain `views` substrate; reject any positions field at the route),
**capture-immutable-snapshot** (manifest: revision + arrangement + scope; rasterization deferrable),
**promote-finding** (reuse the existing InterpretationChip/promote path).

## 5. Hard risks (call out explicitly)

1. **Never write lens layout into placement (Law 6, marquee).** Lens sets positions only via `setNodes`;
   never `putPlacement`, never into `foldPlacement`'s stored arg. Enforce with a `putPlacement`-never test.
   **Subtle bug:** the poll-reconcile effect at `VentureCanvasStage.tsx:105-108` re-applies `founderPositions()`
   on every lens/scene change — while a lens is active it would snap lens nodes back to free mid-lens. **Gate
   that reconcile on "no active lens"** (or let the lens overlay win in the same effect).
2. **Keep `?shell=world`/`NowShell`/legacy untouched.** All new code under `components/canvas/`; do NOT modify
   `SemanticBandProvider`/`semanticBand.ts`/`betBand.ts`/`atlasTrace.ts`/`deriveEpistemicState.ts` beyond
   additive exports (world shares them).
3. **Escape-ladder ordering.** Lens Escape `preventDefault`s and precedes the workspace broaden — one Escape
   does one thing (lens-exit first, then next press broadens).
4. **Camera restore fidelity.** No camera history here — capture the free viewport before the first enter,
   restore `duration:0`.
5. **FLIP vs `onlyRenderVisibleElements`.** Measure only rendered nodes; virtualized nodes snap (they were
   off-screen). Fixed-footprint seed means no measurement flash.

## Component inventory (each <300 LOC)

Reuse verbatim: projectAtlas/atlasSemanticProjection/atlasTrace, resolveTerritories/TERRITORY_SIDE,
foldPlacement/useCanvasPlacement (untouched), decisionBandForBet, deriveEpistemicState, SemanticBandProvider/
BAND_LABEL (add `onBand` wiring). Build: `lensArrangement.ts` (~220), `useLensFlip.ts` (~180),
`LensControl.tsx` + 4-band altimeter (~120+60), `useOperatingLens.ts` (~60), `GeneratedAnswer.tsx` (~200),
`saveLiveView` api stub + brain route (~40, rejects positions).

## Build steps (additive, verifiable)

1. Lift the band + dock the altimeter (verify: altimeter word tracks zoom, agrees with card anatomy).
2. `lensArrangement.ts` pure + unit tests (key-set identity; Execute column/pressure on a fixture).
3. `useLensFlip` + `useOperatingLens` + `LensControl`; repoint outline `l`→`o` (verify: L cycles, Shift+L
   reverses, Escape exits; suffix appears; `putPlacement` never fires — spy).
4. Instant restore reading `foldPlacement` (verify: browser pixel assertion).
5. `GeneratedAnswer` + trace scope + three exits + `saveLiveView` seam (verify: dismiss restores exact frame;
   save-view payload carries scope, NO positions).

## Tests

Unit (`lensArrangement.test.ts`): per lens, output keys === scene node ids (no dupes/drops); Execute puts
product-rooted left, gtm-rooted right, `atlas:wall` on the seam, equal-pressure at equal y. Unit
(`useLensFlip.test.ts`): restore reads `foldPlacement`; `putPlacement` never called across enter→cycle→exit.
Contract: node count identical free vs each lens. Browser journey: open `?shell=canvas`, snapshot every node
pixel rect; for each lens press `L` (enter) then `Escape` (exit) and assert every node lands on its exact
pre-toggle pixel and the id-set is unchanged; a generated answer trigger→dismiss restores the exact frame.
