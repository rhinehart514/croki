import { ensureAgentCreationPolicy } from "./agent-policy-store.mjs";
import {
  agentInstanceMarkdown,
  createPersonalizedAgent,
} from "./capability-foundry.mjs";
import { appendDomainEvent, listDomainEvents } from "./domain-events.mjs";
import { ensureOutcomeProgramForChannel, updateOutcomeProgram } from "./program-store.mjs";

// The live compose path (server + MCP front doors) creates programs, policies, profiles, and agent
// instances. Until now it wrote them straight to the stores and emitted no domain events, so the
// event log — which DDD.md and program-projection.mjs call the authoritative, reconstructable
// history — was missing every aggregate the real product creates. These emitters close that gap.
// They are idempotent: a re-compose (the ensure* functions return existing aggregates) appends no
// duplicate creation event, because each is guarded on whether the log already has it.
function alreadyRecorded(projectId, aggregateId, type, options) {
  return listDomainEvents(projectId, { ...options, aggregateId, type }).length > 0;
}

export function recordCompiledProgramEvents({ program, agents = [] } = {}, options = {}) {
  const projectId = program.projectId;
  if (!alreadyRecorded(projectId, program.id, "OutcomeProgramCreated", options)) {
    appendDomainEvent(projectId, {
      type: "OutcomeProgramCreated",
      aggregateType: "OutcomeProgram",
      aggregateId: program.id,
      data: program,
    }, options);
  }
  for (const { policy, profile, instance } of agents) {
    if (policy && !alreadyRecorded(projectId, policy.id, "AgentCreationPolicyCreated", options)) {
      appendDomainEvent(projectId, {
        type: "AgentCreationPolicyCreated",
        aggregateType: "AgentCreationPolicy",
        aggregateId: policy.id,
        data: policy,
      }, options);
    }
    if (profile && !alreadyRecorded(projectId, profile.id, "PersonalizationProfileAssembled", options)) {
      appendDomainEvent(projectId, {
        type: "PersonalizationProfileAssembled",
        aggregateType: "PersonalizationProfile",
        aggregateId: profile.id,
        data: profile,
      }, options);
    }
    if (instance && !alreadyRecorded(projectId, instance.id, "PersonalizedAgentCreated", options)) {
      appendDomainEvent(projectId, {
        type: "PersonalizedAgentCreated",
        aggregateType: "AgentInstance",
        aggregateId: instance.id,
        data: instance,
      }, options);
    }
  }
}

export function compileOpportunityProgram({ project, channel, agents = [], priorRunState = [] } = {}, options = {}) {
  if (!project) throw new Error("A project is required to compile an outcome program.");
  if (!channel) throw new Error("A channel opportunity is required to compile an outcome program.");
  const program = ensureOutcomeProgramForChannel(project, channel, { ...options, projectId: project.id });
  const compiledAgents = agents.map((agentOpportunity) => {
    const policy = ensureAgentCreationPolicy({ project, program, agentOpportunity }, { ...options, projectId: project.id });
    const { instance, profile } = createPersonalizedAgent({
      project,
      program,
      policy,
      agentOpportunity,
      priorRunState,
    }, { ...options, projectId: project.id });
    return {
      opportunity: agentOpportunity,
      policy,
      instance,
      profile,
      markdown: agentInstanceMarkdown({ instance, policy, profile, agentOpportunity }),
    };
  });
  // Make the live path event-complete: the program and every born agent become authoritative
  // creation events, the same as the operator's executeDomainCommand path already produced.
  recordCompiledProgramEvents({ program, agents: compiledAgents }, { ...options, projectId: project.id });
  return { program, agents: compiledAgents };
}

export function annotateGraphWithProgram(graph, compiled) {
  const byRef = new Map(compiled.agents.map((agent) => [agent.instance.ref, agent]));
  return {
    ...graph,
    outcomeProgramId: compiled.program.id,
    nodes: graph.nodes.map((node) => {
      if (node.kind !== "agent" || !byRef.has(node.ref)) return node;
      const compiledAgent = byRef.get(node.ref);
      return {
        ...node,
        config: {
          ...node.config,
          programId: compiled.program.id,
          agentInstanceId: compiledAgent.instance.id,
          creationPolicyId: compiledAgent.policy.id,
          personalizationProfileId: compiledAgent.profile.id,
        },
        sourceOfTruth: [
          ...new Set([
            ...(node.sourceOfTruth ?? []),
            "agentCreationPolicy",
            "personalizationProfile",
          ]),
        ],
        contract: node.contract ?? {
          accepts: compiledAgent.instance.inputContract,
          emits: compiledAgent.instance.outputContract,
          minItems: 1,
        },
      };
    }),
  };
}

export function markProgramComposed(program, { channelId, graphId, workflowGraph, name, objective, kind, enabled = true } = {}, options = {}) {
  // Composition activates the program's lifecycle (founder-controlled), not a run-status. The old
  // single status:"ready" is gone; a composed program is "active" and immediately runnable.
  const graphBody = workflowGraph ?? null;
  // graphId is the flow-store ledger key and must always equal workflowGraph.id (contract §4).
  const ledgerGraphId = graphBody?.id ?? graphId ?? null;
  const updated = updateOutcomeProgram(program.id, {
    lifecycle: "active",
    channelId,
    graphId: ledgerGraphId,
    workflowGraph: graphBody,
    ...(name ? { name } : {}),
    ...(objective ? { desiredOutcome: { ...(program.desiredOutcome ?? {}), description: objective } } : {}),
    ...(name || objective || kind ? {
      channelHypothesis: {
        ...(program.channelHypothesis ?? {}),
        label: name ?? program.name,
        objective: objective ?? program.desiredOutcome?.description ?? "",
        kind: kind ?? program.channelHypothesis?.kind ?? "custom",
        enabled,
      },
    } : {}),
  }, { ...options, projectId: program.projectId });
  // The composition is a state transition the event log must carry, or a rebuild would show the
  // program without its graph. Mirrors the ComposeProgramWorkflow command's WorkflowComposed event.
  appendDomainEvent(updated.projectId, {
    type: "WorkflowComposed",
    aggregateType: "OutcomeProgram",
    aggregateId: updated.id,
    data: { channelId: updated.channelId, graphId: updated.graphId, workflowGraph: updated.workflowGraph },
  }, options);
  if (name || objective || kind) {
    appendDomainEvent(updated.projectId, {
      type: "ProgramChannelMetadataUpdated",
      aggregateType: "OutcomeProgram",
      aggregateId: updated.id,
      data: {
        channelId: updated.channelId,
        name: name ?? updated.name,
        objective: objective ?? updated.desiredOutcome?.description ?? "",
        kind: kind ?? updated.channelHypothesis?.kind ?? "custom",
        enabled,
        workflowGraph: updated.workflowGraph,
        channelHypothesis: {
          ...(updated.channelHypothesis ?? {}),
          label: name ?? updated.name,
          objective: objective ?? updated.desiredOutcome?.description ?? "",
          kind: kind ?? updated.channelHypothesis?.kind ?? "custom",
          enabled,
        },
      },
    }, options);
  }
  return updated;
}
