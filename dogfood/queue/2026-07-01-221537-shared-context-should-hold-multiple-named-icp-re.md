---
kind: feature
status: ready-for-review
captured_at: 2026-07-01T22:15:37.848Z
git_sha: unknown
source: founder-session
branch: dogfood/2026-07-01-221537-shared-context-should-hold-multiple-name
commits: 1
---

Shared context should hold MULTIPLE named ICP records, not one: add sharedContext.icps[] (each: key, label, query, geography, industry, keywords, hypotheses, status), keep sharedContext.icp as the active/default for backward compatibility. setChannelIcp already links a pipeline to an icp key (project-store.mjs:700) — resolve that key against icps[] so each pipeline can state a DIFFERENT ICP. getPipelineIcpGrouping (board.mjs) should render each arm under its own stated ICP record instead of the single global icp, so an ICP-discovery program (e.g. 5 pipelines targeting 5 segments, grouped as one experiment) reads honestly. update_shared_context patch path must accept icps. Cover with tests in project-store.test.mjs and board.test.mjs.

## What was happening

Strelva (just registered) is starting an ICP-discovery GTM program across widely different segments (local businesses, non-profits, member orgs). The product currently models one stated ICP per project; per-pipeline icp links exist but have no multi-ICP record store to resolve against.

## Snapshot

```json
{
  "project": {
    "id": "strelva",
    "activeChannelId": null
  }
}
```

## Build result

Branch `dogfood/2026-07-01-221537-shared-context-should-hold-multiple-name` (1 commit) is waiting for founder review. Nothing merges without you.

```
brain/src/board.mjs               | 36 ++++++++++++++++-------
 brain/src/project-store.mjs       | 60 ++++++++++++++++++++++++++++++++++++---
 brain/test/board.test.mjs         | 37 ++++++++++++++++++++++++
 brain/test/project-store.test.mjs | 46 ++++++++++++++++++++++++++++++
 4 files changed, 165 insertions(+), 14 deletions(-)
```

Committed. Here's the founder-facing summary.

## What I built

Strelva's ICP-discovery program needed the project to hold **several named ICPs**, not the one it modeled before. I added a named multi-ICP store while leaving the existing single ICP as the default, so nothing that already relied on it changes.

- **`sharedContext.icps[]` — a list of named ICP records.** Each has `key, label, query, geography, industry, keywords, hypotheses, status`. The existing `sharedContext.icp` stays as the active/default ICP for backward compatibility. Existing projects automatically get an empty `icps: []` on load — never a seeded value.
- **`update_shared_context` now accepts `icps`.** On write, records are shaped to a stable form (keyed, consistent fields); a record with no `key` is dropped because it could never be linked to a pipeline; any extra fields a founder puts on a record are preserved.
- **Linking a pipeline resolves against the store.** `setChannelIcp` already binds a pipeline to an ICP by key; now when you link by bare key it adopts that record's label so the link reads honestly. An explicit label still wins, and a key with no matching record stays key-only (no fabricated label).
- **The ground view reads honestly.** `getPipelineIcpGrouping` now resolves each explicitly-linked pipeline's key against `icps[]`, so **each pipeline renders under its own stated ICP record** (its belief plus the full `icpRecord`) instead of the single global ICP. A pipeline linked to a key with no record stays honest-blank on the bare key. This is what makes a 5-segment discovery program read as 5 distinct grounds rather than one.

## How I verified

- Targeted tests: `test/project-store.test.mjs` + `test/board.test.mjs` — 26/26 pass, including new cases for multi-record storage, keyless-record dropping, bare-key label enrichment, and per-pipeline record rendering with an unresolved-key fallback.
- Full brain suite: `npm test` → **931 pass, 1 fail**. The one failure (`convex-backend.test.mjs` "configured-but-teamless Convex URL keeps the local backend working") is **pre-existing and unrelated** — I confirmed it fails identically with my changes stashed. It's about the Convex mirror provider, which I didn't touch.
- Brain-only change; no UI files touched, so lint/build weren't in scope.

Committed to `dogfood/2026-07-01-221537-shared-context-should-hold-multiple-name` (`17d22eb`). Not pushed.

## For you to decide when reviewing

1. **Keyless records are dropped on write.** A record needs a `key` to be linkable/resolvable, so I discard keyless ones during normalization. If you'd rather keep draft records with no key yet, say so.
2. **`icpBelief` format is unchanged for link grounds** — bare descriptor (e.g. "Local businesses"), while the base ground uses `Target: …`. I kept the existing per-source convention rather than unifying it. Easy to standardize if you want one format everywhere.
3. **Pre-existing Convex test failure** is sitting in this worktree independent of my work — flagging it so it doesn't get attributed to this change.
