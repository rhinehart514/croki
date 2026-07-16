// market.test.mjs — F5 acceptance: a polled reply lands as an outcome on its exact bet once (dedupe
// proven), parks one decide-together item without ever auto-replying or running work; approval/
// release receipts cannot enter the ledger; unjoined signals stay unattributed; a founder kill hands
// the learning to the crew as an ordinary driveTeammate goal, producing a mutation bet with lineage.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { recordOutcome, recordFounderOutcome, mutateKilledBet } from "../../src/firm/market.mjs";
import { createVenture, getVentureDoc, setVentureDoc, listVentureDocs } from "../../src/firm/venture-store.mjs";
import { createBet, end as endBet } from "../../src/firm/bet.mjs";
import { queue } from "../../src/firm/wall.mjs";

function freshRoot() {
  return { root: fs.mkdtempSync(path.join(os.tmpdir(), "firm-market-")) };
}

function makeBet(ventureId, options, overrides = {}) {
  const bet = createBet({ ventureId, intent: "cold outbound to fintech ops", teammateRef: "outreach-writer", ...overrides });
  setVentureDoc(ventureId, "bets", bet.id, bet, options);
  return bet;
}

describe("market — a reply lands as an outcome on its exact bet", () => {
  it("joins an outcome to the bet whose joinKey matches, appended to bet.evidence", () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Outcome join" }, options);
    const bet = makeBet(venture.id, options, { configurationRevision: 7 });

    const { outcome, joined, bet: joinedBet } = recordOutcome(
      { ventureId: venture.id, joinKey: bet.joinKey, outcomeKind: "reply", body: "sounds interesting, tell me more", from: "jo@acme.com", source: "connected-account" },
      options,
    );
    assert.equal(joined, true);
    assert.equal(joinedBet.id, bet.id);
    assert.equal(outcome.type, "outcome");
    assert.equal(outcome.body, "sounds interesting, tell me more");
    assert.equal(outcome.configurationRevision, 7);

    const reloaded = getVentureDoc(venture.id, "bets", bet.id, options);
    assert.equal(reloaded.evidence.length, 1);
    assert.equal(reloaded.evidence[0].type, "outcome");
    assert.equal(reloaded.evidence[0].id, outcome.id);
    assert.equal(listVentureDocs(venture.id, "outcomes", options)[0].outcomeKind, "reply");
  });

  it("a poller re-observing the same reply on a later tick is a durable no-op (dedupe by provider event)", () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Dedupe" }, options);
    const bet = makeBet(venture.id, options, { configurationRevision: 7 });
    const raw = { ventureId: venture.id, joinKey: bet.joinKey, outcomeKind: "reply", body: "hi", from: "jo@acme.com", source: "connected-account", providerEventId: "gmail-msg-1", providerSourceId: "thread-1" };

    const first = recordOutcome(raw, options);
    assert.equal(first.deduped, false);
    const second = recordOutcome(raw, options);
    assert.equal(second.deduped, true);
    assert.equal(second.outcome.id, first.outcome.id);

    const reloaded = getVentureDoc(venture.id, "bets", bet.id, options);
    assert.equal(reloaded.evidence.filter((e) => e.type === "outcome").length, 1, "exactly one outcome, not two");
  });

  it("dedupe also holds on the message-id fallback tuple for non-provider-event sources", () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Dedupe fallback" }, options);
    const bet = makeBet(venture.id, options);
    const raw = { ventureId: venture.id, joinKey: bet.joinKey, outcomeKind: "reply", body: "hi", messageId: "msg-1", source: "connected-account" };
    recordOutcome(raw, options);
    const second = recordOutcome(raw, options);
    assert.equal(second.deduped, true);
  });

  it("a founder-entered outcome does NOT dedupe on the message fallback (each founder note is a separate fact)", () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Founder notes distinct" }, options);
    const bet = makeBet(venture.id, options);
    const raw = { ventureId: venture.id, joinKey: bet.joinKey, outcomeKind: "reply", body: "note one", messageId: "ctx-1", source: "founder-entered" };
    recordOutcome(raw, options);
    const second = recordOutcome({ ...raw, body: "note two" }, options);
    assert.equal(second.deduped, false, "founder-entered outcomes are never collapsed by the message fallback alone");
  });
});

describe("market — parks exactly one decide-together item, never auto-replies or runs work", () => {
  it("recordOutcome parks a wall item carrying the outcome, and deciding it never touches an executor", () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Decide together" }, options);
    const bet = makeBet(venture.id, options, { configurationRevision: 7 });
    const { queued } = recordOutcome({ ventureId: venture.id, joinKey: bet.joinKey, outcomeKind: "reply", body: "let's talk", source: "connected-account" }, options);

    assert.ok(queued);
    assert.equal(queued.purpose, "review-outcome");
    assert.equal(queued.blocksBet, false);
    assert.equal(queued.configurationRevision, 7);
    assert.equal(queued.effect.outcome.body, "let's talk");

    const wallQueue = queue(venture.id, options);
    assert.equal(wallQueue.length, 1);
    assert.equal(wallQueue[0].id, queued.id);
    assert.equal(wallQueue[0].betId, bet.id);
  });

  it("a dedupe no-op does NOT park a second wall item", () => {
    const options = freshRoot();
    const venture = createVenture({ name: "No double park" }, options);
    const bet = makeBet(venture.id, options);
    const raw = { ventureId: venture.id, joinKey: bet.joinKey, outcomeKind: "reply", body: "hi", providerEventId: "evt-1", source: "connected-account" };
    recordOutcome(raw, options);
    const second = recordOutcome(raw, options);
    assert.equal(second.queued, null, "a deduped outcome parks nothing new");
    assert.equal(queue(venture.id, options).length, 1);
  });
});

describe("market — approval/release receipts cannot enter the ledger", () => {
  it("refuses an outcomeKind of approval/release", () => {
    const options = freshRoot();
    const venture = createVenture({ name: "No admin receipts" }, options);
    assert.throws(
      () => recordOutcome({ ventureId: venture.id, joinKey: "j1", outcomeKind: "founder-approval" }, options),
      /not a market outcome/,
    );
    assert.throws(
      () => recordOutcome({ ventureId: venture.id, joinKey: "j1", outcomeKind: "release" }, options),
      /not a market outcome/,
    );
  });
});

describe("market — unjoined signals stay unattributed, never claimed onto the wrong bet", () => {
  it("an outcome whose joinKey matches nothing still records honestly, unattributed, and still parks an alert", () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Unjoined" }, options);
    const { outcome, joined, bet, queued } = recordOutcome(
      { ventureId: venture.id, joinKey: "no-such-bet-joinkey", outcomeKind: "reply", body: "hello?", source: "connected-account" },
      options,
    );
    assert.equal(joined, false);
    assert.equal(bet, null);
    assert.ok(queued, "an unjoined outcome still alerts the founder");
    assert.equal(queued.betId, null);
    assert.equal(outcome.attribution, "unattributed");
    assert.equal(listVentureDocs(venture.id, "outcomes", options).length, 1);
  });
});

describe("market — founder outcome entry (recordFounderOutcome)", () => {
  it("maps an open happened-label to an outcomeKind and joins to the named bet", () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Founder entry" }, options);
    const bet = makeBet(venture.id, options);
    const { outcome, joined } = recordFounderOutcome({ ventureId: venture.id, betId: bet.id, happened: "got replies", learned: "cold subject lines flop" }, options);
    assert.equal(joined, true);
    assert.equal(outcome.outcomeKind, "reply");
    assert.equal(outcome.body, "cold subject lines flop");
  });

  it("an unrecognized happened-label passes through lowercased rather than being rejected", () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Open label" }, options);
    const bet = makeBet(venture.id, options);
    const { outcome } = recordFounderOutcome({ ventureId: venture.id, betId: bet.id, happened: "went viral on reddit", learned: "huh" }, options);
    assert.equal(outcome.outcomeKind, "went viral on reddit");
  });

  it("recording with no bet named still records honestly with a fresh one-off join", () => {
    const options = freshRoot();
    const venture = createVenture({ name: "No bet named" }, options);
    const { outcome, joined } = recordFounderOutcome({ ventureId: venture.id, happened: "other", learned: "just noting something" }, options);
    assert.equal(joined, false);
    assert.ok(outcome.joinKey);
  });
});

describe("market — kill produces a crew-authored mutation bet with lineage", () => {
  it("mutateKilledBet drives an ordinary goal through driveTeammate (injected double) and forks with forkedFrom set", async () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Kill mutation" }, options);
    const bet = makeBet(venture.id, options);
    const ended = endBet(bet, "founder", { learning: "cold list, no signal" });
    setVentureDoc(venture.id, "bets", ended.id, ended, options);

    let seenGoal = null;
    let seenTeammateRef = null;
    const fakeDrive = async ({ ventureId, teammateRef, goal }) => {
      seenGoal = goal;
      seenTeammateRef = teammateRef;
      // Simulate the crew's own fork_bet tool call — the host never picks the dimension, the crew does.
      const { fork } = await import("../../src/firm/bet.mjs");
      const mutated = fork(ended, "try a warmer, referral-based angle instead of cold outbound", { learning: ended.learning });
      setVentureDoc(ventureId, "bets", mutated.id, mutated, options);
      return { outcome: { kind: "forked" }, mutatedBetId: mutated.id };
    };

    const result = await mutateKilledBet({ ventureId: venture.id, bet: ended }, options, { driveTeammate: fakeDrive });
    assert.equal(seenTeammateRef, "outreach-writer");
    assert.match(seenGoal, /died/);
    assert.match(seenGoal, /smallest meaningful mutation/i);
    assert.match(seenGoal, new RegExp(ended.id));

    const { listVentureDocs } = await import("../../src/firm/venture-store.mjs");
    const mutatedBet = listVentureDocs(venture.id, "bets", options).find((b) => b.forkedFrom === ended.id);
    assert.ok(mutatedBet, "a mutation bet was forked with lineage back to the killed bet");
    assert.equal(mutatedBet.forkedFrom, ended.id);
  });

  it("refuses to mutate a bet that was never actually ended", async () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Not ended" }, options);
    const bet = makeBet(venture.id, options);
    await assert.rejects(
      () => mutateKilledBet({ ventureId: venture.id, bet }, options, { driveTeammate: async () => ({}) }),
      /already-ended bet/,
    );
  });

  it("refuses when there is no teammateRef to hand the goal to", async () => {
    const options = freshRoot();
    const venture = createVenture({ name: "No teammate" }, options);
    const bet = makeBet(venture.id, options, { teammateRef: undefined });
    const ended = endBet(bet, "founder", { learning: "dead end" });
    setVentureDoc(venture.id, "bets", ended.id, ended, options);
    await assert.rejects(
      () => mutateKilledBet({ ventureId: venture.id, bet: ended }, options, { driveTeammate: async () => ({}) }),
      /teammateRef/,
    );
  });
});
