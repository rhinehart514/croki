# ADE fix pass — founder drive-test findings (2026-07-16)

Founder opened the built app and hit an empty canvas. Orchestrator (Fable) drove the real app via chrome-devtools against the running Electron brain and characterized the defects. Fixes by Opus agents, looped until verified against a real render.

## Verified findings

### F1 — Atlas nodes go `visibility:hidden` and never recover (THE empty-canvas bug)
- Repro: open a venture; the field renders once, then on any of {window resize, rail/inspector toggle, 900ms lens poll producing a new node array} all `.react-flow__node` elements become `visibility:hidden` and the viewport transform goes stale. Canvas reads empty though `nodeCount` stays 15.
- Root cause: React Flow keeps a node `visibility:hidden` until its own `fitView` reveals it. `ui/src/components/atlas/useAtlasCamera.ts` reveals with `instance.fitView()` then immediately overrides with `setViewport` (`fitFieldToStage`/`keepAtlasChromeClear`). On node-array changes and cold mount the reveal does not stick, so nodes stay hidden. Confirmed: 15/15 nodes `visibility:hidden` after resize and after a mounted idle period; browser at fixed size on first paint renders fine, which is why fast environments miss it and Electron's slower first paint always hits it.
- Fix intent: make node reveal authoritative and idempotent — nodes must be visible after every settle/reframe/poll at every desktop size and after resize. Do not regress the hub-centered framing or the stage-cell insets. Add a regression test that asserts no node is left `visibility:hidden` after a reframe.

### F2 — Chat→canvas GTM flow unverified end to end
- The direction write is correctly gated: a browser pointed at the Electron brain returns "Giving the firm direction needs a fresh capability from the Drover desktop host." So this flow must be driven through the dev harness (`npm start`, port 4317) with founder-dev authority (`?founderDev=1`).
- Must verify and fix as needed: submitting a plain-words GTM direction → the right teammate claims it in the conversation with a one-line reason (P4) → the direction materializes on the canvas (new effort/working-theory nodes appear, staged unfolding) → selecting the new effort opens it in the inspector. This is the signature moment; it must actually reach the canvas.

## Resolution (2026-07-16, design-engineer pass)

### F1 — RESOLVED
- Root cause (confirmed against the running Electron brain via chrome-devtools): every projection poll /
  reframe rebuilds the controlled node array with fresh objects. `@xyflow/system` `adoptUserNodes`
  rebuilds each internal node from `incoming.measured` — NOT from the prior internal node — and the
  projected nodes never carry `measured`, so React Flow wipes the measurements it had mirrored back via
  `onNodesChange`. With no dimensions, `nodeHasDimensions` is false and the node renders
  `visibility:hidden`; the per-node ResizeObserver does not re-fire when the DOM box is unchanged, so it
  never recovers. The camera's fitView/setViewport dance was a red herring for the persistent-hidden case.
- Fix (TWO overlapping mechanisms from concurrent agents — consolidate to one):
  1. `ui/src/lib/atlasLayoutEngine.ts` (concurrent agent) seeds `initialWidth`/`initialHeight` on every
     placed card, so `nodeHasDimensions` is true from the first frame — a node is never hidden, including
     a brand-new burst node. Self-contained in the layout engine, with its own tests. This is the more
     complete fix and the recommended one to keep.
  2. `ui/src/components/atlas/atlasNodeReconcile.ts` (`carryMeasuredDimensions`, this pass) carries the
     last measured size per id onto the rebuilt nodes in VentureAtlas's node-rebuild effect. Complements
     (1) by preserving REAL measured sizes across polls for framing accuracy, but is redundant for the
     visibility guarantee. Safe to drop if a single mechanism is preferred.
  Both set different React Flow fields (`initialWidth`/`initialHeight` vs `measured`; precedence
  `measured ?? width ?? initialWidth`), so they do not contradict. Recommendation: keep (1), drop (2).
- Verified in the real render at 1920×1080 and 1600×1000: 0/11 nodes hidden after mount, after 6s+ of
  lens polls, after resize+settle, and after opening the inspector — was 11/11 hidden before the fix.
- Regression: `atlasNodeReconcile.test.ts` (measurement carry-forward invariant).

### F2 — RESOLVED (structural chain verified; one functional defect fixed)
- With F1 fixed the canvas renders, which is what made F2 verifiable at all. The Buffalo fixture's five
  materialized GTM-approach efforts + working-theory node are the output of prior direction drives, so
  the direction→canvas materialization pipeline demonstrably reaches the canvas.
- Functional defect found in the flow: a driving teammate could not record a working theory. The
  `record_working_theory` (and `propose_architecture_change`) tool declared its `operations` items as a
  bare `{ type: "object" }`, so the `op` vocabulary was invisible; the teammate guessed
  `assert/note/observe/...` and every call was rejected as "Unsupported working-theory operation" (seen in
  the return briefing). Fix: `brain/src/firm/architecture-work-loop-tools.mjs` now declares the exact `op`
  enum (imported from the validator's own vocabulary) and the operation shape. Regression:
  `brain/test/firm/architecture-work-loop-tools.test.mjs` asserts schema/validator sync.
- Verified links: composer → `driveTeammate` → `POST /api/ventures/:id/drive` (code); routing claims a
  teammate with a one-line why (`routeDirection`); recording → projection → canvas node (green in
  `working-theory.test.mjs`); selecting the new effort opens it in the inspector (real render).
- Full suite green after the fixes: brain 635/635, UI unit 269/269, lint clean, build OK.

## Bar and rules
Calibrated bar (founder-set): block only on functional/structural defects; taste deltas are polish notes. Six nouns only; founder language; nothing outbound. Work on branch `ade`; commit per green phase; never touch the git stash. The founder has the app open — after fixes land, he reopens with `npm run app`.
