# Current project state

Last audited: 2026-08-05
Code baseline: Croki 0.4.7 UI history foundation on `croki/main`

Croki is Jacob's current ADE and daily development environment. The product is
a narrow application-aware overlay on the development environment rather than
a second agent runtime.

Croki 0.4.7 is the current repository version; 0.4.5 remains the latest
published baseline inherited by it. See the [0.4.6 release
notes](./release-notes-0.4.6.md), [0.4.7 UI history
plan](./release-notes-0.4.7.md), [0.4.8 quality-of-life
plan](./release-notes-0.4.8.md), [0.4.9 control without interruption
plan](./release-notes-0.4.9.md), [0.4.10 durable outcomes and review
plan](./release-notes-0.4.10.md), and [release ownership contract](../operations/release.md)
for independently gated publication destinations.

## Working product

Croki currently provides:

- durable projects, threads, messages, activities, and checkpoints;
- recoverable desktop renderer crashes reopen the last verified Croki screen and explain which server-owned work stayed attached, which saved drafts remain available, and which browser-only state reset. Full desktop process exits make no runtime-survival promise;
- native project and worktree execution with Git diff, restore, commit, push,
  and pull-request paths;
- terminal, files, preview, plans, approvals, project scripts, and recovery;
- Codex-native guidance into an exact running turn, with durable sent messages
  and explicit pending, delivered, failed, or unconfirmed delivery state;
- web, Electron desktop, and mobile clients;
- multiple configured instances of Codex, Claude, Cursor, Grok Build,
  OpenCode, and OpenClaw;
- Codex Threads can explicitly run to one durable outcome with a visible native
  goal, optional token budget, pause, resume, and clear controls;
- OpenClaw instances can connect to any agent already configured in the user's
  Gateway. Croki stores the selected agent identity and preserves that agent's
  workspace, memory, skills, model, tools, and delegation settings; it does not
  provision or replace an agent.
- local and remote environment connection paths, including desktop-managed SSH
  and Croki Connect compatibility infrastructure;
- rollback-safe automatic updates for launcher-managed Linux servers, with
  exact-version package staging, database snapshots around migration trials,
  correlated reconnect outcomes, and automatic return to the previous server
  when a trial cannot prepare;
- matching server-update actions on web, desktop, and mobile. Mobile OTA checks
  remain disabled unless a non-inherited `CROKI_EAS_PROJECT_ID` is supplied;
- Croki branding and completion feedback;
- one repository-owned application brief at `.croki/application.croki`, carried
  as bounded direction into project Threads;
- the true Canvas / Croki Senses projection established by the 0.4.2 migration.

## 0.4.8 boundary

0.4.8 is a quality-of-life patch over 0.4.7 focused on finding and resuming the
right work without reconstructing it. Project and conversation retrieval,
durable Thread titles, bounded catch-up, renderer recovery, and pull-request
continuity strengthen the existing project and Thread model. `.croki` collapses
to one application brief and one compact released-to-building focus in the
Thread header. The setup action, progress model, Concept workflow, generated
object views, and automatic panel expansion disappear. The brief opens as
ordinary source and remains bounded direction for project Threads. The patch
does not add another application-awareness layer, prompt surface, `.croki`
kind, or future product-direction commitment. Preview also returns to one job:
opening and checking a running app. Its component catalog, idea form,
alternatives flow, and Beta setting disappear while checked-screen history
remains.

## Planned 0.4.9 and 0.4.10 boundaries

0.4.9 continues the 0.4.8 continuity story: guide an active Codex turn, route
only unresolved founder judgment into existing navigation, recover honestly
after renderer failure, and branch an earlier Codex instruction without
rewriting either the source Thread or current files. It adds no inbox, task
system, provider-neutral steering loop, or combined conversation/filesystem
undo.

0.4.10 is the deliberate expansion release: an explicit native Codex goal can
continue one Thread to a durable outcome, and a native detached Codex review can
challenge a concrete change set in a read-only child Thread. Neither behavior
is imitated for unsupported providers, and neither creates a Croki-owned agent
runtime or second canonical conversation.

## UI history

Croki 0.4.7 preserves successful model-driven Preview snapshots as checked
screens in the originating Thread. Each entry keeps the exact image and bounded
page evidence, and the read-only `ui_history` model tool can list or reopen it
in a later turn. Preview projects recent checked screens under **UI history**;
there is no separate authored history database or design workflow.

Likely user-visible turns now also receive one compact result after the answer.
Same-turn snapshots collapse into **Checked _n_ screens** and open as a gallery;
visible checkpoint files without a snapshot say **Not checked**; nonvisual turns
add nothing. This receipt is derived from Croki-owned evidence and stays visible
when turn internals fold. It proves only that those screens were captured during
the turn, not complete design, flow, accessibility, breakpoint, or production
coverage.

UI history currently records individual screens. It does not yet compare
checkpoints, connect action sequences into checked flows, discover missing
states, sweep responsive widths, or import production behavior. Capture and the
founder-facing history control currently share Preview's desktop-only boundary.
Images follow Thread attachment cleanup, but rolling retention and
deduplication are not yet needed or implemented for explicit model checks.

## Application awareness

The 0.4.7 application foundation gives native providers with Croki MCP one read-only
`application_observe` frame: project-declared direction, the invoking Thread's
branch/worktree and latest checkpoint files, project-wide checked screens, and
bounded Senses evidence. Every screen is qualified by source Thread and screen
id so forked observations cannot resolve ambiguously. A model may select a
baseline and target screen for factual diagnostic deltas, then reopen either
exact PNG with `application_screen`.

Croki does not author the product conclusion. Approval of the current direction
file is explicitly unverified at read time, observed evidence stays separate
from declaration, and missing or stale coverage remains visible. The provider
uses its native reasoning and repository tools to judge user responsibility and
mission continuity.

MCP-backed application observation is not available to OpenClaw's current ACP
bridge or external OpenCode sessions. Those paths still receive bounded
application lineage and retain native file/Git inspection, but cannot yet reopen
project-wide checked screens through this capability.

Provider support means that an adapter and product surface exist. A provider is
ready only when its required local CLI, authentication, model access, and
supporting process are available. OpenClaw additionally requires a running
Gateway and configured agent.

## Venture evidence and Croki Senses

Canvas presentation is on the back burner after 0.4.3. The active foundation
is provider-neutral venture evidence carried through ordinary Thread activity
and inspected through Croki Senses. Product behavior, customer language, market
signals, and distribution results share one bounded observation envelope with
source provenance, confidence, read-only authority, and explicit separation
from founder-approved canon.

Source adapters may observe evidence; Threads may investigate and compare it;
neither action promotes an inference into `.croki/application.croki`. Raw customer
transcripts, private adapter payloads, and connector-specific data do not enter
the perception packet. Consequential GTM writes remain outside Senses and still
require native tools and explicit authority.

## Canvas and Croki Senses

The 0.4.2 pivot established Canvas as one zero-maintenance projection of Croki
Senses. Senses are the durable direction; Canvas is an optional human-readable
projection of that activity and is not the active expansion surface. It is not
a release board, context editor, artifact authoring surface, workflow runtime,
memory database, or coordination dashboard.

A Perception Frame is one hybrid observation/delta packet. It can include
rendered pixels, semantic objects, relationships, provenance, confidence,
available affordances, and changes since the previous frame. The model can
refresh or narrow its attention, inspect causal neighbors, compare a possible
future, or wait for a meaningful change. Canvas stays current without a founder
or agent manually authoring nodes, edges, release items, or a scene.

The initial capabilities are `sense_status`, `sense_observe`, `sense_inspect`,
and `sense_wait`; these
give models more perception and control over context rather than constraining
their reasoning to a fixed Canvas schema. External writes, destructive actions,
expensive operations, sensitive data, and production changes still pass through
native Threads, tools, approvals, and authority checks.

Sense calls are read-only and return frames directly. Canvas derives the same
frame from ordinary Thread activity, so neither models nor founders maintain a
second activity stream or scene.

Canvas compresses project activity for a founder: one current outcome, up to
three semantic conclusions drawn across sibling Threads, one judgment or
blocker, and collapsed source evidence. The server derives this project model
on demand from durable Thread projections, so it survives restart without a
second cache or startup rebuild. Raw commands, context-window updates,
checkpoints, and receipts remain inspectable without filling the field with
runtime telemetry. Every visible object retains source-Thread provenance.

Canvas owns the workspace as soon as it opens on desktop and narrow widths.
Founder judgments come before passive context, a single source Thread collapses
to provenance, and `Address in Thread` acts directly from the object without
first opening an inspector.

The founder can choose `Address in Thread` directly on any meaningful object.
Croki focuses the native composer and carries only stable sensed IDs into the
sent turn; the provider can inspect their sources through read-only Senses.
Canvas never injects bodies, grants authority, or changes provider behavior.
Failed sends preserve the focus and successful turn starts clear it.

`.croki/application.croki` is the single repository-owned application brief.
It remains bounded, founder-approved direction and never becomes Canvas state.
Normal files, Git, and Review own its changes.
The previous `.croki/context.json` Release, Context, and agent-authored Artifact
specifications are historical migration notes. They are not provider context or
the active application model.

## Application context

Croki 0.4.6 and 0.4.7 introduced repository-owned application lineage and
Application, Concept, Release, and Venture schemas. 0.4.8 keeps the useful
center and removes the hierarchy: `.croki/application.croki` is the only active
application brief. The Thread header presents one compact released-to-building
focus with a direct path to its source. Croki has no `.croki` setup form,
progress model, Concept worktree action, or generated object representation. A
`.croki` file opens in the same editor and panel size as any other project file.

The server bounds and validates the brief before treating it as factual project
direction. Malformed, absent, unsupported, or oversized data fails open, the
stored user message remains unchanged, and native provider behavior remains the
default. Product remains an optional Composer behavior, not a metadata
maintenance flow.

Before each provider turn, Croki also derives a bounded project-activity
snapshot from durable Thread projections. It includes at most five sibling
Threads with their title, current state, branch, and latest checkpoint files,
plus exact file overlaps with the invoking Thread. This observed activity is
explicitly distinct from founder-approved application direction. Snapshot
failure never blocks the turn, and sibling message bodies or private reasoning
are never copied into provider context.

Historical Concept, Release, and Venture parsers remain only to keep older
repositories readable. They are not active navigation, ideation, release, or
portfolio objects.

## Selected native-provider rule

The default Croki experience must preserve each provider's native behavior.
Croki-specific personas, planning loops, delegation policies, tool policies,
and behavioral prompts are never implicit. An explicit harness may be requested
for a turn or thread, but Canvas and Croki Senses never require one and never
silently change one. Any harness is visible, scoped, reversible, and unable to
modify founder-approved project truth.

Runtime, context, tools, and harnesses are separate:

- the provider runtime performs the work;
- context supplies visible facts and constraints;
- tools expose actions;
- a harness deliberately changes how an agent approaches a task.

Canvas is the projection of sense activity, not a harness. The web composer
remains native by default; opening, closing, selecting, or arranging Canvas
never changes provider behavior or grants authority. OpenClaw follows the same
rule: Croki passes prompts through ACP without a persona, delegation policy,
model requirement, or forced reasoning mode. The selected OpenClaw agent remains
user-owned and native; Croki never asks it to use a Croki-owned workspace,
memory, skills, or model.

## Known implementation gaps

- Hosted web, production mobile, and other package-backed server update paths
  remain intentionally unavailable until Croki-owned npm, EAS, and hosting
  credentials are configured. Their release gates require the exact
  `croki-server` version to publish first. GitHub-only desktop releases are
  independent: the desktop app updates its bundled server while remote package
  update actions are compiled out. Signed desktop distribution remains
  unavailable until Croki-owned signing credentials are configured.
- Parallel Threads is implemented behind a default-off Settings → Beta toggle
  for the planned 0.4.4 release. It reuses provider-native delegation and the
  parent Thread's existing Workstreams projection; provider support therefore
  depends on the selected runtime exposing native workers. Once real child
  Threads exist, the founder can persist either nested read-only worker chats
  or bounded inline Workstreams on the parent. The two presentations are
  mutually exclusive and worker transcripts remain owned by the children.
- Historical `.croki` scope schemas and legacy Canvas objects remain only for
  compatibility reads and old receipts. The application brief remains active.
- Additional native senses can expand beyond the initial Thread, preview,
  checkpoint, approval, and runtime sources without changing the frame model.
- UI history preserves individual model snapshots, but checked-flow timelines,
  semantic visual comparison, state discovery, responsive sweeps,
  accessibility embodiment, and production-behavior adapters remain planned.
- Production releases, Croki CLI publication, Croki-owned relay and web
  destinations, signing, and mobile production deployment remain disabled by
  ownership guards.
- Remote self-update and copied CLI launch commands still target the local
  `croki-server@<version>` package. They are not Croki release paths until the
  CLI package and publication destination are configured under Croki ownership.
- Several deep subsystem documents originated upstream. Compatibility names are
  intentional, but any instructions that publish to inherited T3 destinations
  are reference material rather than active Croki operations.

## Repository and release contract

- `main` mirrors `upstream/main`.
- `croki/main` carries the Croki overlay and is the active product branch.
- Production release jobs validate destinations independently. A GitHub-only
  release may target `rhinehart514/croki` on `croki/main`; CLI, relay, web,
  signing, Discord, and mobile destinations remain skipped until their specific
  flags and Croki-owned configuration are enabled.
- Pushes to `croki/main` build unsigned macOS arm64 and Windows x64 installer
  artifacts. A tagged GitHub release is the enabled 0.4.3 publication path.

## Verification

Run the Croki boundary after Croki changes:

```sh
npm run check:croki
```

Run focused tests for each touched owner. Before syncing upstream, report the
overlay against the exact reviewed upstream commit:

```sh
npm run report:croki-overlay -- --base <known-upstream-sha>
```
