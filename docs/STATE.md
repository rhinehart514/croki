# STATE — Drover

**Stage:** alpha. **Updated:** 2026-07-19.
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

### Implemented correction — chat is the center, visuals open beside it

The shipped shell is now a thread rail, persistent chat, and optional visual stage. Product and
Go-to-market remain canonical model territories but are not permanent rail taxonomy. Preview, diff, flow,
comparison, evidence, consequence, and map material opens beside the current conversation without creating
a route or product mode. Chat stays mounted, keeps its draft and per-thread scroll, and regains focus when
the stage closes.

`workspace/VentureWorkspace.tsx` is now only the stable app boundary around feature-local `ThreadShell`.
The retired `Workbench`, `VentureHome`, `WorkNarrative`, `WorkspaceIndex`, `WorkspaceOutline`, and
`ventureOutlineModel` implementations and tests are deleted. The remaining older canvas is a tested
compatibility seam with no normal product entrypoint.

The detailed laws and compatibility boundaries live in `FIRM-SPEC.md`; experience behavior lives in root
`DESIGN.md`.

## Verified current behavior — observed on this working tree

### Mechanical baseline

On 2026-07-19, the complete local readiness checks passed against this working tree:

- `npm test`: Brain **802/802** and UI **464/464**, with lint and the production build green;
- design-token parity: **161 tokens** across **24 CSS files** and **34 extensions**;
- firm browser acceptance: **5/5**;
- Atlas browser journeys: **3/3**.

The browser journeys exercise the thread rail and permanent chat at rest; inline evidence and consequence
material; exact founder controls; generated Whole system, Product, and Go-to-market graphs inside the
visual stage; explicit graph-to-thread handoff; `Esc` stage close; keyboard reachability; 120-node
containment; venture isolation; zoom; and offline last-coherent reads. Manual collaborative-browser checks
also verified the two-column shell at 1440×900 and the chat/stage split at effective widths 900×800 and
720×450 (200% zoom equivalent).

This is a **local receipt only**. **There is no CI workflow** — the repository has no `.github/workflows`,
so nothing reruns this suite or the acceptance gate automatically. The browser is a deterministic harness,
not a production surface. There is no packaged Electron end-to-end journey; the Electron receipt covers
window-state helpers only. No test above proves live provider behavior, world-touching effects,
outside-founder comprehension, or market value. Every count must be re-earned by hand after a change.

A manual Electron dogfood pass also used the real configured provider against the Drover venture. It
verified that a new direction returns control to the composer in under a second, live work shows a named
participant, meaningful activity, and elapsed time, a structured flow returns inline and opens beside the
still-mounted chat, a founder can stop that exact participant through chat without closing the Thread, and
“Check for returned evidence and replies” invokes the read-only market-return path in the same conversation.
This is observed local behavior, not a packaged automation receipt or proof of an external market return.

### Chat-first ADE — the default founder surface; generated maps are summoned

`FirmApp.tsx` resolves the launch boundary before rendering a founder surface: an existing installation
reopens the last active venture (or the newest connected venture when no return preference exists), while a
first installation with no venture reaches `VenturePicker`. There are **no `?shell=` flags, no competing
shell roots, and no query-parameter product switching** — the venture workspace is the only returning
founder surface. The prior immersive/Now/legacy shells were deleted from the tree (see "Removed surfaces").

The workspace opens on `ThreadShell`: a resizable 240px thread rail and chat using the rest of the frame.
The rail contains venture switching, local-only New thread, search, explicit pins, open Threads, aggregate
agent attention, grouped History, and Settings. Product/GTM objects are absent from permanent navigation.
The venture root timeline projects a truthful "Since you left" return summary and up to three current
review actions. New threads become durable only on first send.

The optional visual stage opens beside the selected thread and is presentation state only. `VentureMaps`
is registered as `kind: "map"`; selection inside it stays local until the founder explicitly chooses Open
work. Pan, zoom, and fit remain presentation only, nodes are not draggable, and the graph is never a second
source of truth. `VentureWorkspace.test.tsx` proves the default shell, no ontology folders, local draft
creation, stage open without chat unmount, `Esc` focus return, and safe migration of an old map-mode session.

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
  grants, placement, and settings;
- repository truth reading and isolated product-change worktrees;
- stable attached-work identity and work references through wall items and returned outcomes;
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

Reply capture now has an explicit founder-invoked production home: a founder can ask the current chat to
check replies or returned evidence. `conversation/reply` calls the read-only `pollReplies`, reports an
honest no-op when nothing has been released or connected, and lets the existing outcome path dedupe and join
real provider evidence. Nothing polls on a timer and no read grants outward authority.

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

The desktop composer sends every root, draft, and existing-thread turn through `conversation/reply` with
the exact selected `threadRef` when one exists. New directions are accepted with `202` before provider
completion, so the composer remains usable while the run continues. Active beats expose meaningful work and
elapsed time. Approaches opened during a run join the same Thread immediately rather than flashing as a
separate legacy row. Configured participant names project into messages, live status, artifacts, and stop
receipts instead of exposing internal refs.

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
- a thread-only rail with cross-message/artifact/evidence/decision search and needs-you attention;
- live artifact, before/after, flow, alternatives, evidence, and consequence chat projections;
- the React Flow venture canvas with deterministic layout, founder placement, semantic zoom, operating
  lenses, dense clustering, focus traces, camera restoration, outline, and reduced-motion behavior;
- contextual product-change review and purpose-specific wall controls;
- return summaries, active-work receipts, runtime provenance, and exact work focus.

These are now composed into one surface with **chat as the center and visuals as an optional sidecar**.
The React Flow Atlas projection remains the graph substrate behind a visual-stage map; it never replaces
the conversation.

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

The exact current command receipts are recorded once in **Mechanical baseline** above. They are local-only:
there is no CI workflow, so the readiness gate is not enforced automatically and must be rerun by hand after
any change.

## Known broken or incomplete paths

### Product composition

- The shipped tree is **chat-first**: one `VentureWorkspace` boundary renders `ThreadShell`, whose permanent
  surfaces are the thread rail and conversation. A visual stage is optional and never becomes a mode.
- Product and Go-to-market stay connected in canonical system memory, search, consequences, and map
  projection. They are deliberately absent as permanent navigation folders.
- Search covers thread titles, referenced messages, staged artifact titles/bodies, evidence/outcomes, and
  decisions. Search results reopen the owning thread and can open the matched material beside chat.
- Exact thread targeting is carried through conversation replies and new Runs. Legacy bet-focused work
  remains reachable through non-destructive virtual threads.

### Canvas and model

- The canonical storage model is open, but its shipped architecture compatibility projection still requires
  the legacy five roles.
- The active map surface is a generated, read-only operating graph. Whole system is the default; Product
  and Go-to-market are focused views that preserve their real cross-boundary support. Canonical
  relationships and existing structured references supply every connector. There is no separate diagram
  store, free placement, or invented connector data in this surface.
- The older full canvas remains compatibility code, not the normal map-mode UI. Its persistence, saved-view,
  and coordinator caveats below still apply if that surface is restored or reused.
- **Saved views/snapshots are write-only in the UI.** The backend (`views-store.mjs` / `view-routes.mjs`)
  supports save, list, reopen, and delete; the founder surface only saves/captures — it renders **no**
  list, reopen, or delete affordance, so a saved view cannot be reached again.
- In the older compatibility canvas, nodes are founder-draggable and placement is founder-owned (nodes lock
  only while a lens or generated-answer overlay is active, and for group/intent nodes). The active operating
  graph never writes placement.
- The **generated-answer "Related context" trace is deterministic and promotes nothing to durable truth.**
  A prior version wrote the founder's *question* back as a "finding" — recording a question as a fact, a
  truth-model violation. That truth-promotion path is removed; the surface only rearranges to highlight
  existing relationships.
- **`VentureCanvasStage` is a large second-order coordinator** — it owns projection, placement, bands,
  lenses, views, mutation, revision, interpretation, clustering, selection, keyboard, and outline in one
  component. Splitting it by stable responsibility is owed.

### Conversation and runs

- New founder-authorized drives now have a durable venture root plus persistent child direction Threads;
  legacy root-joined Runs are intentionally not backfilled. The venture-outline path carries a selected
  betless child `threadRef` end to end; other legacy selection paths may still lack exact Thread identity.
- The dialogue reply route is the desktop composer's sole submission path. It handles new direction,
  steer, observe, participant-specific stop/involvement, critique, parallel attempts, approval surfacing,
  and explicit close without switching product modes.
- **Undo/redo is not durable venture history.** It is session-scoped, capped, on a 30-minute TTL, and not
  transactional — the stack moves before the mutation confirms, so a rejected write can leave the visible
  history out of step with persisted truth.
- The agent/MCP `/drive` fresh-start gap is **closed (Phase 2)**: an agent-stamped drive with no bet lineage
  is refused; only a founder starts fresh work.
- Participant composition is directed in chat; all active participants in the selected Thread are visible
  in the header and their latest inline activity.
- The brain work-index projection distinguishes runtime terminals (`completed`, `failed`, `cancelled`,
  `paused`, `budget-exhausted`, `interrupted`), but founder-ended work, external execution, returned evidence,
  and the current UI projection are not yet unified on those semantics.
- Outcome-contract workflows are not implemented.
- Selected-thread timelines and relevant index facets revalidate from the venture SSE stream. A slower
  reconnect/offline poll preserves the last coherent read; it is not the normal five-request 1.2-second
  path.

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
- **canvas/workbench primacy** — **migrated.** The tree now opens on persistent chat and summons visual
  material into a side stage; `FIRM-SPEC` and `DESIGN` describe that hierarchy, and deterministic browser
  journeys assert it.

Remaining behaviors may persist temporarily as compatibility seams while the approved migration preserves
current user data and capability parity. They must not be promoted in current product copy or future
implementation.
