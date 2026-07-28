// The provider-neutral loop: diverge → stage → wall → decide → outcome → feed. Native runtimes own
// their agent loops; Croki owns durable resume state, cancellation, and founder authority.
import { getVentureDoc } from "./venture-store.mjs";
import { getRuntime, selectRuntime } from "../runtimes/index.mjs";
import { appendEvent, buildToolSet, releasePreviewPin } from "./work-loop-tools.mjs";
import { summon } from "./crew.mjs";
import { appendConversationMessage, listConversation } from "./conversation.mjs";
import { CONFIGURATION_KEY, configuredAgent, ensureInitialFirmParticipant } from "./configuration.mjs";
import { buildCoordinationSeam } from "./work-loop-coordination.mjs";
import { beginActiveDrive } from "./active-drives.mjs";
import { buildStreamSeam } from "./work-loop-stream.mjs";
import { buildArchitectureContext, buildWorkingTheoryContext } from "./architecture-context.mjs";
import { buildWorkLoopSystem } from "./work-loop-prompt.mjs";
import { createWorkLoopReceipts } from "./work-loop-receipts.mjs";
import { settleDriveIntoConversation } from "./work-loop-handoff.mjs";
import { captureWorkingTheoryBaseline } from "./working-theory-completion.mjs";
import { loadWork, prepareRuntimeResume, saveWork } from "./work-loop-state.mjs";
import { acceptDriveRun } from "./work-loop-run.mjs";
import { drainFounderContext } from "./work-loop-steer.mjs";
import { exactWorkScope, withParticipantDriveLease } from "./work-loop-drive-lease.mjs";
import { codingWorkspaceEnvironment, updateCodingSession } from "./code-workspace.mjs";
import { isCodingDirection } from "./code-intent.mjs";
import { executeProviderTurn, startCodingRun } from "./work-loop-coding.mjs";
import {
  directSdkConfiguration,
  captureNativeSourceRefs,
  prepareDirectSdkTurn,
  settleNativeCanvasOutcome,
} from "./work-loop-direct-sdk.mjs";
import { buildRuntimeReceipt, normalizeEffort } from "./work-loop-runtime.mjs";
import { reserveAgentDailySpend, settleAgentDailySpend, UNMEASURED_DRIVE_ESTIMATE_USD } from "./work-loop-budget.mjs";
import { publicImageAttachments } from "./image-attachments.mjs";
import { buildWorkLoopProviderIntervention, consumeInPlaceContinuation } from "./provider-interventions.mjs";
import { recordProviderSession, recordRunInterrupted } from "./work-journal-runtime.mjs";
import { failRunWorker, settleRunTimeline } from "./run-worker.mjs";
import { recoveryMachineRef } from "./work-recovery.mjs";
import { emitFirmEvent } from "./firm-events.mjs";
export { getAgentDailySpend } from "./work-loop-budget.mjs";
const DEFAULT_MAX_STEPS = 24;
// Build the retained provider-neutral runtime seam and drive it to the next pause.
export async function driveTeammate(input = {}) {
  const { ventureId, teammateRef, goal, betId = null, initiatedBy = null, options = {}, deps = {} } = input;
  if (!ventureId) throw new Error("driveTeammate() needs a ventureId.");
  if (!teammateRef) throw new Error("driveTeammate() needs a teammateRef.");
  if (!goal) throw new Error("driveTeammate() needs a goal.");
  // Already answered inside a live turn (provider-interventions.mjs): that warm session still holds the
  // provider's callback, so continuing it here would fork a second run over one Thread. The marker is
  // one-shot and consumed before the drive lease, so no other drive is touched.
  if (initiatedBy === "founder" && consumeInPlaceContinuation({ ventureId, teammateRef, betId, target: input.target, goal })) return null;
  return withParticipantDriveLease({
    ventureId,
    teammateRef,
    betId,
    workScopeRef: exactWorkScope(input.target),
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
  interactionMode = null,
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
  const recovery = deps.recovery ?? null;
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
  if (!agent) throw Object.assign(new Error(`Participant "${teammateRef}" is not in this venture's firm configuration.`), { code: "participant_not_configured" });
  const workScopeRef = exactWorkScope(target);
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
  const workingTheoryDrive = !directSdk && !isCodingDirection(goal, target) && !betId && !target?.architectureId && !target?.productGtmView && !target?.workflowSketch && !coordination?.request;
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
  // The initiating message is recorded once, and its id becomes the run's originMessageRef. When this loop
  // records the direction itself we capture the appended id; a caller that already durably wrote it (e.g.
  // dialogue-routes records it before routing) passes recordInitiation:false and supplies originMessageRef,
  // so the direction is not duplicated in the thread and the run's join stays exact rather than guessed.
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
  // Founder-selected reasoning effort. Normalized to the live SDK union (low through max/ultra); null
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
  if (!selection.adapter) throw Object.assign(new Error(selection.reason || "No runtime available to drive this teammate."), { code: "runtime_unavailable" });
  if (interactionMode === "plan" && selection.adapter.id !== "claude-code") {
    throw Object.assign(new Error(`${selection.adapter.label} does not advertise native plan mode in this harness.`), {
      code: "runtime_capability_unavailable",
    });
  }

  const driveStartedAt = deps.nowMs ?? Date.now();
  const spendAvailability = reserveAgentDailySpend({
    ventureId, teammateRef, cap: agent.budget.dailySpendUsd, costReporting: selection.adapter.costReporting,
    options, nowMs: driveStartedAt, recoveryReservationId: recovery?.spendReservationId ?? null,
  });

  // Fold durable founder context into this resume exactly once.
  const steerBrief = (betId ?? bet?.id)
    ? drainFounderContext({ ventureId, betId: betId ?? bet?.id }, options)
    : null;
  // drainSteer cleared the durable queue on the effort's work record; mirror that onto the in-memory
  // work this drive will checkpoint, so the drive's own saveWork never resurrects an already-folded
  // steer (loadWork ran before the drain).
  if (steerBrief && work && Array.isArray(work.pendingSteer)) work = { ...work, pendingSteer: [] };

  let { currentWork, resumePrompt, runtimeSessionId, resumeSessionAt } = prepareRuntimeResume({
    work, goal, steerBrief, architectureContext, adapterId: selection.adapter.id,
  });
  // An unfinished nested provider task cannot cross a Brain process boundary. Recovery holds that
  // Run for the founder; when the founder explicitly starts fresh work, the new Run owns any new
  // nested identities instead of inheriting stale "running" tasks from the interrupted process.
  if (!recovery && Array.isArray(currentWork.nativeNestedTasks) && currentWork.nativeNestedTasks.length) {
    currentWork = { ...currentWork, nativeNestedTasks: [] };
  }
  const checkpointWork = () => saveWork({ ventureId, teammateRef, betId, workScopeRef, bet, work: currentWork, options });
  const narration = [];

  const activeDrive = beginActiveDrive({
    id: recovery?.runId ?? null,
    ventureId,
    teammateRef,
    betId: betId ?? bet?.id ?? null,
    runtime: selection.adapter.id,
    abortSupported: selection.adapter.supportsAbort,
    architectureRevision: architectureContext?.architectureRevision ?? null,
  });
  const targetBetId = betId ?? bet?.id ?? null;
  const driveRun = acceptDriveRun({
    activeDrive, ventureId, initiatedBy, betId: targetBetId, originMessageId: initiatingMessageId,
    threadName: goal, target, options, recovery, teammateRef, spendAvailability,
    nowMs: driveStartedAt, onAccepted: deps.onRunAccepted,
  });
  const receipts = createWorkLoopReceipts({
    ventureId, betId: targetBetId, activeDriveId: activeDrive.id, adapter: selection.adapter, options,
    stepIndex: () => Number(currentWork.stepCount) || 0,
    monotonicNow: deps.monotonicNow,
    driveRun,
  });
  receipts.beat("Reading venture context");
  let codingWorkspace;
  let workspaceCwd;
  try {
    ({ workspace: codingWorkspace, cwd: workspaceCwd } = startCodingRun({
      deps, goal, target, driveRun, activeDrive, venture, ventureId, betId: targetBetId,
      teammateRef, participantRef: directSdk ? null : teammateRef, provider: selection.adapter.id, options,
      recovery,
    }));
  } catch (error) {
    recordRunInterrupted(driveRun, error, { layer: "workspace" });
    activeDrive.finish();
    throw error;
  }

  const providerIntervention = buildWorkLoopProviderIntervention({
    ventureId, targetBetId, teammateRef, selection, effectiveModel, effectiveEffort, directSdk, target,
    driveRun, activeDrive, workScopeRef, configuration, architectureContext, options, getWork: () => currentWork,
    putWork: (nextWork) => { currentWork = nextWork; checkpointWork(); },
    park: deps.park ?? (await import("./wall.mjs")).park,
    appendEvent: (detail) => appendEvent(ventureId, targetBetId, { type: "asked", detail }, options),
  });
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
    previewWorkspace: codingWorkspace ?? null, runId: activeDrive.id,
    continuation: providerIntervention.continuation,
  });
  const outwardBlocked = configuration.authority.outwardEffects === "blocked" || agent.authority.outwardEffects === "blocked";
  const configuredTools = agent.capabilities.firmTools
    ? built.tools.filter((tool) => !(outwardBlocked && tool.name === "stage_outward"))
    : [];
  const { tools, outputSchema, canvasContext, retainedSourceRefs } = prepareDirectSdkTurn({
    directSdk, configuredTools, target, ventureId, betId,
    threadRef: target?.threadRef ?? driveRun?.threadRef, options,
  });
  const { consultedNames } = built;
  const toolByName = new Map(tools.map((tool) => [tool.name, tool]));
  const externallyCancelled = deps.isCancelled ?? (() => false);

  const ctx = {
    goal,
    attachments,
    model: effectiveModel,
    effort: effectiveEffort,
    interactionMode: interactionMode === "plan" ? "plan" : null,
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
      canvasContext,
      retainedSourceRefs,
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
    directSdk,
    outputSchema,
    initialMessages: null,
    runtimeSessionId: codingWorkspace
      ? codingWorkspace.providerSessions?.filter((entry) => entry.provider === selection.adapter.id && entry.sessionId).at(-1)?.sessionId ?? null
      : runtimeSessionId,
    resumePrompt,
    // The stored resume cursor only rides a non-workspace session: a coding run's session id comes
    // from the workspace's own provider sessions, so the work record's cursor would not match it.
    resumeSessionAt: codingWorkspace && !recovery ? null : resumeSessionAt,
    exactResumeOnly: Boolean(recovery),
    onRuntimeSession: (sid) => {
      const stamped = sid ? `${selection.adapter.id}:${sid}` : null;
      // A brand-new provider session invalidates the stored cursor; the pair stays coherent.
      if (stamped !== currentWork.runtimeSessionId) currentWork = { ...currentWork, runtimeSessionId: stamped, resumeSessionAt: null };
      checkpointWork();
      if (codingWorkspace && sid) updateCodingSession(ventureId, codingWorkspace.id, { runRef: `run:${activeDrive.id}`, sessionId: sid }, options);
      recordProviderSession(driveRun, {
        provider: selection.adapter.id,
        sessionId: sid,
        participantRef: teammateRef,
        model: effectiveModel,
        effort: effectiveEffort,
        interactionMode: interactionMode === "plan" ? "plan" : null,
        machineRef: recoveryMachineRef(options),
        spendReservationId: spendAvailability.reservation?.id ?? null,
      });
    },
    spentUsd: Number(currentWork.spentUsd) || 0,
    onCost: (usd) => {
      receipts.noteCost(usd);
      currentWork = { ...currentWork, spentUsd: (Number(currentWork.spentUsd) || 0) + (Number(usd) || 0) };
      checkpointWork();
    },
    onUsage: (usage) => receipts.noteUsage(usage),
    maxSteps: deps.maxSteps ?? agent.budget.maxSteps ?? configuration.defaults.maxSteps ?? DEFAULT_MAX_STEPS,
    maxBudgetUsd: spendAvailability.remainingUsd,
    stepCount: Number(currentWork.stepCount) || 0,
    signal: activeDrive.signal,
    isCancelled: () => activeDrive.signal.aborted || externallyCancelled(),
    currentStatus: () => (currentWork.pausedFor ? "paused" : "running"),
    onProviderIntervention: providerIntervention.handler,
    onTurn: () => {
      currentWork = { ...currentWork, stepCount: (Number(currentWork.stepCount) || 0) + 1 };
      checkpointWork();
      receipts.beat("Thinking through the direction");
      return currentWork.stepCount;
    },
    // Streaming seam (work-loop-stream.mjs): onText/onTextDelta/onToolInputDelta live presence, the
    // resume-cursor checkpoint, and the live-run handle a founder steer reaches mid-turn.
    ...buildStreamSeam({
      activeDrive, receipts, narration, ventureId, betId: targetBetId,
      threadRef: target?.threadRef ?? driveRun?.threadRef ?? null,
      getWork: () => currentWork, putWork: (work) => { currentWork = work; checkpointWork(); },
      driveRun,
      onSettledToolResult: (result) => {
        const sourceRefs = captureNativeSourceRefs({ cwd: workspaceCwd, result });
        receipts.settleNativeTool(result, { sourceRefs });
      },
    }),
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
  let execution;
  try {
    execution = await executeProviderTurn({
      adapter: selection.adapter, ctx, workspace: codingWorkspace, ventureId,
      runRef: `run:${activeDrive.id}`, options, receipts, activeDrive,
      driveRun,
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
  } catch (error) {
    if (driveRun) {
      try {
        await failRunWorker(driveRun, error, {
          workspace: codingWorkspace,
          runRef: `run:${activeDrive.id}`,
        });
      } catch {
        // The originating provider/workspace failure remains the actionable error.
      }
      // A failed provider turn has no returned conversation message to invalidate the Thread. Emit
      // only after the journal projection is durably settled so the live row is replaced by its
      // recoverable terminal state instead of lingering as "working".
      emitFirmEvent(ventureId, "timeline", { threadRef: driveRun.threadRef });
    }
    throw error;
  } finally {
    releasePreviewPin(activeDrive.id); // every terminal path frees the preview for the Thread's next run
  }
  let { outcome } = execution;
  codingWorkspace = execution.workspace;
  outcome = settleNativeCanvasOutcome({
    directSdk, outcome, ventureId, teammateRef, goal, betId, target,
    configurationRevision: configuration.revision, options,
  });
  if (outcome.kind === "cancelled") appendEvent(ventureId, betId ?? bet?.id, { type: "work_stopped", detail: "Stopped by the founder. Staged work was kept." }, options);
  currentWork = {
    ...currentWork,
    pausedFor: outcome.kind === "paused" ? (currentWork.pausedFor ?? outcome.summary ?? "Paused.") : null,
    nativePermissionGrant: null,
  };
  saveWork({ ventureId, teammateRef, betId, workScopeRef, bet, work: currentWork, options });

  // Settle everything this pause owes the Thread in one handoff, then mint quiescence from exact receipts.
  const runtimeReceipt = buildRuntimeReceipt(selection, effectiveModel, configuration.revision);
  const settleConversation = () => settleDriveIntoConversation({
    ventureId, teammateRef, betId, target, options,
    outcome, narration, priorTeammateMessageIds, runtimeReceipt,
    coordinationRequest: coordination?.request ?? null,
    beforeBets, beforeWallItems, ventureStore,
    driveRun, configurationRevision: configuration.revision,
    targetBetId, theoryBaseline, workingTheoryDrive,
  });
  const settled = driveRun
    ? await settleRunTimeline(driveRun, settleConversation, {
        workspace: codingWorkspace,
        runRef: `run:${activeDrive.id}`,
        artifactRefs: (result) => [
          ...(result.messages ?? []).map((message) => `conversation:${message.id}`),
          ...(result.handoff?.id ? [`handoff:${result.handoff.id}`] : []),
        ],
      })
    : settleConversation();

  return {
    outcome,
    work: currentWork,
    consultedTools: [...consultedNames],
    runtime: runtimeReceipt,
    messages: settled.messages,
    handoff: settled.handoff,
    completion: settled.completion,
    codingWorkspace,
  };
}
