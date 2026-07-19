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
import { teammateSoulStore } from "../teammate-soul-store.mjs";
import { getRuntime, selectRuntime } from "../runtimes/index.mjs";
import { appendEvent, buildToolSet } from "./work-loop-tools.mjs";
import { summon } from "./crew.mjs";
import { appendConversationMessage, listConversation, stampConversationRuntime } from "./conversation.mjs";
import { CONFIGURATION_KEY, configuredAgent, ensureInitialFirmParticipant } from "./configuration.mjs";
import { buildCoordinationSeam } from "./work-loop-coordination.mjs";
import { beginActiveDrive } from "./active-drives.mjs";
import { architectureContextPrompt, buildArchitectureContext, buildWorkingTheoryContext, workingTheoryContextPrompt } from "./architecture-context.mjs";
import { createWorkLoopReceipts } from "./work-loop-receipts.mjs";
import { buildWorkHandoff } from "./work-loop-handoff.mjs";
import { captureWorkingTheoryBaseline, checkWorkingTheoryCompletion } from "./working-theory-completion.mjs";
import { loadWork, saveWork } from "./work-loop-state.mjs";
import { beginDriveRun, finishDriveRun } from "./work-loop-run.mjs";
import { drainSteer } from "./work-loop-steer.mjs";
import { withParticipantDriveLease } from "./work-loop-drive-lease.mjs";
import {
  reserveAgentDailySpend,
  settleAgentDailySpend,
  UNMEASURED_DRIVE_ESTIMATE_USD,
} from "./work-loop-budget.mjs";

export { getAgentDailySpend } from "./work-loop-budget.mjs";

const DEFAULT_MAX_STEPS = 24;

// The whole wall-item collection at a moment in time — the run's decision-join diff (work-loop-run.mjs)
// needs every item, decided or not, so an item DECIDED by the founder during the drive is still attributed
// to the run. A pending-only snapshot would drop it from both the before and after view.
function allWallItems(ventureStore, ventureId, options) {
  return ventureStore.listVentureDocs(ventureId, "decisions", options);
}

// The system prompt: the teammate's soul/voice, plus the one standing instruction that carries
// FIRM-SPEC.md's divergence doctrine — the host names the expectation, the crew judges the shape.
function buildSystem({ ventureId, teammateRef, goal, options, configuration, agent, coordination, firstDirection, target, architectureContext, theoryContext, workingTheoryDrive, steerBrief }) {
  const soul = teammateSoulStore.ensure(ventureId, teammateRef, {}, options);
  const brief = teammateSoulStore.voiceBriefFor(ventureId, teammateRef, {}, options) ?? {};
  const name = agent.name || brief.name || soul.name || teammateRef;
  const participantLabel = configuration.presentation.participantLabel || "teammate";
  const peers = configuration.agents
    .filter((candidate) => candidate.ref !== teammateRef)
    .map((candidate) => `${candidate.name} (${candidate.ref}; ${candidate.activation})${candidate.perspective ? ` — ${candidate.perspective}` : ""}`);
  return [
    `You are ${name}, a ${participantLabel} in this venture's ${configuration.presentation.collectiveLabel}.`,
    agent.perspective ? `Your perspective: ${agent.perspective}` : "",
    agent.temperament.length ? `Your temperament: ${agent.temperament.join("; ")}` : "",
    agent.contributes.length ? `You contribute: ${agent.contributes.join("; ")}` : "",
    agent.boundaries.length ? `Your boundaries: ${agent.boundaries.join("; ")}` : "",
    brief.register ? `How you sound: ${brief.register}` : "",
    brief.stance ? `How you carry yourself: ${brief.stance}` : "",
    agent.context.instructions ? `Context instructions: ${agent.context.instructions}` : "",
    agent.memory.instructions ? `Memory instructions: ${agent.memory.instructions}` : "",
    agent.capabilities.additional.length
      ? `Your configured capabilities: ${agent.capabilities.additional.join(", ")}. Use these as lenses and skills; they do not grant host authority.`
      : "",
    configuration.organization.instructions
      ? `How this firm is organized: ${configuration.organization.instructions}`
      : "",
    `Coordination mode: ${configuration.coordination.mode}.`,
    `Respond to what is in front of you. Answer directly when that is enough. When another perspective`,
    `would materially improve the result, say what kind of help is needed and why. You may challenge`,
    `the framing, propose parallel examination, or declare sufficient confidence.`,
    peers.length ? `Other configured participants: ${peers.join("; ")}.` : "",
    peers.length && configuration.coordination.maxPasses > 1
      ? `Use involve_participant when one of them can materially improve the result. Choose the participant, protocol, and focused question yourself.`
      : "",
    coordination?.request
      ? `This pass was requested by ${coordination.request.requestedBy} using ${coordination.request.protocol}: ${coordination.request.question}`
      : "",
    target?.workRef
      ? `This direction explicitly targets durable work ${target.workRef}${target.betId ? ` inside bet ${target.betId}` : ""}. Keep any revision, outward act, and return attached to that work identity.`
      : target?.betId ? `This direction explicitly targets bet ${target.betId}.` : "",
    target?.teammateRefs?.length
      ? `The founder explicitly included these participants: ${target.teammateRefs.join(", ")}. Preserve that attribution; involve a peer only when their contribution is materially useful.`
      : "",
    architectureContext ? architectureContextPrompt(architectureContext) : "",
    theoryContext ? workingTheoryContextPrompt(theoryContext) : "",
    firstDirection
      ? `This is the venture's first direction. Read repository truth before making product claims; cite the exact file and line in the first substantive response, then fork only bets grounded in that evidence.`
      : "",
    workingTheoryDrive
      ? `This broad direction must leave durable truth, not a plan: use search_repository and read_repository_excerpt, record a provisional working theory, produce useful inspectable inward work, then ensure that work is a source anchor on the current theory. The host will report partial unless all three facts exist.`
      : "",
    steerBrief ? steerBrief : "",
    `When the founder asks to shape venture architecture or propose a GTM system, first use read_venture_architecture, then propose_architecture_change; it stays staged for the founder, so do not create bets, start campaigns, or invent workflow stages on its behalf. Otherwise, when useful, fork genuinely divergent bets — different angles, not restatements of the same move.`,
    `How many, and along which dimensions, is your judgment call; there is no fixed count.`,
    configuration.coordination.protocols.length
      ? `Available interaction protocols: ${configuration.coordination.protocols.join(", ")}.`
      : "",
    configuration.coordination.stopWhen.length
      ? `Stop seeking more perspectives when: ${configuration.coordination.stopWhen.join("; ")}.`
      : "",
    agent.evaluation.signals.length
      ? `Evaluate the work against: ${agent.evaluation.signals.join("; ")}.`
      : "",
    agent.evaluation.instructions ? `Evaluation instructions: ${agent.evaluation.instructions}` : "",
    `Stage real drafts on each bet you fork. Consult taste (get_taste) before staging anything the`,
    `founder will see. Anything that would touch the world — a send, a publish, a spend — goes through`,
    `stage_outward, never executed directly. Ask the founder (ask_founder) when you are genuinely stuck.`,
    `Use speak on a bet for concise progress or conclusions the founder should hear. Speak as yourself`,
    `in the first person; the founder sees those lines in the venture chat.`,
    `Goal: ${goal}`,
  ].filter(Boolean).join("\n");
}

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
  initiatedBy = null,
  coordination = null,
  target = null,
  recordInitiation = true,
  originMessageRef = null,
  options = {},
  deps = {},
} = {}, lease) {
  const persistedConfiguration = getVentureDoc(ventureId, "configuration", CONFIGURATION_KEY, options);
  const canFormFirstParticipant = !persistedConfiguration
    || (persistedConfiguration.revision === 1 && persistedConfiguration.agents?.length === 0);
  if (persistedConfiguration && !configuredAgent(persistedConfiguration, teammateRef) && !canFormFirstParticipant) {
    const error = new Error(`Participant "${teammateRef}" is not in this venture's firm configuration.`);
    error.code = "participant_not_configured";
    throw error;
  }
  summon(ventureId, teammateRef, { templateRef: teammateRef }, options);
  const configuration = ensureInitialFirmParticipant(ventureId, teammateRef, options);
  const agent = configuredAgent(configuration, teammateRef);
  if (!agent) {
    const error = new Error(`Participant "${teammateRef}" is not in this venture's firm configuration.`);
    error.code = "participant_not_configured";
    throw error;
  }
  const loaded = loadWork({ ventureId, teammateRef, betId, options });
  const bet = loaded.bet;
  let work = loaded.work;
  if (lease.recoveredLeaseIds.length) {
    work = { ...work, pausedFor: "Previous provider work was interrupted. Durable progress was kept." };
    saveWork({ ventureId, teammateRef, betId, bet, work, options });
  }

  const taste = deps.taste ?? deps.memory ?? await import("./taste.mjs");
  const ventureStore = deps.ventureStore ?? await import("./venture-store.mjs");
  const venture = ventureStore.openVenture(ventureId, options);
  if (!venture) throw new Error(`No such venture: ${ventureId}`);
  const beforeBets = ventureStore.listVentureDocs(ventureId, "bets", options);
  const beforeWallItems = allWallItems(ventureStore, ventureId, options);
  const workingTheoryDrive = !betId && !target?.architectureId && !coordination?.request;
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
  const built = buildToolSet({
    ventureId,
    teammateRef,
    configurationRevision: configuration.revision,
    options,
    cwd: deps.cwd ?? venture.repository,
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

  // A resumed provider conversation already has its transcript, but it cannot infer why the
  // founder started this new drive. Carry the explicit direction into every resume and retain the
  // last pause as context rather than letting either one replace the other. Fresh drives still use
  // the ordinary goal prompt below.
  const resumePrompt = work.runtimeSessionId
    ? [
        work.pausedFor ? `Prior pause context: ${work.pausedFor}` : null,
        `New founder direction: ${goal}`,
        steerBrief,
      ].filter(Boolean).join("\n\n")
    : null;
  let currentWork = {
    ...work,
    pausedFor: null,
    ...(architectureContext ? {
      architectureRevision: architectureContext.architectureRevision,
      architectureTarget: { id: architectureContext.selected.id, stepId: architectureContext.stepId },
    } : {}),
  };
  const checkpointWork = () => saveWork({ ventureId, teammateRef, betId, bet, work: currentWork, options });
  const narration = [];
  const toolByName = new Map(tools.map((tool) => [tool.name, tool]));

  const storedSession = typeof currentWork.runtimeSessionId === "string" ? currentWork.runtimeSessionId : null;
  const separator = storedSession?.indexOf(":") ?? -1;
  const storedRuntime = separator > 0 ? storedSession.slice(0, separator) : null;
  const runtimeSessionId = storedRuntime
    ? (storedRuntime === selection.adapter.id ? storedSession.slice(separator + 1) : null)
    : storedSession;

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
  const externallyCancelled = deps.isCancelled ?? (() => false);

  const ctx = {
    goal,
    model: effectiveModel,
    cwd: deps.cwd ?? venture.repository,
    system: buildSystem({
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
    }),
    tools: tools.map(({ run: _run, ...definition }) => definition),
    client: selection.client ?? null,
    query: deps.query ?? null,
    options,
    env: deps.env ?? process.env,
    initialMessages: null,
    runtimeSessionId,
    resumePrompt,
    onRuntimeSession: (sid) => {
      currentWork = { ...currentWork, runtimeSessionId: sid ? `${selection.adapter.id}:${sid}` : null };
      checkpointWork();
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
    onToolStart: (name) => receipts.startTool(name),
    onToolError: (name, message) => receipts.record({ type: "tool_failed", detail: `${name}: ${message}` }),
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
  let outcome;
  try {
    outcome = await selection.adapter.drive(ctx);
  } finally {
    try {
      receipts.finishDrive();
    } finally {
      activeDrive.finish();
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
    }
  }
  if (outcome.kind === "cancelled") {
    appendEvent(ventureId, betId ?? bet?.id, { type: "work_stopped", detail: "Stopped by the founder. Staged work was kept." }, options);
  }
  currentWork = {
    ...currentWork,
    pausedFor: outcome.kind === "paused" ? (currentWork.pausedFor ?? outcome.summary ?? "Paused.") : null,
  };
  saveWork({ ventureId, teammateRef, betId, bet, work: currentWork, options });

  const runtimeReceipt = {
    id: selection.adapter.id,
    label: selection.adapter.label,
    auth: selection.auth ?? null,
    model: effectiveModel,
    configurationRevision: configuration.revision,
  };
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

  const afterWallItems = allWallItems(ventureStore, ventureId, options);
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
  };
}
