// lens.test.mjs — F6 acceptance for the projection: crew + bets (with derived position/staged
// count/latest outcome), the wall summary, and placement (CAS, delete-loses-only-placement).

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { buildLens, putPlacement, clearPlacement, PersistenceConflictError } from "../../src/firm/lens.mjs";
import { createVenture, setVentureDoc, getVentureDoc } from "../../src/firm/venture-store.mjs";
import { createBet, fork, end } from "../../src/firm/bet.mjs";
import { summon } from "../../src/firm/crew.mjs";
import { park } from "../../src/firm/wall.mjs";

function freshRoot() {
  return { root: fs.mkdtempSync(path.join(os.tmpdir(), "firm-lens-")) };
}

function fixtureVenture(options) {
  const venture = createVenture({ name: "Lens fixture venture" }, options);
  summon(venture.id, "outreach-writer", {}, options);
  summon(venture.id, "landing-page-builder", {}, options);
  summon(venture.id, "closer", {}, options);

  const root1 = createBet({ ventureId: venture.id, intent: "cold outbound to fintech ops", teammateRef: "outreach-writer" });
  setVentureDoc(venture.id, "bets", root1.id, root1, options);
  const fork1 = fork(root1, "warmer subject line", { teammateRef: "outreach-writer" });
  setVentureDoc(venture.id, "bets", fork1.id, fork1, options);
  const fork2 = fork(root1, "try a different ICP", { teammateRef: "outreach-writer" });
  setVentureDoc(venture.id, "bets", fork2.id, fork2, options);
  const withVoice = createBet({ ventureId: venture.id, intent: "landing page v2", teammateRef: "landing-page-builder" });
  setVentureDoc(venture.id, "bets", withVoice.id, { ...withVoice, evidence: [{ type: "outcome", id: "outcome-1" }] }, options);
  setVentureDoc(venture.id, "outcomes", "outcome-1", {
    type: "outcome", id: "outcome-1", ventureId: venture.id, betId: withVoice.id,
    body: "looks good, tell me more", observedAt: "2026-07-01T00:00:00.000Z", joined: true,
  }, options);
  const staged = createBet({ ventureId: venture.id, intent: "a diff to the pricing page", teammateRef: "landing-page-builder" });
  setVentureDoc(venture.id, "bets", staged.id, { ...staged, staged: [{ id: "staged-1", content: "diff", stagedAt: "now" }] }, options);
  const endedBet = end(createBet({ ventureId: venture.id, intent: "cold list, too cold", teammateRef: "closer" }), "founder", { learning: "too cold" });
  setVentureDoc(venture.id, "bets", endedBet.id, endedBet, options);
  const wallBet = createBet({ ventureId: venture.id, intent: "ship a pricing page", teammateRef: "closer" });
  setVentureDoc(venture.id, "bets", wallBet.id, wallBet, options);

  park({ ventureId: venture.id, betId: wallBet.id, effect: { kind: "page", destination: "pricing" } }, options);
  park({ ventureId: venture.id, effect: { question: "which ICP should we push?" } }, options);

  return { venture, bets: { root1, fork1, fork2, withVoice, staged, endedBet, wallBet } };
}

describe("buildLens", () => {
  it("renders a fixture venture: crew of 3, seven bets with lineage, two wall items, one outcome", () => {
    const options = freshRoot();
    const { venture, bets } = fixtureVenture(options);
    const lens = buildLens(venture.id, options);

    assert.equal(lens.ventureId, venture.id);
    assert.equal(lens.crew.length, 3);
    assert.ok(lens.crew.every((entry) => entry.soul));

    assert.equal(lens.bets.length, 7);
    assert.equal(lens.wall.count, 2);
    assert.ok(lens.wall.oldestParkedAt);

    const forkedBet = lens.bets.find((b) => b.id === bets.fork1.id);
    assert.equal(forkedBet.forkedFrom, bets.root1.id);

    const voiced = lens.bets.find((b) => b.id === bets.withVoice.id);
    assert.equal(voiced.latestOutcome.body, "looks good, tell me more");

    const stagedBet = lens.bets.find((b) => b.id === bets.staged.id);
    assert.equal(stagedBet.stagedCount, 1);

    const ended = lens.bets.find((b) => b.id === bets.endedBet.id);
    assert.equal(ended.position, "ended");

    const atWall = lens.bets.find((b) => b.id === bets.wallBet.id);
    assert.equal(atWall.position, "at-wall");

    const live = lens.bets.find((b) => b.id === bets.root1.id);
    assert.equal(live.position, "live");
  });

  it("no founder-facing field on the lens payload is a count or score derived from the market", () => {
    const options = freshRoot();
    const { venture } = fixtureVenture(options);
    const lens = buildLens(venture.id, options);
    const serialized = JSON.stringify(lens);
    // The wall's own item COUNT is licensed (FIRM-SPEC.md: the wall is the one unmistakable
    // boundary); what is barred is a market sentiment score/rate anywhere in a bet's own shape.
    for (const bet of lens.bets) {
      assert.equal("score" in bet, false);
      assert.equal("sentimentScore" in bet, false);
      if (bet.latestOutcome) {
        assert.equal("score" in bet.latestOutcome, false);
        assert.equal("sentiment" in bet.latestOutcome, false);
      }
    }
    assert.ok(serialized); // sanity: payload actually serializes
  });

  it("an unknown venture fails closed", () => {
    const options = freshRoot();
    assert.throws(() => buildLens("no-such-venture", options), /No such venture/);
  });
});

describe("placement", () => {
  it("starts empty at revision 0, and a compareAndSet write persists and advances the revision", () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Placement venture" }, options);
    const first = buildLens(venture.id, options).placement;
    assert.deepEqual(first, { positions: {}, revision: 0 });

    const saved = putPlacement(venture.id, { positions: { "bet:1": { x: 10, y: 20 } }, expectedRevision: 0 }, options);
    assert.equal(saved.revision, 1);
    assert.deepEqual(saved.positions, { "bet:1": { x: 10, y: 20 } });

    const reloaded = buildLens(venture.id, options).placement;
    assert.deepEqual(reloaded, saved);
  });

  it("a stale expectedRevision is refused — two tabs racing a drag fail closed", () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Racing placement" }, options);
    putPlacement(venture.id, { positions: { a: { x: 0, y: 0 } }, expectedRevision: 0 }, options);
    assert.throws(
      () => putPlacement(venture.id, { positions: { a: { x: 99, y: 99 } }, expectedRevision: 0 }, options),
      PersistenceConflictError,
    );
  });

  it("deleting placement loses only positions — bets, crew, and decisions are untouched", () => {
    const options = freshRoot();
    const { venture, bets } = fixtureVenture(options);
    putPlacement(venture.id, { positions: { "bet:1": { x: 1, y: 1 } }, expectedRevision: 0 }, options);

    const beforeBet = getVentureDoc(venture.id, "bets", bets.root1.id, options);
    const beforeWall = buildLens(venture.id, options).wall;

    clearPlacement(venture.id, options);

    const afterPlacement = buildLens(venture.id, options).placement;
    assert.deepEqual(afterPlacement, { positions: {}, revision: 0 });

    const afterBet = getVentureDoc(venture.id, "bets", bets.root1.id, options);
    assert.deepEqual(afterBet, beforeBet);
    const afterWall = buildLens(venture.id, options).wall;
    assert.deepEqual(afterWall, beforeWall);
  });
});
