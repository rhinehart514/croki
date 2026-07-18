# Shell consolidation — execute-ready plan (promote canvas to default, delete legacy shells)

**Status:** execute-ready, from a grounded read-only pass (2026-07-17). This is the acceptance-collapsing
step: the two browser suites in `test:acceptance` currently mount an old default DOM that no longer matches
the shipped default — repointing them to the canvas DOM is the reconciliation that turns them green.

## Ground truth
- Default today is `NowShell` (`FirmApp.tsx:214`), NOT immersive — `firm-journey.mjs:176` /
  `immersive-shell-journey.mjs:140` still assert immersive-as-default and are already out of sync (prior debt
  this subsumes).
- Routing (`FirmApp.tsx`): `!venture`→`VenturePicker` (keep, shared); `?shell=legacy`→inline triptych
  (:217-338); `?shell=canvas`→`VentureWorkspace` (:212, promotion target); `?shell=world`→`ImmersiveShell`
  (:213); default→`NowShell` (:214).
- **Load-bearing dependency fact:** canvas transitively reuses most of `now/` (`VentureWorkspace`→
  `StageWorkspace`→`stage/*`→`now/`: DecisionGate, directionModel, projectDirection, reviewArtifact,
  WorkDetail, ApproachComparison, representations; plus NowComposer + directionModel direct; WorkspaceIndex→
  NowRail + ConversationFeed). **Only 3 `now/` files are canvas-unreachable: NowShell, NowStream, WorkbenchView.**

## 1. The swap (`FirmApp.tsx`)
Replace lines 211-215 with a single `return <VentureWorkspace key={venture.id} venture={venture}
onOpenVenture={openVenture} />;`. Remove flag fns `canvasShellRequested`/`legacyShellRequested`/
`worldShellRequested` (:44-63), the `if(!legacyShellRequested())` wrapper + triptych JSX (:217-338). Drop
now-dead imports (ImmersiveShell, NowShell, InspectorEffort, inspectorHeader/Content, TeammateRail,
FirmWorkbenchCanvas, firm-app.css, and the triptych-only hooks/state at :70-195). Keep VenturePicker,
VentureWorkspace, and verify the founder-presence heartbeat (markFounderPresent/Away, :112-123, shell-independent).

## 2. Delete (ONLY after parity proven)
- `ui/src/components/immersive/` entire tree (40+ files incl. ImmersiveShell, immersive.css, world/, descend/
  incl. **GateReading** which lives here not in now/) — nothing outside imports it (only FirmApp:21 + test).
- `now/NowShell.tsx`, `now/NowStream.tsx`(+test), `now/WorkbenchView.tsx`.
- `now/now.css` — **KEEP, DO NOT DELETE.** It styles `now-composer-*` classes NowComposer uses (22 defs, no
  `:root`); NowComposer imports no CSS itself. **Relocate its import** from deleted NowShell into
  `NowComposer.tsx` (`import "./now.css";`).
- Legacy `firm/` triptych: `TeammateRail`(+test), `FirmWorkbenchCanvas`, `InspectorEffort`,
  `inspectorContent.ts`, `styles/firm-app.css` — grep-verify only-importer at delete time.
- `test/browser/immersive-shell-journey.mjs` (not in any script, references dead code).
- **KEEP:** VenturePicker, FirmSettings, ConversationFeed, FirmFreshness, and all of canvas/ stage/ atlas/
  workspace/ lens/ review/; and now/ NowComposer, NowRail, directionModel, projectDirection, directionImpact,
  reviewArtifact, WorkDetail, ApproachComparison, representations, DecisionGate, driveReceipt, useSpeechInput.

## 3. Test reconciliation
- `FirmApp.test.tsx` — REWRITE: drop NowShell/ImmersiveShell mocks + ~14 `setShell("legacy")` triptych-DOM
  tests; repoint no-flag routing test to assert `venture-canvas-stub`; keep VenturePicker tests.
- `WorkDetail.test.tsx` — drop the `WorkbenchView` describe block, keep WorkDetail/ExactChangeBlock/ResultBody.
- `NowStream.test.tsx`, `TeammateRail.test.tsx` — DELETE.
- `AtlasMotionContract.test.ts:57` — drop the `firm-app.css` read + assertion (file deleted).
- `firm-journey.mjs` — REWRITE default block (:174-195) + delete legacy block (:204-540); repoint to
  VentureWorkspace DOM (`.venture-workspace`, `.venture-canvas-flow.atlas-canvas`, `.venture-workspace-dock`).
- `canvas-journey.mjs` — **KEEP + repoint url (:73) from `?shell=canvas` to `${drover.base}` (no flag).** This
  is the parity oracle — already asserts frame+descend+escape+composer end-to-end.
- `atlas-browser-harness.mjs:312-340` — repoint `.firm-app-canvas` → `.venture-workspace .atlas-canvas`
  (atlas element/focus assertions already match VentureCanvasStage output; only the container selector changes).

## 4. Acceptance / CSS-debt collapse
`verify:tokens` (`verify-token-parity.mjs`) scans every `.css` under `ui/src`, fails on undefined `var(--token)`,
`transition: all`, `animation … infinite`, `font-size: 9|10px`.
- `immersive.css` — infinite (189,506) + 10× 9-10px → **gone with the dir delete.**
- `firm-app.css` — 9-10px (461,466,477) → **gone with the file delete.**
- `now.css:427` — references `var(--r-panel)` which is defined NOWHERE (index.css has `--r-md:9px`, `--r-tool`,
  `--r-xl`, no `--r-panel`). now.css survives → **must FIX not delete:** change :427 to `var(--r-md)`, or add
  `--r-panel` to index.css `:root` AND mirror into `design-system/styles.css` (parity check :162-175).
- `venture-atlas.css` — infinite (398,721) + 9-10px (677,698) → **NOT removed by shell delete; residual,
  in-flight, fix independently.**

## 5. Order + risk
Irreversible: the immersive tree delete (only copy of the warm-paper world, GateReading, semantic-zoom). Prove
parity FIRST. Before deleting NowShell, confirm the one non-obvious capability — NowStream (recent-consequence
stream) + WorkbenchView (pinned identity head / working-now pulse) — is either covered by StageWorkspace's
Overview/Direction/Consequence bodies or consciously dropped.
1. Repoint `canvas-journey.mjs` url to no-flag, run `test:canvas:browser`, confirm green (parity oracle).
2. Swap the default (FirmApp.tsx only, delete nothing yet); run unit + canvas journey.
3. Fix `--r-panel`; relocate now.css import into NowComposer.
4. Delete the trees/files above.
5. Reconcile tests (§3).
6. `npm run test:acceptance` — immersive/firm-app-css failures gone; residual = venture-atlas.css + confirm
   `--r-panel` fix landed in both index.css and design-system/styles.css.
