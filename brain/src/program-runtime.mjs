import { appendDomainEvent, listDomainEvents } from "./domain-events.mjs";
import { loadFlow, recordFlowRun } from "./flow-store.mjs";
import { runGraph } from "./graph.mjs";
import { buildDraftMemory, extractDecisions } from "./memory.mjs";
import { loadProject } from "./project-store.mjs";
import {
  getOutcomeProgram,
  syncProgramStoreFromEvents,
  validateOutcomeProgramTransition,
} from "./program-store.mjs";
import {
  evaluateAgentInstancesFromRun,
  getAgentInstance,
  createNextAgentVersion,
} from "./capability-foundry.mjs";
import { recordFeedbackSignalsFromRun } from "./feedback-ledger.mjs";
import { reviseAgentPolicyFromFeedback } from "./agent-policy-store.mjs";

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
    memory: buildDraftMemory(extractDecisions(flow.runs)),
    runs: flow.runs,
    resumeResult: resumeRecord?.result ?? null,
    stepRuntime: input.stepRuntime ?? options.stepRuntime,
    onEvent: input.onEvent,
  });
  const saved = recordFlowRun(flow.graph, result, options);
  const feedback = recordFeedbackSignalsFromRun({ projectId, graph: flow.graph, result }, { ...options, projectId });
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

  const status = nextProgramStatus({ result, feedback, evaluations, nextVersions });
  transitionProgramStatus({ ...program, status: "running" }, status, { ...options, projectId });
  return {
    programId: program.id,
    graphId: flow.graph.id,
    result,
    feedback,
    evaluations,
    nextVersions,
    storedRunCount: saved.runs.length,
    programStatus: status,
  };
}

function transitionProgramStatus(program, status, options = {}) {
  const projectId = options.projectId || program.projectId || "default";
  const nextStatus = validateOutcomeProgramTransition(program.status, status);
  if (program.status === nextStatus) return program;
  ensureProgramCreationEvent(program, { ...options, projectId });
  appendDomainEvent(projectId, {
    type: "ProgramStatusChanged",
    aggregateType: "OutcomeProgram",
    aggregateId: program.id,
    data: { status: nextStatus },
  }, options);
  return syncProgramStoreFromEvents(projectId, options).find((item) => item.id === program.id) ?? { ...program, status: nextStatus };
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
