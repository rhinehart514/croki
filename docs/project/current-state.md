# Current project state

Last audited: 2026-08-03
Code baseline: Croki 0.4.5 stabilization release on `croki/main`

Croki is Jacob's current ADE and daily development environment. The product is
a narrow Croki overlay on Croki rather than a second agent runtime.

Croki 0.4.5 is the current release. See the [0.4.5 release
notes](./release-notes-0.4.5.md) and [release ownership
contract](../operations/release.md) for its independently gated destinations.

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
- repository-owned project context at `.croki/context.json`; the true Canvas /
  Croki Senses projection is the active 0.4.2 migration.

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
neither action promotes an inference into `.croki/context.json`. Raw customer
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

`.croki/context.json` remains repository-owned project truth. It may be projected
into a frame when relevant, but Canvas does not write canon, promote proposals,
retire decisions, or turn a frame into memory. The previous Release, Context,
and agent-authored Artifact mode specifications are historical migration notes;
they are superseded by the Senses and Perception Frame contract for 0.4.2.

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
  depends on the selected runtime exposing native workers.
- Legacy Release, Context, and Artifact code remains for compatibility reads;
  the unified Canvas no longer routes users into those authoring surfaces.
- Additional native senses can expand beyond the initial Thread, preview,
  checkpoint, approval, and runtime sources without changing the frame model.
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
