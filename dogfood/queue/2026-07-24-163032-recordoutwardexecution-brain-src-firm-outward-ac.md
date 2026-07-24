---
kind: bug
status: open
captured_at: 2026-07-24T16:30:32.834Z
git_sha: 5c67a020ab27380962b5ebd031981c9ffd066b86
source: mcp
venture_id: buffalo-projects
---

recordOutwardExecution (brain/src/firm/outward-actions.mjs:186) is the only primitive that can attach an execution receipt to a staged outward action, it is correctly founder-only, but it is not wired to any HTTP route — model-routes.mjs imports only grantOutwardObservation. Consequence: when an action executes outside Drover's executor (which happens whenever the executor is unavailable, as with this deploy), no surface — including the founder in Electron — can reconcile the record. grantOutwardObservation then refuses because executedAt is null, so watch-for-return can never engage. The action stays permanently "unexecuted" in the ledger while being live in the world. Attribution stops here by construction, not by policy. Stopping at this failure rather than forging a founder actor; the receipt lives provisionally as drop-door-deploy-receipt on branch model-branch-a5171686.

## What was happening

Reconciling outward-action-d4d0466d (deploy executed 2026-07-24 via Vercel CLI, dpl_2Sd4Q7UFk37xiLorChSEcDxYRYQ6) with its staged record

## Snapshot

```json
{}
```
