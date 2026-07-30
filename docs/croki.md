# Croki on T3 Code

Croki is the product branch of Jacob's T3 Code fork. It is a coding environment
for founders building products with Codex and other coding agents.

Threads are the durable spine of the product. Canvas is the optional contextual
view: it keeps the product intent, decisions, evidence, work, and relationships
that need to survive any one conversation.

## Branch contract

- `main` mirrors `upstream/main`.
- `croki/main` is the long-lived Croki product branch and pushes to Jacob's
  `origin`.
- Upstream's push URL is intentionally disabled. Sync upstream into `main`
  first, then merge or rebase that known commit into `croki/main`.
- Keep internal package names, persistent storage keys, protocol schemes, app
  identifiers, and T3 wire contracts stable unless Croki specifically requires
  a divergence. Visible branding is Croki.

## Product context

Canvas reads and writes `.croki/context.json` through T3's existing
environment-aware project file RPC. That means the same repository-owned
context works for local, desktop-wrapped web, and remote server connections
without a Croki-only transport.

The version 1 file contains:

- a product summary;
- typed nodes: `intent`, `decision`, `evidence`, or `work`;
- lifecycle states: `current`, `provisional`, or `retired`;
- named directed relationships between nodes.

The server reads a fresh snapshot before every provider turn. It adds current
and provisional truth to the provider input at the generic provider-service
boundary, while the visible user message remains unchanged. This gives Codex,
Claude, Cursor, Grok, and OpenCode the same bounded context. Missing, malformed,
or oversized context never blocks a turn.

The Canvas is available as a first-class right-panel surface in the web client
and therefore in the Electron desktop client. Mobile preserves access to the
same source of truth through its remote workspace file surface; editing remains
a desktop/web workflow for this first native migration.

## Native recovery and workflows

Croki deliberately uses T3's native recovery and development paths:

- event-sourced durable threads and provider resume cursors;
- checkpoint diffs and turn restore;
- isolated Git worktrees and branch review;
- terminal, preview, files, plans, and project scripts;
- local and remote environment connections;
- all built-in provider adapters.

The standalone Croki runtime and its `brain`, `relay`, and custom workflow
machinery are historical inputs, not parallel production systems.

The machine-readable [data migration record](./croki-data-migration.json)
documents the reviewed Atlas/journal/configuration hashes, retained conversation
and receipt counts, and the explicit decision for each source category. Current
product truth was distilled into Canvas; historical runtime records remain
losslessly archived instead of being replayed as misleading live T3 threads.

## Standalone archive

The frozen standalone source of truth is outside this checkout at:

`/Users/jacobrhinehart/Projects/ide/croki-transition-archive/2026-07-29`

That archive contains:

- a cold `.git` archive and a verified all-refs Git bundle;
- the final `archive/croki-standalone-2026-07-29` commit;
- attached refs for formerly unreachable commits;
- worktree proof archives and manifests;
- root working-tree patches;
- archived `~/.gtm-ide` and Croki Electron runtime state;
- SHA-256 checksums and a strict restore-check mirror.

Restoration is intentionally an archive operation, not an app startup path.
Verify `SHA256SUMS`, clone or fetch from `croki-all-refs.bundle`, and compare refs
to the saved manifest before changing the preserved standalone checkout.
