# F7 — The always-on firm

**Goal:** the crew runs around the clock under one heat dial and one spend rail. Away accumulates
conviction at the wall; nothing outward ever moves unattended.

## Context (scout receipts)

- `ambient-scheduler.mjs` is the substrate: one unref'd in-process timer (default 5 min tick,
  `GTM_IDE_AMBIENT_TICK_MS` override, `GTM_IDE_DISABLE_AMBIENT=1` kill switch), four independent
  drivers per tick each in its own try/catch. Today only outcome reads run by default.
- `createTickBudget` (lines 102-138) is the proto-heat-dial: `maxScorerPerTick`, `dailyProbeCap`
  (durable per-UTC-day ledger), `motionProbeCadenceMs`. Collapse these into the one dial + spend
  rail; do not surface three knobs.
- `ambient-wake-scorer.mjs` — honest-refusal-by-default judgment (`{warrant:false}` on any
  failure), blocking `runClaudeQuerySync` subprocess. Reusable unchanged.
- `presence.mjs` lapses to away; the wall (F3) already holds everything outward when away.
- Cost: only the Claude Code adapter reports real dollars (`ctx.onCost`); Codex reports none.
  The spend rail must therefore count what it can see and treat unknown-cost drives as spending
  against a conservative per-drive estimate — never as free.

## Build

Create `brain/src/firm/heat.mjs`:

1. **One dial**: a per-venture founder setting `heat` (off | steady | full — a founder word, not a
   config surface) and **one spend rail** `dailySpendUsd`. Both founder-writable only. No other
   ambient tunable survives; `maxScorerPerTick`/`dailyProbeCap`/`motionProbeCadenceMs` fold into
   what each heat level means internally.
2. **The tick**: for each open venture with heat on — wake teammates on live bets that have a next
   inward move (drafting, research, mutation), route captured signals through the wake scorer, and
   run the reply poller (F5). Every wake is `driveTeammate` (F2); everything outward parks (F3).
   The spend ledger (durable, per-day) stops wakes when the rail is hit — mid-drive budget uses
   the existing `spentUsd`/`onCost` seam.
3. **Away semantics**: away changes nothing inward and releases nothing outward — by construction
   (F3), not by scheduler logic. The scheduler never reads presence to decide inward work.
4. Keep the kill switch env var and the unref'd timer discipline.

## Acceptance

- With heat on and a live bet, a tick produces inward work (fake runtime) and zero outward motion;
  the wall queue grows; no connector fires.
- The spend rail: once the day's ledger crosses the rail, no further wakes; the ledger survives
  restart.
- Heat off = the only driver left is the read-only reply poller (or nothing, founder's choice).
- Static guard: at most one heat setting + one spend rail are founder-configurable; a second
  ambient tunable in `firm/` fails the guard. Nothing committed.
