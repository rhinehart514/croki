---
kind: feature
status: done
captured_at: 2026-07-01T21:41:29.858Z
git_sha: unknown
source: live-smoke
branch: superseded
---

Add a get_dogfood_queue MCP tool that lists the dogfood queue items (kind, status, captured_at, branch when present, one-line summary) by calling GET /api/friction, so the founder can ask any Claude session what is queued, building, ready-for-review, declined, or failed.

## What was happening

Proving the request_feature loop end-to-end for the first time; the review queue currently has no MCP-visible status.

## Snapshot

```json
{
  "project": {
    "id": "rodentradar",
    "activeChannelId": "rodentradar-restaurant-outbound"
  }
}
```

## Build result

The brain process was stopped mid-build. Work-in-progress was salvaged as commit 8b80b97 on branch `dogfood/2026-07-01-214129-add-a-get-dogfood-queue-mcp-tool-that-li` (new dogfood-queue.mjs + test + MCP/server wiring, unverified — the builder never got to run tests). Review or re-run the request.

## Resolution

Implemented directly on gtm-board as the get_dogfood_queue MCP tool (thin bridge over GET /api/friction) rather than merging the salvaged branch, which was built against pre-friction code and duplicated the queue reader. Salvaged branch deleted after supersession.
