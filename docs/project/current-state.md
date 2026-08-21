# Current project state

Last audited: 2026-08-21
Code baseline: Croki 0.4.14 source candidate, rebuilt on T3 Code `be7d35aa`

Croki is Jacob's current ADE and daily development environment. The product is
a narrow application-aware overlay on the development environment rather than
a second agent runtime.

Croki 0.4.14 is the current repository source candidate; 0.4.13 remains the
stable release until the candidate is published. See the [0.4.6 release
notes](./release-notes-0.4.6.md), [0.4.7 UI history
notes](./release-notes-0.4.7.md), [0.4.8 quality-of-life
notes](./release-notes-0.4.8.md), [0.4.9 control without interruption
notes](./release-notes-0.4.9.md), [0.4.10 native-provider integration
notes](./release-notes-0.4.10.md), [0.4.11 Thought Views candidate](./release-notes-0.4.11.md), [0.4.12 T3 sync notes](./release-notes-0.4.12.md), [0.4.13 branding correction](./release-notes-0.4.13.md), [0.4.14 foundation refresh](./release-notes-0.4.14.md), and [release ownership contract](../operations/release.md)
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
- T3-derived Codex collaboration-mode instructions that identify the Croki
  runtime, explain product-native Preview routing, and preserve the real
  `request_user_input` availability boundary without adding a task workflow;
- one repository-owned application brief at `.croki/application.croki`, visible
  to the founder and attached to a model only through an explicit user action;
- source-grounded Croki Senses perception, now rendered as automatic inline Views when it materially improves a Thread question.

## 0.4.14 boundary

0.4.14 rebuilds the Croki overlay from T3 Code `be7d35aa`, rather than layering
another long conflict-resolution merge onto the 0.4.13 tree. The archived
pre-refresh commit remains available at
`archive/pre-0.4.14-t3-refresh-2026-08-21` for audit and recovery.

The refresh carries forward Croki's installed-state compatibility, branding,
provider additions, application brief, Thread-native Views, release ownership,
desktop updater, and mobile identity. It also adopts current T3 behavior for
skill discovery, compact tool activity, attached composer drawers, unified
workspace navigation, provider-session reconciliation, stream following,
Preview rendering performance, and the intervening reliability fixes.

## 0.4.13 boundary

0.4.13 restores the canonical Croki mark and name to the persistent sidebar
header without reverting any of the T3-derived 0.4.12 interaction or layout
updates. The Croki overlay check now treats that header as a required brand
surface and rejects the inherited T3 wordmark.

## 0.4.12 boundary

0.4.12 carries Croki onto T3 Code through upstream commit `e321667b`. It keeps
the current T3 interaction and visual behavior across the web, desktop, server,
and mobile clients while preserving Croki's names, storage keys, package
ownership, historical migrations, and fail-closed release destinations.

Every Codex `turn/start` receives the T3-derived Default or Plan host developer
instruction block with Croki runtime identity and product-native Preview/MCP
routing. Croki does not prepend a separate application or strategy prompt.
Presentation-only Croki state is removed before a provider turn is sent.

## 0.4.11 boundary

0.4.11 places automatic visual thinking directly inside the Thread. When the
latest user question and bounded project perception contain useful structure,
a source-grounded View appears with that user turn. Epistemic state, coverage,
framing, and omissions remain inspectable. **Reframe** changes the organizing
logic over the same sources. **Use in next message** returns stable source IDs
through the visible composer boundary. Sparse input adds nothing.

The implementation adds no second model session, hidden Thread, prompt harness,
Canvas destination, or provider dependency. Historical Canvas and harness IDs
remain readable for compatibility only.

## 0.4.8 boundary

0.4.8 is a quality-of-life patch over 0.4.7 focused on finding and resuming the
right work without reconstructing it. Project and conversation retrieval,
durable Thread titles, bounded catch-up, renderer recovery, and pull-request
continuity strengthen the existing project and Thread model. `.croki` collapses
to one application brief and one compact released-to-building focus in the
Thread header. The setup action, progress model, Concept workflow, generated
object views, and automatic panel expansion disappear. The brief opens as
ordinary source and remains founder-facing direction. It reaches a model only
when the founder visibly attaches it or configures a provider-native project
instruction. The patch
does not add another application-awareness layer, prompt surface, `.croki`
kind, or future product-direction commitment. Preview also returns to one job:
opening and checking a running app. Its component catalog, idea form,
alternatives flow, and Beta setting disappear while checked-screen history
remains.

## 0.4.9 and 0.4.10 boundaries

0.4.9 continues the 0.4.8 continuity story: guide an active Codex turn, route
only unresolved founder judgment into existing navigation, recover honestly
after renderer failure, and branch an earlier Codex instruction without
rewriting either the source Thread or current files. It adds no inbox, task
system, provider-neutral steering loop, or combined conversation/filesystem
undo.

0.4.10 integrates the current T3 Code substrate while removing Croki's active
model-behavior harness. Default turns contain only the founder's visible
message and attachments. Application direction, skills, files, interaction
modes, permissions, and any Croki-added tool access affect the model only
through explicit user actions. Canvas itself remains founder-facing and grants
no model tools. Croki observes provider-native agents and workflows but does
not become their scheduler, strategy layer, or recovery runtime.

## UI history

Croki 0.4.7 preserves successful model-driven Preview snapshots as checked
screens in the originating Thread. Each entry keeps the exact image and bounded
page evidence, and the read-only `ui_history` model tool can list or reopen it
in a later turn. Preview projects recent checked screens under **UI history**;
there is no separate authored history database or design workflow.

An explicit concept label on two or more same-turn snapshots now turns that
turn's receipt into a ranked concept set. The set preserves up to ten
alternatives and the model's proposed order. The founder can inspect, drag or
keyboard-sort, compare two, and mark each option Keep, Question, or Reject.
Continue and Remix write the
ranked choices into the native composer as visible editable text; they never
send a turn or change provider behavior automatically. Unlabeled snapshots keep
the ordinary checked-screen receipt, so Croki does not guess which screens are
ideas.

Likely user-visible turns now also receive one compact result after the answer.
Same-turn snapshots collapse into **Checked _n_ screens** and open as a gallery;
visible checkpoint files without a snapshot say **Not checked**; nonvisual turns
add nothing. This receipt is derived from Croki-owned evidence and stays visible
when turn internals fold. It proves only that those screens were captured during
the turn, not complete design, flow, accessibility, breakpoint, or production
coverage.

Outside explicit same-turn concept sets, UI history records individual screens.
It does not yet compare checkpoints, connect action sequences into checked
flows, discover missing states, sweep responsive widths, or import production
behavior. Capture and the founder-facing history control currently share
Preview's desktop-only boundary.
Images follow Thread attachment cleanup, but rolling retention and
deduplication are not yet needed or implemented for explicit model checks.

## Application awareness

Application awareness is a founder-facing Croki projection, not default model
context. The application brief, Thread state, checkpoint files, sibling work,
checked screens, and Senses evidence may be shown in Croki without being added
to a provider request. Opening a project, Thread, Canvas, Preview, or the
application focus changes nothing sent to the model.

When a founder wants a model to use application evidence, Croki exposes the
specific source as a removable attachment or makes the relevant read-only tool
available through an explicit user action. The sent turn records what Croki
applied, including its source and scope. Croki never promotes observed evidence
to founder-approved direction or claims to expose provider-owned hidden
instructions.

Provider support means that an adapter and product surface exist. A provider is
ready only when its required local CLI, authentication, model access, and
supporting process are available. OpenClaw additionally requires a running
Gateway and configured agent.

## Venture evidence and Croki Senses

Canvas presentation is on the back burner after 0.4.3. The active foundation
is provider-neutral venture evidence shown through ordinary Thread activity
and inspected through user-enabled Croki Senses. Customer language, market
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

The compatibility capabilities are `sense_status`, `sense_observe`,
`sense_inspect`, and `sense_wait`. When a user enables them, they give the model
read-only perception without supplying a Croki behavioral instruction. External
writes, destructive actions, expensive operations, sensitive data, and
production changes still pass through native Threads, tools, approvals, and
authority checks.

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
Croki focuses the native composer and presents a visible, removable reference
before send. Canvas never injects bodies, grants authority, enables a tool, or
changes provider behavior. Failed sends preserve the draft reference and a
successful turn records it.

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

The server bounds and validates the brief for display. Malformed, absent,
unsupported, or oversized data fails open, the stored user message remains
unchanged, and no application data is sent to the provider. The founder may
attach the brief visibly for one turn or reference it from provider-native
project instructions.

Croki may derive a bounded project-activity snapshot for its own UI. It is
never prepended before a provider turn. The founder may attach a specific
source-labelled slice; Croki records that attachment with the sent turn and
never copies sibling transcripts or private reasoning.

Historical Concept, Release, and Venture parsers remain only to keep older
repositories readable. They are not active navigation, ideation, release, or
portfolio objects.

## Native-provider and user-application rule

Croki is a harness host, not a harness. A default turn consists of the user's
message and ordinary user-selected attachments plus provider-required protocol
data. Codex also receives the same thin host contract inherited from T3 Code:
collaboration-mode semantics, actual tool availability, product-native Preview
routing, and runtime identity. Croki adds no persona, task strategy, planning
loop, delegation policy, workflow instruction, application brief, project
summary, sibling activity, or other hidden task context.

Instructions, context, tools, runtime, and senses stay separate. The fixed host
contract is infrastructure, not task configuration. Anything task-specific
that Croki applies is chosen by the user, visible before send, scoped, recorded
on the turn, removable, and reversible. Persistent behavior uses provider- or
repository-native mechanisms such as `AGENTS.md`, skills, plugins, MCP
configuration, and provider-owned project instructions; Croki does not emulate
it by repeating a hidden prompt.

Product, GTM, Venture, Parallel Threads, and former `Native` behavior IDs remain
readable only for historical turns and migrations. They are not active composer
choices and cannot reactivate Croki behavior. Opening Canvas or Preview changes
no instruction, context, tool access, or authority. OpenClaw follows the same
rule: Croki connects to the selected user-owned agent through ACP without
rewriting its workspace, memory, skills, model, tools, or delegation settings.

## Known implementation gaps

- Hosted web, production mobile, and other package-backed server update paths
  remain intentionally unavailable until Croki-owned npm, EAS, and hosting
  credentials are configured. Their release gates require the exact
  `croki-server` version to publish first. GitHub-only desktop releases are
  independent: the desktop app updates its bundled server while remote package
  update actions are compiled out. Signed desktop distribution remains
  unavailable until Croki-owned signing credentials are configured.
- Native worker and subagent activity remains observable when the selected
  provider creates it. Croki no longer injects a Parallel Threads delegation
  policy or exposes it as a built-in behavior. Historical worker Threads remain
  readable and owned by their children.
- Historical `.croki` scope schemas and legacy Canvas objects remain only for
  compatibility reads and old receipts. The application brief remains active.
- Additional native senses can expand beyond the initial Thread, preview,
  checkpoint, approval, and runtime sources without changing the frame model.
- UI history preserves individual model snapshots, but checked-flow timelines,
  semantic visual comparison, state discovery, responsive sweeps,
  accessibility embodiment, and production-behavior adapters remain planned.
- GitHub desktop publication is enabled for `rhinehart514/croki` from
  `croki/main`. CLI publication, Croki-owned relay and hosted web destinations,
  signing, Discord, and mobile production deployment remain disabled by their
  independent ownership guards.
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
  artifacts. A tagged GitHub release is the enabled 0.4.14 publication path.

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
