# Current project state

Last audited: 2026-08-05
Code baseline: Croki 0.4.7 UI history foundation on `croki/main`

Croki is Jacob's current ADE and daily development environment. The product is
a narrow Croki overlay on Croki rather than a second agent runtime.

Croki 0.4.7 is the current repository version; 0.4.5 remains the latest
published baseline inherited by it. See the [0.4.6 release
notes](./release-notes-0.4.6.md), [0.4.7 UI history
plan](./release-notes-0.4.7.md), [0.4.8 application awareness
plan](./release-notes-0.4.8.md), and [release ownership contract](../operations/release.md)
for independently gated publication destinations.

## Working product

Croki currently provides:

- durable projects, threads, messages, activities, and checkpoints;
- native project and worktree execution with Git diff, restore, commit, push,
  and pull-request paths;
- terminal, files, preview, plans, approvals, project scripts, and recovery;
- web, Electron desktop, and mobile clients;
- multiple configured instances of Codex, Claude, Cursor, Grok Build,
  OpenCode, and OpenClaw;
- OpenClaw instances can connect to any agent already configured in the user's
  Gateway. Croki stores the selected agent identity and preserves that agent's
  workspace, memory, skills, model, tools, and delegation settings; it does not
  provision or replace an agent.
- local and remote environment connection paths, including desktop-managed SSH
  and Croki Connect compatibility infrastructure;
- Croki branding and completion feedback;
- optional repository-owned application lineage at `.croki/application.croki`,
  which joins inherited released reality with the version currently being built;
- the true Canvas / Croki Senses projection established by the 0.4.2 migration.

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

The 0.4.8 foundation gives native providers with Croki MCP one read-only
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

`.croki/application.croki` is the active founder-approved product and GTM
inheritance boundary. It records released reality and the version being built;
Canvas may eventually project that lineage, but does not own or maintain it.
The previous `.croki/context.json` Release, Context, and agent-authored Artifact
specifications are historical migration notes. They are not provider context or
the active application model.

## Application lineage

Croki 0.4.6 begins application-aware development. When
`.croki/application.croki` exists, the Thread header shows the
released-to-building transition beside the selected project and every provider
turn receives the same bounded factual product and GTM lineage. The stored user
message remains unchanged, native provider behavior remains the default, and
malformed or absent lineage never blocks a turn.

The file belongs to the canonical project root and therefore applies across
native worktrees. Git tags, hosted release URLs, and repository files can be
recorded as provenance, but no Git remote or GitHub account is required. An
empty project without lineage shows no negative context state. The project
header offers **Set application direction** instead. Its popup prepares
application identity and the current version from a root `package.json`,
`pyproject.toml`, or `Cargo.toml`; a manifest description or recent project
Thread titles supply a proposed building intent. The founder reviews the
proposal and either confirms it or sends it into the current Thread under the
Product behavior for evidence-backed revision. That action selects Product and
focuses the composer without importing a generated prompt; the founder's own
comment remains the request. Croki then creates
`.croki/application.croki`; the write requires the file to remain
absent and never releases, tags, publishes, or changes provider behavior.

Product is the only behavior offered for ideation. It combines product, GTM,
and Venture concerns into one founder-judgment turn. Historical Venture and
split GTM turn metadata remains readable. A founder comment may become a
proposed application-direction delta in the Thread; only explicit confirmation
makes that proposal durable project truth.

Application Sense now has four first-class `.croki` boundaries: Venture,
Application, Release, and Concept. An Application can reference its active
`.croki/releases/<version>.croki` transition and optional
`.croki/venture.croki` parent. The server freshly validates and bounds both
before provider turns. The ADE opens all four kinds as generated visual worlds;
Release is a before-and-after shipping story and Venture is a restrained
portfolio view. Raw source remains available on demand. Supporting evidence,
relationships, Product and GTM lenses, Threads, worktrees, screenshots, plans,
and prompts do not become more object kinds.

Before each provider turn, Croki also derives a bounded project-activity
snapshot from durable Thread projections. It includes at most five sibling
Threads with their title, current state, branch, and latest checkpoint files,
plus exact file overlaps with the invoking Thread. This observed activity is
explicitly distinct from founder-approved application direction. Snapshot
failure never blocks the turn, and sibling message bodies or private reasoning
are never copied into provider context.

Application Sense now includes scoped Concepts. From an application-aware
Thread, **Explore separately** creates one
`.croki/concepts/<id>.croki` object and prepares a worktree Thread on
`croki/concept/<id>`. The active Concept appears as a breadcrumb beside the
application transition. Its popover exposes intent, parent versions, branch,
integration-review state, and archive control.

Concept files are discovered individually and remain self-describing; the
implementation deliberately has no central index. A Concept turn gets
only its matching bounded scope plus application reality and relevant sibling
Thread activity. Creating or requesting integration never rewrites
`.croki/application.croki`, and no generated Concept prompt is inserted into the
composer. Portable `.croki` packaging remains a later transport for this same
object model rather than a second schema.

Croki derives a bounded application-progress view from the project's existing
Thread, activity, runtime, review, and checkpoint perception. The composer
shows verified, reported, and invalidated observations beside the released-to-
building transition, and native provider turns receive the same explicitly
non-authoritative evidence. This view is disposable and provenance-preserving;
it does not write `.croki/application.json`, create another project database,
or promote agent reports into founder-approved truth.

`Prepare release lineage` carries that evidence into the current native
Thread. The selected provider inspects the canonical application file, Git
history, tests, previews, source Threads, and release notes, then proposes
ordinary repository edits through Review. Release truth therefore stays an
explicit founder-visible Git change while daily progress requires no manual
lineage maintenance.

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

- Venture evidence now has a typed observation and provenance boundary, but
  source adapters for customer conversations, analytics, CRM, campaigns, and
  market research have not landed yet.
- Parallel Threads is implemented behind a default-off Settings → Beta toggle
  for the planned 0.4.4 release. It reuses provider-native delegation and the
  parent Thread's existing Workstreams projection; provider support therefore
  depends on the selected runtime exposing native workers. Once real child
  Threads exist, the founder can persist either nested read-only worker chats
  or bounded inline Workstreams on the parent. The two presentations are
  mutually exclusive and worker transcripts remain owned by the children.
- Legacy Release, Context, and Artifact code remains only for compatibility
  reads and historical receipts; the composer and provider runtime use
  application lineage instead.
- Application progress is a bounded current evidence sample rather than a
  complete historical ledger. Reported observations remain unverified until a
  stronger project source supports them, and release promotion still requires
  the normal native Thread and Review path.
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
