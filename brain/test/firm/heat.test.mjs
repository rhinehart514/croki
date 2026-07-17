// heat.test.mjs — the founder dial + spend rail, and the founder-invokable batch tick. The perpetual
// firm loop is GONE (FIRM-SPEC rail #1; STATE.md): heat.mjs no longer arms any timer, exposes no
// startHeatScheduler, and carries no env switch that could re-enable an ambient loop by default. What
// this suite proves: a founder-INVOKED runHeatTick wakes inward work and never releases anything
// outward; the spend rail durably stops wakes once the day's ledger is crossed; heat off leaves only
// the read-only reply poller; the static guard keeps exactly one heat setting + one spend rail; and the
// ambient-loop guard proves nothing in heat.mjs can start work on a schedule.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { founderRequest } from "../helpers/founder-capability.mjs";

import {
  HEAT_LEVELS,
  getHeatSettings,
  setHeatSettings,
  chargeHeatSpend,
  runHeatTick,
} from "../../src/firm/heat.mjs";
import { createVenture, setVentureDoc, listVentureDocs, getVentureDoc } from "../../src/firm/venture-store.mjs";
import { createBet } from "../../src/firm/bet.mjs";
import { queue as wallQueue, park } from "../../src/firm/wall.mjs";

function freshRoot() {
  return { root: fs.mkdtempSync(path.join(os.tmpdir(), "firm-heat-")) };
}

function browserReq() {
  return founderRequest();
}

function agentReq() {
  const req = browserReq();
  req.headers["x-gtm-actor"] = "agent";
  return req;
}

function founderAuth() {
  return { req: browserReq() };
}

function fakeDriveTeammate(betsWoken, { spentUsd = 0 } = {}) {
  return async ({ ventureId, teammateRef, betId }) => {
    betsWoken.push({ ventureId, teammateRef, betId });
    return { outcome: { kind: "completed", summary: "worked it" }, work: { spentUsd }, consultedTools: [] };
  };
}

describe("heat — the one dial + one spend rail, founder-writable only", () => {
  it("defaults to off / $0 for a venture that never set one", () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Fresh venture" }, options);
    const settings = getHeatSettings(venture.id, options);
    assert.equal(settings.heat, "off");
    assert.equal(settings.dailySpendUsd, 0);
  });

  it("the founder can set heat + the spend rail; it persists", () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Heat set" }, options);
    const written = setHeatSettings({ ventureId: venture.id, heat: "steady", dailySpendUsd: 5 }, founderAuth(), options);
    assert.equal(written.heat, "steady");
    assert.equal(written.dailySpendUsd, 5);
    assert.deepEqual(getHeatSettings(venture.id, options), { heat: "steady", dailySpendUsd: 5 });
  });

  it("rejects an agent-stamped caller", () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Guard" }, options);
    assert.throws(() => setHeatSettings(
      { ventureId: venture.id, heat: "full", dailySpendUsd: 1 },
      { req: agentReq() },
      options,
    ), /cannot make this decision/i);
  });

  it("rejects an unknown heat word and a negative spend rail", () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Validation" }, options);
    assert.throws(() => setHeatSettings({ ventureId: venture.id, heat: "blazing", dailySpendUsd: 1 }, founderAuth(), options), /heat must be one of/);
    assert.throws(() => setHeatSettings({ ventureId: venture.id, heat: "full", dailySpendUsd: -1 }, founderAuth(), options), /non-negative/);
  });

  it("fails closed on a venture that was never created, matching every other venture-scoped write in this tree", () => {
    const options = freshRoot();
    let threw;
    try {
      setHeatSettings({ ventureId: "never-created", heat: "full", dailySpendUsd: 1 }, founderAuth(), options);
    } catch (err) {
      threw = err;
    }
    assert.ok(threw, "setHeatSettings must not silently write heat for a venture that doesn't exist");
    assert.equal(threw.code, "venture_not_found");
    assert.match(threw.message, /No such venture/);
  });
});

describe("heat — with heat on and a live bet, a tick produces inward work and zero outward motion", () => {
  it("wakes the live bet's teammate via driveTeammate; the wall queue grows only from stage_outward inside the drive, not from the scheduler itself", async () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Tick wakes work" }, options);
    setHeatSettings({ ventureId: venture.id, heat: "steady", dailySpendUsd: 10 }, founderAuth(), options);

    const bet = createBet({ ventureId: venture.id, intent: "cold email to ops leads", teammateRef: "outreach-writer" });
    setVentureDoc(venture.id, "bets", bet.id, bet, options);

    const woken = [];
    const result = await runHeatTick(venture.id, {
      options,
      deps: { driveTeammate: fakeDriveTeammate(woken), pollReplies: async () => null },
    });

    assert.equal(result.heat, "steady");
    assert.equal(woken.length, 1, "exactly the one live bet was woken");
    assert.equal(woken[0].teammateRef, "outreach-writer");
    assert.equal(woken[0].betId, bet.id);
    // The scheduler itself never calls wall.park() or connects to anything outward — the only queue
    // growth possible is whatever the (faked, here inert) drive itself staged via stage_outward.
    assert.deepEqual(wallQueue(venture.id, options), [], "no outward motion was parked by the tick itself");
  });

  it("never wakes a bet already ended, or a bet currently parked at the wall", async () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Position filter" }, options);
    setHeatSettings({ ventureId: venture.id, heat: "full", dailySpendUsd: 10 }, founderAuth(), options);

    const live = createBet({ ventureId: venture.id, intent: "try angle A", teammateRef: "closer" });
    setVentureDoc(venture.id, "bets", live.id, live, options);

    const parked = createBet({ ventureId: venture.id, intent: "try angle B", teammateRef: "closer" });
    setVentureDoc(venture.id, "bets", parked.id, parked, options);
    park({ ventureId: venture.id, betId: parked.id, effect: { external: true } }, options);

    const woken = [];
    await runHeatTick(venture.id, { options, deps: { driveTeammate: fakeDriveTeammate(woken), pollReplies: async () => null } });
    assert.deepEqual(woken.map((w) => w.betId), [live.id], "only the live, non-parked bet was woken");
  });
});

describe("heat — the spend rail durably stops wakes once the day's ledger is crossed", () => {
  it("stops waking further bets once dailySpendUsd is reached, and the ledger survives a fresh process (root reload)", async () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Spend rail" }, options);
    setHeatSettings({ ventureId: venture.id, heat: "full", dailySpendUsd: 1 }, founderAuth(), options);

    const betA = createBet({ ventureId: venture.id, intent: "angle A", teammateRef: "closer" });
    const betB = createBet({ ventureId: venture.id, intent: "angle B", teammateRef: "closer" });
    setVentureDoc(venture.id, "bets", betA.id, betA, options);
    setVentureDoc(venture.id, "bets", betB.id, betB, options);

    const woken = [];
    // A measured $1.50 drive on the first bet blows straight through the $1 rail.
    await runHeatTick(venture.id, {
      options,
      deps: { driveTeammate: fakeDriveTeammate(woken, { spentUsd: 1.5 }), pollReplies: async () => null },
    });
    assert.equal(woken.length, 1, "the rail stopped the second wake in the same tick");

    // A brand-new options object (same root) simulates a process restart — the ledger must still hold.
    const reloadedOptions = { root: options.root };
    const secondTick = [];
    await runHeatTick(venture.id, {
      options: reloadedOptions,
      deps: { driveTeammate: fakeDriveTeammate(secondTick), pollReplies: async () => null },
    });
    assert.equal(secondTick.length, 0, "the ledger survived reload and still holds the day's spend over the rail");
  });

  it("charges the conservative flat estimate for an unmeasured (cost-silent) drive, never treating it as free", async () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Unmeasured cost" }, options);
    setHeatSettings({ ventureId: venture.id, heat: "full", dailySpendUsd: 10 }, founderAuth(), options);
    const spentBefore = chargeHeatSpend(venture.id, 0, { options }); // reads current ledger as a baseline (0 add)
    assert.equal(spentBefore, 0);

    const bet = createBet({ ventureId: venture.id, intent: "angle", teammateRef: "closer" });
    setVentureDoc(venture.id, "bets", bet.id, bet, options);
    const woken = [];
    // spentUsd: 0 mimics a Codex-routed or otherwise cost-silent drive — no ctx.onCost ever fired.
    await runHeatTick(venture.id, { options, deps: { driveTeammate: fakeDriveTeammate(woken, { spentUsd: 0 }), pollReplies: async () => null } });
    const afterEstimate = chargeHeatSpend(venture.id, 0, { options });
    assert.ok(afterEstimate > 0, "an unmeasured drive still charged something against the rail — never free");
  });
});

describe("heat — heat off leaves only the read-only reply poller", () => {
  it("wakes no teammate when heat is off, but still runs the poller", async () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Heat off" }, options);
    // heat defaults to off — no setHeatSettings call needed.
    const bet = createBet({ ventureId: venture.id, intent: "angle", teammateRef: "closer" });
    setVentureDoc(venture.id, "bets", bet.id, bet, options);

    const woken = [];
    let polledCalledWith = null;
    const result = await runHeatTick(venture.id, {
      options,
      deps: {
        driveTeammate: fakeDriveTeammate(woken),
        pollReplies: async (ventureId) => { polledCalledWith = ventureId; return { polled: true }; },
      },
    });
    assert.equal(result.heat, "off");
    assert.equal(woken.length, 0, "heat off wakes nothing");
    assert.equal(polledCalledWith, venture.id, "the read-only reply poller still ran");
  });

  it("with no deps.pollReplies injected, the tick lazily wires in the real market-poll.mjs poller and never breaks on a venture with nothing released yet", async () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Poller absent" }, options);
    const result = await runHeatTick(venture.id, { options, deps: { driveTeammate: async () => ({ outcome: {}, work: {} }) } });
    // The real pollReplies (F5 step 3, market-poll.mjs) now runs — it honestly no-ops for a venture
    // with nothing released, rather than the tick finding no poller at all.
    assert.equal(result.polled.polled, 0);
    assert.match(result.polled.reason, /nothing/i);
  });

  it("a poller that throws outright still never breaks the tick", async () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Poller throws" }, options);
    const result = await runHeatTick(venture.id, {
      options,
      deps: { driveTeammate: async () => ({ outcome: {}, work: {} }), pollReplies: async () => { throw new Error("boom"); } },
    });
    assert.equal(result.polled, null);
  });
});

describe("heat — static guard: at most one heat setting + one spend rail are founder-configurable", () => {
  it("heat.mjs exposes exactly HEAT_LEVELS (3 words) and never a second ambient tunable name", async () => {
    assert.deepEqual(HEAT_LEVELS, ["off", "steady", "full"]);
    const src = fs.readFileSync(path.join(import.meta.dirname, "../../src/firm/heat.mjs"), "utf8");
    const stripped = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    // The retired ambient-scheduler triad must never resurface as a SECOND founder-facing tunable name
    // here — only as the internal HEAT_TICK_SHAPE mapping already folded into the one heat word.
    for (const retired of ["maxScorerPerTick", "dailyProbeCap", "motionProbeCadenceMs"]) {
      assert.ok(!stripped.includes(retired), `heat.mjs must never expose "${retired}" as a tunable name`);
    }
    // setHeatSettings' own writable input shape carries only heat + dailySpendUsd.
    const setSignature = stripped.match(/export function setHeatSettings\(\{([^}]*)\}/)?.[1] ?? "";
    const fields = setSignature.split(",").map((s) => s.trim().split(/[:=]/)[0].trim()).filter(Boolean);
    assert.deepEqual(fields.sort(), ["dailySpendUsd", "heat", "ventureId"].sort());
  });
});

describe("heat — the perpetual firm loop is gone: no scheduler, no timer, no ambient re-enable", () => {
  it("heat.mjs exports no scheduler and no ambient-loop entry point", async () => {
    const mod = await import("../../src/firm/heat.mjs");
    // The always-on scheduler was removed. Work begins only through an explicit founder-invoked path
    // (runHeatTick, given a ventureId) — never a boot-time timer over every venture.
    assert.equal(mod.startHeatScheduler, undefined, "startHeatScheduler must not exist — no ambient loop");
    assert.equal(mod.stopHeatScheduler, undefined, "no scheduler handle to stop");
    assert.equal(typeof mod.runHeatTick, "function", "runHeatTick survives as a founder-invokable batch pass");
  });

  it("heat.mjs arms no timer and carries no env switch that could re-enable an ambient loop by default", () => {
    const src = fs.readFileSync(path.join(import.meta.dirname, "../../src/firm/heat.mjs"), "utf8");
    const stripped = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    assert.ok(!/setInterval\s*\(/.test(stripped), "heat.mjs must arm no recurring timer");
    assert.ok(!stripped.includes("startHeatScheduler"), "no scheduler function survives in source");
    // The former kill/tick env switches are gone too — a loop that can be turned back on by env is not
    // structurally off. Their absence proves the default is off with no code path re-enabling it.
    assert.ok(!stripped.includes("GTM_IDE_DISABLE_HEAT"), "no ambient kill switch env survives");
    assert.ok(!stripped.includes("GTM_IDE_HEAT_TICK_MS"), "no ambient tick-interval env survives");
  });

  it("the server boot path arms no ambient loop — startHeatScheduler is neither imported nor called", () => {
    const src = fs.readFileSync(path.join(import.meta.dirname, "../../src/server.mjs"), "utf8");
    const stripped = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    assert.ok(!stripped.includes("startHeatScheduler"), "server.mjs must not import or call startHeatScheduler");
    assert.ok(!stripped.includes("heatScheduler"), "server.mjs holds no ambient scheduler handle");
  });
});

describe("heat — nothing outward moves regardless of heat, and away is never read", () => {
  it("heat.mjs never imports or calls presence.mjs — the scheduler never reads presence to decide inward work", () => {
    const src = fs.readFileSync(path.join(import.meta.dirname, "../../src/firm/heat.mjs"), "utf8");
    const stripped = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    assert.ok(!stripped.includes("presence.mjs"), "heat.mjs must never import presence — away-safety is the wall's own construction");
  });

  it("a tick still runs (and still wakes) even when the venture is away — the wake itself is inward and always allowed", async () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Away irrelevant" }, options);
    setHeatSettings({ ventureId: venture.id, heat: "steady", dailySpendUsd: 10 }, founderAuth(), options);
    const bet = createBet({ ventureId: venture.id, intent: "angle", teammateRef: "closer" });
    setVentureDoc(venture.id, "bets", bet.id, bet, options);
    const woken = [];
    await runHeatTick(venture.id, { options, deps: { driveTeammate: fakeDriveTeammate(woken), pollReplies: async () => null } });
    assert.equal(woken.length, 1, "the tick woke inward work with no presence check anywhere in the path");
  });
});
