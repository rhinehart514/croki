import { channelIdFor, createBlankChannelGraph } from "./channel-graph.mjs";
import { appendDomainEvent } from "./domain-events.mjs";
import { loadFlow, saveFlow } from "./flow-store.mjs";
import {
  buildOutcomeProgram,
  getOutcomeProgram,
  listOutcomePrograms,
  syncProgramStoreFromEvents,
} from "./program-store.mjs";

export function createProgramWorkflow(input = {}, options = {}) {
  const projectId = input.projectId || options.projectId || "default";
  const name = String(input.name || "").trim();
  if (!name) throw new Error("Program workflow name is required.");
  const objective = String(input.objective || "").trim();
  const existingIds = Array.isArray(input.existingIds)
    ? input.existingIds
    : listOutcomePrograms(projectId, { ...options, projectId }).map((program) =>
        program.channelId || program.workflowGraph?.id || program.graphId || program.id
      );
  const channelId = input.channelId || channelIdFor(input.id || name, existingIds);
  const graphId = input.graphId || (projectId === "default" ? channelId : `${projectId}--${channelId}`);
  const kind = String(input.kind || "custom").trim() || "custom";
  const program = buildOutcomeProgram({
    id: input.programId,
    projectId,
    name,
    objective,
    sourceOpportunityId: input.sourceOpportunityId ?? null,
    channelId,
    graphId,
    // This command composes a workflow in the same breath (it emits WorkflowComposed below), so the
    // program is born active. lifecycle is founder-controlled; there is no longer a single status.
    lifecycle: input.lifecycle || "active",
    desiredOutcome: input.desiredOutcome ?? {
      type: "program_outcome",
      description: objective,
    },
    buyerHypothesis: input.buyerHypothesis ?? {},
    channelHypothesis: input.channelHypothesis ?? {
      id: channelId,
      label: name,
      objective,
      kind,
      enabled: input.enabled !== false,
      status: "accepted",
    },
    measurementPlan: input.measurementPlan ?? {},
  }, { ...options, projectId });
  const workflowGraph = {
    ...(input.workflowGraph ?? createBlankChannelGraph({ id: graphId, name, objective, kind })),
    id: graphId,
    name,
    objective,
    kind,
    outcomeProgramId: program.id,
  };
  const durableProgram = { ...program, graphId, workflowGraph };
  appendDomainEvent(projectId, {
    type: "OutcomeProgramCreated",
    aggregateType: "OutcomeProgram",
    aggregateId: durableProgram.id,
    data: durableProgram,
  }, { ...options, projectId });
  appendDomainEvent(projectId, {
    type: "WorkflowComposed",
    aggregateType: "OutcomeProgram",
    aggregateId: durableProgram.id,
    data: { channelId, graphId, workflowGraph },
  }, { ...options, projectId });
  if (name || objective || kind || input.enabled !== undefined) {
    appendDomainEvent(projectId, {
      type: "ProgramChannelMetadataUpdated",
      aggregateType: "OutcomeProgram",
      aggregateId: durableProgram.id,
      data: {
        channelId,
        name,
        objective,
        kind,
        enabled: input.enabled !== false,
        workflowGraph,
        channelHypothesis: {
          ...(durableProgram.channelHypothesis ?? {}),
          label: name,
          objective,
          kind,
          enabled: input.enabled !== false,
        },
      },
    }, { ...options, projectId });
  }
  syncProgramStoreFromEvents(projectId, { ...options, projectId });
  saveFlow(workflowGraph, options);
  return {
    program: getOutcomeProgram(durableProgram.id, projectId, { ...options, projectId }),
    workflowGraph,
    channel: programWorkflowChannel({ ...durableProgram, workflowGraph }),
  };
}

export function updateProgramWorkflowMetadata(input = {}, options = {}) {
  const projectId = input.projectId || options.projectId || "default";
  if (!input.programId) throw new Error("UpdateProgramWorkflowMetadata requires a programId.");
  const current = getOutcomeProgram(input.programId, projectId, { ...options, projectId });
  const graphId = current.workflowGraph?.id ?? current.graphId;
  const flow = graphId ? loadFlow(graphId, null, options) : { graph: null };
  const workflowGraph = (input.workflowGraph ?? flow.graph ?? current.workflowGraph)
    ? {
        ...(input.workflowGraph ?? flow.graph ?? current.workflowGraph),
        name: input.name ?? current.name,
        objective: input.objective ?? current.desiredOutcome?.description ?? "",
        kind: input.kind ?? current.channelHypothesis?.kind ?? "custom",
        outcomeProgramId: current.id,
      }
    : null;
  if (workflowGraph) saveFlow(workflowGraph, options);
  appendDomainEvent(projectId, {
    type: "ProgramChannelMetadataUpdated",
    aggregateType: "OutcomeProgram",
    aggregateId: current.id,
    data: {
      channelId: input.channelId ?? current.channelId ?? current.id,
      name: input.name ?? current.name,
      objective: input.objective ?? current.desiredOutcome?.description ?? "",
      kind: input.kind ?? current.channelHypothesis?.kind ?? "custom",
      enabled: input.enabled ?? current.channelHypothesis?.enabled ?? true,
      workflowGraph,
      channelHypothesis: {
        ...(current.channelHypothesis ?? {}),
        label: input.name ?? current.name,
        objective: input.objective ?? current.desiredOutcome?.description ?? "",
        kind: input.kind ?? current.channelHypothesis?.kind ?? "custom",
        enabled: input.enabled ?? current.channelHypothesis?.enabled ?? true,
      },
    },
  }, { ...options, projectId });
  return syncProgramStoreFromEvents(projectId, { ...options, projectId })
    .find((program) => program.id === current.id);
}

export function programWorkflowChannel(program = {}) {
  const channel = program.channelHypothesis ?? {};
  return {
    id: program.channelId || channel.id || program.id,
    graphId: program.workflowGraph?.id ?? program.graphId ?? channel.graphId ?? program.channelId ?? program.id,
    name: channel.label || program.name || "Untitled program",
    kind: channel.kind || "custom",
    objective: channel.objective || program.desiredOutcome?.description || "",
    enabled: channel.enabled !== false && program.lifecycle !== "retired",
    createdAt: program.createdAt,
    outcomeProgramId: program.id,
  };
}
