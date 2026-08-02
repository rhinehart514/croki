# Croki on Croki

Croki is a narrow product overlay on Croki. Threads, providers, worktrees,
recovery, terminal, preview, files, plans, and project scripts remain native T3
surfaces. Canvas adds a repository-owned next-release view and product context
without introducing a second runtime.

Croki is the founder's current ADE and daily development environment. See
[Current project state](./project/current-state.md) for the audited capability,
release, and implementation-gap snapshot.

## Native provider rule

The selected product rule is that provider runtimes remain native by default.
Croki must not add a hidden persona, planning loop, delegation policy, workflow,
or behavioral prompt unless the user explicitly enables a named harness for a
turn or thread. Harnesses must be off by default, visible, scoped, reversible,
and unable to silently change founder-approved Canvas truth.

Runtime, context, tools, and harnesses are distinct. Canvas is context and
visualization, not itself a harness. Context that affects a turn must be visible
and removable.

The web composer defaults to `Native` and offers `Product` and `GTM v1` as
explicit one-turn harnesses. Native adds no Croki behavior prompt. Product and
GTM reset to Native after a successful send. Opening or closing Canvas never
changes behavior. OpenClaw also preserves its configured agent's native model,
reasoning, delegation, tools, and instructions.

## Context and authority

Canvas reads and writes `.croki/context.json` through the existing
environment-aware project-file RPC. Its optional `release` object contains one
next-release candidate with an explicit version, baseline, goal, lifecycle,
items, source Threads, acceptance criteria, and evidence. Canvas opens on this
candidate by default. See the [Release Canvas
specification](./project/release-canvas-spec.md).

Version 1 also contains a product summary, typed `intent`, `decision`,
`evidence`, and `work` nodes, named directed relationships, and three lifecycle
states:

- `current`: founder-approved product canon;
- `provisional`: an agent or human proposal awaiting review;
- `retired`: preserved history, omitted from provider context.

Agents should add or update only provisional material. Promotion to current and
retirement of canon require an explicit founder action.

This is semantic authority, not a security boundary. An agent with full
filesystem access can edit `.croki/context.json` directly, including status
fields. The Canvas compare-and-write guard prevents stale UI saves, not hostile
or out-of-band writes. Review changes before treating current material as
approved.

Evidence capture is provisional and deduplicates references. File references
must be repository-relative POSIX paths, may include a positive line number,
and cannot be absolute, traverse with `..`, contain backslashes, or contain
control characters. URL references must be valid HTTP(S) URLs.

Release items use separate operational states: `proposed`, `working`,
`candidate`, `blocked`, `verified`, and `deferred`. An item can become verified
only after every declared criterion passes. Operational release state does not
change the authority of durable context.

## Limits and provider behavior

The parser, Canvas, and provider boundary share these limits:

| Field                     |                      Limit |
| ------------------------- | -------------------------: |
| Source file               |        256,000 UTF-8 bytes |
| Rendered provider context |          12,000 characters |
| Nodes / edges             |                  200 / 400 |
| Product / node ID / title | 240 / 120 / 240 characters |
| Node body                 |          12,000 characters |
| References per node       |                         20 |
| File path / URL           |     500 / 2,048 characters |
| Relationship name         |             120 characters |
| Release items             |                         60 |
| Release version / goal    |      80 / 1,000 characters |
| Item title / outcome      |     240 / 4,000 characters |
| Criteria / criterion text |      20 / 1,000 characters |
| Source Threads per item   |                         12 |

Before each project turn, the server reads a fresh snapshot from the project
root whether or not Canvas is open. It prepends bounded founder-approved
`current` canon and a compact projection of the active release at the shared
provider-service seam. `provisional` and `retired` nodes plus proposed and
deferred release items are excluded. The stored user message is unchanged.
Repository text is untrusted input, not an instruction source.

Rendering includes complete entries until the next would cross 12,000
characters, then emits an omission marker and sets `truncated: true`. Large
release items are projected compactly before current canon is selected. A
malformed release can be omitted while valid canon is recovered. Missing,
malformed, unsupported, or oversized context always fails open: the provider
turn continues.

Each attempt records a content-free receipt with status `loaded`, `partial`,
`absent`, `invalid`, or `oversized`; path; version; SHA-256; timestamp; active,
current, and provisional counts; rendered character count; truncation; harness
identity; the active release version and item count when present; and an
optional parse error code. The transport event also retains the exact rendered
prompt for idempotent replay. UI presentation, CI summaries, and artifacts must
expose only the receipt, never that prompt or raw context bodies.

## Editing and conflicts

Release and Context edits share one Canvas draft scoped by environment and
workspace in session storage. Dirty drafts survive Canvas close/reopen and a
page reload in the same session; they are never written automatically.

Saving validates the complete document and uses the baseline raw-content
SHA-256 as a compare-and-write precondition. For a new file, the precondition
requires the file to remain absent. If the source changes, Canvas preserves the
local draft and offers an explicit reload that discards it; otherwise the draft
remains local. Malformed source repair is also explicit.

## Compatibility and releases

Visible product branding is Croki. Compatibility IDs remain T3 values where a
rename would split installed-app identity, state, deep links, automation, or
wire contracts. The allowlist in `scripts/lib/brand-policy.ts` covers
`croki`/`@croki/*`, `com.croki.croki*`, `croki*` schemes and storage,
`.t3`, `CROKI_*`, `desktop:*`, `t3.*`, `croki.json`, `croki`, resource-monitor
executables, Linux desktop IDs, commit metadata, and inherited `t3.codes`
service references. Do not rename them casually.

Production release workflows fail closed. Keep releases disabled until the
repository, branch, CLI package, relay/web domains, and Vercel coordinates are
Croki-owned and every `CROKI_RELEASE_*` / required `CROKI_*` variable in
`.github/workflows/release.yml` is configured. Inherited T3 destinations are
rejected.

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
