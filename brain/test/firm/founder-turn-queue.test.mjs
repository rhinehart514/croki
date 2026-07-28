import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { createBet } from "../../src/firm/bet.mjs";
import {
  drainQueuedFounderTurns,
  editQueuedFounderTurn,
  listQueuedFounderTurns,
  queueFounderTurn,
  removeQueuedFounderTurn,
  tombstoneQueuedFounderTurns,
} from "../../src/firm/founder-turn-queue.mjs";
import { createVenture, getVentureDoc, setVentureDoc } from "../../src/firm/venture-store.mjs";

function fresh(name) {
  const options = { root: fs.mkdtempSync(path.join(os.tmpdir(), "founder-turn-queue-")) };
  const venture = createVenture({ name }, options);
  const bet = createBet({ ventureId: venture.id, intent: "Continue provider work", teammateRef: "codex" });
  setVentureDoc(venture.id, "bets", bet.id, { ...bet, work: { pendingProviderIntervention: { key: "permission:x" } } }, options);
  return { venture, bet, options };
}

describe("durable founder follow-up queue", () => {
  it("restores ordered turns, permits exact edit/remove, and dispatches the remainder once", () => {
    const { venture, bet, options } = fresh("restore queue");
    const first = queueFounderTurn({ ventureId: venture.id, betId: bet.id, text: "First correction", fromMessageId: "m1" }, options);
    const second = queueFounderTurn({ ventureId: venture.id, betId: bet.id, text: "Second correction", fromMessageId: "m2" }, options);

    assert.deepEqual(listQueuedFounderTurns(venture.id, bet.id, options).map((turn) => turn.text), ["First correction", "Second correction"]);
    editQueuedFounderTurn({ ventureId: venture.id, betId: bet.id, turnId: first.id, text: "Edited first" }, options);
    removeQueuedFounderTurn({ ventureId: venture.id, betId: bet.id, turnId: second.id }, options);
    assert.deepEqual(listQueuedFounderTurns(venture.id, bet.id, options).map((turn) => turn.text), ["Edited first"]);

    const brief = drainQueuedFounderTurns({ ventureId: venture.id, betId: bet.id }, options);
    assert.match(brief, /Edited first/);
    assert.equal(drainQueuedFounderTurns({ ventureId: venture.id, betId: bet.id }, options), null);
    const durable = getVentureDoc(venture.id, "bets", bet.id, options).work.queuedFounderTurns;
    assert.equal(durable.find((turn) => turn.id === first.id).state, "dispatched");
    assert.equal(durable.find((turn) => turn.id === second.id).state, "tombstoned");
  });

  it("turns stop/delete into tombstones that can never dispatch", () => {
    const { venture, bet, options } = fresh("stop queue");
    queueFounderTurn({ ventureId: venture.id, betId: bet.id, text: "Must not run" }, options);
    assert.equal(tombstoneQueuedFounderTurns({ ventureId: venture.id, betId: bet.id, reason: "run-stopped" }, options), 1);
    assert.deepEqual(listQueuedFounderTurns(venture.id, bet.id, options), []);
    assert.equal(drainQueuedFounderTurns({ ventureId: venture.id, betId: bet.id }, options), null);
  });
});
