# Croki on T3 Code

Croki is a narrow product overlay on T3 Code. Threads, providers, worktrees,
recovery, terminal, preview, files, plans, and project scripts remain native T3
surfaces. Canvas adds repository-owned product context without introducing a
second runtime.

## Context and authority

Canvas reads and writes `.croki/context.json` through the existing
environment-aware project-file RPC. Version 1 contains a product summary, typed
`intent`, `decision`, `evidence`, and `work` nodes, named directed relationships,
and three lifecycle states:

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

Before each provider turn, the server reads a fresh snapshot from that
environment's workspace. It prepends bounded current canon, then provisional
suggestions, at the shared provider-service seam. The stored user message is
unchanged. Repository text is untrusted input, not an instruction source.

Rendering includes complete entries until the next would cross 12,000
characters, then emits an omission marker and sets `truncated: true`. Missing,
malformed, unsupported, or oversized context fails open: the provider turn
continues without Canvas context.

Each attempt records a content-free receipt with status `loaded`, `absent`,
`invalid`, or `oversized`; path; version; SHA-256; timestamp; active, current,
and provisional counts; rendered character count; truncation; and an optional
parse error code. The transport event also retains the exact rendered prompt
for idempotent replay. UI presentation, CI summaries, and artifacts must expose
only the receipt, never that prompt or raw context bodies.

## Editing and conflicts

Canvas drafts are scoped by environment and workspace and live in session
storage. Dirty drafts survive Canvas close/reopen and a page reload in the same
session; they are never written automatically.

Saving validates the complete document and uses the baseline raw-content
SHA-256 as a compare-and-write precondition. For a new file, the precondition
requires the file to remain absent. If the source changes, Canvas preserves the
local draft and offers an explicit reload that discards it; otherwise the draft
remains local. Malformed source repair is also explicit.

## Compatibility and releases

Visible product branding is Croki. Compatibility IDs remain T3 values where a
rename would split installed-app identity, state, deep links, automation, or
wire contracts. The allowlist in `scripts/lib/brand-policy.ts` covers
`t3code`/`@t3tools/*`, `com.t3tools.t3code*`, `t3code*` schemes and storage,
`.t3`, `T3CODE_*`, `desktop:*`, `t3.*`, `t3.json`, `t3-code`, resource-monitor
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
