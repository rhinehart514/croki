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

// Build the things the workflow reaches for. The composer — or the founder, dropping a step — can
// reference an agent teammate that was never compiled from a declared opportunity: a Content
// Strategist, a Lifecycle Engineer, a Community Lead, whatever the motion needs. Rather than run that
// as a generic, contract-less step, the foundry MINTS it — a real personalized agent (creation
// policy + instance + on-disk definition), born for this program — so every agent the graph reaches
// for becomes an actual teammate that learns at the gate. This is the other half of the open node
// model: the library is no longer a fixed bin you can only pick from; the graph can reach for a
// teammate and the foundry creates it.
//
// Idempotent: a node already backed by an instance (config.agentInstanceId) is left untouched, and a
// re-run returns the existing policy/instance for the same ref (the opportunity id is stable per
// program+ref). Returns the annotated graph (every minted node now carries its instance) and the
// agents minted this pass.
export function ensureGraphAgents({ project, program, graph, priorRunState = [] } = {}, options = {}) {
  if (!project) throw new Error("A project is required to mint the agents a graph reaches for.");
  if (!program) throw new Error("A program is required to mint the agents a graph reaches for.");
  if (!graph || !Array.isArray(graph.nodes)) return { graph, agents: [] };
  const minted = [];
  for (const node of graph.nodes) {
    if (node.kind !== "agent" || node.config?.agentInstanceId) continue; // skip non-agents + real ones
    const ref = String(node.ref || "").trim();
    if (!ref) continue;
    const job = String(node.label || node.config?.objective || ref).trim();
    const agentOpportunity = {
      id: `graph-agent:${program.id}:${ref}`,
      ref,
      title: node.label || ref,
      objective: job,
      prompt: node.config?.prompt,
      provider: node.config?.provider,
      model: node.config?.model,
      channelId: graph.id ?? null,
      // Carry the node's declared I/O so the minted agent's contract matches the wiring on the canvas.
      ...(node.contract ? { contract: node.contract } : {}),
    };
    const policy = ensureAgentCreationPolicy({ project, program, agentOpportunity }, { ...options, projectId: project.id });
    const { instance, profile } = createPersonalizedAgent({
      project, program, policy, agentOpportunity, priorRunState,
    }, { ...options, projectId: project.id });
    minted.push({
      opportunity: agentOpportunity, policy, instance, profile,
      markdown: agentInstanceMarkdown({ instance, policy, profile, agentOpportunity }),
    });
  }
  if (!minted.length) return { graph, agents: [] };
  recordCompiledProgramEvents({ program, agents: minted }, { ...options, projectId: project.id });
  return { graph: annotateGraphWithProgram(graph, { program, agents: minted }), agents: minted };
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
