# STATE — Drover

**Stage:** alpha. **Updated:** 2026-07-18.
**Authority:** [`FIRM-SPEC.md`](FIRM-SPEC.md) defines durable product/build physics. Root
[`DESIGN.md`](../DESIGN.md) defines the intended desktop experience.

This file reports current proof. Approved direction describes what Drover must become; it is not evidence
that the current tree does it.

## Approved direction — normative, not proof

Drover is the founder-controlled Product and go-to-market system.

The approved product has:

- one canonical open venture model with permanent Product and go-to-market territories;
- one continuous venture conversation plus persistent scoped branches;
- selection-scoped direction and direct manipulation;
- Understand / Design / Execute / Learn as reversible lenses, never stages;
- provisional generated structure;
- facts, evidence, and interpretation kept separate;
- disposable projections, synchronized saved live views, and immutable snapshots;
- work started only by explicit founder direction or founder-invoked workflow;
- direction-scoped autonomy and outcome-contract workflows;
- visible Claude/Codex provenance and steerable multi-agent work without an AI org chart;
- exact founder authority over sends, publish, deploy, spend, destructive/irreversible acts, work ending,
  and ambiguous canonical truth.

### Ratified direction change — the canvas is a summoned projection, not the primary surface

A newer approved direction **revises the prior "venture canvas as the main founder surface" line**: the
graph is now a **summoned intelligence projection**, not the founder's primary operating surface. The
founder operates through directions, artifacts, work, evidence, and exact consequences; the spatial graph
is summoned when spatial or causal understanding adds value, not held open as the default workspace.

**This direction is approved but its ratification into the authority files is pending — `FIRM-SPEC.md`
and root `DESIGN.md` still describe the canvas as the main founder surface.** Per the repository rule, the
conflict is surfaced rather than blended:

- the **current tree** implements canvas-first (the venture canvas is the sole default founder surface —
  see "Verified current behavior");
- the **approved direction** is canvas-as-summoned-projection;
- `FIRM-SPEC.md` / `DESIGN.md` ratification is **pending** — until they adopt it, treat the canvas-first
  tree as current proof and the projection direction as approved-but-unratified intent.

The detailed laws and compatibility boundaries live in `FIRM-SPEC.md`; experience behavior lives in root
`DESIGN.md`.

## Verified current behavior — observed on this working tree

### Mechanical baseline

On 2026-07-18, against the working tree, a local run recorded:

- Brain: **774 tests passed**, 0 failed, 0 skipped.
- UI unit (Vitest): **437 tests passed**, 0 failed, 0 skipped.
- Browser firm-acceptance journeys: **12 passed**, 0 failed, 0 skipped.
- Browser atlas journeys: **3 passed**, 0 failed, 0 skipped.
- UI lint, the production build, and design-system token parity: clean.

This is a **local receipt** produced on one machine. **There is no CI workflow** — the repository has no
`.github/workflows`, so nothing reruns this suite or the acceptance gate automatically. Every count above
must be re-earned by hand before it can be trusted after a change.

This proves the mechanical suite, lint, token parity, and the deterministic browser journeys for the
current working tree. It does not prove Electron behavior, founder comprehension, real effects, market
value, or the approved product direction.

### Venture canvas — the sole default founder surface

`FirmApp.tsx` is ~48 lines with one render decision: no venture → `VenturePicker`; a venture →
`VentureWorkspace`. There are **no `?shell=` flags, no competing shell roots, and no query-parameter
product switching** — the venture workspace (built around the canvas) is the only founder surface. The
prior immersive/Now/legacy shells were deleted from the tree (see "Removed surfaces").

The shipped canvas (`VentureCanvasStage` and its collaborators under `ui/src/components/canvas/`)
provides, verified by unit tests and by the deterministic browser journeys that render the built UI:

- **founder placement** as final authority (Law 6): only founder-moved nodes persist, a 409 merges rather
  than clobbers, and a racing poll cannot snap a just-dropped card back;
- **Product / go-to-market territories** rendered as durable geography with a named seam;
- **semantic zoom** — a shared band step function so the altimeter word and card anatomy cannot disagree;
- reversible **operating lenses** (Understand / Design / Execute / Learn) driving the one node array;
- a **drop-interpretation chip** that names what a founder gesture means before it commits;
- **undo/redo** with revision receipts (see the durability caveat under "Known broken or incomplete paths");
- **dense rank-and-reveal** cluster glyphs so a crowded scene stays a machine, not a scatter;
- a **keyboard-accessible outline** of the scene;
- **in-context workbench descent** into a selected object.

**Browser verification is done, not owed.** The deterministic journeys run against the real built DOM —
`canvas-journey.mjs` at 1440×900 and other journeys at 1280×800 — and assert territory geography,
zoom-driven card anatomy, and final drag placement.

### Removed surfaces

The three-shell era is deleted from the tree, not flag-hidden. Confirmed absent:

- the entire `ui/src/components/immersive/` tree;
- `ui/src/components/now/NowShell.tsx`, `now/NowStream.tsx`, `now/WorkbenchView.tsx` (the `now/` directory
  survives only as reusable leaf components composed inside the workspace, e.g. `NowRail`, `NowComposer`);
- the legacy triptych, `firm/TeammateRail.tsx`, `firm/FirmWorkbenchCanvas.tsx`, `firm/InspectorEffort.tsx`;
- `test/browser/immersive-shell-journey.mjs`.

(`styles/firm-app.css` remains — it is still imported by `workspace/venture-workspace.css` for the
conversation feed's leaf styles, so it is a live dependency, not dead code.)

### Durable local substrate

The current tree implements:

- venture manifests bound to real product repositories;
- venture-scoped readable JSON collections under the local product home;
- atomic writes, compare-and-set revisions, export/import, and cross-venture fail-closed access;
- durable configuration, conversation, bets, outcomes, decisions, product-change history, architecture,
  grants, placement, and settings;
- repository truth reading and isolated product-change worktrees;
- stable attached-work identity and work references through wall items and returned outcomes;
- runtime/model/authentication/configuration receipts in conversation records.

The atlas singleton now has a schema-v2 canonical semantic model with open Object, Relationship, Thread,
Run, View, WorkflowContract, and Insight record families. It remains one readable venture-scoped JSON file
under the existing CAS and transfer boundary. Records join conversation, bets/work, decisions, outcomes,
and placement by same-venture reference rather than copying those authorities.

The Thread and Run schema is corrected to the operating physics rather than a one-bet-per-drive assumption.
A Thread carries durable identity, name, message/subject/participant references, and optional
`parentThreadRef`/`originMessageRef`, and can only reference conversation messages — never copy their
bodies. A Run requires a `threadRef`; it accepts zero, one, or many `betRefs` (betless, multi-bet, and
nested drives via `parentRunRef` are all first-class), keeps the single `betRef` only as a legacy
compatibility seam, and never persists running state or copies bet/event/work/decision/outcome records.
Reference resolution fails closed: a `repository:` citation is accepted only when it structurally carries a
path, an ordered line range, and a source digest — a bare `repository:` prefix no longer resolves, in the
model store and in venture transfer alike. Pure `thread.mjs`/`run.mjs` constructors (no persistence, UI, or
infrastructure imports) plus a lazy atlas CAS adapter (`ensureRootThread`, `recordRun`) form the venture's
deterministic root thread and multi-bet runs only when a real drive needs them, and round-trip through the
existing export/import boundary. New founder ventures created through the product route no longer seed a
fictional founding crew; the first founder direction forms the first participant explicitly. A founder
direction routed through `conversation/reply` is recorded exactly once (the work loop no longer re-appends
it). This proves the corrected canonical Thread/Run substrate and its constructors, not yet the durable Run
lifecycle wired into every live drive (see the handoff's next resumable seam).

Legacy schema-v1 atlas documents read without rewriting. Their first successful semantic or architecture
mutation lazily writes v2 while preserving architecture IDs, public architecture revision receipts,
proposal decisions, campaign contracts, groups, evidence annotations, and working-theory supersession.
Existing architecture routes and the Atlas UI still receive the five-role schema-v1 compatibility
projection. This proves the canonical storage/domain substrate and migration seam, not the complete open
canvas product.

### No ambient work (Phase 2)

Work now begins or continues only through an explicit founder path. The always-on heat scheduler is gone at
its only boot site: `brain/src/server.mjs` no longer imports or arms `startHeatScheduler`, and
`brain/src/firm/heat.mjs` deleted the `setInterval`-over-every-venture scheduler and its
`GTM_IDE_DISABLE_HEAT`/`GTM_IDE_HEAT_TICK_MS` switches. No code path re-enables an ambient loop. The founder
heat dial, spend rail, durable spend ledger, and a founder-invokable `runHeatTick` batch pass survive, but
nothing calls the tick on a timer. The MCP/agent fresh-drive gap is closed: an agent-stamped `POST /drive`
carrying only a goal (no `betId`, no `branchFrom`) is refused 403 — an agent may resume or branch existing
founder-authored work, but only the founder starts fresh work. Proven by `heat.test.mjs` (loop gone) and the
new `agent-drive-initiation.test.mjs` (agent fresh refused; agent resume/branch allowed; founder fresh
allowed). Verified green in the full `npm test` on 2026-07-17.

Caveat surfaced by this change: `runHeatTick` was the only recurring caller of the read-only reply poller
(`pollReplies`). Removing ambient execution leaves reply capture without a production home until a
founder-invoked path calls it; `runHeatTick` still runs the poller when a founder invokes it. Giving reply
capture an explicit founder-invoked home is tracked as follow-up, outside Phase 2 scope.

### Product/GTM territory + traceability substrate (Phase 6, brain-side)

The canonical model now carries an optional, founder/earned **territory** facet (`product`/`gtm`) on an
object's open properties — never a sixth architecture role, and it does not appear in the architecture
compatibility projection. A pure `venture-traceability.mjs` derivation reads the model and returns
cross-boundary trace links (positioning→promise, promise→capability, audience-need→experience,
release→campaign, campaign-asset→product-claim, plus response/revenue/telemetry insight crossings) and
gaps (unsupported claim, unsupported link, unexpressed capability, disconnected evidence). It is pure: it
never mutates the model and never fabricates evidence. Facts, evidence, and interpretation stay separate
(Product Law 10) — a tentative interpretation cannot discharge a claim's evidence gap, only a supporting
stance backed by resolving evidence can, and with no evidence resolver wired a claim stays a *visible* gap
(fail toward visibility, FIRM-SPEC section 7). This is the brain substrate the Phase 6 UI will read; it is
not yet wired to a founder surface.

### Founder authority mechanics

The current tree mechanically implements:

- Electron-owned per-boot founder secret;
- signed short-lived single-use method-and-path claims below the renderer;
- refusal of unstamped, model/MCP-stamped, cross-origin, stale, replayed, forged, and prior-process claims;
- volatile founder presence and away-state outward holds;
- purpose-specific wall decisions;
- second explicit deploy authorization semantics;
- cross-venture failure;
- module-private wall release capability checks in effect executors.

These are strong authority mechanics. They do not prove every visible consequence has a working executor.

### Founder-directed work mechanics

The current tree can:

- accept a founder or agent-stamped inward direction through `/drive`;
- scope work to configured participants, a bet, exact work, architecture, or provisional theory;
- deterministically create an isolated alternative through `branchFrom`;
- run Claude Code or Codex through the provider-neutral runtime seam;
- persist founder directions, teammate/model responses, handoffs, runtime receipts, staged work, and
  completion records;
- expose process-local active drives and founder-authorized abort;
- enqueue steering text for a later work-loop step;
- allow one configured participant to involve another under protocol, cycle, pass, capability, authority,
  and spend checks;
- keep the founder as the only actor allowed to end active work.

Runtime completion currently does not equal founder-ended work. The default composer always calls `/drive`
and does not use the existing steer/close/new-direction dialogue reply path.

### Product-change and market-return mechanics

The current tree mechanically supports:

- isolated product-change worktrees;
- exact diff retention;
- a separate founder product-review approval before apply;
- wall-gated apply;
- Gmail connection and wall-gated send plumbing;
- durable provider-event outcomes and honest unattributed outcomes;
- work and configuration lineage through outward acts and returns.

No live receipt in this document proves a real released email, returned reply, production deploy, paid spend,
destructive act, or attributable market result on the current tree.

### Current UI mechanics

The tree contains **one** founder surface: `FirmApp.tsx` renders `VenturePicker` (no venture) or
`VentureWorkspace` (a venture). The earlier three-shell split (Now, immersive `?shell=world`, legacy
`?shell=legacy`) is gone. Reusable mechanics now composed inside the single workspace include:

- a venture picker and venture-scoped connection state;
- a continuous conversation feed and selection-scoped conversation projection;
- a direction index (`WorkspaceIndex` / `NowRail`) with universal search and needs-you attention;
- Result, Exact Change, and approach-comparison workbench representations;
- the React Flow venture canvas with deterministic layout, founder placement, semantic zoom, operating
  lenses, dense clustering, focus traces, camera restoration, outline, and reduced-motion behavior;
- contextual product-change review and purpose-specific wall controls;
- return summaries, active-work receipts, runtime provenance, and exact work focus.

These are now composed into one surface. The canvas-first tree matches the prior "canvas as main surface"
line but **not** the newer ratified direction, which makes the canvas a summoned projection rather than the
primary operating surface (see "Ratified direction change"). A separate React Flow **Atlas** projection and
its journeys remain in the tree as the graph substrate the workspace canvas builds on.

## Mechanically exercised — deterministic regression coverage

The repository contains deterministic tests and fixtures for:

- venture isolation, transfer, storage, configuration, conversation, bets, outcomes, architecture, and
  product-change records;
- canonical-model absent/v1/v2 reads, lazy migration, readable single-file storage, two-writer CAS,
  seven-family export/import, cross-venture and dangling-reference refusal, authoritative-record
  separation, workflow/run state refusal, working-theory insight lineage, and architecture compatibility;
- founder-authority signatures, origin/method/path/expiry/replay/process rotation, presence, deploy
  authorization, and actor-stamped refusal;
- participant collaboration primitives, pass/cycle limits, runtime selection, spend accounting, steering,
  and abort;
- product-change worktree isolation and staged review;
- Gmail connection/send failure paths and outcome joins;
- Atlas projection, layout, density, outline, accessibility, camera, wall, return, and Workyard fixtures;
- Now component rendering, representation availability, composer receipts, and local callbacks.

Deterministic browser and fixture coverage proves rendering and interaction mechanics only. It does not
establish outside-founder comprehension, usefulness, real-world effects, causality, or market value.

On 2026-07-18, a local run recorded the mechanical suite, design-token parity, the firm-acceptance browser
journeys (12 pass), and the atlas browser journeys (3 pass) all green with 0 failed and 0 skipped. This is a
**local receipt only** — there is no CI workflow, so the readiness gate is not enforced automatically and
must be rerun by hand after any change.

## Known broken or incomplete paths

### Product composition

- The shipped tree is canvas-first: one `VentureWorkspace` surface with the venture canvas as the default.
  The **newer ratified direction makes the canvas a summoned projection**, not the primary surface — the
  current tree does not yet implement that (see "Ratified direction change"). `FIRM-SPEC`/`DESIGN`
  ratification of the projection direction is pending.
- Directions are reconstructed from founder-message chronology and bet lineage rather than durable branch
  records.
- Workspace search filters **directions only** — it does not search across canvas objects, work, or
  evidence.
- **Selection integrity is incomplete.** The visible selection, the founder-facing scope label, and the
  drive payload are all bet-centric; architecture/theory/work/teammate selections degrade. A teammate
  selection can *present* as scoped yet start an **unscoped** drive. One canonical selected-object spine is
  owed.

### Canvas and model

- The canonical storage model is open, but its shipped architecture compatibility projection still requires
  the legacy five roles.
- **Saved views/snapshots are write-only in the UI.** The backend (`views-store.mjs` / `view-routes.mjs`)
  supports save, list, reopen, and delete; the founder surface only saves/captures — it renders **no**
  list, reopen, or delete affordance, so a saved view cannot be reached again.
- Canvas nodes are now founder-draggable and placement is founder-owned (nodes lock to `draggable:false`
  only while a lens or generated-answer overlay is active, and for group/intent nodes). This reverses the
  earlier engine-owned placement.
- The **generated-answer "Related context" trace is deterministic and promotes nothing to durable truth.**
  A prior version wrote the founder's *question* back as a "finding" — recording a question as a fact, a
  truth-model violation. That truth-promotion path is removed; the surface only rearranges to highlight
  existing relationships.
- **`VentureCanvasStage` is a large second-order coordinator** — it owns projection, placement, bands,
  lenses, views, mutation, revision, interpretation, clustering, selection, keyboard, and outline in one
  component. Splitting it by stable responsibility is owed.

### Conversation and runs

- There is no durable venture-root branch plus persistent scoped branch model.
- The default composer always calls `/drive`; it does not use the implemented dialogue reply route
  (steer/approve/close/new-direction), which is therefore unused from the UI.
- **Undo/redo is not durable venture history.** It is session-scoped, capped, on a 30-minute TTL, and not
  transactional — the stack moves before the mutation confirms, so a rejected write can leave the visible
  history out of step with persisted truth.
- The agent/MCP `/drive` fresh-start gap is **closed (Phase 2)**: an agent-stamped drive with no bet lineage
  is refused; only a founder starts fresh work.
- The composer drops explicit multi-participant targeting and exposes only the first active drive.
- Runtime completion, workflow completion, founder ending, external execution, and returned evidence are not
  represented as distinct terminal conditions.
- Outcome-contract workflows are not implemented.
- **"Real-time" is a 1.2-second, four-request poll.** `use-firm-connection.ts` refetches lens,
  conversation, active drives, and health together every 1.2s. Server-side SSE exists but this surface does
  not use it.
- Venture switching can briefly retain old lens/messages/drives/drafts under the new venture identity.

### Consequences

Repaired brain-side in Phase 3 (verified: 710 brain + 49 security-matrix green):

- Product-change release now refuses a revision that was not separately founder-reviewed+approved
  (`product_change_not_approved` thrown before any status flip); a failed apply no longer self-approves.
- A deploy effect executor exists and is fail-closed: with no configured provider it returns a persisted
  `{ ok:false, executionError }` and never a fake success; the second authorization is unchanged.
- A failed message/deploy transport is persisted on the still-queued wall item
  (`lastExecutionError`/`needsReconnect`/`lastAttemptAt`) and thrown as `wall_release_execution_failed` (502);
  a genuine later success clears those markers and stamps `releasedAt` exactly once.
- A standing grant no longer claims "Sending" without sending: it skips the *wait*, not the *release* — the
  act parks honestly (`sent:false`) and the founder still performs the release. The wall release capability
  is minted only inside `wall.decide()`.

Remaining consequence follow-ups (tracked; not authority holes):

- **Grant true auto-send is a deliberate product/authority decision, not a bug.** A background drive holds no
  live founder request and cannot obtain the founder capability, so a grant cannot ship a real send in-spec.
  If auto-send is actually wanted, it needs a new host-authority path — surfaced for Jacob, not smuggled in.
- The founder wall UI does not yet render `lastExecutionError`/`needsReconnect` as a retry/reconnect
  affordance (belongs to the Phase 4 shell rebuild).
- `executeProductChange` throws on apply failure instead of returning `{ok:false}`, bypassing the
  persist-failure path (item stays queued, honest, but without `lastExecutionError`) — normalize in Phase 4/6.
- A crash mid-apply leaves a product-change revision `applying`; the approved-only gate then refuses retry
  with no recovery path (fail-closed but stuck) — add an explicit recovery.
- `preAuthorizedGrantId` is stamped on parker-controllable effect content and not in `park()`'s
  authorization-claim strip list — a latent spoof-display seam (nothing reads it today); move it to a
  host-stamped item field in the Phase 7 hardening pass.
- Concurrent drives can oversubscribe the same remaining daily allowance; aggregate spend is not a hard
  concurrent guarantee.
- MCP assumes a fixed Brain port while Electron owns a dynamic port, so the packaged desktop and MCP do not
  naturally share one Brain process.

### Engineering

- **No CI workflow.** The repository has no `.github/workflows`; nothing runs `npm test` or the acceptance
  gate on push or PR. Every test count in this file is a hand-run local receipt.
- `VentureCanvasStage` is a large second-order coordinator holding many responsibilities in one component
  (see "Canvas and model").
- `brain/src/firm/work-loop.mjs` exceeds the 500-line production-service ceiling and combines several
  responsibilities.
- The anti-cage file-count threshold is too loose to prevent ordinary architecture growth.
- The production vendor bundle exceeds the current warning threshold.
- Electron tests cover window-state helpers, not Brain launch, signed founder mutation, unified-workspace
  behavior, restart recovery, or shutdown.

## Unproven

The following are approved requirements or desired alpha evidence without sufficient current receipts:

- one canonical open model fully wired across Product/go-to-market canvas, conversation, runs, work,
  decisions, evidence, and saved views;
- one venture conversation with durable persistent branches;
- semantic zoom over exact work, evidence, and provenance (the canvas zooms over Product/go-to-market
  structure today, but exact work, evidence, and provenance are not yet in the zoomed scene);
- a **reachable** saved-view lifecycle — the founder can save and snapshot, but cannot yet list, reopen, or
  delete a saved view from the UI;
- immediate provisional whole-venture interpretation plus useful work in one founder-directed turn;
- a real provider pass that independently selects and completes a second participant contribution;
- founder-invoked outcome-contract workflows;
- hard concurrent spend authority;
- a working deploy executor;
- a real released send and returned reply;
- a real attributable market result changing the venture model and next work;
- cross-machine import with destination repository rebind;
- an outside founder completing the Product/go-to-market loop without a walkthrough;
- repeated use proving the canvas stays legible without manual grooming.

## Legacy or conflicting behavior — scheduled for migration or removal

The following exists in code or prior documentation but is not approved product physics:

- the three-shell surface split (Now/direction-workspace primacy, `?shell=world` immersive, `?shell=legacy`
  triptych), the immersive tree, and the retired shell browser journey — **removed from the tree** (see
  "Removed surfaces"), retained here only so their absence is on record;
- one conversation per direction;
- permanent AI staff, automatic founding crew, teammate roster as product ontology, and AI-org-chart
  relationships (new founder ventures no longer auto-seed fictional crew — Phase 1);
- ambient scheduling, heat-controlled autonomy, automatic activation, and around-the-clock inward work
  (the always-on heat scheduler is removed — Phase 2; the founder-invokable dial/tick remains);
- fixed diverge/prepare/wall/observe loops presented as the venture lifecycle;
- closed Concept/Product-loop/System/Motion/Campaign architecture roles as the canonical model;
- workflow prohibition instead of founder-invoked outcome contracts;
- **canvas-first primacy itself, under the newer ratified direction** — the tree keeps the canvas as the
  default surface while the approved direction summons it as a projection; this is a live conflict pending
  `FIRM-SPEC`/`DESIGN` ratification, not yet a migrated behavior.

Remaining behaviors may persist temporarily as compatibility seams while the approved migration preserves
current user data and capability parity. They must not be promoted in current product copy or future
implementation.
