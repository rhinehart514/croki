import { appendDomainEvent } from "./domain-events.mjs";
import { loadFlow } from "./flow-store.mjs";
import { createAgentCreationPolicy } from "./agent-policy-store.mjs";
import {
  createNextAgentVersion,
  createPersonalizedAgent,
  evaluateAgentInstancesFromRun,
} from "./capability-foundry.mjs";
import {
  buildOutcomeProgram,
  getOutcomeProgram,
  normalizeMeasurementPlan,
  syncProgramStoreFromEvents,
} from "./program-store.mjs";
import {
  recordObservedOutcome,
  reviseProgramFromFeedback,
  runProgram,
} from "./program-runtime.mjs";
import {
  createProgramWorkflow,
  updateProgramWorkflowMetadata,
} from "./program-workflow-commands.mjs";

export async function executeDomainCommand(command, input = {}, options = {}) {
  switch (command) {
    case "CreateOutcomeProgram":
      return CreateOutcomeProgram(input, options);
    case "DefineMeasurementPlan":
      return DefineMeasurementPlan(input, options);
    case "DeriveAgentNeed":
      return DeriveAgentNeed(input, options);
    case "CreateAgentCreationPolicy":
      return CreateAgentCreationPolicy(input, options);
    case "AssemblePersonalizationProfile":
    case "CreatePersonalizedAgent":
      return CreatePersonalizedAgent(input, options);
    case "ComposeProgramWorkflow":
      return ComposeProgramWorkflow(input, options);
    case "CreateProgramWorkflow":
      return CreateProgramWorkflow(input, options);
    case "UpdateProgramWorkflowMetadata":
      return UpdateProgramWorkflowMetadata(input, options);
    case "RecordFounderDecision":
      return RecordFounderDecision(input, options);
    case "RunProgram":
      return RunProgram(input, options);
    case "RecordObservedOutcome":
      return RecordObservedOutcome(input, options);
    case "EvaluateAgentInstance":
      return EvaluateAgentInstance(input, options);
    case "ReviseAgentPolicyFromFeedback":
    case "ReviseAgentCreationPolicyFromFeedback":
      return ReviseAgentPolicyFromFeedback(input, options);
    case "CreateNextAgentVersion":
      return CreateNextAgentVersion(input, options);
    default:
      throw new Error(`Unsupported domain command: ${command}`);
  }
}

function syncProgramProjection(projectId = "default", options = {}) {
  return syncProgramStoreFromEvents(projectId, options);
}

export function CreateOutcomeProgram(input = {}, options = {}) {
  const program = buildOutcomeProgram(input, options);
  appendDomainEvent(program.projectId, {
    type: "OutcomeProgramCreated",
    aggregateType: "OutcomeProgram",
    aggregateId: program.id,
    data: program,
  }, options);
  return syncProgramProjection(program.projectId, options).find((item) => item.id === program.id) ?? program;
}

export function DefineMeasurementPlan(input = {}, options = {}) {
  const projectId = input.projectId || options.projectId || "default";
  const program = getOutcomeProgram(input.programId, projectId, { ...options, projectId });
  const measurementPlan = normalizeMeasurementPlan(input.measurementPlan ?? input);
  appendDomainEvent(program.projectId, {
    type: "MeasurementPlanDefined",
    aggregateType: "OutcomeProgram",
    aggregateId: program.id,
    data: measurementPlan,
  }, options);
  return syncProgramProjection(program.projectId, options).find((item) => item.id === program.id);
}

export function DeriveAgentNeed(input = {}, options = {}) {
  if (!input.programId) throw new Error("DeriveAgentNeed requires a programId.");
  const projectId = input.projectId || options.projectId || "default";
  const need = {
    id: input.id || `agent-need-${Date.now()}`,
    programId: input.programId,
    title: input.title || input.objective || "Agent need",
    objective: input.objective || input.title || "",
    evidence: Array.isArray(input.evidence) ? input.evidence : [],
    derivedAt: new Date().toISOString(),
  };
  appendDomainEvent(projectId, {
    type: "AgentNeedDerived",
    aggregateType: "OutcomeProgram",
    aggregateId: input.programId,
    data: need,
  }, options);
  return need;
}

export function CreateAgentCreationPolicy(input = {}, options = {}) {
  const policy = createAgentCreationPolicy(input, options);
  appendDomainEvent(policy.projectId, {
    type: "AgentCreationPolicyCreated",
    aggregateType: "AgentCreationPolicy",
    aggregateId: policy.id,
    data: policy,
  }, options);
  return policy;
}

export function CreatePersonalizedAgent(input = {}, options = {}) {
  const created = createPersonalizedAgent(input, options);
  appendDomainEvent(created.instance.projectId, {
    type: "PersonalizationProfileAssembled",
    aggregateType: "PersonalizationProfile",
    aggregateId: created.profile.id,
    data: created.profile,
  }, options);
  appendDomainEvent(created.instance.projectId, {
    type: "PersonalizedAgentCreated",
    aggregateType: "AgentInstance",
    aggregateId: created.instance.id,
    data: created.instance,
  }, options);
  return created;
}

export function ComposeProgramWorkflow(input = {}, options = {}) {
  if (!input.programId) throw new Error("ComposeProgramWorkflow requires a programId.");
  const projectId = input.projectId || options.projectId || "default";
  const current = getOutcomeProgram(input.programId, projectId, { ...options, projectId });
  const workflowGraph = input.workflowGraph
    ?? input.graph
    ?? (input.graphId ? loadFlow(input.graphId, null, { ...options, projectId }).graph : null);
  appendDomainEvent(current.projectId, {
    type: "WorkflowComposed",
    aggregateType: "OutcomeProgram",
    aggregateId: current.id,
    data: {
      channelId: input.channelId ?? null,
      graphId: input.graphId ?? workflowGraph?.id ?? null,
      workflowGraph,
    },
  }, options);
  return syncProgramProjection(current.projectId, options).find((item) => item.id === current.id);
}

export function CreateProgramWorkflow(input = {}, options = {}) {
  return createProgramWorkflow(input, options);
}

export function UpdateProgramWorkflowMetadata(input = {}, options = {}) {
  return updateProgramWorkflowMetadata(input, options);
}

export async function RunProgram(input = {}, options = {}) {
  if (!input.programId) throw new Error("RunProgram requires a programId.");
  return runProgram(input.programId, input, options);
}

export function RecordObservedOutcome(input = {}, options = {}) {
  if (!input.programId) throw new Error("RecordObservedOutcome requires a programId.");
  return recordObservedOutcome(input.programId, input.outcome ?? input, options);
}

export function RecordFounderDecision(input = {}, options = {}) {
  if (!input.programId) throw new Error("RecordFounderDecision requires a programId.");
  const projectId = input.projectId || options.projectId || "default";
  const status = input.status || input.decision;
  const type = status === "approved"
    ? "FounderApprovedAction"
    : status === "rejected"
      ? "FounderRejectedAction"
      : "FounderEditedAction";
  return appendDomainEvent(projectId, {
    type,
    aggregateType: "OutcomeProgram",
    aggregateId: input.programId,
    data: {
      runId: input.runId ?? null,
      nodeId: input.nodeId ?? null,
      itemId: input.itemId ?? null,
      decision: status,
      draft: input.draft ?? null,
      editedFrom: input.editedFrom ?? null,
    },
  }, options);
}

export function EvaluateAgentInstance(input = {}, options = {}) {
  const evaluations = evaluateAgentInstancesFromRun(input, options);
  return Array.isArray(evaluations) && evaluations.length === 1 ? evaluations[0] : evaluations;
}

export function ReviseAgentPolicyFromFeedback(input = {}, options = {}) {
  if (!input.programId) throw new Error("ReviseAgentPolicyFromFeedback requires a programId.");
  return reviseProgramFromFeedback(input.programId, input, options);
}

export function CreateNextAgentVersion(input = {}, options = {}) {
  const created = createNextAgentVersion(input, options);
  appendDomainEvent(created.instance.projectId, {
    type: "NextAgentVersionCreated",
    aggregateType: "AgentInstance",
    aggregateId: created.instance.id,
    data: created.instance,
  }, options);
  return created;
}

export function InspectOutcomeProgram(input = {}, options = {}) {
  if (!input.programId) throw new Error("InspectOutcomeProgram requires a programId.");
  return getOutcomeProgram(input.programId, input.projectId || options.projectId || "default", options);
}
