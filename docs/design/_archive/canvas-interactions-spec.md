# Canvas interactions — build specs (interpretation-preview · undo/redo · dense rank-and-reveal)

**Status:** build-ready, from a grounded read-only pass (2026-07-17). Additive to `?shell=canvas`
(`VentureWorkspace` → `VentureCanvasStage`); `?shell=world`/`NowShell` default byte-unchanged. All three mount
inside the existing `{lens && scene}` block and **share one `useArchitectureMutation` + one revision stack**
(mount once at the top of the stage, thread down — else A and B spin up competing mutation clients). Each
component <300 LOC.

**Three reshaping findings:**
1. The "relationship interpreter" is genuinely to-build (client-side), but the WRITE path already exists:
   `mutateArchitecture` + a `create-connection` op whose `FirmArchitectureConnection` carries a free-string
   `label` + `assertion ∈ {tentative, founder-asserted}` (`brain/src/firm/architecture.mjs:25,210`). "Never a
   hard-coded triple" is already true at the data layer. (The brain lane is adding a pure interpreter helper.)
2. Undo/redo BACKBONE already ships: `VentureAtlas.tsx:230-235` computes inverse ops and stores them via
   `useAtlasRevisionReceipt.keep(receipt, {operations: inverse})`, with an Undo toast (`:310`). SPEC B is
   port-to-canvas + turn the single slot into a stack, not invent.
3. `node.hidden` is used nowhere; `atlasDensity.ts` is a content-TIER (editorial/standard/detailed), not a
   visibility ranker. SPEC C's ranker is to-build; the signals it needs exist (`betBand.ts:7-13`,
   `deriveEpistemicState`, `semanticBand.ts`).

## SPEC A — Interpretation-preview (dwell-gated chip, Exp Law 7)

Drag is owned by `useCanvasPlacement` (`VentureCanvasStage.tsx:114-123`); `onNodeDragStop` → `VentureCanvasFlow`.
**No drop-onto-target detection exists today — a drop is pure reposition, always** (the Law-6 guarantee: the
visual move commits to the node array before any interpretation is asked).

- `useDropTarget.ts` (~90): read live drag from the flow store; center-overlap of the dragged node's reserved
  box (`canvasReservedWidth/Height`, `canvasSeedLayout.ts:99,106`) vs others; 200ms dwell; emit
  `{sourceId,targetId,armed}`. **Unarmed release emits nothing → existing reposition runs untouched.**
- `interpretRelationship.ts` (~110, pure): ranked open-string kinds from (a) the venture's EXISTING connection
  labels for similar type-pairs (`projection.connections`), (b) a territory-aware default vocabulary; degrade
  to the founder's literal label if nothing ranks (composer literal-fallback doctrine). Never a fixed triple.
- `InterpretationChip.tsx` (~140): floats at drop midpoint (ViewportPortal, same as `TerritoryLayer`):
  "Drover understands: `<sentence>` — Apply · Change relationship · Keep visual only". Apply →
  `mutation.apply([{op:"create-connection", connection:{id,fromRef,toRef,label,assertion:"founder-asserted"}}])`
  + push inverse `remove-connection` to the SPEC-B stack. Keep-visual-only → write nothing (that IS the
  unsupported epistemic state — no drawn line, hollow slots, `EpistemicEdge.tsx:91`); re-drag re-opens.
  Change-relationship → cycle `interpretRelationship` output in place.
- Mount as a sibling of `<GeneratedAnswer>` inside `VentureCanvasStage` (~line 240), inside `ReactFlowProvider`.
- **Risks:** node must never move/revert (assert node.position after keep-visual-only == drop position);
  `create-connection` CAS is independent of the placement 409 buffer — keep sequential (place first).

## SPEC B — Undo/redo + revision receipts (port + stack)

Backbone template: `VentureAtlas.tsx:230-235` (inverse ops + `revisionReceipt.keep`) + the Undo toast (`:310`);
`useAtlasRevisionReceipt.ts` persists one receipt to sessionStorage, 30-min TTL. Missing on the canvas:
multi-level stack; placement/rename/soft-delete/promote don't emit inverse-carrying receipts; the shell mounts
none of it.

- Undoable: placement (inverse = prior positions map), rename/edit/connect/soft-delete+restore/promote (all
  `mutateArchitecture` ops with computable inverses: create↔remove-connection, update↔update with prior,
  remove↔create-element). NOT undoable: a world-boundary act (anything a `effect-executor` ran — a release/
  authorized deploy). **The stack hard-stops at the first `worldBoundary:true` receipt — the single most
  important correctness gate; test it.**
- `useCanvasRevisionStack.ts` (~140): generalize the single receipt to bounded undo+redo arrays; entries
  `{forward, inverse, reason, revision, kind, worldBoundary}`; sessionStorage persist.
- `RevisionReceipts.tsx` (~120): the visible receipt rail, reusing `atlas-revision-receipt` CSS/motion; names
  the changed object in founder words; Undo/Redo; a world-boundary entry renders WITHOUT Undo. `⌘Z`/`⌘⇧Z`
  guarded by the existing input/textarea skip.
- `placementInverse.ts` (~40): snapshot `lens.placement.positions` before a drop; undo-of-placement rides the
  same conflict-safe `putPlacement` path (poll-safe).
- **Risks:** CAS drift — undo applies inverse against a possibly-moved revision; `mutation.apply` re-reads via
  `adoptRevision`; on 409 surface "changed since — can't undo cleanly", never force-apply. A compound action
  (SPEC A writes connection + left a placement) is ONE stack entry undone in reverse order.

## SPEC C — Dense-map rank-and-reveal (Exp Law 4, the ~100-node wall)

At STRUCTURE (`band==="structure"`, zoom ≤ 0.78): rank nodes, keep high-rank surfaced, set `node.hidden=true`
on the long tail, render one **cluster glyph** per collapsed group with a count. Reveal on band-step-up or
pan/zoom near the cluster. **Nothing is removed from the array** — `AtlasOutline` reads the full `decorated`
array (`VentureCanvasStage.tsx:262`), so every object stays reachable at every altitude (test this directly).

- `rankAtlasNodes.ts` (~120, pure): surface at-wall (`betBand.ts:8`), contested (`deriveEpistemicState`),
  recently-changed (`bet.events`), AND any node with a stored founder placement (founder intent = surfaced,
  Law 6). At-wall/contested surface one band early.
- `clusterCollapse.ts` (~90, pure): group the tail by territory into ≤N glyphs; assign `hidden:true` +
  `clusterId`; invariant `surfaced ∪ clustered === allNodes`. Feed cluster glyphs into `foldPlacement` as
  pinned obstacles (`canvasSeedLayout.ts:141`) so surfaced nodes route around them.
- `ClusterGlyph.tsx` (~80): new NODE_TYPE, "34 more directions", territory-tinted, greyscale-safe; click/approach expands.
- Guard to `band==="structure" && !lensActive && !answerOpen` (flags at `VentureCanvasStage.tsx:103,202`) so
  the lens/generated-answer always reorganize the FULL scene. Keep `atlasDensity` content-tier separate (don't blend).
- **Risks:** hidden nodes MUST stay in the array feeding `AtlasOutline` (Law 4 non-negotiable); reveal can't
  reflow (seed reserves largest footprint) but a cluster glyph is a new box → feed as obstacle; a
  founder-placed tail node is never collapsed.
