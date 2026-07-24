---
kind: bug
status: open
captured_at: 2026-07-24T15:41:23.683Z
git_sha: 5c67a020ab27380962b5ebd031981c9ffd066b86
source: mcp
venture_id: buffalo-projects
---

read_current_model returns the entire venture model in one payload (306,550 chars for buffalo-projects). That overflows agent context limits, so the agent must save the blob to disk and query it with jq — a manual reconstruction outside Drover. The door needs scoped reads: by family, by object id, or by territory, plus a summary view.

## What was happening

Turn-6 real product loop, agent door, read_current_model on buffalo-projects at revision 124

## Snapshot

```json
{}
```
