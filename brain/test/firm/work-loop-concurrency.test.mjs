import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, it } from "node:test";

import { createBet } from "../../src/firm/bet.mjs";
import { applyFirmConfiguration, getFirmConfiguration } from "../../src/firm/configuration.mjs";
import {
  invokePreview,
  registerPreviewHost,
  resetPreviewBrokerForTest,
} from "../../src/firm/preview-broker.mjs";
import { DRIVE_LEASES_KEY } from "../../src/firm/work-loop-drive-lease.mjs";
import { driveTeammate, getAgentDailySpend } from "../../src/firm/work-loop.mjs";
import {
  createVenture,
  getVentureDoc,
  listVentureDocs,
  setVentureDoc,
} from "../../src/firm/venture-store.mjs";

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
  it("does not serialize unrelated fresh Threads that share one participant", async () => {
    const { options, venture } = await configuredVenture();
    const firstEntered = deferred();
    const secondEntered = deferred();
    const release = deferred();
    let active = 0;
    let maxActive = 0;
    const runtime = {
      id: "thread-parallel",
      label: "Thread parallel",
      async drive(ctx) {
        active += 1;
        maxActive = Math.max(maxActive, active);
        if (ctx.goal === "First Thread") firstEntered.resolve();
        if (ctx.goal === "Second Thread") secondEntered.resolve();
        await release.promise;
        active -= 1;
        return { kind: "completed", summary: ctx.goal };
      },
    };

    const first = driveTeammate({
      ventureId: venture.id,
      teammateRef: "operator",
      goal: "First Thread",
      target: { threadRef: "thread:first" },
      options,
      deps: { runtime },
    });
    await firstEntered.promise;
    const second = driveTeammate({
      ventureId: venture.id,
      teammateRef: "operator",
      goal: "Second Thread",
      target: { threadRef: "thread:second" },
      options,
      deps: { runtime },
    });
    try {
      await new Promise((resolve) => setTimeout(resolve, 30));
      assert.equal(maxActive, 2);
      await secondEntered.promise;
    } finally {
      release.resolve();
    }
    await Promise.all([first, second]);
  });

  it("serializes the same Thread resume identity and loads its latest checkpoint", async () => {
    const { options, venture } = await configuredVenture();
    const firstEntered = deferred();
    const releaseFirst = deferred();
    const starts = [];
    const runtime = {
      id: "thread-resume",
      label: "Thread resume",
      async drive(ctx) {
        const index = starts.length;
        starts.push({ runtimeSessionId: ctx.runtimeSessionId, stepCount: ctx.stepCount });
        ctx.onRuntimeSession(`session-${index + 1}`);
        ctx.onTurn();
        if (index === 0) {
          firstEntered.resolve();
          await releaseFirst.promise;
        }
        return { kind: "completed", summary: `turn ${index + 1}` };
      },
    };
    const input = {
      ventureId: venture.id,
      teammateRef: "operator",
      target: { threadRef: "thread:one" },
      options,
      deps: { runtime },
    };

    const first = driveTeammate({ ...input, goal: "First" });
    await firstEntered.promise;
    const second = driveTeammate({ ...input, goal: "Second" });
    try {
      await new Promise((resolve) => setTimeout(resolve, 30));
      assert.equal(starts.length, 1);
    } finally {
      releaseFirst.resolve();
    }
    await Promise.all([first, second]);

    assert.deepEqual(starts, [
      { runtimeSessionId: null, stepCount: 0 },
      { runtimeSessionId: "session-1", stepCount: 1 },
    ]);
    const scoped = getVentureDoc(venture.id, "crew", "work-scope:thread:one", options);
    assert.equal(scoped.work.runtimeSessionId, "thread-resume:session-2");
    assert.equal(scoped.work.stepCount, 2);
  });

  it("serializes one exact workspace reference even when reached from different Threads", async () => {
    const { options, venture } = await configuredVenture();
    const firstEntered = deferred();
    const releaseFirst = deferred();
    const starts = [];
    const runtime = {
      id: "workspace-resume",
      label: "Workspace resume",
      async drive(ctx) {
        starts.push(ctx.goal);
        if (starts.length === 1) {
          firstEntered.resolve();
          await releaseFirst.promise;
        }
        return { kind: "completed", summary: ctx.goal };
      },
    };

    const first = driveTeammate({
      ventureId: venture.id,
      teammateRef: "operator",
      goal: "First workspace visit",
      target: { threadRef: "thread:first", workRef: "work:code-shared" },
      options,
      deps: { runtime },
    });
    await firstEntered.promise;
    const second = driveTeammate({
      ventureId: venture.id,
      teammateRef: "operator",
      goal: "Second workspace visit",
      target: { threadRef: "thread:second", workRef: "work:code-shared" },
      options,
      deps: { runtime },
    });
    try {
      await new Promise((resolve) => setTimeout(resolve, 30));
      assert.deepEqual(starts, ["First workspace visit"]);
    } finally {
      releaseFirst.resolve();
    }
    await Promise.all([first, second]);
    assert.deepEqual(starts, ["First workspace visit", "Second workspace visit"]);
  });

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

  it("releases a preview pin when the provider fails", async () => {
    resetPreviewBrokerForTest();
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "firm-preview-error-repo-"));
    execFileSync("git", ["init", "-q"], { cwd: repo });
    execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: repo });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: repo });
    fs.writeFileSync(path.join(repo, ".gitignore"), ".drover-worktrees/\n");
    fs.writeFileSync(path.join(repo, "product.txt"), "base\n");
    execFileSync("git", ["add", "."], { cwd: repo });
    execFileSync("git", ["commit", "-qm", "base"], { cwd: repo });
    const options = freshRoot();
    const venture = createVenture({ name: "Preview error", repository: repo }, options);
    registerPreviewHost(async () => ({ ok: true }));
    const runtime = {
      id: "preview-error",
      label: "Preview error",
      async drive(ctx) {
        await ctx.runTool({ name: "preview_open", input: { port: 5173 } });
        throw new Error("provider exploded");
      },
    };

    try {
      await assert.rejects(
        driveTeammate({
          ventureId: venture.id,
          teammateRef: "operator",
          goal: "Implement the preview error path",
          initiatedBy: "founder",
          options,
          deps: { runtime },
        }),
        /provider exploded/,
      );
      const [workspace] = listVentureDocs(venture.id, "codeWorkspaces", options);
      assert.ok(workspace, "the failed coding Run still leaves its inspectable workspace");
      await invokePreview({
        runId: "next-run",
        workspaceId: workspace.id,
        worktree: workspace.worktree,
        operation: "open",
        input: { port: 5173 },
      });
    } finally {
      resetPreviewBrokerForTest();
      fs.rmSync(repo, { recursive: true, force: true });
      fs.rmSync(options.root, { recursive: true, force: true });
    }
  });
});
