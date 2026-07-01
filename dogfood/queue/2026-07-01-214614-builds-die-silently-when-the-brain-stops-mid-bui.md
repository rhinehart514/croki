---
kind: bug
status: done
captured_at: 2026-07-01T21:46:14.510Z
git_sha: 49830fdc022e30c2a65b93f37664f31348a63b07
source: self
---

Builds die silently when the brain stops mid-build: the queue item stays at building forever and the worktree is orphaned. On server start, recover stale building items — salvage-commit any worktree work, mark the item interrupted, remove the worktree.

## What was happening

First live smoke of request_feature; the smoke server was killed mid-build and the spine had no recovery path.

## Snapshot

```json
{}
```

## Resolution

Fixed: recoverStaleBuilds() in feature-builder.mjs runs at brain boot — salvage-commits orphaned worktree work to its dogfood/* branch, removes the worktree, flips stale queued/building items to interrupted. Covered by feature-builder.test.mjs.
