// work-loop.mjs — the one loop, driven (FIRM-SPEC.md "The one loop": diverge → stage → wall →
// decide → outcome → feed). A teammate drives real work through the existing provider-neutral
// runtime adapters directly. The whole resume state is
// `{ runtimeSessionId, stepCount, spentUsd, pausedFor }` — living on the bet
// once one exists, or on a tiny per-teammate work record before the first fork — never a 40-field
// session.
//
// The ctx this module builds is the small callback seam every retained runtime adapter implements
// (isCancelled/currentStatus/onTurn/onText/onToolStart/onToolError/runTool/onRuntimeSession/onCost/
// resumePrompt/runtimeSessionId/spentUsd/maxSteps/stepCount/model/system/tools), built here because
// the drive has no separate session store or execution ledger. Divergence is prompt-level only
// (FIRM-SPEC.md "What stays open"): the system prompt tells the
// teammate to fork genuinely divergent bets; the host never counts or shapes them.

import { getVentureDoc } from "./venture-store.mjs";
import { getRuntime, selectRuntime } from "../runtimes/index.mjs";
import { appendEvent, buildToolSet } from "./work-loop-tools.mjs";
import { summon } from "./crew.mjs";
import { appendConversationMessage, listConversation, stampConversationRuntime } from "./conversation.mjs";
import { CONFIGURATION_KEY, configuredAgent, ensureInitialFirmParticipant } from "./configuration.mjs";
import { buildCoordinationSeam } from "./work-loop-coordination.mjs";
import { beginActiveDrive } from "./active-drives.mjs";
import { buildArchitectureContext, buildWorkingTheoryContext } from "./architecture-context.mjs";
import { buildWorkLoopSystem } from "./work-loop-prompt.mjs";
import { createWorkLoopReceipts } from "./work-loop-receipts.mjs";
import { buildWorkHandoff } from "./work-loop-handoff.mjs";
import { captureWorkingTheoryBaseline, checkWorkingTheoryCompletion } from "./working-theory-completion.mjs";
import { loadWork, prepareRuntimeResume, saveWork } from "./work-loop-state.mjs";
import { beginDriveRun, finishDriveRun } from "./work-loop-run.mjs";
import { drainSteer } from "./work-loop-steer.mjs";
import { withParticipantDriveLease } from "./work-loop-drive-lease.mjs";
import { codingWorkspaceEnvironment, updateCodingSession } from "./code-workspace.mjs";
import { isCodingDirection } from "./code-intent.mjs";
import { executeProviderTurn, startCodingRun } from "./work-loop-coding.mjs";
import { directSdkConfiguration } from "./work-loop-direct-sdk.mjs";
import { buildRuntimeReceipt, normalizeEffort } from "./work-loop-runtime.mjs";
import {
  reserveAgentDailySpend,
  settleAgentDailySpend,
  UNMEASURED_DRIVE_ESTIMATE_USD,
} from "./work-loop-budget.mjs";
import { publicImageAttachments } from "./image-attachments.mjs";
export { getAgentDailySpend } from "./work-loop-budget.mjs";
const DEFAULT_MAX_STEPS = 24;
// driveTeammate — the whole loop, one call. Builds the retained runtime callback seam
// already proves, selects the runtime, and drives
// to the next pause. `deps` lets callers (and tests) inject `park`, `client`/`query`/`runtime`
// (forwarded to selectRuntime), `taste`, `ventureStore`, and `cwd` without reaching into module
// internals — the same injection convention brain/test/runtimes.test.mjs already uses.
export async function driveTeammate(input = {}) {
  const { ventureId, teammateRef, goal, betId = null, initiatedBy = null, options = {}, deps = {} } = input;
  if (!ventureId) throw new Error("driveTeammate() needs a ventureId.");
  if (!teammateRef) throw new Error("driveTeammate() needs a teammateRef.");
  if (!goal) throw new Error("driveTeammate() needs a goal.");
  return withParticipantDriveLease({
    ventureId,
    teammateRef,
    betId,
    workScopeRef: input.target?.workScopeRef ?? null,
    explicitContinuation: initiatedBy === "founder" || initiatedBy === "agent",
    options,
    deps,
  }, (lease) => driveTeammateLeased(input, lease));
}
async function driveTeammateLeased({
  ventureId,
  teammateRef,
  goal,
  betId = null,
  runtime = null,
  model = null,
  effort = null,
  directSdk = false,
  initiatedBy = null,
  coordination = null,
  target = null,
  recordInitiation = true,
  originMessageRef = null,
  attachments = [],
  options = {},
  deps = {},
} = {}, lease) {
  const persistedConfiguration = getVentureDoc(ventureId, "configuration", CONFIGURATION_KEY, options);
  if (directSdk && !persistedConfiguration) throw new Error("Direct SDK Work needs an existing venture configuration.");
  const canFormFirstParticipant = !persistedConfiguration
    || (persistedConfiguration.revision === 1 && persistedConfiguration.agents?.length === 0);
  if (!directSdk && persistedConfiguration && !configuredAgent(persistedConfiguration, teammateRef) && !canFormFirstParticipant) {
    const error = new Error(`Participant "${teammateRef}" is not in this venture's firm configuration.`);
    error.code = "participant_not_configured";
    throw error;
  }
  if (!directSdk) summon(ventureId, teammateRef, { templateRef: teammateRef }, options);
  const configuration = directSdk
    ? directSdkConfiguration(persistedConfiguration, teammateRef, runtime, model)
    : ensureInitialFirmParticipant(ventureId, teammateRef, options);
  const agent = configuredAgent(configuration, teammateRef);
  if (!agent) {
    const error = new Error(`Participant "${teammateRef}" is not in this venture's firm configuration.`);
    error.code = "participant_not_configured";
    throw error;
  }
  const workScopeRef = target?.workScopeRef ?? null;
  const loaded = loadWork({ ventureId, teammateRef, betId, workScopeRef, options });
  const bet = loaded.bet;
  let work = loaded.work;
  if (lease.recoveredLeaseIds.length) {
    work = { ...work, pausedFor: "Previous provider work was interrupted. Durable progress was kept." };
    saveWork({ ventureId, teammateRef, betId, workScopeRef, bet, work, options });
  }

  const taste = deps.taste ?? deps.memory ?? await import("./taste.mjs");
  const ventureStore = deps.ventureStore ?? await import("./venture-store.mjs");
  const venture = ventureStore.openVenture(ventureId, options);
  if (!venture) throw new Error(`No such venture: ${ventureId}`);
  const beforeBets = ventureStore.listVentureDocs(ventureId, "bets", options);
  const beforeWallItems = ventureStore.listVentureDocs(ventureId, "decisions", options);
  const workingTheoryDrive = !isCodingDirection(goal, target) && !betId && !target?.architectureId && !target?.productGtmView && !target?.workflowSketch && !coordination?.request;
  const theoryBaseline = captureWorkingTheoryBaseline(ventureId, options);
  const architectureContext = target?.architectureId
    ? buildArchitectureContext(ventureId, {
        id: target.architectureId,
        stepId: target.architectureStepId,
        revision: target.architectureRevision,
      }, options)
    : null;
  const theoryContext = target?.theorySubjectId || target?.theoryRelationshipId
    ? buildWorkingTheoryContext(ventureId, {
        theoryId: target.theoryId,
        subjectId: target.theorySubjectId,
        relationshipId: target.theoryRelationshipId,
      }, options)
    : null;
  // The initiating message is recorded once. A caller that already durably wrote the founder direction
  // (e.g. dialogue-routes records it before routing) passes recordInitiation: false so the direction is
  // not duplicated in the thread.
  // The initiating message id becomes the run's originMessageRef. When this loop records the direction
  // itself we capture the appended id; when a caller (e.g. dialogue-routes) already wrote it and passes
  // recordInitiation:false, that caller supplies originMessageRef so the join stays exact rather than guessed.
  let initiatingMessageId = originMessageRef;
  if ((initiatedBy === "founder" || initiatedBy === "agent") && recordInitiation) {
    const initiation = appendConversationMessage({
      ventureId,
      role: initiatedBy,
      content: goal,
      teammateRef,
      betId,
      target,
      attachments: publicImageAttachments(attachments),
    }, options);
    initiatingMessageId = initiation?.id ?? initiatingMessageId;
  }
  const priorTeammateMessageIds = new Set(
    listConversation(ventureId, options)
      .filter((message) => message.role === "teammate")
      .map((message) => message.id),
  );
  const coordinationSeam = buildCoordinationSeam({
    ventureId,
    teammateRef,
    configuration,
    agent,
    coordination,
    options,
    deps,
    drive: driveTeammate,
  });
  const configuredRuntime = agent.runtime.provider ?? configuration.defaults.runtime;
  const configuredModel = agent.runtime.model ?? configuration.defaults.model;
  let effectiveRuntime = runtime ?? configuredRuntime;
  let effectiveModel = model ?? configuredModel;
  // Older composer builds put the adapter id in the `model` field. Treat a known adapter id as the
  // adapter and leave its model on Auto; passing "claude-code" to Claude as a model name produces the
  // exact selected-model error this compatibility seam exists to prevent.
  if (!effectiveRuntime && effectiveModel && getRuntime(effectiveModel)) {
    effectiveRuntime = effectiveModel;
    effectiveModel = null;
  }
  // Founder-selected reasoning effort. Normalized to the real SDK union (low/medium/high/xhigh/max); null
  // means "no explicit choice" and each adapter falls back to its own default so behavior is unchanged when
  // the founder never touches the control. Adapters clamp to the tiers their runtime supports.
  const effectiveEffort = normalizeEffort(effort);

  const selection = (deps.selectRuntime ?? selectRuntime)({
    client: deps.client,
    runtime: deps.runtime,
    forced: deps.forced ?? effectiveRuntime,
    model: effectiveModel,
    env: deps.env,
  });
  if (!selection.adapter) {
    const error = new Error(selection.reason || "No runtime available to drive this teammate.");
    error.code = "runtime_unavailable";
    throw error;
  }

  const driveStartedAt = deps.nowMs ?? Date.now();
  const spendAvailability = reserveAgentDailySpend({
    ventureId,
    teammateRef,
    cap: agent.budget.dailySpendUsd,
    costReporting: selection.adapter.costReporting,
    options,
    nowMs: driveStartedAt,
  });

  // Drain any founder steer queued while prior work ran (the §2.7 checkpoint seam). This is the honest
  // "adjusts on the next step": a steer reply the founder made during a run is folded into THIS resume's
  // brief, then cleared. Landed via work-loop-steer.mjs (a sibling module) so work-loop.mjs stays under
  // its LOC ceiling. Applies to a fresh drive on an existing effort too (a steer can arrive between runs).
  const steerBrief = (betId ?? bet?.id)
    ? drainSteer({ ventureId, betId: betId ?? bet?.id }, options)
    : null;
  // drainSteer cleared the durable queue on the effort's work record; mirror that onto the in-memory
  // work this drive will checkpoint, so the drive's own saveWork never resurrects an already-folded
  // steer (loadWork ran before the drain).
  if (steerBrief && work && Array.isArray(work.pendingSteer)) {
    work = { ...work, pendingSteer: [] };
  }

  // Provider transcript continuity is retained, but every resume still receives the founder's new
  // direction. Adapter changes intentionally do not inherit a foreign provider session id.
  let { currentWork, resumePrompt, runtimeSessionId } = prepareRuntimeResume({
    work, goal, steerBrief, architectureContext, adapterId: selection.adapter.id,
  });
  const checkpointWork = () => saveWork({ ventureId, teammateRef, betId, workScopeRef, bet, work: currentWork, options });
  const narration = [];

  const activeDrive = beginActiveDrive({
    ventureId,
    teammateRef,
    betId: betId ?? bet?.id ?? null,
    runtime: selection.adapter.id,
    abortSupported: selection.adapter.supportsAbort,
    architectureRevision: architectureContext?.architectureRevision ?? null,
  });
  const targetBetId = betId ?? bet?.id ?? null;
  const receipts = createWorkLoopReceipts({
    ventureId, betId: targetBetId, activeDriveId: activeDrive.id, adapter: selection.adapter, options,
    stepIndex: () => Number(currentWork.stepCount) || 0,
    monotonicNow: deps.monotonicNow,
  });
  receipts.beat("Reading venture context");
  // Durable Run lifecycle (FIRM-SPEC rail #1): a founder-authorized drive records a canonical run joined to
  // its child direction thread BEFORE provider dispatch — founder intent → run → returned evidence becomes
  // inspectable history. Fail-safe by construction (beginDriveRun swallows its own errors): driveRun is null
  // when this drive does not record or when recording failed, and a null handle changes nothing downstream.
  const driveRun = beginDriveRun({
    ventureId,
    runId: activeDrive.id,
    initiatedBy,
    betId: targetBetId,
    originMessageId: initiatingMessageId,
    threadName: goal,
    threadRef: target?.threadRef ?? null,
    target,
    options,
  });
  let codingWorkspace;
  let workspaceCwd;
  try {
    ({ workspace: codingWorkspace, cwd: workspaceCwd } = startCodingRun({
      deps, goal, target, driveRun, activeDrive, venture, ventureId, betId: targetBetId,
      teammateRef, provider: selection.adapter.id, options,
    }));
  } catch (error) {
    activeDrive.finish();
    throw error;
  }

  const built = buildToolSet({
    ventureId,
    teammateRef,
    configurationRevision: configuration.revision,
    options,
    cwd: workspaceCwd,
    taste,
    ventureStore,
    deps,
    coordinationParticipants: coordinationSeam.participants,
    coordinationProtocols: configuration.coordination.protocols,
    involveParticipant: coordinationSeam.involveParticipant,
    target,
    architectureRevision: architectureContext?.architectureRevision ?? null,
  });
  const outwardBlocked = configuration.authority.outwardEffects === "blocked"
    || agent.authority.outwardEffects === "blocked";
  const tools = agent.capabilities.firmTools
    ? built.tools.filter((tool) => !(outwardBlocked && tool.name === "stage_outward"))
    : [];
  const consultedNames = built.consultedNames;
  const toolByName = new Map(tools.map((tool) => [tool.name, tool]));
  const externallyCancelled = deps.isCancelled ?? (() => false);

  const ctx = {
    goal,
    attachments,
    model: effectiveModel,
    effort: effectiveEffort,
    cwd: workspaceCwd,
    system: buildWorkLoopSystem({
      ventureId,
      teammateRef,
      goal,
      options,
      configuration,
      agent,
      coordination,
      firstDirection: beforeBets.length === 0 && !betId,
      target,
      architectureContext,
      theoryContext,
      workingTheoryDrive,
      steerBrief,
      directSdk,
    }),
    tools: tools.map(({ run: _run, ...definition }) => definition),
    client: selection.client ?? null,
    query: deps.query ?? null,
    options,
    env: codingWorkspace ? codingWorkspaceEnvironment(codingWorkspace, deps.env ?? process.env) : (deps.env ?? process.env),
    nativeCoding: Boolean(codingWorkspace),
    initialMessages: null,
    runtimeSessionId: codingWorkspace
      ? codingWorkspace.providerSessions?.filter((entry) => entry.provider === selection.adapter.id && entry.sessionId).at(-1)?.sessionId ?? null
      : runtimeSessionId,
    resumePrompt,
    onRuntimeSession: (sid) => {
      currentWork = { ...currentWork, runtimeSessionId: sid ? `${selection.adapter.id}:${sid}` : null };
      checkpointWork();
      if (codingWorkspace && sid) updateCodingSession(ventureId, codingWorkspace.id, { runRef: `run:${activeDrive.id}`, sessionId: sid }, options);
    },
    spentUsd: Number(currentWork.spentUsd) || 0,
    onCost: (usd) => {
      receipts.noteCost(usd);
      currentWork = { ...currentWork, spentUsd: (Number(currentWork.spentUsd) || 0) + (Number(usd) || 0) };
      checkpointWork();
    },
    maxSteps: deps.maxSteps ?? agent.budget.maxSteps ?? configuration.defaults.maxSteps ?? DEFAULT_MAX_STEPS,
    maxBudgetUsd: spendAvailability.remainingUsd,
    stepCount: Number(currentWork.stepCount) || 0,
    signal: activeDrive.signal,
    isCancelled: () => activeDrive.signal.aborted || externallyCancelled(),
    currentStatus: () => (currentWork.pausedFor ? "paused" : "running"),
    onTurn: () => {
      currentWork = { ...currentWork, stepCount: (Number(currentWork.stepCount) || 0) + 1 };
      checkpointWork();
      receipts.beat("Thinking through the direction");
      return currentWork.stepCount;
    },
    onText: (text) => {
      receipts.record({ type: "text", detail: text });
      const line = String(text ?? "").trim();
      if (line) narration.push(line);
    },
    onToolStart: (name, detail = null) => {
      receipts.startTool(name);
      if (codingWorkspace) updateCodingSession(ventureId, codingWorkspace.id, { runRef: `run:${activeDrive.id}`, activity: detail?.summary ?? `Using ${String(name).replaceAll("_", " ")}` }, options);
    },
    onToolError: (name, message) => receipts.record({ type: "tool_failed", detail: `${name}: ${message}` }),
    onCommand: (command) => {
      if (!codingWorkspace) return;
      updateCodingSession(ventureId, codingWorkspace.id, { runRef: `run:${activeDrive.id}`, command: { ...command, kind: "provider-command" } }, options);
    },
    runTool: async ({ name, input }) => {
      const tool = toolByName.get(name);
      if (!tool) throw new Error(`Unknown firm tool "${name}".`);
      const receipt = receipts.takeTool(name);
      try {
        const result = await tool.run(input ?? {});
        // A pre-authorized grant parks the act for the record but does NOT wait on the founder
        // (result.waiting === false), so the drive keeps going rather than pausing at the wall.
        const result_waits = name === "stage_outward" && result?.parked === true && result?.waiting !== false;
        const pause = name === "ask_founder" || result_waits;
        if (pause) {
          currentWork = { ...currentWork, pausedFor: name === "ask_founder" ? "Waiting for the founder's answer." : "Waiting at the founder wall." };
          checkpointWork();
        }
        return { result, pause };
      } finally {
        receipts.completeTool(receipt);
      }
    },
    persistMessages: () => {},
  };

  const spentBeforeDrive = Number(currentWork.spentUsd) || 0;
  const execution = await executeProviderTurn({
    adapter: selection.adapter, ctx, workspace: codingWorkspace, ventureId,
    runRef: `run:${activeDrive.id}`, options, receipts, activeDrive,
    afterDrive: () => {
      if (spendAvailability.cap != null) {
        const measured = Math.max(0, (Number(currentWork.spentUsd) || 0) - spentBeforeDrive);
        const fallback = selection.adapter.costReporting === "usd"
          ? Math.min(UNMEASURED_DRIVE_ESTIMATE_USD, spendAvailability.remainingUsd)
          : UNMEASURED_DRIVE_ESTIMATE_USD;
        settleAgentDailySpend({
          ventureId,
          teammateRef,
          reservation: spendAvailability.reservation,
          usd: measured > 0 ? measured : fallback,
          nowMs: driveStartedAt,
          options,
        });
      }
    },
  });
  const { outcome } = execution;
  codingWorkspace = execution.workspace;
  if (outcome.kind === "cancelled") {
    appendEvent(ventureId, betId ?? bet?.id, { type: "work_stopped", detail: "Stopped by the founder. Staged work was kept." }, options);
  }
  currentWork = {
    ...currentWork,
    pausedFor: outcome.kind === "paused" ? (currentWork.pausedFor ?? outcome.summary ?? "Paused.") : null,
  };
  saveWork({ ventureId, teammateRef, betId, workScopeRef, bet, work: currentWork, options });

  const runtimeReceipt = buildRuntimeReceipt(selection, effectiveModel, configuration.revision);
  let newTeammateMessages = listConversation(ventureId, options)
    .filter((message) => (
      message.role === "teammate"
      && message.teammateRef === teammateRef
      && !priorTeammateMessageIds.has(message.id)
    ));
  if (!newTeammateMessages.length) {
    const directAnswer = narration.at(-1)
      ?? (outcome.kind === "completed" ? String(outcome.summary ?? "").trim() : "");
    if (directAnswer) {
      newTeammateMessages = [appendConversationMessage({
        ventureId,
        role: "teammate",
        content: directAnswer,
        teammateRef,
        betId,
        runtime: runtimeReceipt,
        coordination: coordination?.request ?? null,
        target,
      }, options)];
    }
  }
  const stampedMessages = stampConversationRuntime(
    ventureId,
    newTeammateMessages.map((message) => message.id),
    runtimeReceipt,
    options,
    coordination?.request ?? null,
  );

  const afterWallItems = ventureStore.listVentureDocs(ventureId, "decisions", options);
  const handoffDraft = buildWorkHandoff({
    beforeBets,
    afterBets: ventureStore.listVentureDocs(ventureId, "bets", options),
    beforeWallItems,
    afterWallItems,
  });
  const handoff = handoffDraft ? appendConversationMessage({
    ventureId,
    role: "system",
    kind: "handoff",
    content: handoffDraft.content,
    teammateRef,
    betId,
    target,
    changes: handoffDraft.changes,
  }, options) : null;
  const completion = checkWorkingTheoryCompletion({ ventureId, baseline: theoryBaseline, outcome, target, required: workingTheoryDrive }, options);
  // Terminal Run completion: add the durable decision joins parked during this drive and mint an immutable
  // WorkflowExecutionReceipt for EVERY founder-authorized terminal — bet-scoped OR betless (betRef null).
  // A drive that reached here completed OR cancelled (a cancelled outcome returned by adapter.drive still
  // arrives here and finishes its run with a terminal cancelled receipt, so cancelled stays distinct from
  // completed post-hoc). Only a truly INTERRUPTED drive — one that THREW before this point — leaves its run
  // completedAt:null, historical-unknown, never a false completion. Fail-safe: finishDriveRun swallows its
  // own errors so a completion failure never changes the drive's already-built return.
  finishDriveRun(driveRun, {
    outcome,
    beforeWallItems,
    afterWallItems,
    runtime: runtimeReceipt,
    modelRevision: configuration.revision,
    messageRefs: [...stampedMessages, ...(handoff ? [handoff] : [])].map((message) => `conversation:${message.id}`),
    subjectRefs: [...new Set([
      targetBetId,
      ...(handoffDraft?.changes?.openedBetIds ?? []),
      ...(handoffDraft?.changes?.stagedBetIds ?? []),
      ...(handoffDraft?.changes?.wallBetIds ?? []),
    ].filter(Boolean))].map((id) => `bet:${id}`),
  });

  return {
    outcome,
    work: currentWork,
    consultedTools: [...consultedNames],
    runtime: runtimeReceipt,
    messages: stampedMessages,
    handoff,
    completion,
    codingWorkspace,
  };
}
