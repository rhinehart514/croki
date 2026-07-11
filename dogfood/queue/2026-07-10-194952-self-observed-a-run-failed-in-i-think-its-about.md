---
kind: bug
status: open
captured_at: 2026-07-10T19:49:52.888Z
git_sha: 65cb3c2cc98bccd914998f48888336ad4e632db4
source: self-observed
signature: run-crash|code_throw|session|session
category: run-crash
failure_class: self_inflicted
occurrences: 1
first_seen: 2026-07-10T19:49:52.888Z
last_seen: 2026-07-10T19:49:52.888Z
---

Self-observed: a run failed in I think its about time I focused on GTM at the run.

## What was happening

## What broke

Reading additional input from stdin... 2026-07-10T19:49:52.262868Z ERROR codex_core::session: Failed to create session: required MCP servers failed to initialize: gtm-operator: handshaking with MCP server failed: connection closed: initialize response Error: thread/start: thread…

## Context

```json
{
  "category": "run-crash",
  "errorKind": "code_throw",
  "failureClass": "self_inflicted",
  "pipeline": {
    "id": null,
    "label": "I think its about time I focused on GTM"
  },
  "step": null,
  "inputSummary": "no upstream items",
  "sessionId": "op-20260710194948-4f416d18"
}
```

## Snapshot

```json
{
  "category": "run-crash",
  "errorKind": "code_throw",
  "failureClass": "self_inflicted",
  "pipeline": {
    "id": null,
    "label": "I think its about time I focused on GTM"
  },
  "step": null,
  "inputSummary": "no upstream items",
  "sessionId": "op-20260710194948-4f416d18"
}
```
