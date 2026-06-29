import { appendDomainEvent, listDomainEvents } from "./domain-events.mjs";
import { loadFlow, recordFlowRun } from "./flow-store.mjs";
import { runGraph } from "./graph.mjs";
import { buildDraftMemory, extractDecisions } from "./memory.mjs";
import { mergeSharedDecisions } from "./shared-judgments.mjs";
import { getDesignState } from "./design-state-store.mjs";
import { gradeRun } from "./eval.mjs";
import { loadProject } from "./project-store.mjs";
import {
  getOutcomeProgram,
  syncProgramStoreFromEvents,
  updateOutcomeProgram,
} from "./program-store.mjs";
import {
  evaluateAgentInstancesFromRun,
  getAgentInstance,
  createNextAgentVersion,
} from "./capability-foundry.mjs";
import { recordFeedbackSignalsFromRun } from "./feedback-ledger.mjs";
import { createDerivedSourceLoader } from "./cross-reference.mjs";
import { promoteEntrantsFromRun } from "./person-store.mjs";
import { reviseAgentPolicyFromFeedback } from "./agent-policy-store.mjs";

// Product grounding for a run, so an agent step (especially a self-sourcing discovery entry) knows
// WHAT product it serves and WHO its ICP is — without it, a discovery agent has nothing to find. The
// headline carries the product description + positioning + ICP so the product provider conveys who
// to look for. Shared by every run path (program runs and the direct/streaming graph-run endpoints).
export function buildRunGrounding(project) {
  const sc = project?.sharedContext ?? {};
  const repo = sc.repository ?? {};
  const icpDesc = sc.icp?.description || sc.icp?.buyer || sc.icp?.summary || "";
  const posDesc = sc.positioning?.promise || sc.positioning?.category || sc.positioning?.summary || "";
  return {
    productName: project?.name || sc.product?.name || "product",
    headline: [repo.headline || sc.product?.description, posDesc, icpDesc ? `Ideal customer: ${icpDesc}` : ""]
      .filter(Boolean).join(" — ") || project?.name || "",
    winEvent: repo.outcome ? { name: repo.outcome } : null,
    evidenceState: "blind",
    evidence: [],
  };
}

export async function runProgram(programId, input = {}, options = {}) {
  const project = loadProject(options);
  const projectId = input.projectId || project.id || options.projectId || "default";
  const program = getOutcomeProgram(programId, projectId, { ...options, projectId });
  const ownedGraph = program.workflowGraph && typeof program.workflowGraph === "object" ? program.workflowGraph : null;
  const graphId = ownedGraph?.id ?? program.graphId;
  if (!graphId) throw new Error(`Outcome program is not composed yet: ${programId}`);
  enforceMeasurementGate(program, input);
  const storedFlow = loadFlow(graphId, null, options);
  const flow = { ...storedFlow, graph: ownedGraph ?? storedFlow.graph };
  if (!flow.graph) throw new Error(`Program graph not found: ${graphId}`);
  if (flow.graph.outcomeProgramId && flow.graph.outcomeProgramId !== program.id) {
    throw new Error(`Graph ${flow.graph.id} belongs to a different outcome program.`);
  }

  transitionProgramStatus(program, "running", { ...options, projectId });
  appendDomainEvent(projectId, {
    type: "ProgramRunStarted",
    aggregateType: "OutcomeProgram",
    aggregateId: program.id,
    data: { graphId: flow.graph.id },
  }, options);

  const resumeRecord = typeof input.resumeRunId === "string"
    ? flow.runs.find((run) => run.id === input.resumeRunId)
    : null;
  if (input.resumeRunId && !resumeRecord) {
    throw new Error(`Run not found for gate resume: ${input.resumeRunId}`);
  }
  const result = await runGraph(flow.graph, {
    targetNodeId: typeof input.targetNodeId === "string" ? input.targetNodeId : undefined,
    approvals: input.approvals && typeof input.approvals === "object" ? input.approvals : {},
    decisions: input.decisions && typeof input.decisions === "object" ? input.decisions : {},
    memory: buildDraftMemory(mergeSharedDecisions(extractDecisions(flow.runs), options)),
    designState: getDesignState(projectId, options),
    grounding: buildRunGrounding(project),
    runs: flow.runs,
    resumeResult: resumeRecord?.result ?? null,
    stepRuntime: input.stepRuntime ?? options.stepRuntime,
    loadLastRunItems: createDerivedSourceLoader({ ...options, projectId }),
    onEvent: input.onEvent,
  });
  // Grade the run against its eval — its answer key — oracle first, then the shared grade.mjs
  // (HARNESS.md invariants 1 and 5). Only when an eval was composed; otherwise nothing changes.
  const evalGrade = flow.graph.eval ? gradeRun({ graph: flow.graph, result }) : null;
  if (evalGrade) result.evalGrade = evalGrade;
  const saved = recordFlowRun(flow.graph, result, options);
  const feedback = recordFeedbackSignalsFromRun({ projectId, graph: flow.graph, result }, { ...options, projectId });
  // Promote run entrants into durable People (the keystone object). Read-derived GTM state, never
  // health: this feeds find-references / dedup / fatigue, NOT engine or measure. Best-effort inside.
  promoteEntrantsFromRun({ projectId, channelId: program.channelId ?? flow.graph.id, result }, { ...options, projectId });
  const evaluations = evaluateAgentInstancesFromRun({
    projectId,
    graph: flow.graph,
    result,
    signals: feedback.signals,
  }, { ...options, projectId });
  const nextVersions = createNextVersions({
    project,
    program,
    graph: flow.graph,
    updatedPolicies: feedback.updatedPolicies,
  }, { ...options, projectId });

  for (const gateId of result.pendingGates ?? []) {
    appendDomainEvent(projectId, {
      type: "FounderGateOpened",
      aggregateType: "OutcomeProgram",
      aggregateId: program.id,
      data: { runId: result.runId, graphId: flow.graph.id, gateId },
    }, options);
  }
  for (const signal of feedback.signals) {
    appendDomainEvent(projectId, {
      type: feedbackEventType(signal.type),
      aggregateType: "OutcomeProgram",
      aggregateId: program.id,
      data: signal,
    }, options);
  }
  for (const evaluation of evaluations) {
    appendDomainEvent(projectId, {
      type: "AgentEvaluated",
      aggregateType: "AgentInstance",
      aggregateId: evaluation.agentInstanceId,
      data: evaluation,
    }, options);
  }
  // Every revised policy is a new authoritative version — emit the FULL policy so the projection
  // can rebuild it, whether or not it produced a next agent version this run.
  for (const policy of feedback.updatedPolicies ?? []) {
    appendDomainEvent(projectId, {
      type: "AgentCreationPolicyUpdated",
      aggregateType: "AgentCreationPolicy",
      aggregateId: policy.id,
      data: policy,
    }, options);
  }
  for (const version of nextVersions) {
    // Carry the full profile and instance: a rebuild from events must reconstruct the same agent
    // the store holds, not a stub of it.
    appendDomainEvent(projectId, {
      type: "PersonalizationProfileAssembled",
      aggregateType: "PersonalizationProfile",
      aggregateId: version.profile.id,
      data: version.profile,
    }, options);
    appendDomainEvent(projectId, {
      type: "NextAgentVersionCreated",
      aggregateType: "AgentInstance",
      aggregateId: version.instance.id,
      data: version.instance,
    }, options);
  }

  const lastRunStatus = nextProgramStatus({ result, feedback, evaluations, nextVersions });
  transitionProgramStatus(program, lastRunStatus, { ...options, projectId });
  return {
    programId: program.id,
    graphId: flow.graph.id,
    result,
    evalGrade,
    feedback,
    evaluations,
    nextVersions,
    // Surface the self-building loop's output at the top level so the run path doesn't have to dig
    // into `feedback`: detected deterministic procedures and the PENDING, gated tool-birth proposals
    // derived from them. Both are inert until a founder approves — nothing here is registered or live.
    crystallizationSuggestions: feedback.crystallizationSuggestions ?? [],
    toolBirthProposals: feedback.toolBirthProposals ?? [],
    storedRunCount: saved.runs.length,
    // API COMPAT: the server + UI read `run.programStatus`. It now carries the run-derived
    // lastRunStatus value (waiting_for_gate / blocked / learning / complete), not a lifecycle.
    programStatus: lastRunStatus,
  };
}

// Run-derived status only. `lastRunStatus` has NO state machine: a run writes it directly so a
// previously blocked program is always re-runnable (the bug class this refactor kills — no
// lifecycle transition may block a re-run). We never call validateOutcomeProgramTransition here;
// lifecycle ("draft"/"active"/"retired") is founder-controlled and lives elsewhere.
//
// The skip-when-unchanged check reads the CURRENT stored value, not the caller's snapshot: within a
// single run the start transition writes "running" before the end transition reads, so a stale
// snapshot would wrongly skip the end write (leaving the store stuck on "running" when a re-run
// ends in the same status it ended in last time, e.g. blocked → blocked).
function transitionProgramStatus(program, lastRunStatus, options = {}) {
  const projectId = options.projectId || program.projectId || "default";
  const current = getCurrentLastRunStatus(program, { ...options, projectId });
  if (current === lastRunStatus) return program;
  ensureProgramCreationEvent(program, { ...options, projectId });
  updateOutcomeProgram(program.id, { lastRunStatus }, { ...options, projectId });
  appendDomainEvent(projectId, {
    type: "ProgramStatusChanged",
    aggregateType: "OutcomeProgram",
    aggregateId: program.id,
    data: { lastRunStatus },
  }, options);
  return syncProgramStoreFromEvents(projectId, options).find((item) => item.id === program.id)
    ?? { ...program, lastRunStatus };
}

function getCurrentLastRunStatus(program, options = {}) {
  try {
    return getOutcomeProgram(program.id, options.projectId, options).lastRunStatus ?? null;
  } catch {
    return program.lastRunStatus ?? null;
  }
}

function ensureProgramCreationEvent(program, options = {}) {
  const projectId = options.projectId || program.projectId || "default";
  const existing = listDomainEvents(projectId, {
    ...options,
    aggregateId: program.id,
    type: "OutcomeProgramCreated",
  });
  if (existing.length) return;
  appendDomainEvent(projectId, {
    type: "OutcomeProgramCreated",
    aggregateType: "OutcomeProgram",
    aggregateId: program.id,
    data: program,
  }, options);
}

export function recordObservedOutcome(programId, outcome = {}, options = {}) {
  const project = loadProject(options);
  const projectId = options.projectId || project.id || "default";
  const program = getOutcomeProgram(programId, projectId, { ...options, projectId });
  if (!outcome.summary && !outcome.outcomeEvent) throw new Error("Observed outcome requires a summary or event name.");
  return appendDomainEvent(projectId, {
    type: "ObservedOutcomeRecorded",
    aggregateType: "OutcomeProgram",
    aggregateId: program.id,
    data: {
      outcomeEvent: outcome.outcomeEvent ?? program.measurementPlan?.outcomeEvent ?? null,
      joinKey: outcome.joinKey ?? program.measurementPlan?.joinKey ?? null,
      summary: outcome.summary ?? "",
      observedAt: outcome.observedAt ?? new Date().toISOString(),
    },
  }, options);
}

export function reviseProgramFromFeedback(programId, input = {}, options = {}) {
  const project = loadProject(options);
  const projectId = input.projectId || project.id || options.projectId || "default";
  const program = getOutcomeProgram(programId, projectId, { ...options, projectId });
  const signals = Array.isArray(input.signals) ? input.signals : [];
  const revisions = [];
  for (const policyId of new Set(signals.flatMap((signal) => signal.policyIds ?? []))) {
    const revised = reviseAgentPolicyFromFeedback(policyId, signals, { ...options, projectId });
    revisions.push(revised);
    // Full policy so a rebuild reconstructs the revision, not just its id.
    appendDomainEvent(projectId, {
      type: "AgentCreationPolicyUpdated",
      aggregateType: "AgentCreationPolicy",
      aggregateId: revised.id,
      data: revised,
    }, options);
  }
  appendDomainEvent(projectId, {
    type: "ProgramRevisedFromFeedback",
    aggregateType: "OutcomeProgram",
    aggregateId: program.id,
    data: { policyIds: revisions.map((policy) => policy.id) },
  }, options);
  return revisions;
}

function createNextVersions({ project, program, graph, updatedPolicies = [] } = {}, options = {}) {
  const byPreviousPolicy = new Map(updatedPolicies
    .filter((policy) => policy.previousPolicyId)
    .map((policy) => [policy.previousPolicyId, policy]));
  const versions = [];
  for (const node of graph?.nodes ?? []) {
    if (node.kind !== "agent" || !node.config?.agentInstanceId || !node.config?.creationPolicyId) continue;
    const nextPolicy = byPreviousPolicy.get(node.config.creationPolicyId);
    if (!nextPolicy) continue;
    const previousInstance = getAgentInstance(options.projectId || project.id, node.config.agentInstanceId, options);
    const { instance, profile } = createNextAgentVersion({
      project,
      program,
      previousInstance,
      policy: nextPolicy,
    }, options);
    versions.push({ policy: nextPolicy, instance, profile });
  }
  return versions;
}

// Returns a ProgramRunStatus value (the lastRunStatus the run ended in), not a lifecycle.
function nextProgramStatus({ result, feedback, evaluations, nextVersions } = {}) {
  if (result?.pendingGates?.length) return "waiting_for_gate";
  if (!result?.ok) return "blocked";
  if (feedback?.signals?.length || evaluations?.some((item) => item.recommendations?.length) || nextVersions?.length) {
    return "learning";
  }
  return "complete";
}

function enforceMeasurementGate(program, input = {}) {
  const plan = program.measurementPlan ?? {};
  if (input.scale === "scaled" && (!plan.outcomeEvent || !plan.joinKey)) {
    throw new Error("No scaled program execution without a measurement plan and attribution join key.");
  }
}

function feedbackEventType(type) {
  if (type === "FounderApproval") return "FounderApprovedAction";
  if (type === "FounderRejection") return "FounderRejectedAction";
  if (type === "FounderEdit") return "FounderEditedAction";
  return "FeedbackSignalRecorded";
}
