---
kind: friction
status: open
captured_at: 2026-07-24T15:41:35.257Z
git_sha: 5c67a020ab27380962b5ebd031981c9ffd066b86
source: mcp
venture_id: buffalo-projects
---

The prepared deploy action came back with deployUnavailableReason "Name an existing package.json deploy script before authorizing this deploy." The repo deploys through Vercel git integration and CLI; it has build/start scripts but no "deploy" script, which is typical. So even if the founder released this action, Drover could not execute it. The deploy executor contract is narrower than how real repos deploy, and release itself is only reachable inside the Electron UI — a founder working from the CLI or an agent session has no release path, so real outward acts happen outside the wall and lose attribution.

## What was happening

prepare_outward_action kind=deploy, outward-action-d4d0466d, repo ~/Buffalo-Projects

## Snapshot

```json
{}
```
