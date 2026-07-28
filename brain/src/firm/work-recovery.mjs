// Exact interrupted-Run reconstruction. This module decides whether durable facts authorize an
// automatic native-session resume; it never invents authority and delegates the actual provider turn.

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";

import { getFirmConfiguration, configuredAgent } from "./configuration.mjs";
import { listConversation } from "./conversation.mjs";
import { getSemanticModel } from "./semantic-model-store.mjs";
import { listVentures, listVentureDocs } from "./venture-store.mjs";
import { createWorkJournal } from "./work-journal.mjs";
import { getAgentDailySpend } from "./work-loop-budget.mjs";
import { loadWork } from "./work-loop-state.mjs";
import { recordRunRecovery } from "./work-journal-runtime.mjs";
import { listWorkScopes } from "./work-scopes.mjs";

const EXACT_NATIVE_PROVIDERS = new Set(["claude-code", "codex"]);

function text(value) {
  return String(value ?? "").trim() || null;
}

function bare(value, prefix) {
  return String(value ?? "").replace(new RegExp(`^${prefix}:`), "").trim() || null;
}

export function recoveryMachineRef(options = {}) {
  const supplied = text(options.recoveryMachineRef ?? process.env.CROKI_MACHINE_REF);
  if (supplied) return supplied;
  const digest = crypto.createHash("sha256")
    .update(`${os.hostname()}\0${process.platform}\0${process.arch}`)
    .digest("hex")
    .slice(0, 24);
  return `machine:${digest}`;
}

export function recoveryDriveInput(plan, options = {}, deps = {}) {
  return {
    ventureId: plan.ventureId,
    teammateRef: plan.participantRef,
    goal: plan.founderMessage,
    runtime: plan.provider,
    model: plan.model,
    effort: plan.effort,
    interactionMode: plan.interactionMode,
    initiatedBy: "agent",
    recordInitiation: false,
    originMessageRef: plan.founderMessageRef,
    target: { threadRef: plan.threadRef, workScopeRef: plan.workScopeRef },
    options,
    deps: { ...deps, recovery: plan },
  };
}

function layer(run, type) {
  return (run.layerReceipts ?? []).find((receipt) => receipt.type === type) ?? null;
}

function outcomeFor(run) {
  if ((run.recovery ?? []).some((entry) => ["completed", "resumed"].includes(entry.outcome))) return { skip: true };
  if (run.tombstone) return { outcome: "held-for-founder", reasons: [`tombstone:${run.tombstone.reasonCode}`] };
  if (layer(run, "provider-settled")?.status === "succeeded") {
    return { outcome: "completed", reasons: ["provider-settled-before-disconnect"] };
  }
  if (layer(run, "provider-settled")?.status === "failed") {
    return { outcome: "failed-with-recovery", reasons: ["provider-settlement-failed"] };
  }
  if ((run.recovery ?? []).some((entry) => entry.outcome === "attempted")) {
    return { outcome: "held-for-founder", reasons: ["prior-recovery-attempt-unsettled"] };
  }
  return null;
}

function reconstructRun(ventureId, run, options, deps) {
  const reasons = [];
  const model = getSemanticModel(ventureId, options);
  const canonical = model.runs.find((entry) => entry.id === run.id);
  const thread = model.threads.find((entry) => entry.id === run.threadId);
  const messageId = run.founderTurnIds?.at(-1) ?? bare(canonical?.originMessageRef, "conversation");
  const message = listConversation(ventureId, options).find((entry) => entry.id === messageId);
  const session = run.providerSession;
  const participantRef = bare(session?.participantRef, "participant");
  const configuration = getFirmConfiguration(ventureId, options);
  const participant = configuredAgent(configuration, participantRef);
  const configuredProvider = participant?.runtime?.provider ?? configuration.defaults.runtime;
  const configuredModel = participant?.runtime?.model ?? configuration.defaults.model ?? null;
  const scope = listWorkScopes(ventureId, options).find((entry) => `work-scope:${entry.id}` === run.workScopeRef);
  const canonicalBetRefs = canonical?.betRefs ?? [];
  const betId = canonicalBetRefs.length === 1 ? bare(canonicalBetRefs[0], "bet") : null;
  const workspace = listVentureDocs(ventureId, "codeWorkspaces", options)
    .find((entry) => (entry.runRefs ?? []).includes(`run:${run.id}`)) ?? null;

  if (!canonical) reasons.push("run-missing");
  if (!thread || thread.deletedAt) reasons.push("thread-deleted");
  if (!message || message.role !== "founder") reasons.push("founder-message-missing");
  if (!session?.sessionId) reasons.push("provider-session-missing");
  if (!EXACT_NATIVE_PROVIDERS.has(session?.provider)) reasons.push("provider-session-not-resumable");
  if (!participant) reasons.push("participant-missing");
  if (participant && configuredProvider !== session.provider) reasons.push("provider-changed");
  if (participant && text(configuredModel) !== text(session.model)) reasons.push("model-changed");
  if (session?.machineRef !== recoveryMachineRef(options)) reasons.push("machine-changed");
  if (!scope) reasons.push("continuing-authority-missing");
  if (scope?.revokedAt) reasons.push("continuing-authority-revoked");
  if (scope && !scope.resumeOnRestart) reasons.push("restart-not-authorized");
  if (scope && (!scope.spendPolicyRef || scope.originThreadRef !== `thread:${run.threadId}`)) reasons.push("scope-mismatch");
  if (scope && bare(scope.originMessageRef, "conversation") !== messageId) reasons.push("scope-message-mismatch");
  if (scope?.stopConditions?.length && !deps.stopConditionsClear?.(scope)) reasons.push("stop-conditions-unverified");
  if (canonicalBetRefs.length > 1) reasons.push("multi-bet-recovery-unsupported");
  if (!workspace) reasons.push("coding-workspace-missing");
  if (workspace && (!workspace.worktree || !fs.existsSync(workspace.worktree))) reasons.push("worktree-missing");
  const workspaceSession = workspace?.providerSessions
    ?.find((entry) => entry.runRef === `run:${run.id}` && entry.provider === session?.provider);
  if (workspace && workspaceSession?.sessionId !== session?.sessionId) reasons.push("workspace-session-mismatch");
  if (run.interventions?.some((entry) => entry.status === "open")) reasons.push("intervention-pending");

  let work = null;
  let spend = null;
  if (participantRef) {
    work = loadWork({
      ventureId,
      teammateRef: participantRef,
      betId,
      workScopeRef: run.workScopeRef,
      options,
    }).work;
    spend = getAgentDailySpend(ventureId, participantRef, { options, nowMs: deps.nowMs ?? Date.now() });
    if (session?.spendReservationId) {
      const reservation = spend.reservations.find((entry) => entry.id === session.spendReservationId);
      if (!reservation || reservation.runRef !== `run:${run.id}` || reservation.machineRef !== session.machineRef) {
        reasons.push("spend-reservation-mismatch");
      }
    } else if (participant?.budget?.dailySpendUsd != null) {
      reasons.push("spend-reservation-missing");
    }
  }

  const runtimeSessionId = workspaceSession?.sessionId
    ?? text(work?.runtimeSessionId)?.replace(new RegExp(`^${session?.provider}:`), "")
    ?? null;
  if (runtimeSessionId !== session?.sessionId) reasons.push("resume-session-mismatch");
  // Claude dynamic workflows preserve completed work only inside the same live Claude process. A
  // Brain restart cannot truthfully call an unfinished nested workflow an exact session resume.
  // Hold it for the founder instead of silently restarting agents inside the prior Run.
  if (session?.provider === "claude-code" && Array.isArray(work?.nativeNestedTasks) && work.nativeNestedTasks.length) {
    reasons.push("nested-work-restart-required");
  }
  return {
    ventureId,
    threadRef: `thread:${run.threadId}`,
    founderMessageRef: messageId ? `conversation:${messageId}` : null,
    founderMessage: message?.content ?? null,
    runId: run.id,
    participantRef,
    provider: session?.provider ?? null,
    sessionId: session?.sessionId ?? null,
    model: session?.model ?? null,
    effort: session?.effort ?? null,
    interactionMode: session?.interactionMode ?? null,
    machineRef: session?.machineRef ?? null,
    workspaceId: workspace?.id ?? null,
    worktree: workspace?.worktree ?? run.worktreeRef ?? null,
    checkpoint: run.checkpoints?.at(-1) ?? null,
    pendingIntervention: run.interventions?.find((entry) => entry.status === "open") ?? null,
    spentUsd: Number(work?.spentUsd) || 0,
    spendReservationId: session?.spendReservationId ?? null,
    streamCursor: work?.resumeSessionAt ?? null,
    workScopeRef: run.workScopeRef ?? null,
    betId,
    reasons,
  };
}

export function reconstructInterruptedWork(options = {}, deps = {}) {
  const results = [];
  for (const venture of listVentures(options)) {
    const journal = createWorkJournal(options);
    const inspected = journal.inspect(venture.id);
    if (inspected.mode !== "writable") {
      results.push({ ventureId: venture.id, outcome: "held-for-founder", reasons: [inspected.reason] });
      continue;
    }
    const projection = journal.readProjections(venture.id);
    for (const run of projection.runs ?? []) {
      if (run.quiescence || ["completed", "failed"].includes(run.status)) continue;
      const settled = outcomeFor(run);
      if (settled?.skip) continue;
      if (settled) {
        results.push({
          ventureId: venture.id,
          threadRef: `thread:${run.threadId}`,
          runId: run.id,
          ...settled,
        });
        continue;
      }
      const snapshot = reconstructRun(venture.id, run, options, deps);
      results.push({
        ...snapshot,
        outcome: snapshot.reasons.length ? "held-for-founder" : "resume",
      });
    }
  }
  return results;
}

export async function recoverInterruptedWork(options = {}, deps = {}) {
  const plans = reconstructInterruptedWork(options, deps);
  const results = [];
  for (const plan of plans) {
    if (!plan.runId || plan.outcome !== "resume") {
      if (plan.runId) recordRunRecovery({
        ventureId: plan.ventureId,
        runId: plan.runId,
        threadRef: plan.threadRef,
        options,
      }, {
        attemptId: `recovery:${plan.runId}`,
        outcome: plan.outcome,
        reasonCodes: plan.reasons,
      });
      results.push(plan);
      continue;
    }
    const handle = { ventureId: plan.ventureId, runId: plan.runId, threadRef: plan.threadRef, options };
    const attemptId = `recovery:${plan.runId}`;
    recordRunRecovery(handle, { attemptId });
    try {
      if (typeof deps.resumeRun !== "function") {
        throw Object.assign(new Error("Interrupted Work recovery needs an exact native-session resume driver."), {
          code: "recovery_resume_unavailable",
        });
      }
      const value = await deps.resumeRun(plan);
      recordRunRecovery(handle, { attemptId, outcome: "resumed" });
      results.push({ ...plan, outcome: "resumed", value });
    } catch (error) {
      recordRunRecovery(handle, {
        attemptId,
        outcome: "failed-with-recovery",
        reasonCodes: [text(error?.code) ?? "resume-failed"],
      });
      results.push({
        ...plan,
        outcome: "failed-with-recovery",
        reasons: [text(error?.code) ?? text(error?.message) ?? "resume-failed"],
      });
    }
  }
  return results;
}
