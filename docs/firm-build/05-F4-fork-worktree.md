# F4 — Fork is a worktree

**Goal:** a bet that touches the product runs through the surviving worktree contract: isolated
change, retained diff, staged review at the wall, explicit apply. Same verb, same wall.

## Context (scout receipts — the contract is proven, port it whole)

Keep-list, ported with minimal change:
- `brain/src/git-patch.mjs` — verbatim (self-contained diff/hash).
- `brain/src/feature-builder.mjs` — the spine: `createBuilderPathPolicy` (BUILDER_TOOLS
  Read/Glob/Grep/Edit/Write only; no Bash/git/network; symlink + `.git` escape guards),
  `buildFeatureRequest` (worktree add at `.dogfood-worktrees/<key>`, base-commit record,
  git-metadata tamper check, defensive uncommit via `git reset --mixed`, declined-on-empty-diff,
  ready-for-review retention, crash-preserving failure path), `recoverStaleBuilds`, serial chain.
- `brain/src/friction.mjs` — the queue/receipt substrate (markdown queue records).
- `brain/src/revision.mjs` — `reviewRevision`, `inspectApplyReadiness` (HEAD-drift + dirty-tree +
  patch-hash guards), `applyRevision` (`git apply --check` then apply), `revertRevision`.
- `brain/src/product-change-receipts.mjs` — stage/review/apply/discard state machine
  (`safeWorkspace`, `assertRetainedIdentity`, idempotent staging on patch hash, `confirm: true`
  apply, crash-safety `applying` marker).
- `brain/src/workspace.mjs` — trimmed to `getWorkspace`/`addRevision`/`updateRevision`/
  `addDecision` + persistence; drop scan-specific fields.
- Runtime doors: `claude-code.mjs` `runProductChange` (line 269) and `codex.mjs`
  `runCodexProductChange` (writable worktree, shell/apps/network/MCP all disabled).
- Do **not** port `build.mjs`'s parallel `buildTrackingFix` worktree path — it duplicates the
  contract; fold or drop.

## Build

1. **Re-key the contract to bets.** A product bet's fork calls `enqueueFeatureRequest` with the
   bet's intent; the queue record carries `betId` (replacing the project↔workspace binding with a
   venture↔bet binding, the minimal subset of what `groundProjectInWorkspace` did).
2. **Ready-for-review stages onto the bet**: the retained diff + patch hash attach to
   `bet.staged[]` and park at the wall as an effect whose "exact difference" is the diff.
3. **Wall decide → apply**: release runs `applyProductChange` (with `confirm`), founder-gated
   exactly as today (`authorizeFounderWriteForRequest`). Reject/discard keep their guards. Deploy
   stays a separate, second authorization.
4. Existing tests `feature-builder.test.mjs` and the product-change receipt tests keep passing
   (re-pointed where they referenced project/workspace joins).

## Acceptance

- One bet carries a real code diff from fork → isolated worktree → retained diff at the wall →
  founder apply onto the source repo → receipt on the bet. Founder dirt untouched throughout.
- The sandbox violations (commit attempt, symlink escape, `.git` touch) still fail exactly as the
  current tests prove. Nothing committed by builders or by the contract itself.
