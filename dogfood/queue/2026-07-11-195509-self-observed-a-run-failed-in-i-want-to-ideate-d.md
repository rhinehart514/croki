---
kind: bug
status: open
captured_at: 2026-07-11T19:55:09.162Z
git_sha: 10fd1c91b097a989e01328ffa4d3a07f399a1a5d
source: self-observed
signature: run-crash|code_throw|session|estatesaleusa--referral-loop-through-adjacent-professionals
category: run-crash
failure_class: self_inflicted
occurrences: 1
first_seen: 2026-07-11T19:55:09.162Z
last_seen: 2026-07-11T19:55:09.162Z
---

Self-observed: a run failed in i want to ideate different GTM pipelines and just see if this is something htat is feasible at the run.

## What was happening

## What broke

{"type":"error","status":400,"error":{"type":"invalid_request_error","message":"The 'gpt-5.5-codex' model is not supported when using Codex with a ChatGPT account."}}

## Context

```json
{
  "category": "run-crash",
  "errorKind": "code_throw",
  "failureClass": "self_inflicted",
  "pipeline": {
    "id": "estatesaleusa--referral-loop-through-adjacent-professionals",
    "label": "i want to ideate different GTM pipelines and just see if this is something htat is feasible"
  },
  "step": null,
  "inputSummary": "no upstream items",
  "sessionId": "op-20260711195503-1cd942b5"
}
```

## Snapshot

```json
{
  "category": "run-crash",
  "errorKind": "code_throw",
  "failureClass": "self_inflicted",
  "pipeline": {
    "id": "estatesaleusa--referral-loop-through-adjacent-professionals",
    "label": "i want to ideate different GTM pipelines and just see if this is something htat is feasible"
  },
  "step": null,
  "inputSummary": "no upstream items",
  "sessionId": "op-20260711195503-1cd942b5"
}
```
