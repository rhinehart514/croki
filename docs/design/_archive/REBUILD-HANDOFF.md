# Drover rebuild — session handoff

**Status:** in progress. **Written:** 2026-07-17. **Purpose:** carry the full approved plan, completed
work, and next steps across chat sessions without loss.

This is a working handoff, not product authority. Authority is `docs/FIRM-SPEC.md`, root `DESIGN.md`, and
`docs/STATE.md`. The full approved implementation plan lives at
`~/.claude/plans/enchanted-jingling-crane.md`.

---

## 1. The approved product (the founder's Product and Experience Laws)

Drover is **the founder-controlled Product and go-to-market system**. One founder gets a venture canvas for
seeing, understanding, directly manipulating, and executing the whole system while retaining authority at
every world boundary.

Governing sentence: **The canvas holds the venture. Conversation directs and interrogates it. Claude and
Codex expand what the founder can accomplish.**

Non-negotiable laws (full text in `docs/FIRM-SPEC.md`):

1. Founder direction or a founder-invoked workflow starts **every** run. No ambient agents, automatic
   roadmaps, permanent AI staff, or perpetual firm loop.
2. Autonomy is scoped to the direction/workflow, not to an agent.
3. Authority follows consequence: sends, publish, deploy, spend, destructive/irreversible acts, and
   ambiguous canonical-truth changes stay founder-held. Only the founder ends active work.
4. One canonical open model. Product and go-to-market are permanent territories over it. Every object has
   one identity; editing anywhere updates everywhere.
5. Understand / Design / Execute / Learn are **reversible lenses**, never stages.
6. Generated structure is provisional until founder action or evidence strengthens it.
7. Facts, evidence, and interpretation stay separate.
8. Views are disposable projections; saved **live views** stay synchronized; **snapshots** are immutable.
9. Workflows are **outcome contracts** (result, constraints, artifacts, proof, checkpoints, completion),
   not default DAGs.
10. Claude/Codex are visible in provenance and run inspection, not an AI org chart.
11. Direct manipulation is reversible until the world boundary.

Anti-laws: not an autonomous company simulator, agent dashboard, task tracker with a decorative graph, CRM
pipeline, workflow-node editor, chat wrapper, taxonomy-maintenance canvas, AI org chart, disconnected
boards, fixed four-stage process, or a system that equates generation with truth.

---

## 2. Execution model (how to run this rebuild)

Dependency-ordered vertical slices. Each slice ships a founder-observable capability and passes its own
unit + integration + browser + product-law gate before the next begins. Schema changes are additive and
compatibility-read old records until migration is proven. Old shells and compatibility nouns are deleted
**only after** the unified shell proves parity.

Multi-agent workflows are used for exploration, review, and adversarial verification — **not** concurrent
editing. One integration owner (the main session) edits shared seams. Cap concurrent agents at ~8;
deduplicate findings before verifying; stop a phase when two review rounds find nothing new.

Preserve the dirty working tree. Do not reset or overwrite existing user edits. Do not commit unless asked.

---

## 3. Phase status

| Phase | Task | Status |
|---|---|---|
| 0 | Lock one authority + protect migration | **DONE, verified** |
| 1 | Canonical venture model + compatibility migration | **IN PROGRESS** (first canonical-model slice implemented and verified) |
| 2 | Unify intent, workflows, runs, live events | **PARTIAL** — ambient/heat work removed + MCP fresh-drive gap closed, verified green; intent/workflow/event unification still pending |
| 3 | Repair consequence execution | **PARTIAL** — brain-side repaired + verified (approval-before-apply, deploy fail-closed, failed-send persistence, honest grant); UI failure-surfacing + receipt terminal-conditions pending |
| 4 | Build single founder shell | pending |
| 5 | Make canvas canonical, manipulable, epistemically honest | pending |
| 6 | Product/GTM territories, operating lens, learning loop | pending |
| 7 | Delete competing surfaces | pending |
| 8 | Full release-readiness proof | pending |

Task IDs in the session tracker: #7 (done), #8 (in progress), #9–#15 (pending, dependency-chained).

---

## 4. Phase 0 — DONE (what changed)

Rewrote/reconciled to the approved laws:

- `docs/FIRM-SPEC.md` — full rewrite around the Product/Experience Laws, canonical physics, compatibility
  seams, delivery sequence, verification. Removed holding-company/permanent-staff framing, always-on loop,
  five-role closed kernel, auto-seeded crew, branch-only/no-workflow, heat dial.
- `DESIGN.md` (root) — full rewrite: one Cursor-like frame, canvas-as-venture, conversation + persistent
  branches, semantic zoom, direct manipulation, Product/GTM territories, reversible lens, views/snapshots,
  provenance grammar, signature interaction. `verified_viewports` → `target_viewports`.
- `docs/STATE.md` — restructured into: Approved direction (not proof) / Verified current behavior /
  Mechanically exercised / Known broken paths / Unproven / Legacy behavior. Records the honest baseline.
- `PRODUCT.md`, `README.md`, `docs/README.md`, `docs/VISION.md`, `docs/FEATURES-AND-VALUE.md`,
  `docs/DISTRIBUTION.md`, `RUN.md`, `ui/README.md` — reconciled as subordinate translations.
- `package.json` + `brain/package.json` descriptions updated.
- `docs/design/DESIGN.md` — marked current-code record, flagged legacy primitives, added missing-capability
  ledger.
- Superseded banners added: `drover-experience-system.md`, `drover-immersive-redesign.md`,
  `drover-immersive-architecture.md`, `ade-hybrid-routing.md`, `orbital-atlas.md`,
  `immersive-test-plan.md`. `prior-directions-inventory.md` fully rewritten.
- Public site: `site/src/app/layout.tsx`, `site/src/app/page.tsx`,
  `site/src/components/machine-canvas.tsx`, `site/src/components/site-header.tsx` — repositioned to the
  founder-controlled system, framed unbuilt capability as direction, replaced `npm start` with `npm run
  app`, labeled illustrative scenes.
- Global memory: `~/.agents/global/DESIGN-TASTE.md` — replaced stale Workyard/Orbital-Atlas Drover
  direction with a pointer to repo `FIRM-SPEC.md` / `DESIGN.md`.
- `AGENTS.md` — clarified `channel` legacy identifier vs. the ordinary GTM role.

Applied the adversarial-review corrections: domain-specific (non-ranked) authority in `docs/README.md`;
MCP fresh-drive gap disclosed in `README.md` + `STATE.md`; channel distinction; site present-tense claims
demoted to direction; historical banners made non-executable; `verified_viewports` renamed.

### Phase 0 verification (observed on the dirty tree, 2026-07-17)

- `npm test` → **638 Brain tests pass, 355 UI tests pass, lint pass, build pass**. Vendor chunk warning:
  `vendor-CGN5ilKm.js` 633.21 kB min / 195.39 kB gzip.
- `npm --prefix site run lint && npm --prefix site run build` → **pass**.
- `git diff --check` → clean.
- `npm run test:acceptance` → **FAILS at design-token parity** (before browser journeys). Debt is in
  legacy CSS: `immersive.css` (`--stage`, `--ink-4`, `--face-color`, `--crew`, infinite animation, 9–10px
  text), `now.css` (`--dur-med`, `--r-panel`), `firm-app.css` (`--firm-rail-width`, `--firm-inspector-width`,
  `--sh-rail`, 9–10px text), `venture-atlas.css` (infinite animation, 9–10px text). This is recorded as a
  red gate in `STATE.md`. It must be fixed during Phases 4–7 as those surfaces are unified/removed.

---

## 5. Phase 1 — canonical model design + implementation progress

**Core decision: do NOT create a parallel graph store.** Evolve the existing venture-scoped
`architecture/atlas.json` CAS document from schema v1 (closed five-role architecture) into schema **v2**, a
canonical open model. Architecture becomes a **compatibility projection** over the model. This preserves
venture isolation, readable JSON, atomic CAS, and automatic export/import — with no second semantic
authority.

### Implemented first vertical slice (verified 2026-07-17)

- Added pure `brain/src/firm/semantic-model.mjs` plus the thin venture-scoped
  `semantic-model-store.mjs` adapter. The atlas singleton is now the schema-v2 canonical document; no
  second collection or persistence backend was added.
- Implemented and validated all seven record families: OpenObject, Relationship, Thread, Run, View,
  WorkflowContract, and Insight. Cross-venture, unknown, and dangling references fail closed. Thread, Run,
  View, and Insight records can reference but cannot copy their conversation, bet/work, placement, or
  evidence authorities; workflow contracts cannot persist status/stage and runs cannot persist `running`.
- Reads cover absent, legacy schema-v1, and schema-v2 atlas documents. Legacy reads do not rewrite. The
  first successful semantic or architecture write lazily produces one readable v2 JSON document with no
  duplicate `current`, advancing the atlas CAS revision once.
- Architecture remains a schema-v1 compatibility projection for every existing route/caller. Founder
  mutations, proposals, decisions, revision receipts, campaign contracts, groups, evidence annotations,
  and original IDs survive the projection. Working-theory snapshots also lift into tentative open objects
  and source-bearing Insight lineages without becoming founder truth.
- Venture transfer now emits envelope v2, accepts v1 and v2, validates both atlas formats before writing,
  and round-trips all seven families. The old architecture transfer validator remains for legacy files.
- Added focused proof for readable single-file storage, two-writer CAS conflict, v1 non-mutating reads,
  lazy migration, ID/revision/proposal survival, all-family export/import, working-theory insight lineage,
  authoritative-record separation, dangling/cross-venture refs, and architecture identity compatibility.
- `npm test` is green after this slice: **648 Brain tests, 355 UI tests, lint, and production build**. The
  existing vendor chunk warning remains unchanged. `git diff --check` is clean.

### Second Phase 1 slice — domain hardening + Thread/Run correction (verified 2026-07-17)

- **Reference resolution fails closed.** `repository:` citations resolve only when structurally valid — a
  repository-relative path, an ordered `#L<from>-L<to>` range, and a source digest — via the new pure
  `brain/src/firm/repository-ref.mjs`. A bare `repository:` prefix no longer resolves in the semantic-model
  store resolver (`semantic-model-store.mjs`) or in venture transfer (both the v2-atlas and the v1
  evidence-annotation paths in `venture-transfer.mjs`).
- **Thread/Run schema corrected to the operating physics.** A Run now requires `threadRef`; accepts
  `betRefs: []` (betless), many bets (multi-bet), and `parentRunRef` (nested); keeps single `betRef` only as
  a legacy seam; and validation rejects persisted running state and any copied bet/event/work/decision/
  outcome. A Thread gained optional `parentThreadRef`/`originMessageRef` and self-parent rejection. See the
  corrected loops in `semantic-model.mjs` (`requireRef`/`optionalRef`/`requireEach` helpers).
- **Pure constructors + atlas CAS adapter.** `brain/src/firm/thread.mjs` and `run.mjs` are pure (no
  persistence/UI/infra imports): `createThread`/`createRootThread`/`withThreadMessage`,
  `createRun`/`completeRun`, and a deterministic `ROOT_THREAD_ID`. `semantic-model-store.mjs` adds
  `ensureRootThread` (lazy, exactly-once) and `recordRun`, both round-tripped through the atlas CAS in
  `brain/test/firm/thread-run.test.mjs`.
- **Duplicate founder direction removed.** `driveTeammate`/`driveTeammateLeased` take `recordInitiation`
  (default true, so `/drive` is unchanged); `dialogue-routes.mjs` passes `recordInitiation: false` because it
  already recorded the founder message. Proven by a new real-work-loop test in `dialogue-routes.test.mjs`.
- **No fictional founding crew for new ventures.** The product route (`lens-routes.mjs`) creates ventures
  with `seedFoundingCrew: false`; the legacy fictional roster remains an explicit opt-in seam (existing
  ventures and low-level tests still read it). `ensureInitialFirmParticipant` remains the explicit
  first-participant formation seam. Proven in `lens-routes.test.mjs`.
- **Adversarial coverage added:** repository-citation spoofs, betless/multi-bet/nested runs, run/thread
  self-parenting, run running-state and copied-record rejection, and the fail-closed missing-bet run.
- `npm test` green after this slice: **698 Brain tests, 355 UI tests, lint, production build** (vendor
  chunk warning unchanged). `npm --prefix brain test` alone: 698 pass; `git diff --check` clean.

### Next resumable seam — wire the durable Run lifecycle into live drives

This is deliberately NOT yet done: it belongs on the `work-loop.mjs` hot path (~40 tests) and must land as
its own vertical slice with its own gate, because a run-recording error must never break a drive.

Design to implement:

1. In `driveTeammateLeased`, after input/configuration/runtime validation but **before**
   `selection.adapter.drive(ctx)` (around `work-loop.mjs:424`): `ensureRootThread(ventureId)`, then
   `recordRun` with `betRefs = betId ? ['bet:'+betId] : []` (betless when no bet), the run id derived from
   `activeDrive.id`, `originMessageRef` from the initiating founder/agent message when the caller supplies
   it, and `parentRunRef` when a nested coordination drive occurs.
2. After terminal completion (near the `return` at `work-loop.mjs:510`): complete the run (add durable
   `decisionRefs`/`outcomeRefs` from the wall/outcome diffs already computed as `beforeWallItems`/`afterBets`)
   and persist an immutable `WorkflowExecutionReceipt`/`WorkflowOutcome`. Interrupted/cancelled trails render
   as historical-unknown, never as failed/done.
3. **Fail-safe:** wrap all run recording in try/catch that degrades honestly (like `runFirstRun` in
   `lens-routes.mjs`) so the drive still returns. Never let a semantic-model validation error abort a drive.
4. Thread the initiating founder-message id from BOTH callers (`dialogue-routes.dispatchNewDirection` already
   has `founderMessage.id`; `work-routes.mjs` records its own founder message id) into `driveTeammate` so the
   Run's `originMessageRef` is exact rather than guessed. Do NOT backfill legacy drives — legacy runs stay
   historical-unknown.
5. Add a work-loop slice test suite: betless drive → betless run; bet drive → single-bet run; coordination
   nested drive → child run with `parentRunRef`; interrupted drive → run with no running state and no false
   completion; concurrent drives do not collide on run id or atlas CAS.

Still pending in Phase 1 beyond that seam: ViewSpec/SourceFrame vs. mutable ViewPresentation separation and
the return-cursor/atlas-camera migration into the presentation layer (`view-semantics.mjs` value object
exists; the UI-side migration does not); the remaining architecture-caller adversarial transfer cases; and
the complete Phase 1 exit gate (mechanical suite + browser journey + acceptance diagnosis). EvidenceRef,
InsightInterpretation, WorkflowOutcome, and WorkflowExecutionReceipt value objects are implemented and
tested; wiring the latter two into the Run lifecycle is part of the seam above.

### Which records stay authoritative (do not duplicate)

- `manifest` — identity/repository.
- `crew`/souls — people/memory.
- `bets` (`bet.mjs`) — effort, lineage, durable work checkpoint, events, staged artifacts, receipts.
- `decisions` (`wall.mjs`) — founder/outward acts.
- `outcomes` (`market.mjs`) — market returns, attribution, join evidence.
- `conversation` (`conversation.mjs`) — actual message text/speaker/timestamps/runtime.
- `productChanges` — review history. `configuration`/`grants`/`settings` — operating policy.
- `placement` (`lens.mjs`, `placement/canvas.json`) — coordinates only, own CAS revision.
- `active-drives.mjs` — volatile process-local presence (never persisted as `running`).
- **Canonical model** — semantic meaning and organization ONLY; holds refs, never copies.

### v2 CanonicalModelDocument (stored at `architecture/atlas` singleton)

Fields: `schemaVersion:2, ventureId, revision, objects[], relationships[], threads[], runs[], views[],
workflowContracts[], insights[], updatedAt, updatedBy`. Outer atlas doc `revision` is the CAS token,
advances exactly once per semantic mutation.

Record families (all reference-based, same-venture fail-closed):

- **OpenObject**: `id, type (open string), name, statement, properties (open JSON), authorityRef?,
  assertion? (tentative|founder-asserted), provenance, timestamps`. Architecture roles become `type`/facets
  in `properties.architecture`; `architecture:<id>` keeps resolving.
- **Relationship**: `id, fromRef, toRef, label, type (open), properties, assertion, sourceRefs, timestamps`.
  Endpoints resolve to same-venture records. Cannot claim execution/outcome/run state.
- **Thread**: `id, name, messageRefs (conversation:<id>), subjectRefs, participantRefs, properties`. Never
  copies message body.
- **Run**: `id, betRef, eventRefs, workRefs, decisionRefs, outcomeRefs, workflowContractRef, modelRevision,
  properties, createdAt, completedAt`. Semantic join, never persists `running`. Legacy drives readable via
  derived projection.
- **View**: `id, name, kind (open), rootRefs, filter/query, relationshipRefs, placementRef, properties`.
  Coordinates stay in placement. Legacy architecture groups → views. Deleting a view deletes nothing else.
- **WorkflowContract**: `id, name, subjectRefs, entryConditions, expectedTransitions, gateRefs,
  measurement, sourceRefs, properties`. Declarative/open; never persists status/stage.
  `projectBetWorkflow()` still derives actual stages. Legacy campaign fields migrate into one contract.
- **Insight**: `id, statement, subjectRefs, stance/type (open), assertion, sourceRefs, supersedes, status,
  proposedBy/appliedBy, timestamps`. Non-founder assertions are tentative + source-bearing. Architecture
  evidence annotations → insights; working-theory snapshots → insight lineages + tentative objects.

### Additional records (view/evidence/workflow-outcome design)

- **ViewSpec** (disposable|live|snapshot) + **SourceFrame** (snapshot pins exact record versions/digests,
  fails visibly if a ref is stale) + **ViewPresentation** (placement/camera/reviewCursor, independently
  disposable).
- **WorkflowOutcome** (`completed|paused|budget-exhausted|cancelled|failed`) — an execution contract,
  **never** a market Outcome, never enters `outcomes` collection. Normalize provider strings at one adapter
  boundary. **WorkflowExecutionReceipt** — immutable durable receipt after a drive settles; no stored
  running status; interrupted trails render as unknown, not failed/done.
- **EvidenceRef** value object (`outcome|repository-citation|conversation|work|wall-item|
  architecture-revision`) — same-venture fail-closed. **InsightInterpretation** references evidence, never
  copies. **Repository EvidenceRecord** — store citation coords + digest once, load excerpt on demand
  (stops working-theory excerpt duplication); stale on digest mismatch, unresolved on transfer until rebind.

### Threads/runs migration (do NOT guess causality)

Replace UI chronology-based direction reconstruction (`ui/src/components/now/directionModel.ts`) with
durable branch/direction/attempt/run records. **Do not backfill** Thread/Run just because messages/bet
events exist — provide read projections for legacy data; persist canonical records only when a user/model
explicitly creates semantic organization. Founder messages don't record `/drive` vs `/conversation/reply`,
so text/chronology/handoff adjacency must not backfill causality. Legacy fork families prove attempt
lineage, not common direction. Legacy runs are `historical-unknown`.

### Migration mechanics

- New pure module `brain/src/firm/semantic-model.mjs` plus `semantic-model-store.mjs` persistence adapter —
  normalize/validate/mutate over `venturePersistence(...).get/compareAndSet("architecture","atlas",...)`. No new persistence backend, no
  new venture collection (keep `VENTURE_COLLECTIONS` and `SINGLETON_KEYS.architecture="atlas"` unchanged so
  export/import already carry it).
- Adapter reads three cases: absent → empty v2; legacy v1 `{current,revisions,proposals}` → in-memory
  lifted v2 (reading must NOT rewrite); v2 → direct validation.
- **Lazy migration**: first successful semantic/architecture mutation CAS-writes v2, preserving original
  ids, revision history, proposal decisions, working-theory supersession.
- Refactor `architecture.mjs` (`getArchitectureState`, `getArchitecture`, `validateArchitecture`,
  `applyArchitectureMutations`, `restoreArchitectureRevision`), `architecture-proposals.mjs`,
  `architecture-projection.mjs`, `architecture-context.mjs`, `architecture-campaign.mjs`,
  `architecture-system-assembly.mjs` into compatibility operations over the canonical model. Public
  signatures + architecture revision receipts stay stable so current Atlas UI (`ui/src/types.ts`,
  `atlasSemanticProjection.ts`, `AtlasProjection.ts`, `atlasTrace.ts`) keeps working via the server adapter.
- `venture-transfer.mjs`: emit transfer v2, accept v1 and v2, replace `validateTransferredArchitecture()`
  with a format-dispatch validator that validates before any destination write; keep machine-path/provider
  stripping.
- Stop auto-seeding fictional founding crew for new ventures (existing seeded participants stay readable).

### Anti-cage caution

`brain/test/firm/anti-cage.test.mjs` asserts the closed v1 architecture shape and forbids importing "Dies"
modules. The compatibility projection must preserve the public five-role shape those tests read, OR those
guards get updated deliberately as the closed roles open up. The `DIES_MODULES` list in that test comes
from `FIRM-SPEC.md`'s old "deletion ledger" — the rewritten FIRM-SPEC no longer has that section verbatim,
so **check whether that test still resolves its module list correctly** before relying on it (the current
`npm test` still passes, so it does today).

### Phase 1 files to touch

`brain/src/firm/`: `semantic-model.mjs` (new), `evidence-ref.mjs` (new), `insight-interpretation.mjs`
(new), `workflow-outcome.mjs` (new), `workflow-execution-receipt.mjs` (new), `view-semantics.mjs` (new),
`architecture.mjs`, `architecture-proposals.mjs`, `architecture-projection.mjs`, `architecture-context.mjs`,
`architecture-campaign.mjs`, `architecture-system-assembly.mjs`, `venture-store.mjs`, `venture-transfer.mjs`,
`conversation.mjs`, `bet.mjs`, `work-loop.mjs`, `work-loop-state.mjs`, `work-loop-tools.mjs`,
`work-loop-receipts.mjs`, `workflow-projection.mjs`, `active-drives.mjs`, `lens.mjs`, `market.mjs`.
`ui/src/`: `components/now/directionModel.ts`, `lib/return-cursor.ts`, `lib/return-brief.ts`,
`components/atlas/useAtlasCamera.ts`, `components/lens/lensCameraHistory.ts`, `types.ts`.

### Phase 1 tests (new/extended)

Domain unit tests for semantic-model (readable single JSON, no duplicate `current`), two-writer CAS
conflict, v1 read-compat, lazy-migration id/revision survival, all seven record families round-trip through
export/import, transfer v1+v2 with cross-venture reject, architecture compatibility projection identity,
working-theory as canonical insights, workflow contract can't store status, authority tests (thread edit
can't change conversation; run edit can't change bet; view edit can't change placement; insight edit can't
change outcome/decision), deletion/reference integrity, ViewSpec disposable/live/snapshot semantics,
WorkflowOutcome table cases, EvidenceRef resolver fail-closed cases, cursor migration. Keep all existing
readable-file/isolation/transfer/anti-cage tests green.

### Phase 1 gate (exit criteria)

Old and new venture fixtures open/export/import/reopen with no data loss; one ID resolves the same object
from canvas/conversation/workbench/decisions/evidence; deleting a view/layout loses no semantic truth;
cross-venture refs fail closed; no domain module imports UI/persistence/Electron/provider/route code.

---

## 6. Phases 2–8 — condensed spec (full detail in the plan file)

**Phase 2 — Unify intent, workflows, runs, live events.** One founder command endpoint; deterministic code
resolves explicit acts (steer/branch/stop/close/target/workflow-invoke/wall-action), model judgment only
for genuine ambiguity, interpretation returned before widening. Persist message + interpretation + branch +
autonomy envelope + participants before work starts. Reuse `focusedConversationMessages`, `enqueueSteer`,
deterministic `branchFrom`, founder-only `end`. Venture switch clears stale lens/messages/drives/selection/
drafts. Workflows as outcome contracts (not DAGs). Adaptive multi-agent composition persisted + steerable.
Expand `firm-events.mjs` kinds; adopt `useFirmEventStream` with polling fallback; one authoritative read
model. Persist run checkpoints. **Remove ambient/heat-triggered work from the default product** (heat
scheduler is in `brain/src/server.mjs:150-152` + `brain/src/firm/heat.mjs:151-189` — this is the ambient
loop the laws reject; disable unless a later explicit founder-granted authority is designed).
Gate: `intent → visible interpretation → scoped run → optional multi-agent branch → steer/stop → artifacts/
checkpoints → verification → founder close/end`, surviving restart; no agent starts work without founder
direction/workflow. **Fix the MCP fresh-drive gap** (`work-routes.mjs` allows agent-stamped `/drive` with
no founder lineage; `mcp-tools.mjs` `drive_teammate` "starts fresh").

**Phase 3 — Repair consequence authority + effects.** Keep Electron HMAC authority, presence, MCP refusal,
isolation, module-private wall release. One typed consequence adapter for conversation/canvas/workbench/wall
(exact effect, destination, artifact/diff, evidence, reversibility, required action). Repair product-change
release so review approval (`approveWallProductChange`) precedes apply (Now currently calls only
`decideWallItem('release')` — broken). Add a real deploy executor behind the second authorization OR remove
deploy from actionable UI (currently dead: `effect-executors.mjs` has no deploy branch). Persist
message/send failure + retry state (currently drops the error). Redesign standing grants so they never say
"Sending" without executing and never mint release capability. Add spend + destructive consequence classes.
Separate runtime-completion / workflow-completion / founder-end / external-execution / returned-evidence in
receipts. Electron per-boot secure discovery for its dynamic Brain port so MCP can attach (currently
`brain/src/mcp.mjs` hardcodes `localhost:4317`, Electron uses random port). Gate: full security matrix.

**Phase 4 — Single founder shell.** One feature-local `ui/src/components/workspace/` root:
`VentureWorkspace.tsx` (composition), `WorkspaceIndex.tsx`, `ConversationPane.tsx`, `UnifiedComposer.tsx`,
`VentureCanvas.tsx`, `ContextWorkbench.tsx`, `FounderGate.tsx`, plus `useWorkspaceSelection.ts`,
`useVentureModel.ts`, `useVentureEvents.ts`, and a command palette / unified search. Reuse: `ConversationFeed`
+ `focusedConversationMessages`; merge `GoalComposer` (scope/runtime/multi-agent/ended-work guards) +
`NowComposer` (calm entry, voice, receipts); NowRail search/attention; `AtlasProjection` + `atlasLayoutEngine`
+ camera + outline + trace; Workbench Result/Exact-Change/Compare; productChangeWall helper; wall. Keep
components <300 LOC. **Delete `NowShell`, `ImmersiveShell`, legacy triptych only after parity.** Gate:
`FirmApp` mounts one shell, no `?shell=world`/`?shell=legacy`; one selection + data model; venture switch
can't show/submit stale data; every shell-unique capability present or intentionally removed.

**Phase 5 — Canvas canonical, manipulable, honest.** Draggable/resizable objects, placement persisted
separately from truth, generated layouts never overwrite founder placement. create/paste/draw/group/rename/
edit/soft-delete/restore/save/promote/connect; cheap reversible edits immediate; ambiguous semantic gestures
→ interpretation preview (Apply / Change relationship / Keep visual only). Undo/redo + revision receipts.
Semantic zoom with hysteresis (structure far → relationships/components → artifacts/evidence/decisions/
provenance near; never tiny text). Selection focuses + scopes + restores + keeps context; Escape restores
prior camera/scope. Immediate provisional working theory after first direction (visibly inferred, local
until promoted). Epistemic grammar (established/repo-backed/measured/inferred/contested/stale/unsupported/
historical) via text+shape+icon+position, not color alone. Conflict + missing-link projections. Note:
current `VentureAtlas` filters `fullScene` to ~14 archetypes (`canvasArchetypeScene` in `ventureAtlasModel.ts`)
and hardcodes `draggable:false` — both must change. Gate: browser journeys for manipulation/undo/camera/
zoom/keyboard/reduced-motion/dense/empty/partial/error/placement-delete-regenerates.

**Phase 6 — Product/GTM territories + operating lens + learning loop.** Permanent Product/GTM territories
over the same objects (not separate stores/boards). Understand/Design/Execute/Learn as reversible lens
(restore exact camera/placement/scope/selection). Cross-boundary traceability + gap projections. Temporary
generated answers preserve prior view exactly; save as live view / immutable snapshot / promote findings;
dismissal can't mutate truth. Evidence changes object/relationship condition; interpretation stays separate.
Gate: visible causal chain `product change → GTM artifact/campaign → founder release → response/telemetry/
revenue evidence → revised object/insight → next direction`; no duplicate Product/GTM store.

**Phase 7 — Delete divergence.** Remove Now/immersive/legacy roots, duplicate composers/polling/wall caches/
selection models/shell CSS/query flags/stale tests/decorative immersive chrome/dead nav. Remove UI
dependence on compatibility nouns (keep internal seams). Supersede stale design proposals. Split
`work-loop.mjs` (currently 515 lines, over the 500 service ceiling) by responsibility. Tighten anti-cage
guards + add bundle/perf budgets. Update all docs from the verified tree. **This is where the token-parity
CSS debt gets cleaned** (immersive/now/firm-app/venture-atlas CSS). Gate: one shell, one composer, one
selection model, one event path, one wall adapter; lint + architecture checks pass without suppression.

**Phase 8 — Full release proof.** Run + repair: `npm --prefix brain test`, `npm --prefix ui run test:unit`,
`npm run lint`, `npm run build`, `npm test`, `npm run test:firm:browser`, rewritten unified-canvas browser
journeys, expanded Electron integration tests (Brain spawn, dynamic discovery, signed founder writes,
venture switch, shutdown, restart recovery), `npm run test:acceptance`. Ten end-to-end journeys (new venture
→ first direction → provisional model; select → scoped branch → multi-agent → inspect/steer/stop/compare;
product change → review → apply → deploy 2nd auth → receipt; GTM asset → send → failure/reconnect → reply
join; evidence changes a relationship → next decision; direct-manipulation ambiguous connection → apply/
change/visual-only → undo; temporary view → dismiss restores / save live / snapshot immutable; restart +
cross-machine import/rebind preserve truth; cross-venture + non-founder attacks fail closed; empty/loading/
partial/stale/offline/overflow/dense/reduced-motion/keyboard/200%-zoom usable). Human proof: drive Electron,
answer the seven return questions, fresh-context design critic + consistency audit. Update `STATE.md` from
observed proof only; separate deterministic from outside-founder/market proof.

---

## 6.5 Phase 2 slice — ambient work removed (verified 2026-07-17)

Done and verified green (full `npm test`: 705 Brain, 355 UI, lint, build):

- **Ambient heat scheduler removed at its only boot site.** `brain/src/server.mjs` no longer imports/arms
  `startHeatScheduler`; `brain/src/firm/heat.mjs` deleted the `setInterval`-over-every-venture scheduler and
  the `GTM_IDE_DISABLE_HEAT`/`GTM_IDE_HEAT_TICK_MS` switches. No code path re-enables an ambient loop. The
  founder dial, spend rail, spend ledger, and a founder-invokable `runHeatTick` survive (nothing calls the
  tick on a timer).
- **MCP fresh-drive gap closed.** `brain/src/firm/work-routes.mjs` refuses (403) an agent-stamped `POST
  /drive` with no `betId` and no `branchFrom`; agents may resume/branch existing founder-authored work, only
  the founder starts fresh. `mcp-tools.mjs drive_teammate` forwards `branchFrom` and requires bet-or-branch.
- Coverage converted not deleted: `heat.test.mjs` proves the loop is gone; new `agent-drive-initiation.test.mjs`
  proves the four-way invariant.
- **Caveat (follow-up):** `runHeatTick` was the only recurring caller of the reply poller (`pollReplies`), so
  reply capture now has no production home until a founder-invoked path calls it. Give it an explicit
  founder-invoked home.

Still pending in Phase 2 (the broader "unify intent/workflows/runs/live-events"): one founder command
endpoint with visible interpretation before widening; durable run checkpoints; outcome-contract workflows;
persisted adaptive multi-agent composition; expand `firm-events.mjs` + adopt `useFirmEventStream` with polling
fallback; venture-switch clears stale lens/messages/drives/selection/drafts before writes.

## 6.6 Phases 3–8 — adversarial review map (from workflow wf_7aa956b9-7c7, 2026-07-17)

A multi-agent workflow produced per-phase implementation plans, each stress-tested by an adversarial
reviewer. The reviewers' verdicts (the full step-by-step plan bodies live in the workflow transcript under
`subagents/workflows/wf_7aa956b9-7c7`; re-run to re-capture them explicitly — the pipeline propagated only
the review stage). Load-bearing findings, all verified against the live tree:

- **Phase 3 (consequence execution): not ready as written.** Real defects confirmed at exact lines:
  product-change release throws "not approved" (`revision.mjs:78-79`); no deploy branch in
  `effect-executors.mjs:83-93`; `DecisionGate.tsx:39-41` treats a non-throwing failed send as success; the
  standing-grant path posts "Sending" without executing (`work-loop-tools.mjs:366-386`). Corrections: there
  is NO reusable `connectors/execute/deploy.mjs` (hallucinated) — build the deploy executor from scratch,
  returning `{ok:false}` with no provider; spend and destroy need their OWN founder-visible verbs (FIRM-SPEC
  exact-verb law), not a generic "release"; all `wall.mjs` edits (slices touching wall + receipt) must
  serialize through the one integration owner, never parallel; MCP discovery must make Electron and MCP share
  `GTM_IDE_HOME` explicitly (Electron never spawns MCP).
- **Phase 4 (single shell): ready with corrections — and it surfaced a LIVE defect.** `ui/src/FirmApp.tsx`
  mounts `<NowShell venture={venture} />` with **no `key={venture.id}`**, so on venture switch selection,
  composer draft (`NowComposer.tsx:61`), and wall queue persist and a submit can fire against the NEW venture
  with the OLD venture's draft — a real venture-isolation/founder-authority defect in today's default shell.
  Smallest correct fix: `key={venture.id}` on the workspace root. Plan test-count facts were stale (24 `it`
  blocks in FirmApp.test.tsx, 17 legacy) — re-count when rewriting.
- **Phase 5 (canvas): needs revision; hard-blocked on Phase 4.** placement store/CAS/route/client and the
  `draggable:false` hardcodes are real; do not start before the unified shell exists.
- **Phase 6 (territories/lens/learning): ship the brain slice, defer the UI half.** Territory is a
  `properties` facet (not a 6th role); traceability/conditions are pure derivations over the canonical model
  — implementable brain-side now. Steps that touch the shell belong to Phase 4/5.
- **Phase 7 (delete divergence): DO NOT implement the deletes.** Correctly blocked — `ui/src/components/
  workspace/` does not exist yet; deleting the Now/immersive/legacy shells before parity would destroy the
  only working surface. This is also where the acceptance token-parity CSS debt gets cleaned.
- **Phase 8 (release proof): a gate, dependencies unmet.** Correct that it cannot run until 1–7 land.

## 6.7 Phase 3 slice — consequence execution repaired brain-side (verified 2026-07-17)

Workflow `wf_68856980-faf` + owner cleanup. Green: 710 Brain, 49 security-matrix, full `npm test`.

- **Product-change release ordering** (`product-change-decide.mjs`): `applyProductBetChange` throws
  `product_change_not_approved` unless the revision was separately founder-reviewed+approved
  (`reviewProductBetChange(approve)` — note: there is no `approveWallProductChange`); a failed apply restores
  the prior status instead of self-stamping `approved`.
- **Deploy executor** (`effect-executors.mjs`): built fail-closed from scratch (no `connectors/execute/
  deploy.mjs` exists) — no provider → persisted `{ok:false, executionError}`, never fake success; second
  authorization unchanged.
- **Failed-send persistence** (`wall.mjs decide()`): a failed transport is persisted on the still-queued item
  and thrown 502; a genuine success clears the failure markers (owner fix) and emits a wall event on failure
  too (owner fix).
- **Standing grant honesty** (`work-loop-tools.mjs` → new `grant-stage-outward.mjs`): the grant skips the wait
  not the release; `sent:false`; teammate copy no longer claims a send. The wall release capability stays
  minted only inside `wall.decide()`. The extraction also brought `work-loop-tools.mjs` back under the 500-LOC
  ceiling (514 → 486).
- **Open decision for Jacob:** whether a grant should ever *truly auto-send*. It cannot in-spec today (a
  background drive has no founder capability); real auto-send requires a new host-authority path — a
  deliberate design decision, not a defect to patch. Default stands: honest park.
- Deferred (see STATE.md Consequences follow-ups): UI failure-surfacing (Phase 4 shell), receipt
  terminal-condition separation, `executeProductChange` soft-failure contract, mid-apply recovery, and the
  `preAuthorizedGrantId` host-stamp hardening (Phase 7).

Net: Phases 4–8 are a strict sequential chain behind the unified shell (Phase 4). The self-contained,
owner-safe next slices are the Phase 3 brain-side consequence repairs (serialized on `wall.mjs`) and the
Phase 6 brain-side territory/traceability derivations — plus the one-line Phase 4 `key={venture.id}` defect
fix, which is worth doing immediately regardless of shell sequencing.

---

## 7. Key current-code facts (verified during this session)

- `ui/src/FirmApp.tsx:195-201` — three shells: default `NowShell`, `?shell=world` `ImmersiveShell`,
  `?shell=legacy` triptych.
- Directions are reconstructed (`ui/src/components/now/directionModel.ts:1-6,121-169`), not durable.
- Now fetches conversation but doesn't render the thread; always calls `/drive`; drops explicit
  `teammateRefs`; shows only `drives[0]` (`projectDirection.ts:89-90`).
- `useFirmConnection` (`ui/src/hooks/use-firm-connection.ts:56-74`) resets phase on venture change but does
  NOT clear old lens/messages/drives — stale-venture window.
- SSE exists (`brain/src/firm/dialogue-routes.mjs:182-209`, `ui/src/api.ts:303-335`,
  `ui/src/hooks/useFirmEventStream.ts`) but Now uses 1.2s polling only.
- Product apply broken in Now: `DecisionGate.tsx:35-41` calls only `decideWallItem('release')`; correct path
  is `ui/src/lib/productChangeWall.ts` `approveWallProductChange` (used by legacy, not Now).
- Deploy dead: `brain/src/firm/effect-executors.mjs:81-95` supports only `product-change` and `message/send`.
- Standing grants: `brain/src/firm/work-loop-tools.mjs:359-389` says "Sending" but never calls decide/executor.
- MCP fixed port `brain/src/mcp.mjs:11-29` vs Electron dynamic port `electron/main.cjs:233-240`.
- `brain/src/firm/work-loop.mjs` = 515 lines (over 500 ceiling).
- Founder authority is strong: `electron/main.cjs:127-151,205-240`, `brain/src/routes/founder-authority.mjs:83-129`,
  `brain/src/firm/wall.mjs:182-301`.

---

## 8. Commands + gates

```sh
npm run app                 # Electron desktop product (the shipped surface)
npm start                   # browser harness (read-only by default)
npm test                    # brain + ui unit + lint + build  (current: 648 brain, 355 ui, green)
npm --prefix brain test     # brain only
npm --prefix ui run test:unit
npm run test:firm:browser
npm run test:acceptance     # currently RED at token parity — see STATE.md
npm --prefix site run lint && npm --prefix site run build   # public site (green)
```

Rules: preserve the dirty tree; no commit/publish/deploy/spend without explicit approval; domain code must
not import UI/persistence/infrastructure; UI components <300 LOC, services <500 LOC.

---

## 9. How to resume in a new chat

1. Read this file, then `docs/FIRM-SPEC.md`, root `DESIGN.md`, `docs/STATE.md`, and
   `~/.claude/plans/enchanted-jingling-crane.md`.
2. Confirm Phase 0 remains reconciled and the first Phase 1 canonical-model slice is present and green.
3. Continue Phase 1 with the evidence/view/workflow value objects, then wire durable Thread/Run refs into
   conversation, bets, and work without guessing legacy causality. Keep the architecture compatibility
   projection and `npm test` green throughout.
4. Do not delete any shell, composer, or compatibility noun until its replacement proves parity.
5. Run the mechanical suite after each slice; update `STATE.md` only from observed proof.
