# Product / GTM canvas — T3 polish pass (2026-07-22)

Polish arc on the shipped Product / GTM canvas. Subtraction and honesty only; no new capability.
Grounded in a live render of the real venture (`buffalo-projects`) against a sandboxed brain copy,
not the checked-in fixture. Branch: `polish/t3-work-product-gtm`.

## Decisions

1. **Resting work pills fold instead of shingling.** `productGtmProjection.ts` de-duplicates
   `liveWork`: identical threads (same state + subject + intent) fold into one pill whose meta
   carries the derived count ("review · 6 threads"). Pinned items — running, the chapter anchor,
   the selection — always render individually and register their fold key first so duplicates fold
   into the anchor rather than hiding it. A quiet thread with no resolvable subject earns no resting
   pill. Attention-worthy work (decision / failure / review) is never dropped, only folded. Fold ids
   keep the original `liveWork` index because `automaticChapter` derives the same
   `workNodeId(item, index)` ids. Proof on real data: 7 identical debris pills → 2 honest pills.
2. **Auto-layout void and step staircase root-caused, not tuned.** `productGtmLayout.ts`:
   the detached grid now starts two columns right of the rightmost *occupied* column (the old
   `spine.length + 1` counted invisible spine entries → a dead void). `reflowExpandedNeighborhood`
   measures workflow steps at their true 230×52 box (uniform `NODE_WIDTH`=294 vs 226px steps spaced
   272px produced false collisions cascading +82px per column — the staircase). Play chains now lay flat.
3. **Drafted plays are talk-first.** Dock register derives from physics
   (`deriveWorkflowRegister`: established iff canonical AND actually run, via the movement index in
   `WorkspaceProductSurface.tsx`). While movement is unknown the safe register is drafted — a draft
   must never present as established; the reverse costs one honest extra step. Established → "Run
   again"; drafted → "Walk through this play" (Footprints icon), which opens the play-scoped
   conversation. The dock scope names the register ("Drafted play" / "Established play"); the
   no-selection fallback is "Whole venture", not "Canvas controls".
4. **Full-length play framing.** Selecting a play frames the whole step chain (`workflowNodes`, no
   `.slice(0,4)`); the length is information. Camera floor `PRODUCT_GTM_MIN_ZOOM = 0.3`
   (`productGtmViewport.ts`) replaces the ad-hoc 0.2 — below it the pill face is unreadable dust —
   and applies to ReactFlow `minZoom`, whole-venture fits, and play-focus fits alike.
5. **One camera escape.** The aside `.product-gtm-context-recenter` button is deleted; the floating
   "Return to current" pill is the only recenter control and appears in every chapter on `cameraAway`.

## Verification

- `cd ui && npx tsc -b --force` clean; `npm run build --workspace ui` clean;
  `npm --prefix ui run test:unit` 247/247.
- Live CDP captures (real venture, sandbox store copy at `/tmp/drover-canvas-store`):
  resting map shows the single fold pill and clean page names; play selection frames all 7 steps of
  "Thin Project Drop product contract" flat with the drafted-register dock button; Organize produces
  a compact grid with no void; zoomed-away view shows exactly one Return-to-current control.
  Console clean of errors.

## Notes

- No Mobbin references pulled: this was a polish pass against the T3 Code bar in
  `docs/design/experience-intent-architecture.md`, audited from the live render.
- No layer specialists invoked; all changes are geometry, projection honesty, and control subtraction.
- Deferred, not forgotten: a small dark edge-label artifact on the cross-territory spectrum edge in
  the whole-venture chapter (pre-existing, unchanged by this pass) — candidate for the next edge pass.
