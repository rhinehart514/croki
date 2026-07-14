# F3 — The wall queue

**Goal:** one decision surface for everything outward: releases, kills, replies, questions. The
security matrix passes against the new store.

## Context (scout receipts)

- `OUTWARD_RELEASE` today is a module-private Symbol in `graph.mjs:27-32`, rebuilt fresh per run,
  threaded on `node.runtime`, checked by every execute connector (`hasOutwardRelease`). Port the
  pattern, not the file: the capability moves onto the executing context of a released item.
- Founder authority: `session-guard.mjs` (`authorizeFounderWriteForRequest`,
  `claimFounderSession`, browser-only session minting, `x-gtm-actor: agent` rejection).
- Presence: `presence.mjs` — volatile 60s lease, lapses to away, any caller may mark away.
- The away-hold logic in `connectors/gate/default.mjs:150-179` (standing autonomy suppressed when
  away and downstream possibly outward) — port the *behavior*: when away, nothing auto-releases.
- Existing security tests to port/re-target: `run-approve.test.mjs`, `gate-pattern.test.mjs`,
  `experiment-verdict-auth.test.mjs`, `run-venture-isolation.test.mjs`,
  `founder-authority-route-guards.test.mjs`, the deploy double-authorization guards in
  `anti-cage.test.mjs:449-551`.

## Build

Create `brain/src/firm/wall.mjs` and `brain/src/firm/routes.mjs` (wall section):

1. **`park({ ventureId, betId, effect })`** — an outward effect (send/publish/deploy/spend), a
   founder question, a kill proposal, or a reply-decision enters the queue. The effect names its
   exact difference (message + recipients, page + destination, diff + environment, amount +
   recipient) — whatever `stage_outward` classified.
2. **`queue(ventureId)`** — the one list the founder reviews; also a cross-venture
   `queueAll()` for the portfolio wall (F8), each item still venture-scoped.
3. **`decide({ ventureId, itemId, decision, note })`** — founder-only (session-guard); writes a
   receipt to `decisions`; on release, mints the outward capability for that one execution and
   invokes the effect's executor (gmail/http/slack/deploy connectors, which keep their
   `hasOutwardRelease` refusal); on kill, calls `bet.end()` and hands the learning to the crew
   (mutation fork is F5). Deploy keeps its second explicit authorization.
4. **Presence hold**: when away, `decide` by anything other than an authenticated founder browser
   is rejected, and no standing pattern auto-releases. Promote-by-replay (standing approval for a
   proven pattern) ports from the autonomy ladder later — exceptions still park.
5. **Routes**: `GET /api/ventures/:id/wall`, `POST /api/ventures/:id/wall/:item/decide`
   (founder-gated), agent-stamped callers rejected, cross-venture 404s.

## Acceptance (tests under `brain/test/firm/`)

- Only a founder-authenticated decision releases; browser/API/MCP/model self-approval all rejected.
- A released send executes exactly once with the capability; an unreleased item can never reach a
  connector (connector-level refusal test).
- Away: standing patterns hold; marking away requires nothing; marking present requires founder auth.
- Kill writes the receipt + learning and is the only path to `endedBy`.
- Cross-venture decide fails closed as 404. Deploy requires the second authorization.
- Nothing committed.
