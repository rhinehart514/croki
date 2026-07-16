# F8 — The portfolio proof

> **HISTORICAL EXECUTION TASK.** This work package is not a current backlog. Current portfolio and
> transfer proof lives in [STATE.md](../STATE.md).

**Goal:** two ventures behind one wall, and a venture is a file: export/import a running venture
and it resumes mid-bet. Rails 6 and 8 proven.

## Build

1. **The portfolio wall**: `queueAll()` (F3) renders every venture's pending decisions in one
   surface, each item decided under its own venture scope. No cross-venture reads beyond the
   queue projection; decisions route to the owning venture store.
2. **Export**: `exportVenture(ventureId, destination)` — the venture directory (crew, bets,
   decisions, placement, souls' venture instances, product-change receipts scoped to the venture)
   packs to a single archive. Credentials and template souls are explicitly NOT exported
   (credentials never leave; template souls are the founder's cross-venture asset).
3. **Import**: `importVenture(archive)` on a fresh home — the venture opens, bets reload with
   lineage and positions, the wall queue re-derives, teammates resume from `runtimeSessionId`
   where the provider still holds the session and degrade honestly to a cold resume where it
   does not.
4. **Isolation regression**: importing a venture must not touch any other venture's records.

## Acceptance

- Fixture: two ventures, each with live bets and parked wall items. One surface lists both;
  deciding each writes to the correct venture only; cross-venture decide 404s.
- Export → wipe → import round-trip: bets, lineage, decisions, placement intact; a live bet
  resumes (cold-resume path acceptable and honestly marked).
- Credentials absent from the archive (test inspects the archive contents).
- Nothing committed.
