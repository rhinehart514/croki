# F1 — The firm core

> **HISTORICAL EXECUTION TASK.** This work package is not a current backlog. Use
> [FIRM-SPEC.md](../FIRM-SPEC.md) and [STATE.md](../STATE.md) before changing the live tree.

**Goal:** one venture = one readable local directory holding crew, bets, decisions, and placement,
behind one persistence seam, with the harness available to the new core through the keep-list only.

## Context (scout receipts)

- Persistence seam: `brain/src/persistence.mjs` provides JSON and SQLite backends with
  compareAndSet; the JSON backend writes atomic per-file documents. Use it; do not invent storage.
- Souls: `brain/src/teammate-soul-store.mjs` (`ensure`, template `__library__` project,
  founder-blessed graduation) is the crew's memory. Reuse as-is.
- The current `GTMPath` record (`brain/src/gtm-store.mjs:300`) is documented as "one strategic
  bet" and outcome Results already carry `pathId` + `joinKey`. The new Bet record replaces it as
  the join target — carry `joinKey` lineage compatibility.

## Build

Create `brain/src/firm/`:

1. **`venture-store.mjs`** — a venture home under the existing product home
   (`~/.gtm-ide/ventures/<ventureId>/` in production; injectable root for tests). Human-readable
   JSON documents via `persistence.mjs` (JSON backend scoped to the venture directory):
   `crew`, `bets`, `decisions`, `placement`. Venture-scoped reads/writes only; a caller naming a
   different venture's record fails closed. Export/list/create/open. No revision ceremony beyond
   what `persistence.mjs` compareAndSet already gives.
2. **`bet.mjs`** — create/fork/end. A bet is: `id`, `ventureId`, `intent` (whoever's words),
   `forkedFrom` (bet id or null), `teammateRef`, `refs[]`, `evidence[]`, `staged[]` (artifacts and
   parked outward effects), `joinKey`, `createdAt`, `endedAt?`, `endedBy?` (founder only),
   `learning?` (written at kill). **No `kind`, no `status`, no stage field.** Position is a pure
   function `positionOf(bet, wallQueue)` → `live | at-wall | ended` — derived, never stored.
   `fork(parentBetId, intent)` records lineage. `end(betId, byFounder, learning)` is the only
   terminal write and requires founder authority (caller passes the authorized actor; model/agent
   actors are rejected here, mirroring `experiment-verdict-auth` semantics).
3. **`crew.mjs`** — the venture's teammate roster over `teammate-soul-store.mjs`: summon (ensure
   soul + add to crew), list with track record (port the read from `memory.mjs`
   `buildAgentBench`), no roles/hierarchy fields.
4. **A static guard test** (mirroring `brain/test/anti-cage.test.mjs` style) asserting:
   - no file under `brain/src/firm/` imports any module named in FIRM-SPEC.md §Dies;
   - the bet record source contains no `kind:`/`status:`/`stage` field writes;
   - teammate records contain no role/seniority/manager fields.

## Acceptance (write these tests under `brain/test/firm/`)

- Venture CRUD round-trips through real files; the venture directory is readable JSON.
- Cross-venture access fails closed (read and write).
- Fork lineage: parent → child → mutation chain reloads intact; `positionOf` derives all three
  positions correctly from the wall queue state.
- `end()` rejects non-founder actors; records learning; killed bet stays readable.
- Static guard passes. `node --test brain/test/firm/` green. Nothing committed.
