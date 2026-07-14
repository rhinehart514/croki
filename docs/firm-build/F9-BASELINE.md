# F9 pre-deletion baseline

**Status:** read-only capture. Nothing in this document required editing production code; the two
test-file edits made alongside this baseline (a presence-lease flake fix in `market-poll.test.mjs`,
and the equivalent hardening in my own `effect-executors.test.mjs`/`work-loop-wall-integration.test.mjs`)
are recorded separately below and are test-only. Nothing was committed.

**Captured:** 2026-07-14, HEAD at `fb8bcba` ("declutter canvas chrome and panel surfaces"), working
tree carrying F0–F8's uncommitted firm-rebuild work plus in-flight edits from several parallel builders
(UI lens/composer surfaces, etc. — see `git status` at capture time).

**Purpose:** an honest before-picture so F9's deletion (docs/firm-build/10-F9-deletion.md) has something
to diff its own after-picture against. This is a health snapshot (tests/lint/build), not the import-graph
audit — that's `docs/firm-build/F9-DELETION-MANIFEST.md`.

---

## Headline numbers

| Metric | Count |
|---|---|
| Files under `brain/src` (`.mjs`, recursive) | **222** |
| Files under `brain/src/firm` (`.mjs`) | **20** |
| Lines under `brain/src/firm` (`.mjs`, `wc -l` total) | **2,797** |
| Test files under `brain/test` (top level, `*.test.mjs`) | **203** |
| Test files under `brain/test/firm` (`*.test.mjs`) | **18** |
| Firm-suite tests (`node --test brain/test/firm/*.test.mjs`) | **187 tests / 78 suites — 187 pass, 0 fail** |
| Full legacy brain suite (`npm --prefix brain test`) | **2086 tests — 2078 pass, 7 fail, 1 skip** |
| UI unit suite (`npm --prefix ui run test:unit`) | **441 tests across 78 files — all pass** |
| Lint (`npm run lint`) | **0 errors, 2 warnings** |

`brain/src/firm/` at capture time (20 files, one per line from the delivery sequence F1–F8 plus this
integration pass): `bet.mjs`, `crew.mjs`, `effect-executors.mjs`, `heat-routes.mjs`, `heat.mjs`,
`lens-routes.mjs`, `lens.mjs`, `market-poll.mjs`, `market.mjs`, `message-send.mjs`,
`product-change-decide.mjs`, `product-change-record.mjs`, `product-change-workspace.mjs`,
`product-change.mjs`, `product-routes.mjs`, `routes.mjs`, `venture-store.mjs`, `wall.mjs`,
`work-loop-tools.mjs`, `work-loop.mjs`. This count and list will change as F9 collapses `routes/` and
retargets `mcp.mjs`; a re-run of this same `find`/`wc` pair after F9 is the after-picture.

---

## (a) Full legacy suite — `npm --prefix brain test`

```
# tests 2086
# suites 463
# pass 2078
# fail 7
# cancelled 0
# skipped 1
# todo 0
# duration_ms 95581.80375
```

**7 failures, in exactly 2 files, both confirmed pre-existing:**

- **`brain/test/convex-backend.test.mjs`** — 2 failures, both inside the `"persistence backend
  selection"` suite:
  - `defaults to SQLite when no Convex URL is set` — expected `'sqlite'`, got `'json'`
  - `an explicit backend pin overrides the Convex auto-select` — same shape
- **`brain/test/persistence.test.mjs`** — 5 failures, across two suites:
  - `"persistence provider"` suite: `the sqlite backend writes the database file, not the legacy json`
  - `"migrate-to-sqlite"` suite (4 of its 5 subtests): `imports every legacy JSON document into SQLite
    without touching the JSON files`, `is idempotent — running twice upserts to the same state`,
    `migrateIfNeeded imports when the DB is empty but JSON exists, then skips on a populated DB`,
    `migrates the workspaces and teams collections (newly routed through persistence)`

**Root cause, not a regression:** every failure is the identical shape — an assertion expecting the
`sqlite` backend got `json` instead. `persistence.mjs`'s own `selectBackend()` (brain/src/persistence.mjs)
falls back to the JSON backend when the native `better-sqlite3` module fails to load in this environment,
by design ("If the native module is unavailable at runtime, fall back to JSON rather than crash every
store"). This is an environment/native-module gap in this sandbox, not application code regressing.

**Confirmed pre-existing, not caused by the firm rebuild:** neither failing test file, nor the source
files they exercise (`persistence.mjs`, `convex-backend.mjs`, `migrate-to-sqlite.mjs`), show any diff
against `HEAD` (`git status --short` on all five paths returns nothing — they are byte-identical to the
last commit). Since nothing in the current working tree touches these files, the failures are attributable
entirely to `HEAD`'s own committed code in this environment, independent of anything F0–F8 or this
integration pass built. (This also matches an earlier direct confirmation from the F1 pass, where the
identical 5 `persistence.test.mjs` failures were reproduced via `git stash` on a clean tree.)

**1 skipped test** — not investigated further; noted for completeness, did not affect the pass count
narrative above.

---

## (b) UI unit suite — `npm --prefix ui run test:unit`

```
 Test Files  78 passed (78)
      Tests  441 passed (441)
   Start at  04:40:24
   Duration  30.15s (transform 5.45s, setup 18.22s, import 30.96s, tests 38.12s, environment 101.01s)
```

Fully green. No caveats.

---

## (c) Lint — `npm run lint` (→ `npm --prefix ui run lint` → `eslint .`)

```
/Users/laneyfraass/drover/ui/src/components/ComposerDock.tsx
  1072:5  warning  Unused eslint-disable directive (no problems were reported from 'react-hooks/exhaustive-deps')
  1079:5  warning  Unused eslint-disable directive (no problems were reported from 'react-hooks/exhaustive-deps')

✖ 2 problems (0 errors, 2 warnings)
```

0 errors. 2 warnings, both in `ComposerDock.tsx`, which another builder has open mid-edit (shows modified
in `git status` at capture time) — not touched here.

---

## (d) Production build — **skipped**

`npm run build` (→ `npm --prefix ui run build`) writes into `ui/dist`, and at capture time:

- `ui/dist` exists and was last built minutes before this baseline (03:28 local).
- A live `node brain/src/server.mjs` process is running (confirmed via `ps aux`) with an active browser
  connection to `localhost:4317` (confirmed via `lsof -i :4317` showing established/close-wait sockets
  from a browser process).

Someone (the founder or another builder) is very likely running the live app against this exact
`ui/dist` right now. Rebuilding would overwrite the UI a live session is serving mid-use. Per the
explicit instruction for this baseline ("skip if it writes into ui/dist that someone's using — your
call"), the build step is skipped here. F9 (or whoever runs the after-picture) should re-check this same
condition before deciding whether to run the build for comparison.

---

## Firm-suite baseline (the part F9's deletion most directly puts at risk)

```
$ node --test --test-concurrency=1 brain/test/firm/*.test.mjs
1..78
# tests 187
# suites 58
# pass 187
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

Confirmed stable across 3 consecutive runs at capture time (12.2s–15.6s each, no flakes) — see the
flake-fix section below for why this is meaningful: this exact suite was intermittently failing before
this pass.

---

## The presence-lease flake: found, fixed, proven

**Symptom:** running the full `brain/test/firm/*.test.mjs` glob repeatedly produced intermittent
`wall_release_while_away` failures in `market-poll.test.mjs`, alternating between 0 and up to 5 failures
across otherwise-identical runs.

**Root cause:** `presence.mjs`'s founder-presence lease (`brain/src/presence.mjs`) is a module-scope
singleton — one process-wide `lease` object, shared by every test FILE `node --test` loads into the same
process (not just within one file). `market-poll.test.mjs`'s `setupReleasedSend()` helper called the real
`markPresent("test")` and then immediately called `decide({decision:"release"})` from inside `async` test
bodies with real `await` points before and after — enough of an event-loop gap for another test file's own
`markPresent`/`__resetPresence` calls (several firm test files legitimately exercise the real lease) to
land in between and flip presence back to "away" out from under it. `wall.decide()`'s own
`isFounderPresent` dependency (`brain/src/firm/wall.mjs:156`, already injectable per F3's own design)
exists exactly to let a caller assert presence deterministically instead of racing the real lease.

**Fix — test files only, no source edits:**
- `brain/test/firm/market-poll.test.mjs` (builder-f2/f5's file — inspected first, found complete and
  settled with no signs of active mid-edit, so edited directly per this task's own instruction): both
  `decide({decision:"release"})` call sites now inject `isFounderPresent: () => true` instead of calling
  the real `markPresent("test")` beforehand; the now-unused `markPresent` import was removed.
- `brain/test/firm/effect-executors.test.mjs` and `brain/test/firm/work-loop-wall-integration.test.mjs`
  (my own files from the prior integration pass): same fix applied proactively, since both had the
  identical `markPresent()`-then-`await`-then-`decide()` shape and were equally exposed to the race.

**Not touched:** `brain/src/presence.mjs` itself. The singleton-across-test-files behavior is a real
property of the module (by design for a single-founder desktop process — "the process IS the session"),
not a bug in production; it only becomes a hazard when multiple *test files* share one process and
several of them legitimately want the real lease. If the process-wide nature of the lease is ever judged
to also risk PRODUCTION correctness (not just test isolation) that would be a separate, source-level
finding — not identified here; this fix stays entirely in test files per the task's constraint.

**Proof — 3 consecutive full-glob runs, all green:**

```
=== RUN 1 ===
1..78
# tests 187
# suites 58
# pass 187
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 15603.072791

=== RUN 2 ===
1..78
# tests 187
# suites 58
# pass 187
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 13620.235791

=== RUN 3 ===
1..78
# tests 187
# suites 58
# pass 187
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 12242.863583
```
