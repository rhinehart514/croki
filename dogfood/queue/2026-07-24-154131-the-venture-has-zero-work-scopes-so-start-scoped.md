---
kind: friction
status: open
captured_at: 2026-07-24T15:41:31.278Z
git_sha: 5c67a020ab27380962b5ebd031981c9ffd066b86
source: mcp
venture_id: buffalo-projects
---

The venture has zero work scopes, so start_scoped_work can only fail (404 "No such continuing work scope"). There is no agent-side way to request a scope, and no pointer in the error toward how the founder grants one. Result: the decision was recorded through Drover but the derived coding work had to happen entirely outside Drover (external worktree, external build), breaking the decision→work attribution chain. The door needs either a request-scope tool that queues for founder approval, or the error must name the founder action that creates the scope.

## What was happening

Turn-6 real product loop: start_scoped_work after recording a decision on branch model-branch-a5171686

## Snapshot

```json
{}
```
