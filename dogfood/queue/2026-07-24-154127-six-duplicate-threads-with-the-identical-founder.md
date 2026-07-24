---
kind: bug
status: open
captured_at: 2026-07-24T15:41:27.451Z
git_sha: 5c67a020ab27380962b5ebd031981c9ffd066b86
source: mcp
venture_id: buffalo-projects
---

Six duplicate threads with the identical founderIntent ("Map the product from the current codebase as the actual pages a user walks through...") each died budget-exhausted about one second after creation on 2026-07-22. All 11 threads on this venture are terminal budget-exhausted. Something retried a failing page-scan flow five times without surfacing the failure to the founder, and thread budgets appear to kill work at birth. The founder sees dead threads, not the cause.

## What was happening

watch_for_return on buffalo-projects, threads family

## Snapshot

```json
{}
```
