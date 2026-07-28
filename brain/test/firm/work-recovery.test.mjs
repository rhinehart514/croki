import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import {
  applyFirmConfiguration,
  ensureInitialFirmParticipant,
} from "../../src/firm/configuration.mjs";
import { appendConversationMessage } from "../../src/firm/conversation.mjs";
import {
  discardCodingWorkspace,
  openCodingWorkspace,
  updateCodingSession,
} from "../../src/firm/code-workspace.mjs";
import {
  ensureDirectionThread,
  recordRun,
} from "../../src/firm/semantic-model-store.mjs";
import { createVenture } from "../../src/firm/venture-store.mjs";
import {
  appendWorkJournalEvent,
  recordAcceptedRun,
  recordProviderSession,
  recordRunLayerReceipt,
  recordRunRecovery,
  recordRunTombstone,
} from "../../src/firm/work-journal-runtime.mjs";
import { createWorkJournal } from "../../src/firm/work-journal.mjs";
import {
  recoveryDriveInput,
  recoverInterruptedWork,
  reconstructInterruptedWork,
} from "../../src/firm/work-recovery.mjs";
import {
  bindAgentDailySpendReservation,
  reserveAgentDailySpend,
} from "../../src/firm/work-loop-budget.mjs";
import { saveWork } from "../../src/firm/work-loop-state.mjs";
import { driveTeammate } from "../../src/firm/work-loop.mjs";
import {
  createWorkScope,
  revokeWorkScope,
} from "../../src/firm/work-scopes.mjs";

const fixtures = [];
const MACHINE = "machine:test-recovery";
const PARTICIPANT = "founding-teammate";

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function fixture(provider, { effort = "high", interactionMode = null } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "drover-work-recovery-"));
  const repository = fs.mkdtempSync(path.join(os.tmpdir(), "drover-work-recovery-repo-"));
  git(repository, ["init", "-q"]);
  git(repository, ["config", "user.email", "test@example.com"]);
  git(repository, ["config", "user.name", "Test"]);
  fs.writeFileSync(path.join(repository, ".gitignore"), ".drover-worktrees/\n");
  fs.writeFileSync(path.join(repository, "product.txt"), "base\n");
  git(repository, ["add", "."]);
  git(repository, ["commit", "-qm", "base"]);

  const options = {
    root,
    recoveryMachineRef: MACHINE,
    nativeCodingHostVerification: false,
    seedFoundingCrew: false,
  };
  const venture = createVenture({ name: `Recovery ${provider}`, repository }, options);
  const seeded = ensureInitialFirmParticipant(venture.id, PARTICIPANT, options);
  const model = provider === "claude-code" ? "claude-sonnet-4-5" : "gpt-5";
  applyFirmConfiguration({
    ventureId: venture.id,
    expectedRevision: seeded.revision,
    configuration: {
      ...seeded,
      agents: seeded.agents.map((agent) => ({
        ...agent,
        runtime: { provider, model },
        budget: { ...agent.budget, dailySpendUsd: 2 },
      })),
    },
    summary: "Configure exact native recovery participant",
  }, options);

  const founder = appendConversationMessage({
    ventureId: venture.id,
    role: "founder",
    content: "Implement the exact interrupted recovery proof",
    teammateRef: PARTICIPANT,
  }, options);
  const direction = ensureDirectionThread(venture.id, {
    name: "Exact interrupted recovery",
    originMessageRef: `conversation:${founder.id}`,
    identityKey: `${provider}-recovery`,
  }, options);
  const scope = createWorkScope({
    ventureId: venture.id,
    originThreadRef: direction.threadRef,
    originMessageRef: `conversation:${founder.id}`,
    objective: founder.content,
    allowedInwardEffects: ["repository-write"],
    resumeOnRestart: true,
    spendPolicyRef: "spend-policy:daily",
    actor: { authority: "founder", id: "founder" },
  }, options);
  const runId = `recovery-${provider.replaceAll("-", "")}`;
  recordRun(venture.id, {
    id: runId,
    threadRef: direction.threadRef,
    originMessageRef: `conversation:${founder.id}`,
    betRefs: [],
  }, {}, options);
  const workspace = openCodingWorkspace({
    ventureId: venture.id,
    runId,
    threadRef: direction.threadRef,
    participantRef: PARTICIPANT,
    provider,
    repository,
    goal: founder.content,
  }, options);
  const sessionId = `${provider}-session-exact`;
  updateCodingSession(venture.id, workspace.id, {
    runRef: `run:${runId}`,
    sessionId,
  }, options);
  const handle = {
    ventureId: venture.id,
    runId,
    threadRef: direction.threadRef,
    options,
  };
  const workScopeRef = `work-scope:${scope.id}`;
  recordAcceptedRun(handle, {
    originMessageRef: `conversation:${founder.id}`,
    participantRef: PARTICIPANT,
    workScopeRef,
    worktreeRef: workspace.worktree,
  });
  appendWorkJournalEvent(venture.id, handle, "checkpoint-recorded", {
    checkpointId: "checkpoint-before-crash",
    checkpointRef: "git-checkpoint:before-crash",
    treeRef: "git-tree:before-crash",
    diffRef: `work:${workspace.id}#diff`,
  }, { eventId: `checkpoint:${runId}` }, options);

  const reserved = reserveAgentDailySpend({
    ventureId: venture.id,
    teammateRef: PARTICIPANT,
    cap: 2,
    costReporting: "usd",
    options,
    nowMs: Date.now(),
  });
  const reservation = bindAgentDailySpendReservation({
    ventureId: venture.id,
    teammateRef: PARTICIPANT,
    reservation: reserved.reservation,
    runRef: `run:${runId}`,
    machineRef: MACHINE,
    options,
    nowMs: Date.now(),
  });
  saveWork({
    ventureId: venture.id,
    teammateRef: PARTICIPANT,
    betId: null,
    workScopeRef,
    bet: null,
    work: {
      runtimeSessionId: `${provider}:${sessionId}`,
      resumeSessionAt: "assistant-cursor-before-crash",
      stepCount: 4,
      spentUsd: 0.37,
      pausedFor: null,
    },
    options,
  });
  recordProviderSession(handle, {
    provider,
    sessionId,
    participantRef: PARTICIPANT,
    model,
    effort,
    interactionMode,
    machineRef: MACHINE,
    spendReservationId: reservation.id,
  });

  const value = {
    root,
    repository,
    options,
    venture,
    founder,
    direction,
    scope,
    runId,
    workspace,
    sessionId,
    model,
    effort,
    interactionMode,
    handle,
    workScopeRef,
    reservation,
  };
  fixtures.push(value);
  return value;
}

afterEach(() => {
  for (const item of fixtures.splice(0)) {
    try {
      discardCodingWorkspace(item.venture.id, item.workspace.id, item.options);
    } catch {
      // A lifecycle-boundary fixture may already have removed or terminally changed the workspace.
    }
    fs.rmSync(item.root, { recursive: true, force: true });
    fs.rmSync(item.repository, { recursive: true, force: true });
  }
});

describe("exact interrupted native Work recovery", () => {
  for (const [provider, interactionMode] of [
    ["claude-code", "plan"],
    ["codex", null],
  ]) {
    it(`reconstructs and resumes the exact ${provider} Run without duplicating its native session`, async () => {
      const fx = fixture(provider, { interactionMode });
      const [plan] = reconstructInterruptedWork(fx.options);
      assert.equal(plan.outcome, "resume");
      assert.deepEqual({
        ventureId: plan.ventureId,
        threadRef: plan.threadRef,
        founderMessageRef: plan.founderMessageRef,
        founderMessage: plan.founderMessage,
        runId: plan.runId,
        participantRef: plan.participantRef,
        provider: plan.provider,
        sessionId: plan.sessionId,
        model: plan.model,
        effort: plan.effort,
        interactionMode: plan.interactionMode,
        machineRef: plan.machineRef,
        workspaceId: plan.workspaceId,
        worktree: plan.worktree,
        checkpointId: plan.checkpoint?.id,
        spentUsd: plan.spentUsd,
        spendReservationId: plan.spendReservationId,
        streamCursor: plan.streamCursor,
        workScopeRef: plan.workScopeRef,
      }, {
        ventureId: fx.venture.id,
        threadRef: fx.direction.threadRef,
        founderMessageRef: `conversation:${fx.founder.id}`,
        founderMessage: fx.founder.content,
        runId: fx.runId,
        participantRef: PARTICIPANT,
        provider,
        sessionId: fx.sessionId,
        model: fx.model,
        effort: fx.effort,
        interactionMode,
        machineRef: MACHINE,
        workspaceId: fx.workspace.id,
        worktree: fx.workspace.worktree,
        checkpointId: "checkpoint-before-crash",
        spentUsd: 0.37,
        spendReservationId: fx.reservation.id,
        streamCursor: "assistant-cursor-before-crash",
        workScopeRef: fx.workScopeRef,
      });

      let invocations = 0;
      const runtime = {
        id: provider,
        label: provider,
        supportsAbort: true,
        costReporting: "usd",
        async drive(ctx) {
          invocations += 1;
          assert.equal(ctx.cwd, fx.workspace.worktree);
          assert.equal(ctx.runtimeSessionId, fx.sessionId);
          assert.equal(ctx.resumeSessionAt, "assistant-cursor-before-crash");
          assert.equal(ctx.exactResumeOnly, true);
          assert.equal(ctx.model, fx.model);
          assert.equal(ctx.effort, fx.effort);
          assert.equal(ctx.interactionMode, interactionMode);
          ctx.onRuntimeSession(fx.sessionId);
          return { kind: "completed", summary: "Recovered exact native session." };
        },
      };
      const recovered = await recoverInterruptedWork(fx.options, {
        resumeRun: (exact) => driveTeammate(recoveryDriveInput(exact, fx.options, {
          runtime,
          leaseOwnerAlive: () => false,
        })),
      });
      assert.equal(recovered[0].outcome, "resumed");
      assert.equal(invocations, 1);

      const projection = createWorkJournal(fx.options).readProjections(fx.venture.id);
      assert.equal(projection.runs.length, 1);
      assert.equal(projection.runs[0].id, fx.runId);
      assert.equal(projection.runs[0].providerSession.sessionId, fx.sessionId);
      assert.equal(projection.runs[0].status, "completed");
      assert.equal(projection.runs[0].quiescence.status, "ready");
      assert.equal(projection.runs[0].recovery.at(-1).outcome, "resumed");

      const second = await recoverInterruptedWork(fx.options, {
        resumeRun: async () => {
          invocations += 1;
        },
      });
      assert.deepEqual(second, []);
      assert.equal(invocations, 1, "a recovered Run cannot replay on the next restart");
    });
  }

  it("holds configuration, machine, continuing-authority, spend, and intervention mismatches", () => {
    const machine = fixture("codex");
    assert.deepEqual(
      reconstructInterruptedWork({ ...machine.options, recoveryMachineRef: "machine:other" })[0].reasons,
      ["machine-changed"],
    );

    const intervention = fixture("claude-code", { interactionMode: "plan" });
    appendWorkJournalEvent(intervention.venture.id, intervention.handle, "intervention-opened", {
      interventionId: "question-before-crash",
      kind: "provider-question",
      questionRef: "decision:question-before-crash",
    }, { eventId: "intervention-before-crash" }, intervention.options);
    const held = reconstructInterruptedWork(intervention.options)[0];
    assert.equal(held.outcome, "held-for-founder");
    assert.equal(held.pendingIntervention.id, "question-before-crash");
    assert.deepEqual(held.reasons, ["intervention-pending"]);

    const revoked = fixture("codex");
    revokeWorkScope({
      ventureId: revoked.venture.id,
      scopeId: revoked.scope.id,
      reason: "Founder withdrew continuing authority",
      actor: { authority: "founder", id: "founder" },
    }, revoked.options);
    const stopped = reconstructInterruptedWork(revoked.options)[0];
    assert.equal(stopped.outcome, "held-for-founder");
    assert.deepEqual(stopped.reasons, ["tombstone:scope-revoked"]);
  });

  it("reconciles a provider settlement just before disconnect without replay", async () => {
    const completed = fixture("claude-code", { interactionMode: "plan" });
    recordRunLayerReceipt(completed.handle, "provider-settled", {
      status: "succeeded",
      artifactRefs: ["provider-session:complete"],
    });
    let invoked = false;
    const result = await recoverInterruptedWork(completed.options, {
      resumeRun: async () => {
        invoked = true;
      },
    });
    assert.equal(invoked, false);
    assert.equal(result[0].outcome, "completed");
    assert.deepEqual(result[0].reasons, ["provider-settled-before-disconnect"]);
    assert.equal(
      createWorkJournal(completed.options).readProjections(completed.venture.id)
        .runs[0].recovery.at(-1).outcome,
      "completed",
    );

    const failed = fixture("codex");
    recordRunLayerReceipt(failed.handle, "provider-settled", {
      status: "failed",
      artifactRefs: [],
      error: { code: "provider-disconnected", message: "Provider disconnected after settling." },
    });
    const failedResult = await recoverInterruptedWork(failed.options, {
      resumeRun: async () => {
        throw new Error("must not replay");
      },
    });
    assert.equal(failedResult[0].outcome, "failed-with-recovery");
    assert.deepEqual(failedResult[0].reasons, ["provider-settlement-failed"]);
  });

  it("makes stop, deletion, revocation, and budget exhaustion durable non-restart tombstones", async () => {
    for (const reasonCode of [
      "founder-stopped",
      "thread-deleted",
      "scope-revoked",
      "budget-exhausted",
    ]) {
      const fx = fixture("codex");
      recordRunTombstone(fx.handle, reasonCode, { authorityRef: "founder" });
      let invoked = false;
      const result = await recoverInterruptedWork(fx.options, {
        resumeRun: async () => {
          invoked = true;
        },
      });
      assert.equal(invoked, false);
      assert.equal(result[0].outcome, "held-for-founder");
      assert.deepEqual(result[0].reasons, [`tombstone:${reasonCode}`]);
  }

  it("holds unfinished Claude nested work instead of claiming an exact cross-process resume", () => {
    const fx = fixture("claude-code");
    saveWork({
      ventureId: fx.venture.id,
      teammateRef: PARTICIPANT,
      betId: null,
      workScopeRef: fx.workScopeRef,
      bet: null,
      work: {
        runtimeSessionId: `claude-code:${fx.sessionId}`,
        resumeSessionAt: "assistant-cursor-before-crash",
        stepCount: 4,
        spentUsd: 0.37,
        pausedFor: null,
        nativeNestedTasks: [{
          taskId: "workflow-1",
          label: "Audit every route",
          taskKind: "local_workflow",
          status: "running",
        }],
      },
      options: fx.options,
    });

    const [plan] = reconstructInterruptedWork(fx.options);
    assert.equal(plan.outcome, "held-for-founder");
    assert.ok(plan.reasons.includes("nested-work-restart-required"));
  });
});

  it("holds an unsettled recovery attempt instead of creating an orphan or duplicate Run", () => {
    const fx = fixture("codex");
    recordRunRecovery(fx.handle, { attemptId: `recovery:${fx.runId}` });
    const [plan] = reconstructInterruptedWork(fx.options);
    assert.equal(plan.outcome, "held-for-founder");
    assert.deepEqual(plan.reasons, ["prior-recovery-attempt-unsettled"]);
    assert.equal(createWorkJournal(fx.options).readProjections(fx.venture.id).runs.length, 1);
  });
});
