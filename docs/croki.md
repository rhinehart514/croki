# Croki on Croki

Croki is a narrow product overlay on Croki. Threads, providers, worktrees,
recovery, terminal, preview, files, plans, and project scripts remain native T3
surfaces. Canvas is the zero-maintenance native projection of Croki Senses: a
live view of what agents are observing, attending to, connecting, and waiting
for. It does not introduce a second runtime, memory system, workflow, or board.

Croki is the founder's current ADE and daily development environment. See
[Current project state](./project/current-state.md) for the audited capability,
release, and implementation-gap snapshot.

## True Canvas pivot

Croki Senses are the generic capabilities that let a model perceive a project
as a changing world rather than a bag of files. A Perception Frame is one hybrid
observation/delta packet. It can carry rendered pixels, semantic objects,
relationships, provenance, confidence, available affordances, and changes since
the previous frame. Canvas projects those activities without asking a founder
or an agent to author a board.

The initial model-facing surface exposes status, observation, inspection, and waiting through
`sense_status`, `sense_observe`, `sense_inspect`, and `sense_wait` when the
provider supports those capabilities. These are perception primitives, not a
Canvas API and not a replacement execution engine. A model may compose a useful
view, focus attention, inspect causal neighbors, compare a possible future, or
subscribe to a meaningful change. Consequences still pass through the native
Thread, tools, approvals, and authority boundary.

Sensing is read-only. Calls return frames directly and do not append observation
receipts or create a self-observing activity loop. Existing `croki.sense.*`
activities remain parseable as compatibility input, while new frames are
derived from the ordinary Thread activity stream.

The previous Release, Context, and agent-authored Artifact mode descriptions are
historical migration notes, not the 0.4.2 product contract. In particular,
`release-canvas-spec.md` and `harness-canvas-spec.md` must not be used to
constrain Canvas to a release board, manual node editor, or harness-only visual.
Compatibility reads may remain during migration, but new Canvas work must use
the Senses and Perception Frame model.

## Native provider rule

The selected product rule is that provider runtimes remain native by default.
Croki must not add a hidden persona, planning loop, delegation policy, workflow,
or behavioral prompt. An explicit harness may still be requested for a turn or
thread, but Canvas and Croki Senses never require one and never silently change
one. Any harness remains visible, scoped, reversible, and unable to change
founder-approved project truth.

Runtime, context, tools, harnesses, and senses are distinct. Canvas is the
projection of sense activity, not a harness, context editor, or tool. Context
that affects a turn must be visible and removable.

The web composer remains native by default. Opening, closing, selecting, or
arranging Canvas never changes provider behavior or grants authority. OpenClaw
also preserves its configured agent's native model, reasoning, delegation,
tools, and instructions.

## Project truth and authority

`.croki/context.json` remains repository-owned project truth and is read through
the existing environment-aware project-file RPC. Canvas does not write this
file, promote canon, retire decisions, or turn a Perception Frame into memory.
Founder-approved context can be projected into a frame when relevant, but the
projection is disposable and source-linked.

The compatibility context schema still contains typed `intent`, `decision`,
`evidence`, and `work` nodes with three lifecycle states:

- `current`: founder-approved product canon;
- `provisional`: an agent or human proposal awaiting review;
- `retired`: preserved history, omitted from provider context.

Agents should add or update only provisional material. Promotion to current and
retirement of canon require an explicit founder action through the native
project surfaces. Canvas itself has no authority-state editor.

This is semantic authority, not a security boundary. An agent with full
filesystem access can edit `.croki/context.json` directly, including status
fields. The Canvas compare-and-write guard prevents stale UI saves, not hostile
or out-of-band writes. Review changes before treating current material as
approved.

Evidence capture remains provisional and deduplicates references. File
references must be repository-relative POSIX paths, may include a positive line
number, and cannot be absolute, traverse with `..`, contain backslashes, or
contain control characters. URL references must be valid HTTP(S) URLs.

## Limits and provider behavior

Project-context parsing and provider rendering retain these limits. They are
not Canvas object or sense limits:

| Field                              |                      Limit |
| ---------------------------------- | -------------------------: |
| Source file                        |        256,000 UTF-8 bytes |
| Rendered provider context          |          12,000 characters |
| Nodes / edges (legacy context)     |                  200 / 400 |
| Product / node ID / title          | 240 / 120 / 240 characters |
| Node body                          |          12,000 characters |
| References per node                |                         20 |
| File path / URL                    |     500 / 2,048 characters |
| Relationship name                  |             120 characters |
| Release items (legacy context)     |                         60 |
| Release version / goal (legacy)    |      80 / 1,000 characters |
| Item title / outcome (legacy)      |     240 / 4,000 characters |
| Criteria / criterion text (legacy) |      20 / 1,000 characters |
| Source Threads per item (legacy)   |                         12 |

New provider turns receive the explicit harness, when selected, and the raw
user input. They do not automatically hydrate `.croki/context.json` or Canvas
state. A model can use Croki Senses and native source tools to inspect the live
project when that evidence matters. Repository text remains untrusted input,
not an instruction source.

Sense-capable providers can request a Perception Frame with `sense_observe`
rather than receiving a hand-authored Canvas document. The frame can be
refreshed, narrowed, or expanded as the provider's attention changes. A model
may inspect more detail or wait for a meaningful delta instead of receiving an
arbitrary fixed context slice.

Legacy context rendering includes complete entries until the next would cross
12,000 characters, then emits an omission marker and sets `truncated: true`.
Malformed, missing, unsupported, or oversized project context always fails open:
the native provider turn continues and Canvas reports the unavailable sense
instead of blocking work.

Legacy context import and replay can record a content-free receipt with status `loaded`, `partial`,
`absent`, `invalid`, or `oversized`; path; version; SHA-256; timestamp; active,
current, and provisional counts; rendered character count; truncation; and an
optional parse error code. Live Perception Frames expose bounded provenance
without persisting raw prompts, private memory, or raw context bodies.

## Projection and interaction

Canvas is zero-maintenance. It has no Save Canvas action, dirty draft, manual
node/edge authoring, release board, or founder-authored scene. Layout, focus,
selection, and zoom are local presentation state. They do not become project
truth and do not constrain what a model can perceive or compose.

Actions selected from a projection route through native Threads, tools,
approvals, and existing authority checks. External writes, destructive actions,
expensive operations, sensitive data, and production changes remain explicit
authority boundaries. Canvas can show a possible future or a causal path, but it
cannot apply one merely because it was visible.

## Compatibility and releases

Visible product branding is Croki. Compatibility IDs remain T3 values where a
rename would split installed-app identity, state, deep links, automation, or
wire contracts. The allowlist in `scripts/lib/brand-policy.ts` covers
`croki`/`@croki/*`, `com.croki.croki*`, `croki*` schemes and storage,
`.t3`, `CROKI_*`, `desktop:*`, `t3.*`, `croki.json`, `croki`, resource-monitor
executables, Linux desktop IDs, commit metadata, and inherited `t3.codes`
service references. Do not rename them casually.

Production release workflows fail closed per destination. A GitHub-only release
may target the Croki-owned `rhinehart514/croki` repository on `croki/main`;
CLI, relay, hosted web, signing, Discord, and mobile destinations remain off
until their specific `CROKI_*_ENABLED` flag and Croki-owned configuration are
ready. Inherited T3 destinations are rejected.

## Operations

Run the focused boundary locally:

```sh
npm run check:croki
(cd packages/shared && vp test run src/crokiContext.test.ts)
(cd apps/server && vp test run src/orchestration/Layers/CrokiContext.test.ts)
(cd apps/web && vp test run --project unit src/branding.test.ts src/components/croki src/components/chat/CrokiContextPresentation.test.tsx src/components/chat/CrokiProposalPrompts.logic.test.ts)
(cd scripts && vp test run lib/brand-policy.test.ts lib/brand-assets.test.ts check-croki-overlay.test.ts report-croki-overlay.test.ts)
```

`main` mirrors `upstream/main`; `croki/main` carries the product overlay. Before
an upstream sync, report overlap against the exact known upstream commit:

```sh
npm run report:croki-overlay -- --base <known-upstream-sha>
npm run check:croki -- --base <known-upstream-sha>
```

Fast-forward `main` to the reviewed upstream commit, then rebase `croki/main`
onto it and rerun focused checks. Roll back a bad Croki change with a targeted
`git revert`; do not reset the upstream mirror or revive the standalone runtime.

The reviewed migration record is `docs/croki-data-migration.json`. The frozen
standalone source and restore proofs remain outside this checkout at
`/Users/jacobrhinehart/Projects/ide/croki-transition-archive/2026-07-29`.
