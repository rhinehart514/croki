import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { createBet } from "../../src/firm/bet.mjs";
import { applyFirmConfiguration, getFirmConfiguration } from "../../src/firm/configuration.mjs";
import { DRIVE_LEASES_KEY } from "../../src/firm/work-loop-drive-lease.mjs";
import { driveTeammate, getAgentDailySpend } from "../../src/firm/work-loop.mjs";
import { createVenture, getVentureDoc, setVentureDoc } from "../../src/firm/venture-store.mjs";

function freshRoot() {
  return { root: fs.mkdtempSync(path.join(os.tmpdir(), "firm-drive-concurrency-")) };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function configuredVenture(cap = null) {
  const options = freshRoot();
  const venture = createVenture({ name: "Concurrent work" }, options);
  await driveTeammate({
    ventureId: venture.id,
    teammateRef: "operator",
    goal: "Initialize",
    options,
    deps: { runtime: { id: "init", label: "Init", async drive() { return { kind: "completed", summary: "ready" }; } } },
  });
  const current = getFirmConfiguration(venture.id, options);
  applyFirmConfiguration({
    ventureId: venture.id,
    expectedRevision: current.revision,
    configuration: {
      ...current,
      agents: current.agents.map((agent) => ({ ...agent, budget: { ...agent.budget, dailySpendUsd: cap } })),
    },
  }, options);
  return { options, venture };
}

describe("participant drive concurrency rails", () => {
  it("serializes overlapping provider calls before budget read and cannot overspend the daily rail", async () => {
    const { options, venture } = await configuredVenture(0.4);
    const firstEntered = deferred();
    const releaseFirst = deferred();
    const seenBudgets = [];
    let active = 0;
    let maxActive = 0;
    const runtime = {
      id: "metered-concurrent",
      label: "Metered concurrent",
      costReporting: "usd",
      async drive(ctx) {
        const index = seenBudgets.length;
        seenBudgets.push(ctx.maxBudgetUsd);
        active += 1;
        maxActive = Math.max(maxActive, active);
        if (index === 0) {
          firstEntered.resolve();
          await releaseFirst.promise;
        }
        ctx.onCost(index === 0 ? 0.3 : 0.1);
        active -= 1;
        return { kind: "completed", summary: `turn ${index + 1}` };
      },
    };

    const first = driveTeammate({ ventureId: venture.id, teammateRef: "operator", goal: "First", options, deps: { runtime } });
    await firstEntered.promise;
    const second = driveTeammate({ ventureId: venture.id, teammateRef: "operator", goal: "Second", options, deps: { runtime } });
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(seenBudgets.length, 1, "the second provider call cannot begin from the first call's stale ledger");
    releaseFirst.resolve();
    await Promise.all([first, second]);

    assert.equal(maxActive, 1);
    assert.ok(Math.abs(seenBudgets[0] - 0.4) < 1e-9);
    assert.ok(Math.abs(seenBudgets[1] - 0.1) < 1e-9);
    const ledger = getAgentDailySpend(venture.id, "operator", { options });
    assert.ok(Math.abs(ledger.spentUsd - 0.4) < 1e-9);
    assert.equal(ledger.reservedUsd, 0);
  });

  it("loads the prior drive's checkpoint before a queued drive writes the same resume record", async () => {
    const { options, venture } = await configuredVenture();
    const bet = createBet({ ventureId: venture.id, intent: "Keep one honest thread", teammateRef: "operator" });
    setVentureDoc(venture.id, "bets", bet.id, bet, options);
    const firstEntered = deferred();
    const releaseFirst = deferred();
    const starts = [];
    const runtime = {
      id: "resume-serial",
      label: "Resume serial",
      async drive(ctx) {
        const index = starts.length;
        starts.push({ stepCount: ctx.stepCount, runtimeSessionId: ctx.runtimeSessionId });
        ctx.onRuntimeSession(`session-${index + 1}`);
        ctx.onTurn();
        if (index === 0) {
          firstEntered.resolve();
          await releaseFirst.promise;
        }
        return { kind: "completed", summary: `turn ${index + 1}` };
      },
    };

    const first = driveTeammate({ ventureId: venture.id, teammateRef: "operator", betId: bet.id, goal: "First", options, deps: { runtime } });
    await firstEntered.promise;
    const second = driveTeammate({ ventureId: venture.id, teammateRef: "operator", betId: bet.id, goal: "Second", options, deps: { runtime } });
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(starts.length, 1);
    releaseFirst.resolve();
    await Promise.all([first, second]);

    assert.deepEqual(starts, [
      { stepCount: 0, runtimeSessionId: null },
      { stepCount: 1, runtimeSessionId: "session-1" },
    ]);
    const work = getVentureDoc(venture.id, "bets", bet.id, options).work;
    assert.equal(work.stepCount, 2);
    assert.equal(work.runtimeSessionId, "resume-serial:session-2");
  });

  it("keeps a dead-process lease stopped until an explicit continuation reclaims it", async () => {
    const { options, venture } = await configuredVenture();
    const deadOwner = { leaseId: "dead-drive", pid: 999_999, processInstanceId: "old-process", acquiredAt: "2026-07-15T12:00:00.000Z" };
    setVentureDoc(venture.id, "crew", DRIVE_LEASES_KEY, {
      id: DRIVE_LEASES_KEY,
      revision: 1,
      resources: { "participant:operator": deadOwner, "resume:participant:operator": deadOwner },
      interruptions: [],
    }, options);
    setVentureDoc(venture.id, "crew", "work:operator", {
      work: { runtimeSessionId: "restart-proof:old-session", stepCount: 3, spentUsd: 0, pausedFor: null },
    }, options);
    let received = null;
    const runtime = {
      id: "restart-proof",
      label: "Restart proof",
      async drive(ctx) {
        received = ctx;
        return { kind: "completed", summary: "continued" };
      },
    };
    const deps = { runtime, leaseOwnerAlive: () => false, driveLeaseWaitMs: 20 };

    await assert.rejects(
      driveTeammate({ ventureId: venture.id, teammateRef: "operator", goal: "Ambient retry", options, deps }),
      (error) => error?.code === "participant_drive_interrupted" && error?.status === 409,
    );
    assert.equal(received, null);

    await driveTeammate({
      ventureId: venture.id,
      teammateRef: "operator",
      goal: "Continue from what survived",
      initiatedBy: "founder",
      options,
      deps,
    });
    assert.equal(received.stepCount, 3);
    assert.equal(received.runtimeSessionId, "old-session");
    assert.match(received.resumePrompt, /previous provider work was interrupted/i);
    assert.match(received.resumePrompt, /continue from what survived/i);
  });
});
