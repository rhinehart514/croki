# Drover surface / bench / map — build spec (Phase 4–5)

**Status:** design authority for the unified canvas build. **Written:** 2026-07-17 from workflow
`wf_5d0c581c-b6c` (6 research streams + repo grounding, synthesized and adversarially critiqued; must-fixes
folded in). Subordinate to root `DESIGN.md`; surfaces conflicts rather than blending. This is the concrete
plan the Phase 4 shell and Phase 5 canvas build execute against.

## Tech decision — keep React Flow, extend

Keep `@xyflow/react` (12.11.0); do **not** migrate to tldraw. Reasons: placement-separate-from-truth is
React Flow's native controlled model and already built in-repo (`useCanvasPlacement` → `putPlacement` with
revision + 409 reload); tldraw makes shape x/y the document, so Law 6 would fight the SDK. Semantic zoom as
band-swapped HTML anatomy is trivial with custom nodes (already shipped as `useSemanticZoom`); tldraw would
force every epistemic state through a shape-prop schema. tldraw production carries a license/watermark
constraint; React Flow is MIT. The screenshot-deterministic journey suite depends on the pure projector +
seeded layout. Ruled-out trigger for revisiting: real-time multiplayer or freehand geometric annotation as
core product — neither is in the laws.

The `lens/` path (`FirmLensCanvas` + `useCanvasPlacement` + `useLensCamera`) is the substrate (it alone
carries drag persistence with conflict handling); the `atlas/` semantic assets (`projectAtlas`,
`atlasSemanticProjection`, `useAtlasCamera`, `useSemanticZoom`, `useAtlasMaterialization`, `AtlasOutline`,
`atlasTrace`, `DescendReading`) are promoted onto it.

## Surface (the canvas)

One React Flow canvas (`VentureCanvasShell`, mounted behind a `canvasShellRequested()` flag beside the
untouched `NowShell` default) rendering the single `projectAtlas` scene folded with the
`atlasSemanticProjection` depth layer — the venture's causal model itself, not a page containing a diagram.
Every surface reads this one scene; nothing re-derives it (the 2026-07-15 header-vs-canvas veto).

- **Territory is rendered geography, not a layout seed.** Two large-type region kickers ("Product" /
  "Go-to-market") pinned at each territory population's centroid-top, rendered only at the STRUCTURE band,
  recomputed from member centroids so they survive any founder dragging. Every causal edge crossing
  territories carries a greyscale-safe tick glyph at its midpoint. The seed layout biases Product-rooted
  objects to one side and GTM-rooted to the other, intent hub pinned at origin. Membership derives once from
  role/refs, never from position.
- **Founder placement overrides the seed absolutely.** Positions persist per-node via `useCanvasPlacement`
  (revision + 409 reload, already built); seeded from `computeAtlasLayout` only when no stored position
  exists. A 409 reload never discards a drag: the in-flight drag result is buffered and re-applied over the
  reloaded revision before retry.
- **Node dimensions are fixed per (archetype × band)** in one `nodeDimensions.ts` table; the seed reserves
  each node's largest band footprint, so band swaps never reflow or collide, and there is no measurement
  flash under `onlyRenderVisibleElements`.
- **Density is rank-and-reveal, never filter-off.** `canvasArchetypeScene`'s hard filter is retired;
  `work:*`, `outcome:*`, `architecture:*` stay in the controlled nodes array as `node.hidden` per band;
  `atlasDensity.ts` ranks; at-wall and contested items surface one band earlier.
- **Empty state is specified, not circular.** Before the first direction the canvas renders exactly three
  things: the intent hub alone at origin carrying the venture's name, the two territory kickers as named
  empty geography, and the composer focused with the single placeholder "Direct the venture". No lorem, no
  tutorial checklist. The first direction's materialization burst lands into already-named ground.

## Bench (the workbench) — two tiers, one content contract

Temporary-surface-over-live-canvas; the canvas never unmounts, blurs to `pointer-events:none`, or hides
behind a scrim.

- **Tier 1 — SelectionRail** answers "what is this and what does it need from me now": a right-docked rail on
  1-click selection, zero-motion rescope on every selection change. Body is structurally restricted to a
  per-archetype `ReadingSummary` slot (~80 LOC each): statement, epistemic token, decision band, single next
  consequence. It physically cannot render diffs/artifacts/telemetry/compare (those bodies are exported only
  to the Workbench), so it can never decay into a properties inspector. Canvas stays pannable behind it;
  `useAtlasCamera.focus` centers selections in the rail-adjusted viewport.
- **Tier 2 — Workbench** answers "what exactly happened and what exactly will happen": summoned by
  double-click/Enter for deep precision (exact diffs, artifacts, telemetry, compare-approaches). Shared-
  element morph (the clicked node becomes the bench, spring 340/32/0.9), then a resizable right-docked
  overlay with its own scroll; canvas behind dims to ~0.5 but stays mounted and camera-stable. Reuses the Now
  `representations.ts` registry and `WorkDetail.tsx` (exact diffs never summarized). `GateReading` renders
  the exact staged payload with words-based release/hold and two-step authorize-then-send — the founder gate
  is the only surface that earns modal elevation.
- **Dismissal is triple-redundant and lossless:** Escape, click the visible canvas, explicit Close — all
  restore the exact prior camera via camera history. Selection, conversation branch, and composer scope
  survive open/close.

## Map (the reversible operating lens)

The same one canvas under a reversible lens (DESIGN.md:172): Understand / Design / Execute / Learn is an
arrangement of the same objects, never a route, a filter that deletes objects, or a duplicate view. Four
words rendered as words, docked with the altimeter; active lens sets a one-word altimeter suffix
("Ground · Execute"); `L` cycles, `Shift+L` reverses, `Escape` exits.

- **Understand** pulls market claims/audiences/evidence/contradictions into reading bands ordered by
  evidence strength. **Design** pulls capabilities/offers/positioning into composition clusters, Product one
  side / GTM the other. **Execute** is two pressure-ordered columns (Product-rooted, GTM-rooted) sharing one
  vertical pressure axis (equal y = equal decision pressure), founder wall spanning the seam — so single
  consequence ordering and territory sidedness coexist by construction (resolves the critique's flat
  contradiction). **Learn** pulls returned outcomes/joins/changed-objects into cause→evidence chains along
  `join.basis` edges, grouped by territory root.
- Each lens is a pure function over the same scene, runs as a FLIP (~400ms) so the founder *sees* the same
  objects reorganize; **return to free arrangement restores founder positions pixel-exactly** — the lens
  layout is never written into placement (Law 6).
- Generated visual answers reuse the FLIP scoped by `atlasTrace`, dismiss instantly to the exact prior
  frame, and expose three exits: **save-as-live-view** (writes an arrangement-function id + `atlasTrace`
  scope, never node positions), **capture-immutable-snapshot** (static image + scene revision), and
  **promote-finding** (routes the claim through the normal interpretation path).

## Semantic zoom — four bands, one shared state

Four bands matching Law 4: STRUCTURE (≤0.78), RELATIONSHIPS (0.78–1.1), COMPONENTS (1.1–~1.6), ARTIFACTS
(≥~1.6). `lensScene`'s competing 0.55/1.05 mapping is deleted, not averaged.

- **Hysteresis as one shared band state:** `bandForZoom(zoom, previousBand)` is a pure step function with a
  ±0.06 dead-band living once in a `SemanticBandProvider`; node anatomies, the lens module, AND the altimeter
  all consume it (altimeter altitude word is a lookup from the band, never a second read of raw transform),
  preserving the documented "can-never-disagree" invariant. Ships before the fourth band.
- **Pixel gating as derived thresholds:** fixed (archetype × band) dimensions compile a per-archetype
  ARTIFACTS zoom threshold (width × zoom ≥ ~320 on-screen px), so a 180px work chip never shows tiny text
  while the 420px hub details early. No live measurement.
- **Settle-freeze with velocity release:** the band-driving zoom freezes while `onMove` fires and releases on
  `onMoveEnd` or when zoom velocity stays low for ~140ms — a fast wheel snaps once, a slow zoom still crosses
  bands mid-gesture.
- **Each band is a different anatomy, never a scaled card:** STRUCTURE = glyph (kicker + title + epistemic
  corner slot); RELATIONSHIPS = + statement, decision band, facepile, relationship labels, edge join-strength
  rung; COMPONENTS = + work/outcome chips, internals, group frames (at-wall/contested one band early);
  ARTIFACTS = + full provenance line, evidence basis, exact line-diff affordance, full epistemic edge
  treatment. Crossings are crisp discrete swaps (Google-Maps hard tier), at most a ~120ms opacity settle.
- Zoom never removes access (`AtlasOutline` lists every object at every altitude); continuous zoom only
  crosses bands, never opens the workbench.

## Truth grammar (epistemic states)

One pure `deriveEpistemicState(object, projection)` over fields `types.ts` already carries (`provenance.kind`,
`connection.assertion`, `join.basis`+`causal`, `evidenceAnnotations` stance+basis, `pressure.reason`,
`bounds`/`omissions`) — zero backend work. Explicit precedence, first match wins, exhaustively unit-tested
over every field value and absence:

1. **Contested** — conflicting pressure or both supports+challenges annotations.
2. **Stale** — `pressure.reason = stale-source`.
3. **Unsupported** — missing-evidence/unattributed-return, or a relationship with no basis (including every
   "Keep visual only" pair).
4. **Historical** — ended/past bounds or survives only via historical revisions.
5. **Measured** — ≥1 outcome join basis exact|contextual, or captured-join annotation (returned reality
   outranks assertion).
6. **Repository-backed** — repository-grounded provenance / repository-citation / exact join.
7. **Founder-established** — founder-authored / founder-asserted / founder-applied / founder-confirmed.
8. **Drover's read** — the default, including provenance-absent (an object nothing establishes reads as
   Drover's read, never silently as established).

One `EpistemicToken` renders every state through **four redundant non-color channels** (Law 11) — text label,
icon shape, node-shape treatment, fixed corner position — so a greyscale screenshot distinguishes all eight.
The corner slot is **reserved and rendered even when unfilled** (hollow placeholder), so absence is a visible
claim, not less clutter. Edge line treatment carries join truth (solid-double receipt / solid contextual /
person founder-applied / hairline-dashed inferred / dotted "joined not caused" / no line at all for
unsupported). Join strength is a discrete four-rung shape ladder, never a gradient. Color is rationed and
never load-bearing: amber `--gap` = founder consequence only, `--proven` green = returned reality only,
evidence never sentiment-colored.

## Motion — four-tier budget keyed to trigger frequency

- **Tier 0 instant (duration:0):** all camera reframe/focus/broaden and all Escape restores; selection rail
  rescope; obvious connection apply; band anatomy swaps.
- **Tier 1 micro (120–180ms):** hover (color/border only), focus-dim of unrelated set to 0.35, band inner
  settle, interpretation-chip fade, drop-target armed highlight (≤150ms, completes before the 200ms dwell
  arms).
- **Tier 2 event (200–280ms):** honest node enter (opacity + scale 0.96→1 + y 12→0), bench backdrop dim;
  node exit quieter/faster than enter (~150ms fade+shrink, never a fly-out).
- **Tier 3 signature (380–420ms, the one sanctioned ceiling exception):** the U/D/E/L lens FLIP and the
  generated-answer FLIP; plus the materialization burst (staggered 220ms cadence — the stagger IS the
  information) and the descend spring morph.
- **Asymmetry:** lens/answer ENTER may tween; RESTORE is always instant. **Bans:** `transition:all`, hover
  transforms, ambient drift/bounce/parallax, any looping pulse/spinner/avatar simulating work (the one honest
  working-now pulse on a genuinely active run is the only continuous motion), animated provenance, cross-faded
  band anatomies, eased zoom. **Reduced motion:** every FLIP/morph/enter swaps to instant-but-complete settled
  frames preserving every causal/provenance/status signal.

## Interaction contract

1-click selects (instant recenter into rail-adjusted viewport, trace lights connected set, unrelated fade to
0.35). Double-click/Enter descends to the Workbench (`zoomOnDoubleClick` disabled so background double-click
never zooms). Escape restores exact prior camera+positions, always instant. Typing with nothing selected
directs the venture; with a selection directs that object — the composer resolves to one interpreted action
in truthful-verb form ("Direct: refine this offer's audience"), Enter commits, Tab reveals the next two;
**when nothing clears the confidence floor the pre-selected action is the literal "Direct: (your words, as
written)"** — no apology, no did-you-mean modal (removes the AI-command-bar silhouette). Dragging changes
placement immediately and silently (pure reposition never prompts). Dropping one object onto another is
**dwell-gated** (200ms center-overlap + visible armed highlight before release; unarmed release is always
pure reposition) — obvious connections apply directly and undoable; ambiguous ones float the
`InterpretationChip` ("Drover understands: this offer is designed for this audience — Apply · Change
relationship · Keep visual only"), where "Change relationship" cycles the venture's real open-string labels,
never a hard-coded triple. "Keep visual only" IS the unsupported state (no line, hollow slots) and re-dragging
re-opens the chip, so visual-only pairs stay promotable forever. Every external act routes through words-based
`GateReading` and fails closed at the founder boundary. Founder input always wins the camera.

## Component inventory

Reuse verbatim: `projectAtlas` + `atlasSemanticProjection` (delete the 9 `draggable:false` sites),
`useAtlasMaterialization`, `AtlasOutline`, `atlasTrace`, `representations.ts` + `WorkDetail` + `DecisionGate`,
index.css tokens. Reuse + small edit: `atlasLayoutEngine` (demote to seed, add territory bias +
largest-footprint reservation), `useCanvasPlacement` (409 drag buffer, ~20 LOC), `useAtlasCamera` (bench-close
hook, input-cancels-framing, rail-adjusted focus), `useSemanticZoom` → `SemanticBandProvider` (step function +
hysteresis + velocity release). Build: `nodeDimensions.ts`, `TerritoryLayer`, per-band `ArchetypeNode`
anatomies, `EpistemicToken` + `deriveEpistemicState` + `epistemicEdge`, `InterpretationChip` + dwell arming,
`SelectionRail` + per-archetype `ReadingSummary` slots, converted `Workbench` container (delete scrim +
`[data-blurred]` pointer-events, add resize/dock), `lensArrangement` + `LensFlip` + `LensControl`,
`VentureCanvasShell` + the one-mount decommission guard. Keep every component <300 LOC.

## Build order (additive; flag-gated; each slice verifiable)

1. **Flagged shell + one scene on the placement substrate.** `VentureCanvasShell` behind
   `canvasShellRequested()` (NowShell default untouched); React Flow over the scene with the 409 drag-buffer;
   delete `draggable:false`; ship the specified empty state + `TerritoryLayer`.
2. **Shared band state first, then the fourth band.** Pure step function + ±0.06 hysteresis in
   `SemanticBandProvider`, altimeter consumes the same state, settle-freeze velocity release, delete
   0.55/1.05 cutpoints, update contract/altimeter tests — *then* add COMPONENTS/ARTIFACTS with the dimension
   table and rank-and-reveal density.
3. **Epistemic grammar from the derivation table.** `deriveEpistemicState` (8-state precedence) + exhaustive
   test; `EpistemicToken` with always-rendered reserved slot; edge treatments; contested line connects
   subject → challenging evidenceRef.
4. **Bench over live canvas with the content contract.** `ReadingSummary` slots + `SelectionRail` (Tier 1,
   summaries only); rail-adjusted centering; convert `DescendReading` to resizable docked overlay (delete
   scrim + pointer-events:none); mount `representations.ts` + `WorkDetail` + `GateReading` as bench-only.
5. **Interpretation before truth, dwell-gated.** Drop-target dwell arming; `InterpretationChip` using the real
   edge component; obvious connections apply+undo; "Change relationship" cycles ranked open-string kinds;
   composer literal fallback.
6. **Lens + generated answers.** `lensArrangement` (Execute = two pressure columns on one axis), `LensControl`
   (words with the altimeter), `LensFlip` (~400ms enter, instant restore); generated-answer exits
   (save-as-live-view stores no positions / snapshot / promote).
7. **Motion + reduced-motion + a11y closure.** Encode the four tiers as tokens; node exit/collapse; extend
   reduced-motion block; `nodesFocusable/edgesFocusable`; dock `AtlasOutline`; gesture-frequency logging.
8. **Decommission the parallel scenes, then decide the flag.** Reduce `VentureAtlas`/`VentureWorld`/
   `FirmLensCanvas` to re-exports of `VentureCanvasShell`; add the guard test asserting `projectAtlas` has
   exactly one mounting importer. Only then evaluate promoting `canvasShellRequested()` to default.

## Feel — the non-negotiables

The canvas is the venture and the founder's hand is final (a dragged node never snaps back — not on the poll,
not under a lens, not from a generated answer, not even losing a 409 race). Geography is rendered, not hoped
for. Navigation is instant; only meaning moves (the whole motion budget is spent on two moments — a direction
materializing branch-by-branch into named ground, and the field FLIPping into a lens). Altitude answers a
different question or it doesn't exist, and the altimeter always agrees with the cards. Escape is a covenant:
one Escape restores the exact prior frame, pixel-for-pixel — exploration is free because return is guaranteed.
Truth wears its uncertainty on its body and absence is a claim. Interpretation before truth, never a form and
never a nag. Nothing simulates work and nothing is ever lost.

## Slice 1 — build record (2026-07-17)

Shipped: `VentureCanvasShell` behind `canvasShellRequested()` (`?shell=canvas`), additive, NowShell
default byte-unchanged. React Flow over the single `projectAtlas` scene (folds `atlasSemanticProjection`
verbatim; never re-derived), on the `lens/` placement substrate. Founder-final drag placement through
`useCanvasPlacement.putPlacement` with the new 409 drag-buffer (re-reads the authoritative revision and
re-applies the just-dropped positions before losing the race). Seed from `computeAtlasLayout` with a
horizontal territory bias, folded so a stored placement overrides absolutely (Law 6). `TerritoryLayer`:
two large-type region kickers recomputed from member centroid-tops (survive dragging; empty territories
still named), greyscale-safe rotated-square tick at each seam-crossing edge midpoint. Empty state:
intent hub carrying the venture name at origin + both named territories + composer with the literal
"Direct the venture". Membership derives from the brain `objectTerritory` facet mirror (`canvasTerritory.ts`),
never position. `zoomOnDoubleClick=false`, `nodesFocusable/edgesFocusable=true`.

Deferred to Slice 8 (not this slice): deleting the 9 shared `draggable:false` sites — overridden at the
canvas mount instead so the Now/world atlas mounts stay engine-owned. Files: `ui/src/components/canvas/*`,
`ui/src/components/lens/useCanvasPlacement.ts`, `ui/src/FirmApp.tsx`, `ui/src/components/now/NowComposer.tsx`
(additive optional `placeholder` prop). Tokens consumed from `index.css` (warm-stone / ember / rationed
amber `--gap` / proven green) + atlas node anatomies reused verbatim so cards read as the cartographic
instrument. Gates: `npm --prefix ui run test:unit` 365 pass, `npm --prefix ui run build` green, lint green.
