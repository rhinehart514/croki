# Current project state

Last audited: 2026-08-02
Code baseline: Croki 0.4.2 true Canvas on `croki/main`

Croki is Jacob's current ADE and daily development environment. The product is
a narrow Croki overlay on Croki rather than a second agent runtime.

Croki 0.4.2 is the current release. See the [0.4.2 release
notes](./release-notes-0.4.2.md) and [release ownership
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

## Canvas and Croki Senses

The 0.4.2 pivot makes Canvas the zero-maintenance native projection of Croki
Senses. Senses are generic model capabilities for perceiving a changing
project; Canvas is the human-readable projection of that activity. It is not a
release board, context editor, artifact authoring surface, workflow runtime,
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
  artifacts. A tagged GitHub release is the enabled 0.4.2 publication path.

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
