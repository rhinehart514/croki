# STATE — Drover

**Stage:** alpha. **Updated:** 2026-07-17.
**Authority:** [`FIRM-SPEC.md`](FIRM-SPEC.md) defines durable product/build physics. Root
[`DESIGN.md`](../DESIGN.md) defines the intended desktop experience.

This file reports current proof. Approved direction describes what Drover must become; it is not evidence
that the current tree does it.

## Approved direction — normative, not proof

Drover is the founder-controlled Product and go-to-market system.

The approved product has:

- one canonical open venture model with permanent Product and go-to-market territories;
- the venture canvas as the main founder surface;
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

The detailed laws and compatibility boundaries live in `FIRM-SPEC.md`; experience behavior lives in root
`DESIGN.md`.

## Verified current behavior — observed on this working tree

### Mechanical baseline

On 2026-07-17, against the preserved dirty working tree, `npm test` completed successfully:

- Brain: **736 tests passed**, 0 failed (Phase 1 canonical model, Phase 2 ambient-removal, Phase 3
  consequence repairs, Phase 6 brain-side territory/traceability + the projection bridge that surfaces real
  per-object territory and venture-level traceability gaps into the architecture projection the UI reads).
- UI: **372 tests passed across 79 files**, 0 failed.

### Unified canvas — Phase 4/5 build in progress (behind `?shell=canvas`)

Additive, flag-gated, NowShell default untouched. Verified green (full `npm test` exit 0):

- **Slice 1 — canvas shell:** `VentureCanvasShell` renders the one `projectAtlas` scene as a draggable map
  with rendered Product/GTM territory geography and a named empty state ("Direct the venture"). Founder
  placement is final: only founder-moved nodes persist (never seeds), a 409 merges rather than clobbers, and
  a racing poll cannot snap a just-dropped card back. Opens in the structure band so the territories are
  named on arrival; the atlas altitude attribute is set so zoom-out simplifies cards instead of shrinking to
  tiny text.
- **Slice 2 — semantic zoom:** one shared `SemanticBandProvider` (pure `bandForZoom` step function with
  ±0.06 hysteresis + settle-freeze) owns the single band state; the node anatomies, density ranker, and the
  legacy immersive band vocabulary all read it, so the altimeter word and the card anatomy cannot disagree.
  Mounted inside the flow store and above the nodes on both the canvas and the legacy world surface.
- **Browser verification owed:** this environment has no browser-automation, so the above is proven by unit
  tests + build + render-logic review, not by literal screenshots. A human/browser pass on `?shell=canvas`
  (empty-state territories visible, zoom changes card anatomy, drag is final) is still required.
- UI lint passed.
- TypeScript and Vite production build passed.
- Vite emitted a build warning for `vendor-CGN5ilKm.js`: **633.21 kB minified / 195.39 kB gzip**.
- `npm --prefix site run lint && npm --prefix site run build` passed; Next.js statically generated the
  public routes.

This proves the mechanical suite, lint, and builds for the current working tree. It does not prove the full
acceptance suite, Electron behavior, founder comprehension, real effects, market value, or the approved
product direction.

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

Runtime completion currently does not equal founder-ended work. The default Now composer does not use the
existing steer/close dialogue path.

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

The tree currently contains three founder shell roots/compositions:

1. default `NowShell` direction workspace;
2. `ImmersiveShell` behind `?shell=world`;
3. legacy conversation/canvas/inspector behind `?shell=legacy`.

Across those implementations, the tree already contains reusable mechanics for:

- a venture picker and venture-scoped connection state;
- a continuous conversation feed and selection-scoped conversation projection;
- rich participant/bet/work/architecture/theory targeting;
- a direction index with search and needs-you filtering;
- Result, Exact Change, and approach-comparison workbench representations;
- a React Flow Atlas projection, deterministic layout, focus traces, camera restoration, outline, and
  reduced-motion behavior;
- contextual product-change review and purpose-specific wall controls;
- return summaries, active-work receipts, runtime provenance, and exact work focus.

Those capabilities are split across incompatible shells. Their presence is not proof of the approved single
canvas/conversation product.

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

On 2026-07-17, `npm run test:acceptance` reran the mechanical suite successfully, then failed at design-token
parity before browser journeys. The reported debt is concentrated in legacy immersive, Now, firm-app, and
Atlas CSS: undefined tokens, infinite animations, and 9–10px essential text. The complete readiness gate is
therefore **red** and no browser-acceptance receipt is claimed current.

## Known broken or incomplete paths

### Product composition

- The shipped default is Now, while the approved product requires one canvas-first founder workspace.
- `FirmApp.tsx` retains three shell roots and query-parameter product switching.
- Conversation, canvas, selection, wall, polling, and composer behavior are duplicated.
- Directions are reconstructed from founder-message chronology and bet lineage rather than durable branch
  records.
- Now fetches conversation but does not render the continuing thread.
- The Atlas is query-hidden from the default product.

### Canvas and model

- The canonical storage model is open, but its shipped architecture compatibility projection and current
  Atlas interactions still require the legacy five roles.
- The resting Atlas filters most exact work, evidence, relationships, and live agent scope off-stage.
- Current Atlas nodes are explicitly `draggable: false` and placement is engine-owned.
- Saved synchronized live views, immutable snapshots, reversible operating lenses, open creation, hybrid
  gesture interpretation, and complete epistemic states are not implemented.
- Product and go-to-market are not yet permanent territories over one canonical model.

### Conversation and runs

- There is no durable venture-root branch plus persistent scoped branch model.
- Now always calls `/drive`; it does not use the implemented dialogue steer/close/new-direction path.
- The agent/MCP `/drive` fresh-start gap is **closed (Phase 2)**: an agent-stamped drive with no bet lineage
  is refused; only a founder starts fresh work.
- Now drops explicit multi-participant targeting and exposes only the first active drive.
- Runtime completion, workflow completion, founder ending, external execution, and returned evidence are not
  represented as distinct terminal conditions.
- Outcome-contract workflows are not implemented.
- SSE exists server/client-side but the production shell relies on polling.
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
- one canvas-first founder workspace with one venture conversation and persistent branches;
- direct canvas manipulation with reversible semantic interpretation;
- semantic zoom over Product, go-to-market, exact work, evidence, and provenance;
- reversible Understand / Design / Execute / Learn lens;
- temporary generated views, synchronized live views, and immutable snapshots;
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

- Now/direction-workspace primacy and one conversation per direction;
- optional/query-hidden canvas framing;
- permanent AI staff, automatic founding crew, teammate roster as product ontology, and AI-org-chart
  relationships (new founder ventures no longer auto-seed fictional crew — Phase 1);
- ambient scheduling, heat-controlled autonomy, automatic activation, and around-the-clock inward work
  (the always-on heat scheduler is removed — Phase 2; the founder-invokable dial/tick remains);
- fixed diverge/prepare/wall/observe loops presented as the venture lifecycle;
- closed Concept/Product-loop/System/Motion/Campaign architecture roles as the canonical model;
- workflow prohibition instead of founder-invoked outcome contracts;
- immersive ambient-thread treatment and decorative shell chrome;
- legacy triptych as a separate product;
- browser journeys that assert retired shell selectors or treat deterministic mechanics as product proof.

These behaviors may remain temporarily as compatibility seams while the approved migration preserves current
user data and capability parity. They must not be promoted in current product copy or future implementation.
