// work-loop-steer.test.mjs — the checkpoint steer seam (build contract §2.7 / Phase 5). A founder steer
// is queued durably on the effort and folded into the NEXT drive's brief, then cleared. Honest scope:
// it adjusts on the next step, not token-by-token mid-flight.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { createVenture, setVentureDoc, getVentureDoc } from "../../src/firm/venture-store.mjs";
import { createBet } from "../../src/firm/bet.mjs";
import { enqueueSteer, drainSteer, pendingSteerFor } from "../../src/firm/work-loop-steer.mjs";
import { driveTeammate } from "../../src/firm/work-loop.mjs";

function fresh(name) {
  const options = { root: fs.mkdtempSync(path.join(os.tmpdir(), "firm-steer-")) };
  const venture = createVenture({ name }, options);
  const bet = createBet({ ventureId: venture.id, intent: "the running effort", teammateRef: "sable" });
  setVentureDoc(venture.id, "bets", bet.id, bet, options);
  return { venture, bet, options };
}

describe("work-loop-steer — durable enqueue and drain", () => {
  it("enqueues a steer onto the effort and drains it exactly once into a resume brief", () => {
    const { venture, bet, options } = fresh("steer drain");
    enqueueSteer({ ventureId: venture.id, betId: bet.id, text: "tighten the opening", fromMessageId: "m1" }, options);
    enqueueSteer({ ventureId: venture.id, betId: bet.id, text: "warmer tone" }, options);
    assert.equal(pendingSteerFor(venture.id, bet.id, options).length, 2);

    const brief = drainSteer({ ventureId: venture.id, betId: bet.id }, options);
    assert.match(brief, /steered this work while it ran/i);
    assert.match(brief, /tighten the opening/);
    assert.match(brief, /warmer tone/);
    assert.equal(pendingSteerFor(venture.id, bet.id, options).length, 0, "draining clears the queue");
    assert.equal(drainSteer({ ventureId: venture.id, betId: bet.id }, options), null, "a second drain finds nothing");
  });

  it("refuses a steer with no effort — a steer is always addressed to an effort", () => {
    const { venture, options } = fresh("steer no effort");
    assert.throws(() => enqueueSteer({ ventureId: venture.id, betId: null, text: "x" }, options), /addressed to an effort/i);
  });
});

describe("work-loop-steer — the steer reaches the next drive's brief", () => {
  it("folds a queued steer into the next drive's system prompt, then clears it", async () => {
    const { venture, bet, options } = fresh("steer into brief");
    enqueueSteer({ ventureId: venture.id, betId: bet.id, text: "lead with the operational pain" }, options);

    let received;
    const runtime = {
      id: "capturing-runtime",
      label: "Capturing runtime",
      async drive(ctx) { received = ctx; return { kind: "completed", summary: "adjusted" }; },
    };
    await driveTeammate({
      ventureId: venture.id, teammateRef: "sable", goal: "keep going", betId: bet.id, options, deps: { runtime },
    });
    assert.match(received.system, /steered this work while it ran/i);
    assert.match(received.system, /lead with the operational pain/);
    // Drained: a second drive no longer carries it.
    const after = getVentureDoc(venture.id, "bets", bet.id, options);
    assert.deepEqual(after.work.pendingSteer ?? [], []);
  });
});
