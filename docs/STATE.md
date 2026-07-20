# STATE — Drover

**Stage:** alpha. **Updated:** 2026-07-20.
**Authority:** [`FIRM-SPEC.md`](FIRM-SPEC.md) defines durable product/build physics. Root
[`DESIGN.md`](../DESIGN.md) defines the intended desktop experience.

This file reports current proof. Approved direction describes what Drover must become; it is not evidence
that the current tree does it.

## Approved direction — normative, not proof

Drover is a Product and GTM Development Environment for founders building with agents. Product and
go-to-market develop as one evidence-returning system; the thread preserves founder direction, while the
release is the primary unit of market movement. Every meaningful Product change creates a distribution
question and every meaningful market return creates a Product or GTM consequence.

The approved product has:

- one canonical open venture model with permanent Product and go-to-market territories;
- three parallel founder modes—Work, Product / GTM, and Releases—over one shared context;
- a mode-owned rail and contextual, closable conversation outside Work;
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

### Implemented correction — three founder jobs, one venture context

The shipped shell now has Work, Product / GTM, and Releases as complete presentation-level modes over the
canonical venture model. Work is a coding-first conversation-and-workbench ADE. Product / GTM owns the node canvas
and Releases owns one connected release path; each opens a contextual, closable conversation only when needed.
Mode changes preserve the selected Thread; node and release selection use their existing direct references
instead of a generalized context router.

`workspace/VentureWorkspace.tsx` remains the stable app boundary; feature-local `WorkspaceShell` now owns
mode, the selected Thread/object/release, v4 venture-keyed presentation state, rail width, Product / GTM
scope/camera, and per-thread conversation scroll. `ThreadShell` is no longer the runtime state owner or
navigation root. The generalized `resolveWorkspaceContext`, Release subview contract, and persisted drawer/
visual-stage routing state are removed. The older free canvas remains a tested compatibility seam with no
normal product entrypoint.

The detailed laws and compatibility boundaries live in `FIRM-SPEC.md`; experience behavior lives in root
`DESIGN.md`.

On 2026-07-20 the authority was reconciled toward mode-owned space. The causal Work → Product / GTM →
Releases → Evidence loop is not a navigation sequence; Product / GTM is never founder-facing **System**;
mode handoff follows existing direct references; founder joins are immediate and undoable while agent joins
remain provisional; and the canvas's broader semantic-zoom/capacity architecture stays an unadopted
hypothesis until a real loop runs. The founder shell now implements that mode-owned correction; outside-founder
comprehension and a live external causal loop remain open rather than being claimed from deterministic shell
mechanics.

## Verified current behavior — observed on this working tree

### Mechanical baseline

On 2026-07-20, the complete `npm run test:acceptance` receipt passed against this working tree:

- `npm test`: Brain **840/840** and UI **509/509**, with lint and the production build green;
- design-token parity: **161 tokens** across **29 CSS files** and **34 extensions**;
- firm browser acceptance: **7/7**, including the native-coding and three-mode workspace journeys;
- Atlas browser journeys: **3/3**;
- Electron: **13/13**, including PTY worktree isolation and terminal outcomes, native preview security, real-host native-coding
  restart, and founder-authority receipts;
- packaged Electron: **1/1**, launching a disposable arm64 `Drover.app`, proving the trusted preload and
  matching dynamic Brain instance, and clearing its runtime location on shutdown.

The browser journeys exercise mode-owned rail bodies, contextual closable conversation outside Work, and
visible offline/read-only truth on the owning Product / GTM or Releases surface; the coding-first Work composer with repository,
isolated-worktree, founder-guard, and real Claude/Codex model choice; absence of those coding controls from
Product / GTM and Releases; no reserved empty workbench before coding begins; stable Work
conversation/workbench split; compact transcript material references; attempt selection; in-surface
changes/diff/review; node-scoped contextual agent; direct Thread/object/release selection,
the five-part Release Path, honest missing links, derived in-market state, joined exact gates and evidence,
founder-granted bounded Gmail observation, honest missing-source/credential states, unsaved contextual release
drafts, blank-form refusal, end/reopen, generated Whole venture/Product/Go-to-market graphs, a visible
release-scoped evidence return curve and exact next-Work handoff, keyboard
reachability, a complete saved-view save/list/reopen/delete lifecycle, 120-node containment, venture
isolation, zoom, and offline last-coherent reads. T3's
collaborative preview automation required unavailable authentication during this run, so no outside-founder
manual visual-QA claim is made. A deterministic 1440×900 Chrome capture was inspected and exposed a collapsed
headerless canvas; the repaired full-height composition is now guarded in the browser journey. Browser and
native-host receipts still prove deterministic behavior rather than comprehension.

The same tree produced `release/Drover-0.3.3-arm64.dmg` (**187,216,672 bytes**, SHA-256
`b0a136944169559508837fc16c1379c9a9fd2a650c18cb14357c26fa99a44eb5`). `codesign --verify --deep
--strict` passed for the app bundle and `hdiutil verify` passed for the DMG. This proves the local ad-hoc
arm64 package, not Developer ID signing, notarization, public hosting, clean-machine installation, upgrade,
or rollback.

The macOS GitHub Actions workflow runs the same complete gate on pull requests and pushes to `main`; its first
remote execution remains unobserved until this working tree is committed and pushed. The browser remains a
deterministic harness, not a production surface. The Electron receipt launches the actual desktop host,
exercises its preload and signed founder mutation, restarts the full application, and verifies recovered
coding work. The deterministic checks do not prove outside-founder comprehension, market value, or an
external consequence.

A manual Electron dogfood pass used the real configured Codex runtime to implement the CI acceptance wiring
without another coding environment. One durable Thread created a Run, persisted provider session
`019f7c6b-d844-78b0-afab-7b4a750a82ed`, worked on branch
`drover/code-7ed97f3d-ebd5-405f-b916-4bec7ef9e84a` in an isolated worktree, and returned exact changes to
`.github/workflows/ci.yml` and `package.json`. Provider and host `npm test` receipts passed; the founder opened
the diff beside the still-mounted conversation, approved the exact checkpoint, and applied it through the
real Electron host. Earlier interrupted attempts remained recoverable and separate rather than disappearing.
This proves the live local coding loop and source apply, not a remote CI run or external market return.

### Three-mode founder workspace — the default founder surface

`FirmApp.tsx` resolves the launch boundary before rendering a founder surface: an existing installation
reopens the last active venture (or the newest connected venture when no return preference exists), while a
first installation with no venture reaches `VenturePicker`. There are **no `?shell=` flags, no competing
shell roots, and no query-parameter product switching** — the venture workspace is the only returning
founder surface. The prior immersive/Now/legacy shells were deleted from the tree (see "Removed surfaces").

The workspace opens on `WorkspaceShell`: a resizable 240px rail with Work, Product / GTM, and Releases below
the venture switcher. Its body belongs to the current mode: Work shows compact Thread groups and search;
Product / GTM shows Whole venture, Product, Go-to-market, Needs attention, mode-local search, and selected
context, plus reachable saved live views and snapshots for the selected canonical path; Releases shows Needs
you, Preparing, In market, Recent, mode-local search, and release preparation only when exact Work or Product
/ GTM context can seed it. New Threads become durable only on first send.

Work opens as coding conversation and gives it the available surface until repository work exists. Its
composer exposes the repository, isolated-worktree promise, founder guard, and available Claude/Codex model
choice. A direction starts a nonblocking coding turn in the same Thread with that exact runtime/model choice.
Conversation holds intent, progress, and compact material references rather than rendering full artifacts or
gates inline. Work now uses the native coding-client conversation geometry proven in the browser journey:
founder turns are compact and right-aligned, agent output is unboxed, transcript rows and composer share a
centered `48rem` measure, and one stable transcript scroller preserves per-Thread position without jumping on
ordinary shell updates. Once coding begins, native attempts are selectable without an overlay; the adjacent workbench
exposes Changes (file navigation plus the exact selected diff), Preview, a collapsible Terminal,
command/verification receipts, checkpoints, and the existing
approve/reject/apply/reverse/commit/prepare/restore/discard controls. Electron
uses `node-pty` only after resolving `ventureId + workspaceId` to the canonical isolated worktree and owns one
sandboxed HTTP(S)-only `WebContentsView` preview. The browser harness shows honest desktop-required states.

Verified coding work now produces an editable Product consequence and distribution question on the exact
workspace. It remains provisional through revisions and rejection; settlement no longer writes semantic
truth. Founder adoption is a separate desktop-authorized action that requires the exact checkpoint and
successful attributed verification, records a source-bearing `capability` as founder-asserted Product truth,
and directly links it back to the owning Thread. The native-coding browser journey edits and adopts the card,
switches to Product / GTM, observes the exact selected capability and its visible missing connection, returns
to the same Work context, then completes the separate repository review and isolated commit.

Product / GTM controls `VentureMaps` as the primary canvas across Whole venture, Product, Go-to-market, and Needs
attention scopes, with those controls in its mode rail. The founder can create open objects and labeled
connections, edit open records directly, and edit compatibility-owned names/connections through the existing
architecture adapter. Selecting a node scopes the contextual agent and derives working, needs review,
failed, or completed state from linked `WorkIndex` Threads. A load-order-safe direct-reference handoff opens
the canonical linked Thread as soon as its shared index is current. The contextual composer stays free of
repository/worktree/model controls. Graph pan, zoom, fit, and camera remain
presentation only; the graph never becomes another authority.

A release-scoped outcome now projects into Product / GTM as a temporary returned-evidence node. It follows
only the release's existing canonical relationships back to affected objects, renders restrained tentative
return curves, and separates the exact outcome from the explicitly unresolved interpretation. The evidence
inspector cannot edit projection-only evidence as Product truth. **Start next work** switches to Work with the
exact `outcomeRef` plus every directly affected `objectRef`; the first message forms the durable Thread under
those subjects.

The Product / GTM rail now completes the saved-view lifecycle. **Save current view** stores the selected
canonical object and its directly connected canonical context; the rail lists live views and snapshots and
supports reopen plus confirmed delete. Reopening a live view resolves current truth, while a stale snapshot
remains visibly stale. Presentation-only camera and generated projection nodes never enter the saved scope.

The mode-owned headerless canvas also has an explicit height contract after visual inspection
found that its graph could render into a two-pixel grid row while DOM nodes remained test-visible.

Releases are canonical semantic objects, not another collection. The workspace derives draft/in-market/ended
and needs-you state from exact references and presents Product delta → Customer consequence → Distribution →
Outward action → Evidence as one feature-local projection. Missing sections remain explicit; exact gates sit
inside Outward action; joined activity follows the path; object/work links open from the relevant section;
rename/end/reopen live in Details. There is no Overview/Build/Activity/Settings subnavigation.
Its contextual agent likewise remains distinct from the Work coding composer. Starting without exact source
context produces a visible missing-link explanation rather than a blank release form.

An adopted coding consequence now seeds release preparation with its exact capability name, distribution
question, canonical `objectRef`, and owning `threadRef`. The founder reviews populated context instead of
re-entering a blank release; one explicit **Prepare release** creates the canonical release and both joins in
the same semantic-model revision. The resulting path shows the Product capability and exact Work while
customer consequence, distribution, outward action, and evidence remain visibly open. Brain coverage proves
the atomic dual-reference seed; the native-coding browser journey proves the populated founder surface and
the resulting causal path.

Conversation remains primary in Work. Product / GTM and Releases open it only through **Ask Drover** as a
closable right column or narrow-width overlay. Closing and reopening preserves the exact Thread, subject-scoped
draft, last coherent timeline, and scroll; a missing linked Thread remains a local draft until first send. The
v4 session restores mode, selected Thread/object/release, contextual-chat state, rail width, Product / GTM
scope/camera, and conversation scroll, while mapping useful v3/v2/v1 selections forward and ignoring retired
resolver, Release-subview, and visual-stage fields.

The former free-canvas implementation remains in `ui/src/components/canvas/` as compatibility code and is
still covered by unit tests, but it has no founder product entrypoint. This proves the local projection and
interaction contract, not outside-founder comprehension or live market state.

### Removed surfaces

The three-shell era is deleted from the tree, not flag-hidden. Confirmed absent:

- the entire `ui/src/components/immersive/` tree;
- `ui/src/components/now/NowShell.tsx`, `now/NowStream.tsx`, `now/WorkbenchView.tsx` (the `now/` directory
  survives only as reusable leaf components composed inside the workspace, e.g. `NowRail`, `NowComposer`);
- the legacy triptych, `firm/TeammateRail.tsx`, `firm/FirmWorkbenchCanvas.tsx`, `firm/InspectorEffort.tsx`;
- `test/browser/immersive-shell-journey.mjs`.

(`styles/firm-app.css` remains — `FirmApp.tsx` still imports it for shared picker, settings, and
conversation-leaf styles, so it is a live compatibility dependency, not dead code.)

### Durable local substrate

The current tree implements:

- venture manifests bound to real product repositories;
- venture-scoped readable JSON collections under the local product home;
- atomic writes, compare-and-set revisions, export/import, and cross-venture fail-closed access;
- durable configuration, conversation, bets, outcomes, decisions, product-change history, architecture,
  native-code workspaces, grants, placement, and settings;
- repository truth reading and isolated product-change worktrees;
- Run-linked native coding worktrees, provider sessions, checkpoints, commands, verification, diffs, and
  Product/release consequences;
- stable attached-work identity and work references through wall items and returned outcomes;
- founder-authorized, CAS-guarded system and release APIs with cross-venture and forged-write refusal;
- canonical release lifecycle, attention, object/work/action joins, unassigned actions, and contextual
  first-message subject references;
- runtime/model/authentication/configuration receipts in conversation records.

The atlas singleton now has a schema-v2 canonical semantic model with open Object, Relationship, Thread,
Run, View, WorkflowContract, and Insight record families. It remains one readable venture-scoped JSON file
under the existing CAS and transfer boundary. Records join conversation, bets/work, decisions, outcomes,
and placement by same-venture reference rather than copying those authorities.

The Thread and Run schema is corrected to the operating physics rather than a one-bet-per-drive assumption.
A Thread carries durable identity, name, lifecycle, reviewed-through cursor,
message/subject/participant references, and optional `parentThreadRef`/`originMessageRef`, and can only
reference conversation messages — never copy their bodies. A Run requires a `threadRef`; it accepts zero,
one, or many `betRefs` (betless, multi-bet, and
nested drives via `parentRunRef` are all first-class), keeps the single `betRef` only as a legacy
compatibility seam, and never persists running state or copies bet/event/work/decision/outcome records.
Reference resolution fails closed: a `repository:` citation is accepted only when it structurally carries a
path, an ordered line range, and a source digest — a bare `repository:` prefix no longer resolves, in the
model store and in venture transfer alike. Pure `thread.mjs`/`run.mjs` constructors (no persistence, UI, or
infrastructure imports) plus the atlas CAS adapter form the venture's deterministic root organization and
child direction threads only when a real drive needs them. Each new founder-authorized direction now mints
a child Thread; later work on the same bet resumes that stable thread; every Run joins the child rather than
the root. Terminal settlement enriches that child with returned conversation and newly revealed bet refs.
The records round-trip through the existing export/import boundary. New founder ventures created through the product route no longer seed a
fictional founding crew; the first founder direction forms the first participant explicitly. A founder
direction routed through `conversation/reply` is recorded exactly once (the work loop no longer re-appends
it).

### Native coding architecture decision

The implemented path strengthens Drover's existing substrate. `conversation`, Thread, Run, participant,
venture store, provider runtimes, exact work, semantic model, visual-stage registry, and Electron founder
authority remain the only product authorities. A coding workspace is one feature-local record attached to a
Run; provider events are translated into its commands, verification, session, and checkpoint receipts.

Direct inspection of T3 Code showed stronger checkpoint, provider-event, git, terminal, restart, transcript,
composer, diff, and status machinery, but those capabilities are coupled to T3's project, session, and event
projections. Replatforming or importing that persistence would create competing project/thread/event truth and
would make Product/release/evidence joins adapters around another system. Drover therefore adapted T3's
temporary-index checkpoint mechanism behind `brain/src/native-code/t3-checkpoint-store.mjs` and ported the
interaction geometry of the shipped `MessagesTimeline`, `ChatComposer`, `DiffPanel`,
`ThreadTerminalDrawer`, and status/checkpoint components onto Drover contracts. The inspected installed build
was T3 Code **0.0.28** at commit `fda6486233e0`; the upstream boundary and MIT notice live in
`licenses/t3code-MIT.txt`. No T3 project, session, Thread, event, draft, terminal, or checkpoint store became
a Drover authority.

`GET /api/ventures/:id/work-index` now projects one production read model from Threads, Runs, process-local
active drives, immutable settlement receipts, and pending founder decisions. Lifecycle, activity,
attention, terminal, and unread remain independent facets; missing settlement becomes `interrupted`, not a
false completion. It now supports cross-body search, explicit pin/unpin through the semantic-model CAS
boundary, participant facets, and a match count. A founder-only reviewed-through write advances the exact
latest consequence cursor and rejects stale writes. Pre-contract ventures are projected as virtual
bet-family threads without destructive backfill.

`GET /api/ventures/:id/threads/:threadId/timeline` joins canonical message references, Runs, active drives,
staged artifacts, decisions, outcomes, receipts, and legacy bet joins into an ordered open union. Stable
visual references open previews, diffs, flows, comparisons, evidence, consequences, and the venture map.
Structured flow/comparison payloads are supported while arbitrary legacy artifact content stays valid.

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

Reply capture now has an explicit founder-granted production home. A release with a real Gmail message
identity can persist one exact, revocable observation contract carrying its source, purpose, start/end,
return conditions, decision references, and message identities. The Releases UI exposes grant, check,
revoke, unavailable-source, expiry, and reconnect truth. A conversation request or founder-invoked heat pass
enumerates only active contracts; neither can call the broad provider reader without one. The contract can
read Gmail threads and record attributable evidence, but explicitly denies send, publish, deploy, spend, and
canonical-interpretation authority. Nothing polls on a timer.

`release-observation.test.mjs` proves founder-only grant/revoke, valid windows, release and message scoping,
source mismatch failure, expiry/revocation failure, and the absence of outward or semantic authority. The
three-mode browser journey grants a contract against one exact released Gmail identity, reloads it from the
canonical release projection, and proves a missing credential returns honestly without reading another
source. It then selects an attributable fixture outcome in Product / GTM, proves the tentative backward return
edge and unresolved interpretation, and starts exact next Work from the outcome and affected Product/GTM refs.
`ReleaseObservation.test.tsx` proves the control is visibly unavailable before a real send. Brain projection
coverage proves this read path does not add or change canonical objects.

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
(fail toward visibility, FIRM-SPEC section 7). The active Product / GTM graph now projects those exact
relationships and gaps, release-scoped evidence, tentative return curves, and the affected next-Work
handoff. It does not promote tentative interpretation to canonical truth.

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

Electron and MCP now share the same Brain process. The desktop Brain atomically publishes its dynamic
loopback port plus per-boot instance identity in a private runtime file; MCP resolves that record on each
call and rejects an instance mismatch. Electron and Brain both clear only the matching record on shutdown,
while `npm start` remains the explicit `127.0.0.1:4317` development fallback. The Electron journey invokes
the MCP client against the published dynamic port, verifies the matching health identity, then proves stale
location cleanup and a distinct identity after relaunch.

The founder UI exposes working exact apply, Gmail send, and repository deploy consequences. Missing
credentials or deploy contracts are visibly unavailable with the reason. Publish, spend, and other outward
capabilities have no active control rather than a decorative or dead one.

### Founder-directed work mechanics

The current tree can:

- accept a founder or agent-stamped inward direction through `/drive`;
- scope work to configured participants, a bet, exact work, architecture, or provisional theory;
- deterministically create an isolated alternative through `branchFrom`;
- run Claude Code or Codex through the provider-neutral runtime seam;
- persist founder directions, teammate/model responses, handoffs, provider sessions, runtime receipts,
  isolated coding work, and completion records;
- expose process-local active drives and founder-authorized abort;
- enqueue steering text for a later work-loop step;
- allow one configured participant to involve another under protocol, cycle, pass, capability, authority,
  and spend checks;
- keep the founder as the only actor allowed to end active work.

The desktop composer sends every root, draft, and existing-thread turn through `conversation/reply` with
the exact selected `threadRef` when one exists. New directions are accepted with `202` before provider
completion, so the composer remains usable while the run continues. Active beats expose meaningful work and
elapsed time. Approaches opened during a run join the same Thread immediately rather than flashing as a
separate legacy row. Configured participant names project into messages, live status, artifacts, and stop
receipts instead of exposing internal refs.

Implementation intent now opens or resumes a protected per-attempt worktree before the provider runs. The
Run links to `work:<codeWorkspace>` and records provider, repository, branch, and workspace lineage. Codex and
Claude command events are normalized into meaningful activity and separate command/verification receipts;
the conversation does not stream raw tool noise. Startup settles an unfinished provider turn as interrupted,
retains the workspace, and presents an explicit recovery path. A correction resumes the same exact work;
another approach creates a distinct attempt in the same Thread.

Runtime completion currently does not equal founder-ended work. The composer is **operational, not a
one-verb `/drive` box**: every scoped turn carries the exact `threadRef` and compatibility `betId` through
`replyInConversation`. Deterministic dialogue handles steer, participant-specific stop, participant
involvement, critique of returned work, same-thread independent attempts, approval surfacing, and explicit
thread close. Ambiguous participants or targets produce a founder question instead of starting or stopping
the wrong Run. Approval dialogue never executes an outward consequence; exact release/apply/deploy controls
remain inside the founder gate in the visual stage.

### Product-change and market-return mechanics

The current tree mechanically supports:

- isolated product-change worktrees;
- exact diff retention;
- a separate founder product-review approval before apply;
- wall-gated apply;
- native-code checkpoint review, apply/reverse apply, isolated commit, branch/PR preparation, restore, and
  discard, with exact source/checkpoint lineage and fail-closed drift checks;
- retained Product capability and release/distribution consequences for completed implementation;
- Gmail connection and wall-gated send plumbing;
- durable provider-event outcomes and honest unattributed outcomes;
- work and configuration lineage through outward acts and returns.

No live receipt in this document proves a real released email, returned reply, production deploy, paid spend,
destructive act, or attributable market result on the current tree.

### Current UI mechanics

The tree contains **one returning founder surface**: `FirmApp.tsx` reopens the last active
`VentureWorkspace`; `VenturePicker` is the first-venture/recovery connector, not a launch dashboard. The
earlier three-shell split (Now, immersive `?shell=world`, legacy `?shell=legacy`) is gone. Reusable mechanics
now composed inside the single workspace include:

- an in-workspace venture switcher with venture creation behind an explicit connector dialog;
- a continuous conversation feed and selection-scoped conversation projection;
- a mode-aware rail with return-value Work groups, Product / GTM scopes, and Release lifecycle groups;
- live artifact, before/after, flow, alternatives, evidence, and consequence chat projections;
- native coding attempt cards with participant, status, changed files, check summary, and same-Thread compare;
- the React Flow venture canvas with deterministic layout, founder placement, semantic zoom, operating
  lenses, dense clustering, focus traces, camera restoration, outline, and reduced-motion behavior;
- contextual product-change and native-code review with purpose-specific founder controls;
- return summaries, active-work receipts, runtime provenance, and exact work focus.

These are now composed into one surface with **one shared venture context across three founder jobs**. The
React Flow projection is primary in Product / GTM and remains available as thread material in Work; neither
form replaces canonical venture truth.

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
- product-change and native-code worktree isolation, tracked/untracked checkpoints, restart recovery,
  distinct attempts, exact apply/reverse, commit guards, nested test-repository support, restore, and discard;
- Gmail connection/send failure paths and outcome joins;
- Atlas projection, layout, density, outline, accessibility, camera, wall, return, and Workyard fixtures;
- Now component rendering, representation availability, composer receipts, and local callbacks;
- browser native coding with two attempts, failure/recovery, diff/check inspection, commit, and refresh;
  real Electron preload, PTY canonical-worktree resolution, preview scheme/isolation guards, signed review,
  full relaunch, and durable coding recovery.

Deterministic browser and fixture coverage proves rendering and interaction mechanics only. It does not
establish outside-founder comprehension, usefulness, real-world effects, causality, or market value.

The exact current command receipts are recorded once in **Mechanical baseline** above. The CI workflow now
declares the same complete gate; remote enforcement remains unproven until GitHub runs it on a pushed change.

## Known broken or incomplete paths

### Product composition

- The three presentation modes share one context and are mechanically complete as parallel lenses. Whether
  the hierarchy is immediately obvious to an outside founder remains a validation deferral, not a hidden
  implementation gap.
- Mode-owned rail bodies and contextual conversation are implemented and deterministic across desktop and
  narrow-width layouts. `Cmd/Ctrl+K` searches the current mode. Global cross-mode search remains a Phase C
  hypothesis until the direct loop is used live; no generalized resolver or focus stack is exposed.
- Product / GTM graph camera, selection, and scope restore through the v4 venture session. Its mode rail now
  exposes save, list, reopen, and confirmed delete for live views and snapshots.
- Exact thread targeting is carried through conversation replies and new Runs. Legacy bet-focused work
  remains reachable through non-destructive virtual threads.

### Canvas and model

- The canonical storage model is open. One hidden architecture compatibility projection still requires the
  legacy five roles; migration or removal is explicitly deferred because the active founder map neither
  exposes those roles nor needs a sixth role control.
- The active map surface is a generated operating graph with direct founder creation and editing through
  venture-scoped mutation adapters. Whole venture is the default; Product and Go-to-market are focused views
  that preserve their real cross-boundary support. Canonical relationships and existing structured
  references supply every connector. Release-scoped outcomes add projection-only tentative return curves to
  directly connected objects and cannot establish an interpretation. There is no separate diagram store,
  free placement, or invented connector data in this surface.
- The older full canvas remains compatibility code with no normal founder entry. Its removal is deferred
  until retained compatibility journeys can be retired without losing migration evidence.
- **Saved views/snapshots have a reachable founder lifecycle.** The Product / GTM rail saves the selected
  canonical path, lists live views and snapshots, reopens their exact references, and uses a confirmed second
  act before delete. Read-only mode keeps reopen available while visibly disabling mutation.
- Drag/placement belongs only to the hidden compatibility canvas. The active operating graph never writes
  placement and exposes no control that implies it does.
- The **generated-answer "Related context" trace is deterministic and promotes nothing to durable truth.**
  A prior version wrote the founder's *question* back as a "finding" — recording a question as a fact, a
  truth-model violation. That truth-promotion path is removed; the surface only rearranges to highlight
  existing relationships.
- **The compatibility canvas coordinator is split by stable responsibility.** `VentureCanvasStage` is 282
  lines and composes feature-local hooks for drag interpretation, revision application, dense-node
  presentation, and selection/keyboard behavior. The generated-map unit suite and all three Atlas browser
  journeys prove the split preserved the existing surface.

### Conversation and runs

- New founder-authorized drives now have a durable venture root plus persistent child direction Threads;
  legacy root-joined Runs are intentionally not backfilled. The venture-outline path carries a selected
  betless child `threadRef` end to end; other legacy selection paths may still lack exact Thread identity.
- The dialogue reply route is the desktop composer's sole submission path. It handles new direction,
  steer, observe, participant-specific stop/involvement, critique, parallel attempts, approval surfacing,
  and explicit close without switching product modes.
- **Compatibility-canvas undo/redo is not durable venture history.** It remains session-scoped and
  nontransactional, but has no shipped founder control. The active graph uses direct founder mutation and
  explicit removal; transactional compatibility history is deferred unless that canvas returns.
- The agent/MCP `/drive` fresh-start gap is **closed (Phase 2)**: an agent-stamped drive with no bet lineage
  is refused; only a founder starts fresh work.
- Participant composition is directed in chat; all active participants in the selected Thread are visible
  in the header and their latest inline activity.
- Brain Run receipts, provider sessions, coding-workspace settlement, the Electron PTY bridge, and Work's
  terminal header now share `completed`, `failed`, and `cancelled`; agent-only terminals retain `paused`,
  `budget-exhausted`, and `interrupted`. Raw exit codes and signals remain receipts. Older retained `stopped`
  UI values render as `cancelled` without rewriting founder data. Founder-ended work, outward execution, and
  returned evidence remain distinct consequences rather than being flattened into Run terminals.
- Outcome-contract workflows are not implemented and no control claims they are. A generalized workflow or
  scheduler remains deliberately deferred until repeated use of the direct release loop proves a need.
- Selected-thread timelines and relevant index facets revalidate from the venture SSE stream. A slower
  reconnect/offline poll preserves the last coherent read; it is not the normal five-request 1.2-second
  path.

### Consequences

Repaired brain-side in Phase 3 (verified: 710 brain + 49 security-matrix green):

- Product-change release now refuses a revision that was not separately founder-reviewed+approved
  (`product_change_not_approved` thrown before any status flip); a failed apply no longer self-approves.
- Deploy has a shipped provider-agnostic executor. At park time Drover resolves the named or conventional
  `package.json` deploy script from the bound venture repository and host-stamps its exact command,
  definition, destination, and digest. After the unchanged two founder acts, execution re-verifies that
  contract and runs it in the exact repository; missing or changed contracts fail closed and stay queued.
- A failed message/deploy transport is persisted on the still-queued wall item
  (`lastExecutionError`/`needsReconnect`/`lastAttemptAt`) and thrown as `wall_release_execution_failed` (502);
  a genuine later success clears those markers and stamps `releasedAt` exactly once.
- The shipped Work and Releases gates render the consequence-specific failure as **Nothing was sent**,
  **Nothing was deployed**, or **Nothing was applied**, preserve the exact transport error, and keep the
  matching retry on the same undecided action. `needsReconnect` adds a
  working **Reconnect Gmail** affordance that opens the existing OAuth replacement form; successful OAuth
  replacement leaves the action for a fresh explicit founder retry rather than sending automatically.
- A standing grant no longer claims "Sending" without sending: it skips the *wait*, not the *release* — the
  act parks honestly (`sent:false`) and the founder still performs the release. The wall release capability
  is minted only inside `wall.decide()`.

Closed consequence follow-ups:

- `executeProductChange` now returns `{ok:false}` through the persist-failure path instead of throwing past
  it, preserving the exact error on the queued item.
- Startup recovery returns an interrupted product-change revision from `applying` to its approved retryable
  state rather than leaving it permanently stuck.
- `preAuthorizedGrantId` is stripped from parker-controlled effect content and stamped only by the host.
- Venture work-loop serialization occurs before the allowance read, so concurrent drives cannot oversubscribe
  the remaining daily budget.

Explicit authority deferral:

- **Grant true auto-send is a deliberate product/authority decision, not a bug.** A background drive holds no
  live founder request and cannot obtain the founder capability, so a grant cannot ship a real send in-spec.
  If auto-send is actually wanted, it needs a new host-authority path — surfaced for Jacob, not smuggled in.

### Engineering

- The anti-cage file-count threshold remains coarse technical debt. Tightening it is deferred until the next
  measured architecture boundary so an arbitrary threshold does not force churn.
- The production vendor bundle exceeds the current warning threshold. Optimization is deferred until runtime
  profiling identifies a founder-visible load or memory cost.
- The current arm64 app bundle and DMG are locally built, launched, integrity-checked, and covered by the
  acceptance gate. Developer ID signing, notarization, public hosting, clean-machine installation, upgrade,
  and rollback remain external distribution work requiring founder-owned credentials and decisions.

## Unproven

Mechanically closed in the current tree: the canonical model joins Product / GTM, conversation, Runs, exact
work, decisions, release evidence, and saved views; venture conversation has a durable root and persistent
child Threads; and work-loop serialization makes concurrent budget enforcement hard rather than advisory.

The following still lack sufficient live or human receipts:

- semantic zoom over exact work, evidence, and provenance is explicitly deferred until a real release returns
  attributable evidence into next Work; the current structure zoom remains implemented evidence, not an
  adopted capacity-layer direction;
- a real provider pass that independently selects and completes a second participant contribution;
- a real released send and returned reply;
- a live attributable market result changing founder-adopted venture understanding and next work (the
  deterministic outcome projection and exact Work handoff are proven; no live Gmail return was performed);
- cross-machine import with destination repository rebind (export/import and same-machine rebind mechanics
  are proven; a second physical machine is not);
- an outside founder completing the Product/go-to-market loop without a walkthrough;
- repeated use proving the canvas stays legible without manual grooming;
- a Developer ID-signed, notarized, publicly hosted package and its clean-machine install, upgrade, and
  rollback receipts.

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
- **canvas/workbench primacy** — **migrated.** The tree opens on the restored founder mode. Work uses
  conversation plus deliberate visuals; Product / GTM uses the canonical graph projection; Releases uses
  its joined release read model. None is a second authority or competing navigation root.

Remaining behaviors may persist temporarily as compatibility seams while the approved migration preserves
current user data and capability parity. They must not be promoted in current product copy or future
implementation.
