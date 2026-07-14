// bet.test.mjs — F1 acceptance: fork lineage reloads intact, positionOf derives correctly, end()
// rejects non-founder actors and records learning, and a killed bet stays readable.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { createBet, fork, end, positionOf } from "../../src/firm/bet.mjs";
import { createVenture, setVentureDoc, getVentureDoc, listVentureDocs } from "../../src/firm/venture-store.mjs";

function freshRoot() {
  return { root: fs.mkdtempSync(path.join(os.tmpdir(), "firm-bet-")) };
}

describe("bet — creation", () => {
  it("requires a ventureId and an intent", () => {
    assert.throws(() => createBet({ intent: "x" }), /ventureId/);
    assert.throws(() => createBet({ ventureId: "v1" }), /intent/);
  });

  it("mints a joinKey when none is supplied, and preserves one when given", () => {
    const a = createBet({ ventureId: "v1", intent: "try a colder subject line" });
    assert.ok(a.joinKey, "a bet always carries a joinKey so outcomes can join back to it");
    const b = createBet({ ventureId: "v1", intent: "try a warmer subject line", joinKey: "join-fixed-1" });
    assert.equal(b.joinKey, "join-fixed-1");
  });

  it("starts live: no endedAt, no endedBy, no learning", () => {
    const bet = createBet({ ventureId: "v1", intent: "try a colder subject line" });
    assert.equal(bet.endedAt, null);
    assert.equal(bet.endedBy, null);
    assert.equal(bet.learning, null);
    assert.equal(bet.forkedFrom, null);
  });
});

describe("bet — fork lineage: parent → child → mutation chain reloads intact", () => {
  it("a fork records forkedFrom, and a chain of forks reloads intact through the venture store", () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Fork lineage" }, options);

    const parent = createBet({ ventureId: venture.id, intent: "cold email to ops leads", teammateRef: "outreach-writer" });
    setVentureDoc(venture.id, "bets", parent.id, parent, options);

    const child = fork(parent, "cold email, colder subject line");
    setVentureDoc(venture.id, "bets", child.id, child, options);
    assert.equal(child.forkedFrom, parent.id);
    assert.equal(child.ventureId, parent.ventureId);
    assert.equal(child.teammateRef, parent.teammateRef, "a fork inherits the forking teammate by default");
    assert.notEqual(child.joinKey, parent.joinKey, "a fork is a new pointer into live work, not a continuation of the parent's join");

    const killed = end(child, "founder", { learning: "ops leads don't open cold email at all" });
    setVentureDoc(venture.id, "bets", killed.id, killed, options);

    const mutation = fork(killed, "switch to LinkedIn instead of email", { learning: killed.learning });
    setVentureDoc(venture.id, "bets", mutation.id, mutation, options);
    assert.equal(mutation.forkedFrom, killed.id);

    // Reload the whole chain from disk and confirm lineage survives the round-trip.
    const reloadedParent = getVentureDoc(venture.id, "bets", parent.id, options);
    const reloadedChild = getVentureDoc(venture.id, "bets", child.id, options);
    const reloadedKilled = getVentureDoc(venture.id, "bets", killed.id, options);
    const reloadedMutation = getVentureDoc(venture.id, "bets", mutation.id, options);

    assert.equal(reloadedParent.forkedFrom, null);
    assert.equal(reloadedChild.forkedFrom, parent.id);
    assert.equal(reloadedKilled.forkedFrom, parent.id);
    assert.equal(reloadedKilled.learning, "ops leads don't open cold email at all");
    assert.equal(reloadedMutation.forkedFrom, killed.id);

    // end() ends a bet in place (same id) rather than creating a new record, so the chain is three
    // distinct bet documents: parent, child (now ended, carrying its learning), and the mutation.
    const allBets = listVentureDocs(venture.id, "bets", options);
    assert.equal(allBets.length, 3);
  });
});

describe("bet — positionOf derives all three positions from the wall queue state", () => {
  it("live: not ended, not queued", () => {
    const bet = createBet({ ventureId: "v1", intent: "try a colder subject line" });
    assert.equal(positionOf(bet, []), "live");
  });

  it("at-wall: not ended, currently queued (array-of-entries shape)", () => {
    const bet = createBet({ ventureId: "v1", intent: "send the draft" });
    assert.equal(positionOf(bet, [{ betId: bet.id }, { betId: "other-bet" }]), "at-wall");
  });

  it("at-wall: not ended, currently queued (predicate-bearing queue shape)", () => {
    const bet = createBet({ ventureId: "v1", intent: "send the draft" });
    const queue = { has: (id) => id === bet.id };
    assert.equal(positionOf(bet, queue), "at-wall");
  });

  it("ended: founder ended it, regardless of wall queue state", () => {
    const bet = end(createBet({ ventureId: "v1", intent: "cold outbound to fintech ops" }), "founder");
    assert.equal(positionOf(bet, []), "ended");
    assert.equal(positionOf(bet, [{ betId: bet.id }]), "ended");
  });
});

describe("bet — end() is the founder's alone", () => {
  it("rejects a model/agent actor", () => {
    const bet = createBet({ ventureId: "v1", intent: "cold outbound to fintech ops" });
    assert.throws(() => end(bet, "agent"), /founder-only/);
    assert.throws(() => end(bet, { kind: "agent" }), /founder-only/);
    assert.throws(() => end(bet, { kind: "model" }), /founder-only/);
  });

  it("rejects an actor with no founder marker at all", () => {
    const bet = createBet({ ventureId: "v1", intent: "cold outbound to fintech ops" });
    assert.throws(() => end(bet), /founder-only/);
    assert.throws(() => end(bet, {}), /founder-only/);
    assert.throws(() => end(bet, ""), /founder-only/);
  });

  it("the founder can end a bet; it records learning and stays readable", () => {
    const options = freshRoot();
    const venture = createVenture({ name: "End is readable" }, options);
    const bet = createBet({ ventureId: venture.id, intent: "cold outbound to fintech ops" });
    setVentureDoc(venture.id, "bets", bet.id, bet, options);

    const ended = end(bet, "founder", { learning: "fintech ops leads want a phone call, not email" });
    setVentureDoc(venture.id, "bets", ended.id, ended, options);

    const reloaded = getVentureDoc(venture.id, "bets", bet.id, options);
    assert.ok(reloaded.endedAt, "a killed bet stays readable, with endedAt set");
    assert.equal(reloaded.endedBy, "founder");
    assert.equal(reloaded.learning, "fintech ops leads want a phone call, not email");
  });

  it("accepts a founder actor object carrying a ref, and stamps endedBy from it", () => {
    const bet = createBet({ ventureId: "v1", intent: "cold outbound to fintech ops" });
    const ended = end(bet, { kind: "founder", ref: "jacob" }, { learning: "too cold" });
    assert.equal(ended.endedBy, "jacob");
  });
});
