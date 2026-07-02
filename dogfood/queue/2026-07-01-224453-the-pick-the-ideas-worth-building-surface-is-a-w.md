---
kind: bug
status: done
captured_at: 2026-07-01T22:44:53.099Z
git_sha: bfce4ffa85dc6576a95b6130fe7fb847fbf72b09
source: founder-live
---

The Pick-the-ideas-worth-building surface is a word dump: 18 cards each rendering a full paragraph pitch with no title, no segment grouping, naked scores, and a goal recap that is itself a wall of text. The founder cannot compare or decide. Cards need: a short title, segment/angle chips, a one-line summary with the full pitch collapsed behind an expander, the score made visual and comparable, and ideas grouped by segment. Upstream, the ideate schema should generate a title and one-line summary alongside the pitch.

## What was happening

Founder reviewing the 18 paused Strelva ICP ideas in the browser; verbatim reaction: this is just a bunch of word dump and doesnt help me.

## Snapshot

```json
{
  "project": {
    "id": "strelva",
    "activeChannelId": null
  },
  "needsFounder": []
}
```

## Resolution

Fixed directly: decidable cards (derived title, score chip, clamp+expand, strongest-first) and stage-aware resolution — beginning-stage projects keep ideas as ICP directions into the shared kernel instead of composing pipelines. Committed on main.
