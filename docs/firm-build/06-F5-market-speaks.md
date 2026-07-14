# F5 — The market speaks

**Goal:** replies and outcomes return as the market's voice, joined to the bet that provoked them.
Kills mutate into next bets. No aggregate metric reaches a founder surface.

## Context (scout receipts)

- Ingress is polling, not webhooks: `connectors/measure/inbox-reader.mjs` `pollInboxOutcomes`
  (line 394) reuses the send credential (`gmail-oauth.mjs:167`), classifies deterministically
  (`classifyThread` line 233: bounce beats reply, own-provenance header excluded), and both
  ingests an outcome and writes a durable reply Input (`ensureReplyInput` line 354).
- The join is one key: staged items carry `joinKey` (`gtm-store.mjs:374-384`); `joinToRun`
  (`outcome-ingest.mjs:71`) is a pure lookup. Results already carry `pathId` — the bet pointer.
- Dedupe identity (`outcomeIdentity`, `outcome-ingest.mjs:269-281`) keeps one voice one voice
  under a poller. Administrative receipts (approval/release) are excluded from the outcome ledger
  (`isAdministrativeReceipt`, line 58) — approval is never an outcome.
- `reply-alert.mjs` is already voice-shaped: one alert object per reply, context + one suggested
  move, never aggregated.
- `writeLearningForResult` (line 202) splits structural vs identifying halves — keep the split.
- Soul writeback: `recordOutcomeIntoSoul` (line 426) feeds teammate track records.
- Scoreboards to NOT port: `outcomeReport` (line 663), `deriveMotionEfficiency` (line 767), their
  plain-summary generators, and every consumer (reallocation, path-portfolio, funnel views).

## Build

Create `brain/src/firm/market.mjs`:

1. **Re-target the join**: staged outward effects on bets carry `joinKey`; port `ingestOutcome`'s
   write order (dedupe → join → Result → Learning → soul write) with the join target being the
   bet. Keep `outcomeIdentity`, `isAdministrativeReceipt`, the structural/identifying split.
2. **Voice objects**: one record per return — who spoke (display string from the raw payload),
   what they said (`body`), which bet it answers, when. Positive, negative, zero (a no-reply
   window can be recorded by the founder or the poller) are all just voices. No counts anywhere
   founder-facing.
3. **Reply capture**: port `inbox-reader.mjs` + `gmail-oauth.mjs` verbatim, re-pointing
   `joinSentItems` to `{joinKey → betId}`; a captured reply parks a decide-together item at the
   wall (F3) carrying the voice and the bet.
4. **Kill → mutation**: when the founder kills a bet at the wall, the learning is handed to the
   crew as an ordinary `driveTeammate` goal ("this died; what is the smallest meaningful
   mutation?") which forks the mutation bet — the host never picks the dimension (port the
   restraint of `loser-mutation.mjs`, not its artifact machinery).
5. **Founder outcome entry**: port `recordFounderOutcome`'s open-label mapping and its honest
   unattributed fallback.

## Acceptance

- A polled reply lands as a voice on its exact bet, once (dedupe proven), and parks one
  decide-together item; deciding it never auto-replies or runs work.
- Approval/release receipts cannot enter the ledger. Unjoined signals stay unattributed.
- A founder kill produces a crew-authored mutation bet with lineage `forkedFrom` set.
- Static guard: no aggregate/count/score fields in any founder-facing route payload from
  `market.mjs`. Nothing committed.
