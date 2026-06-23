import { getEngineState } from "./engine.mjs";
import { liveStepRuntime } from "./agent-bridge.mjs";
import { createClaudeIdeator } from "./ideation.mjs";
import { createClaudeComposer } from "./composition.mjs";
import { loadFlow, recordFlowRun, saveFlow } from "./flow-store.mjs";
import { applyGraphOperations, validateGraph } from "./graph-operations.mjs";
import { listConnectors, runGraph } from "./graph.mjs";
import { buildDraftMemory, extractDecisions } from "./memory.mjs";
import {
  appendOperatorEvent,
  getOperatorSession,
  saveOperatorSession,
} from "./operator-store.mjs";
import {
  applySharedContextToGraph,
  createChannel,
  duplicateChannel,
  getChannel,
  getProjectWithChannels,
  listProjects,
  loadProject,
  setActiveChannel,
  updateChannel,
  updateSharedContext,
} from "./project-store.mjs";
import {
  saveGeneratedOpportunities,
  updateOpportunity,
} from "./opportunity-engine.mjs";
import { composeOpportunityChannel } from "./workflow-composer.mjs";
import {
  compareChannelRuns,
  createPortfolioArtifact,
  derivePortfolioBrief,
  recordExperiment,
} from "./portfolio-intelligence.mjs";
import { getWorkspace, listWorkspaces } from "./workspace.mjs";
import { authModeLabel, selectRuntime } from "./runtimes/index.mjs";

const activeSessions = new Map();

const TOOLS = [
  {
    name: "inspect_projects",
    description: "List product projects and identify the currently active repository scope.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "inspect_portfolio",
    description: "Inspect all GTM channels, their objectives, status, run history, and the shared product-intelligence version.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "inspect_shared_context",
    description: "Inspect the shared repository evidence, product, positioning, ICP, founder taste, contacts, outcomes, experiments, artifacts, and product feedback used by every channel.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "update_shared_context",
    description: "Update shared GTM intelligence across every channel. Preserve evidence status and do not present inferred positioning or ICP as proven.",
    input_schema: {
      type: "object",
      properties: {
        rationale: { type: "string" },
        patch: { type: "object" },
      },
      required: ["rationale", "patch"],
    },
  },
  {
    name: "switch_channel",
    description: "Switch the durable operator to another channel program before inspecting, editing, or running it.",
    input_schema: {
      type: "object",
      properties: { channelId: { type: "string" } },
      required: ["channelId"],
    },
  },
  {
    name: "create_channel",
    description: "Create a blank founder-defined GTM channel, make it active, then shape its graph with typed graph operations.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        objective: { type: "string" },
        kind: { type: "string" },
      },
      required: ["name", "objective"],
    },
  },
  {
    name: "duplicate_channel",
    description: "Duplicate an existing channel and its current graph as a new independently editable channel.",
    input_schema: {
      type: "object",
      properties: {
        channelId: { type: "string" },
        name: { type: "string" },
        objective: { type: "string" },
      },
      required: ["channelId", "name"],
    },
  },
  {
    name: "update_channel",
    description: "Rename, clarify, classify, enable, or archive a founder-defined channel without changing its graph nodes.",
    input_schema: {
      type: "object",
      properties: {
        channelId: { type: "string" },
        name: { type: "string" },
        objective: { type: "string" },
        kind: { type: "string" },
        enabled: { type: "boolean" },
      },
      required: ["channelId"],
    },
  },
  {
    name: "inspect_portfolio_brief",
    description: "Build a current cross-channel brief from real runs, observed outcomes, experiments, artifacts, and product feedback.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "create_experiment",
    description: "Record a disciplined channel experiment with one explicit variable, held constants, and a success signal. This does not invent a result.",
    input_schema: {
      type: "object",
      properties: {
        channelId: { type: "string" },
        hypothesis: { type: "string" },
        variable: { type: "string" },
        heldConstant: { type: "array", items: { type: "string" } },
        successSignal: { type: "string" },
      },
      required: ["channelId", "hypothesis", "variable", "successSignal"],
    },
  },
  {
    name: "create_proof_brief",
    description: "Create and preserve a proof artifact derived from current portfolio state. It contains no invented outcomes.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "inspect_product",
    description: "Inspect the active repository-grounded product report, win event, gaps, and file:line evidence.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "generate_opportunities",
    description: "Generate durable channel and agent opportunities from the active project's repository evidence. Derived and speculative candidates remain explicitly separated.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "review_opportunity",
    description: "Edit and mark one channel or agent opportunity as accepted, rejected, deferred, or proposed. This does not compose a workflow.",
    input_schema: {
      type: "object",
      properties: {
        opportunityId: { type: "string" },
        patch: { type: "object" },
      },
      required: ["opportunityId", "patch"],
    },
  },
  {
    name: "compose_opportunity_channel",
    description: "Compose one accepted channel and accepted agents into a validated input → agents → founder gate → output → measure workflow.",
    input_schema: {
      type: "object",
      properties: {
        channelOpportunityId: { type: "string" },
        agentOpportunityIds: { type: "array", items: { type: "string" } },
        name: { type: "string" },
        objective: { type: "string" },
        input: { type: "object" },
        output: { type: "object" },
      },
      required: ["channelOpportunityId", "agentOpportunityIds"],
    },
  },
  {
    name: "inspect_graph",
    description: "Read the current executable GTM graph, including nodes, edges, revision, and recent run count.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "inspect_problems",
    description: "Read current subsystem health, ranked investigations, connector readiness, and recommended repairs.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "patch_graph",
    description: "Apply validated, reversible typed operations to the GTM graph. Never return a replacement graph.",
    input_schema: {
      type: "object",
      properties: {
        rationale: { type: "string" },
        operations: {
          type: "array",
          minItems: 1,
          maxItems: 24,
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: [
                  "set_graph_name",
                  "add_node",
                  "remove_node",
                  "update_node",
                  "connect_nodes",
                  "disconnect_nodes",
                ],
              },
              name: { type: "string" },
              nodeId: { type: "string" },
              edgeId: { type: "string" },
              node: {
                type: "object",
                description: "A workflow step. A 'tool' step (the default) is a registered connector and needs category + connector. An 'agent', 'skill', or 'code' step is composed freely and needs a ref (the subagent/skill/transform name) instead.",
                properties: {
                  id: { type: "string" },
                  kind: {
                    type: "string",
                    enum: ["tool", "agent", "skill", "code"],
                    description: "tool = connector (default); agent = invoke a subagent; skill = apply a skill's judgment; code = a bounded transform.",
                  },
                  ref: { type: "string", description: "For agent/skill/code steps: the subagent, skill, or transform to invoke." },
                  category: {
                    type: "string",
                    enum: ["resource", "source", "context", "enrich", "filter", "generate", "gate", "execute", "measure"],
                  },
                  connector: { type: "string" },
                  label: { type: "string" },
                  position: {
                    type: "object",
                    properties: { x: { type: "number" }, y: { type: "number" } },
                    required: ["x", "y"],
                  },
                  config: { type: "object" },
                  agentPrompt: { type: "string" },
                  sourceOfTruth: { type: "array", items: { type: "string" } },
                },
                required: ["id", "label", "position", "config"],
              },
              edge: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  source: { type: "string" },
                  target: { type: "string" },
                  edgeType: { type: "string", enum: ["data", "context", "feedback"] },
                  label: { type: "string" },
                },
                required: ["id", "source", "target", "edgeType"],
              },
              patch: { type: "object" },
            },
            required: ["type"],
          },
        },
      },
      required: ["rationale", "operations"],
    },
  },
  {
    name: "validate_graph",
    description: "Validate node references, required fields, edge types, unique ids, and data-cycle safety.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "run_node",
    description: "Run one node and its dependencies, persist the result, and inspect the actual output or failure.",
    input_schema: {
      type: "object",
      properties: { nodeId: { type: "string" } },
      required: ["nodeId"],
    },
  },
  {
    name: "run_loop",
    description: "Run the full GTM graph. The operator automatically pauses if a founder gate is reached.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "inspect_run",
    description: "Inspect a persisted run. Omit runId to inspect the latest run.",
    input_schema: {
      type: "object",
      properties: { runId: { type: "string" } },
      required: [],
    },
  },
  {
    name: "compare_runs",
    description: "Compare two persisted runs by node status, item counts, errors, and gate state.",
    input_schema: {
      type: "object",
      properties: {
        beforeRunId: { type: "string" },
        afterRunId: { type: "string" },
      },
      required: ["beforeRunId", "afterRunId"],
    },
  },
  {
    name: "request_founder_input",
    description: "Pause when a consequential choice or missing fact requires founder judgment.",
    input_schema: {
      type: "object",
      properties: {
        question: { type: "string" },
        reason: { type: "string" },
      },
      required: ["question", "reason"],
    },
  },
  {
    name: "complete",
    description: "Finish the operator session after achieving the goal or reaching the strongest honest result available.",
    input_schema: {
      type: "object",
      properties: {
        summary: { type: "string" },
        outcome: { type: "string", enum: ["achieved", "partially_achieved", "blocked"] },
      },
      required: ["summary", "outcome"],
    },
  },
];

function compactProduct(workspace) {
  if (!workspace) {
    return {
      grounded: false,
      note: "No repository workspace is open. The operator can still inspect and repair the graph, but product claims are ungrounded.",
    };
  }
  const report = workspace.report;
  return {
    grounded: true,
    workspaceId: workspace.id,
    repo: workspace.repo,
    outcome: workspace.outcome,
    headline: report.headline,
    stack: report.stack,
    winEvent: report.winEvent,
    gaps: report.gaps,
    funnel: report.funnel,
  };
}

function latestWorkspace(session, options = {}) {
  const summaries = listWorkspaces(options);
  const id = session.workspaceId || summaries[0]?.id;
  if (!id) return null;
  try {
    return getWorkspace(id, options);
  } catch {
    return null;
  }
}

function flowFor(session, options = {}) {
  const graphId = session.graphId;
  if (!graphId) throw new Error("No active channel. Create or switch to a channel first.");
  const flow = loadFlow(graphId, null, options);
  if (!flow.graph) throw new Error(`Graph not found: ${graphId}`);
  const project = loadProject(options);
  return {
    ...flow,
    graph: applySharedContextToGraph(flow.graph, project.sharedContext),
  };
}

function memoryFor(runs) {
  return buildDraftMemory(extractDecisions(runs));
}

function summarizeNodeResult(node) {
  return {
    nodeId: node.nodeId,
    category: node.category,
    ok: node.ok,
    blocked: node.blocked ?? false,
    pendingReview: node.pendingReview ?? false,
    itemCount: Array.isArray(node.items) ? node.items.length : 0,
    error: node.error ?? null,
    meta: node.meta ?? null,
    items: (node.items ?? []).slice(0, 12),
  };
}

function summarizeRun(result) {
  return {
    runId: result.runId,
    ok: result.ok,
    pendingGates: result.pendingGates,
    targetNodeId: result.targetNodeId,
    error: result.error ?? null,
    nodes: Object.fromEntries(
      Object.entries(result.nodes ?? {}).map(([id, node]) => [id, summarizeNodeResult(node)]),
    ),
  };
}

function systemPrompt(session, workspace) {
  const grounding = workspace
    ? `The active repository is ${workspace.repo}. The defined win event is "${workspace.outcome}".`
    : "No repository workspace is currently active. State that limitation before making product claims.";
  return `You are the resident GTM operator inside GTM IDE.

Your job is to work the founder's goal through the product's real executable system: inspect grounded product evidence, inspect and patch the graph, run the smallest useful scope, diagnose actual failures, revise, rerun, and stop whenever founder judgment or external permission is required.

Founder goal:
${session.goal}

Grounding:
${grounding}

Operating rules:
- Begin by inspecting product truth, the graph, and current problems unless a resumed session already contains that evidence.
- For a new product or portfolio goal, inspect projects and generate reviewable opportunities before creating a blank channel.
- For portfolio goals, inspect all founder-defined channels and shared context before choosing where to work.
- Do not invent a fixed channel catalog. Keep code-derived and speculative opportunities separate, and do not compose either until the founder has accepted it.
- Use create_channel only for an explicitly requested blank motion. Prefer review_opportunity plus compose_opportunity_channel for product-derived systems.
- Keep product, positioning, ICP, founder taste, contacts, and outcomes in shared context rather than duplicating them into graphs.
- Use typed graph operations. Never invent a replacement graph or claim a change that a tool did not apply.
- Prefer running and observing over theorizing. Repair actual failures and rerun affected work.
- Product claims must come from repository evidence or be labeled inferred or blind.
- Never approve a gate. Never send, publish, deploy, charge, or alter an external system.
- When run_loop reaches a gate, the runtime pauses automatically for the founder.
- Ask for founder input only when a consequential choice cannot be inferred safely.
- Keep working until the goal is achieved, honestly blocked, or needs founder judgment.
- Call complete when you are done.`;
}

function addEvent(session, event, options) {
  return saveOperatorSession(appendOperatorEvent(session, event), options);
}

async function executeGraphRun(session, { targetNodeId } = {}, options = {}) {
  const flow = flowFor(session, options);
  const result = await runGraph(flow.graph, {
    targetNodeId,
    memory: memoryFor(flow.runs),
    stepRuntime: liveStepRuntime({ cwd: options.cwd }),
  });
  const stored = recordFlowRun(flow.graph, result, options);
  let next = {
    ...session,
    lastRunId: result.runId,
    graphRevision: flow.graph.revision ?? 0,
  };
  next = addEvent(next, {
    type: "run_completed",
    title: targetNodeId ? `Ran ${targetNodeId}` : "Ran the full loop",
    detail: result.pendingGates.length
      ? `Paused at ${result.pendingGates.length} founder gate${result.pendingGates.length === 1 ? "" : "s"}.`
      : result.ok ? "The run completed successfully." : result.error,
    data: {
      runId: result.runId,
      ok: result.ok,
      targetNodeId: targetNodeId ?? null,
      pendingGates: result.pendingGates,
      storedRunCount: stored.runs.length,
    },
  }, options);
  if (result.pendingGates.length) {
    next = saveOperatorSession({
      ...next,
      status: "waiting_for_gate",
      pendingGate: {
        runId: result.runId,
        nodeIds: result.pendingGates,
        runResult: result,
      },
      error: null,
    }, options);
  }
  return { session: next, result };
}

async function executeTool(session, tool, options = {}) {
  const input = tool.input ?? {};
  if (tool.name === "inspect_projects") {
    const catalog = listProjects(options);
    const next = addEvent(session, {
      type: "inspection",
      title: "Inspected product projects",
      detail: `${catalog.projects.length} product project${catalog.projects.length === 1 ? "" : "s"} · active ${catalog.activeProjectId || "none"}`,
      data: { activeProjectId: catalog.activeProjectId },
    }, options);
    return { session: next, result: catalog, pause: false };
  }

  if (tool.name === "inspect_portfolio") {
    const project = getProjectWithChannels(options);
    const next = addEvent(session, {
      type: "inspection",
      title: "Inspected the GTM portfolio",
      detail: `${project.channels.length} coordinated channel programs · shared context v${project.sharedContext.version}`,
      data: { activeChannelId: project.activeChannelId },
    }, options);
    return { session: next, result: project, pause: false };
  }

  if (tool.name === "inspect_shared_context") {
    const project = loadProject(options);
    const next = addEvent(session, {
      type: "inspection",
      title: "Inspected shared product intelligence",
      detail: `Shared context v${project.sharedContext.version} is used by every channel.`,
    }, options);
    return { session: next, result: project.sharedContext, pause: false };
  }

  if (tool.name === "update_shared_context") {
    const project = updateSharedContext(input.patch, options);
    const next = addEvent(session, {
      type: "shared_context_updated",
      title: "Updated shared GTM intelligence",
      detail: input.rationale,
      data: { version: project.sharedContext.version, fields: Object.keys(input.patch ?? {}) },
    }, options);
    return {
      session: next,
      result: { sharedContext: project.sharedContext },
      pause: false,
    };
  }

  if (tool.name === "switch_channel") {
    const project = loadProject(options);
    const channel = getChannel(project, input.channelId);
    setActiveChannel(channel.id, options);
    const next = addEvent({
      ...session,
      graphId: channel.graphId,
      graphRevision: loadFlow(channel.graphId, null, options).graph?.revision ?? 0,
    }, {
      type: "channel_switched",
      title: `Switched to ${channel.name}`,
      detail: channel.objective,
      data: { channelId: channel.id, graphId: channel.graphId },
    }, options);
    return { session: next, result: { channel, graphId: channel.graphId }, pause: false };
  }

  if (tool.name === "create_channel") {
    const created = createChannel(input, options);
    setActiveChannel(created.channel.id, options);
    const next = addEvent({
      ...session,
      graphId: created.channel.graphId,
      graphRevision: 0,
    }, {
      type: "channel_created",
      title: `Created ${created.channel.name}`,
      detail: created.channel.objective || "Blank channel ready to shape.",
      data: { channelId: created.channel.id, graphId: created.channel.graphId },
    }, options);
    return { session: next, result: created.channel, pause: false };
  }

  if (tool.name === "duplicate_channel") {
    const created = duplicateChannel(input.channelId, input, options);
    setActiveChannel(created.channel.id, options);
    const revision = loadFlow(created.channel.graphId, null, options).graph?.revision ?? 0;
    const next = addEvent({
      ...session,
      graphId: created.channel.graphId,
      graphRevision: revision,
    }, {
      type: "channel_duplicated",
      title: `Duplicated as ${created.channel.name}`,
      detail: created.channel.objective || null,
      data: { channelId: created.channel.id, graphId: created.channel.graphId },
    }, options);
    return { session: next, result: created.channel, pause: false };
  }

  if (tool.name === "update_channel") {
    const { channelId, ...patch } = input;
    const updated = updateChannel(channelId, patch, options);
    const next = addEvent(session, {
      type: "channel_updated",
      title: `Updated ${updated.channel.name}`,
      detail: updated.channel.objective || null,
      data: { channelId: updated.channel.id, enabled: updated.channel.enabled },
    }, options);
    return { session: next, result: updated.channel, pause: false };
  }

  if (tool.name === "inspect_portfolio_brief") {
    const brief = derivePortfolioBrief(options);
    const next = addEvent(session, {
      type: "inspection",
      title: "Built a cross-channel operating brief",
      detail: `${brief.channels.length} channels · ${brief.observedOutcomes.length} observed outcomes · ${brief.recommendations.length} recommendations`,
    }, options);
    return { session: next, result: brief, pause: false };
  }

  if (tool.name === "create_experiment") {
    const recorded = recordExperiment(input, options);
    const next = addEvent(session, {
      type: "experiment_created",
      title: "Created a GTM experiment",
      detail: recorded.experiment.hypothesis,
      data: { experimentId: recorded.experiment.id, channelId: recorded.experiment.channelId },
    }, options);
    return { session: next, result: recorded, pause: false };
  }

  if (tool.name === "create_proof_brief") {
    const recorded = createPortfolioArtifact(options);
    const next = addEvent(session, {
      type: "artifact_created",
      title: "Created a portfolio proof brief",
      detail: recorded.artifact.summary,
      data: { artifactId: recorded.artifact.id },
    }, options);
    return { session: next, result: recorded, pause: false };
  }

  if (tool.name === "inspect_product") {
    const workspace = latestWorkspace(session, options);
    let next = session;
    if (workspace && !session.workspaceId) next = saveOperatorSession({ ...session, workspaceId: workspace.id }, options);
    next = addEvent(next, {
      type: "inspection",
      title: workspace ? "Inspected product evidence" : "Product grounding is missing",
      detail: workspace?.report?.headline ?? "No repository workspace is open.",
    }, options);
    return { session: next, result: compactProduct(workspace), pause: false };
  }

  if (tool.name === "generate_opportunities") {
    const project = loadProject(options);
    const workspaceId = project.sharedContext?.repository?.workspaceId;
    if (!workspaceId) throw new Error("The active project has no repository scan.");
    const workspace = getWorkspace(workspaceId, options);
    const repo = options.cwd || project.sharedContext?.repository?.repo || process.cwd();
    const opportunities = await saveGeneratedOpportunities(workspace.report, {
      ...options,
      ideate: options.ideate || createClaudeIdeator({ cwd: repo }),
    });
    const channels = opportunities.items.filter((item) => item.type === "channel");
    const agents = opportunities.items.filter((item) => item.type === "agent");
    const next = addEvent(session, {
      type: "opportunities_generated",
      title: "Generated channel and agent opportunities",
      detail: `${channels.length} channel opportunities · ${agents.length} agent opportunities · review required before composition`,
      data: {
        derived: opportunities.items.filter((item) => item.origin === "derived").length,
        speculative: opportunities.items.filter((item) => item.origin === "speculative").length,
      },
    }, options);
    return { session: next, result: opportunities, pause: false };
  }

  if (tool.name === "review_opportunity") {
    const opportunity = updateOpportunity(input.opportunityId, input.patch, options);
    const next = addEvent(session, {
      type: "opportunity_reviewed",
      title: `${opportunity.status === "accepted" ? "Accepted" : opportunity.status === "rejected" ? "Rejected" : "Updated"} ${opportunity.title}`,
      detail: opportunity.rationale,
      data: { opportunityId: opportunity.id, type: opportunity.type, status: opportunity.status },
    }, options);
    return { session: next, result: opportunity, pause: false };
  }

  if (tool.name === "compose_opportunity_channel") {
    const composeRepo = options.cwd || loadProject(options).sharedContext?.repository?.repo || process.cwd();
    const composed = await composeOpportunityChannel(input, {
      ...options,
      compose: options.compose || createClaudeComposer({ cwd: composeRepo }),
    });
    const next = addEvent({
      ...session,
      graphId: composed.channel.graphId,
      graphRevision: composed.graph.revision,
    }, {
      type: "channel_composed",
      title: `Composed ${composed.channel.name}`,
      detail: `${composed.graph.nodes.length} steps with a founder gate and attributable feedback loop.`,
      data: { channelId: composed.channel.id, graphId: composed.channel.graphId },
    }, options);
    return { session: next, result: composed, pause: false };
  }

  if (tool.name === "inspect_graph") {
    const flow = flowFor(session, options);
    const next = addEvent(session, {
      type: "inspection",
      title: "Inspected the executable graph",
      detail: `${flow.graph.nodes.length} nodes · ${flow.graph.edges.length} edges · ${flow.runs.length} recorded runs`,
    }, options);
    return {
      session: next,
      result: {
        graph: flow.graph,
        recentRuns: flow.runs.slice(-5).map((run) => ({
          id: run.id,
          createdAt: run.createdAt,
          ok: run.ok,
          pendingGates: run.pendingGates,
        })),
      },
      pause: false,
    };
  }

  if (tool.name === "inspect_problems") {
    const flow = flowFor(session, options);
    const workspace = latestWorkspace(session, options);
    const connectors = listConnectors();
    const engine = getEngineState({
      report: workspace?.report ?? null,
      runs: flow.runs,
      graph: flow.graph ?? null,
      connectors,
    });
    const next = addEvent(session, {
      type: "inspection",
      title: "Inspected live problems",
      detail: engine.investigations.length
        ? `${engine.investigations.length} ranked problem${engine.investigations.length === 1 ? "" : "s"} found.`
        : "No active investigation is currently derived.",
    }, options);
    return {
      session: next,
      result: { engine, connectors },
      pause: false,
    };
  }

  if (tool.name === "patch_graph") {
    const flow = flowFor(session, options);
    const patched = applyGraphOperations(flow.graph, input.operations);
    const saved = saveFlow(patched.graph, options);
    const next = addEvent({
      ...session,
      graphRevision: saved.graph.revision ?? 0,
    }, {
      type: "graph_patched",
      title: "Patched the GTM graph",
      detail: input.rationale,
      data: { revision: saved.graph.revision, changes: patched.changes },
    }, options);
    return {
      session: next,
      result: {
        revision: saved.graph.revision,
        changes: patched.changes,
        validation: patched.validation,
        graph: saved.graph,
      },
      pause: false,
    };
  }

  if (tool.name === "validate_graph") {
    const flow = flowFor(session, options);
    const validation = validateGraph(flow.graph);
    const next = addEvent(session, {
      type: "validation",
      title: validation.ok ? "Graph validation passed" : "Graph validation failed",
      detail: validation.ok ? "Node, edge, and cycle checks passed." : validation.errors.join(" "),
    }, options);
    return { session: next, result: validation, pause: false };
  }

  if (tool.name === "run_node") {
    const run = await executeGraphRun(session, { targetNodeId: input.nodeId }, options);
    return { session: run.session, result: summarizeRun(run.result), pause: run.session.status === "waiting_for_gate" };
  }

  if (tool.name === "run_loop") {
    const run = await executeGraphRun(session, {}, options);
    return { session: run.session, result: summarizeRun(run.result), pause: run.session.status === "waiting_for_gate" };
  }

  if (tool.name === "inspect_run") {
    const flow = flowFor(session, options);
    const record = input.runId
      ? flow.runs.find((run) => run.id === input.runId)
      : flow.runs.at(-1);
    if (!record) throw new Error(input.runId ? `Run not found: ${input.runId}` : "No runs have been recorded yet.");
    const next = addEvent(session, {
      type: "inspection",
      title: `Inspected ${record.id}`,
      detail: record.ok ? "Run completed." : record.result?.error ?? "Run needs attention.",
    }, options);
    return { session: next, result: summarizeRun(record.result), pause: false };
  }

  if (tool.name === "compare_runs") {
    const flow = flowFor(session, options);
    const before = flow.runs.find((run) => run.id === input.beforeRunId);
    const after = flow.runs.find((run) => run.id === input.afterRunId);
    if (!before || !after) throw new Error("Both persisted run ids are required for comparison.");
    const next = addEvent(session, {
      type: "inspection",
      title: "Compared two runs",
      detail: `${before.id} → ${after.id}`,
    }, options);
    return { session: next, result: compareChannelRuns(before, after), pause: false };
  }

  if (tool.name === "request_founder_input") {
    const next = addEvent({
      ...session,
      status: "waiting_for_input",
      pendingQuestion: { question: input.question, reason: input.reason },
      error: null,
    }, {
      type: "founder_input_requested",
      title: "Founder judgment needed",
      detail: input.question,
      data: { reason: input.reason },
    }, options);
    return { session: next, result: { paused: true, question: input.question }, pause: true };
  }

  if (tool.name === "complete") {
    const next = addEvent({
      ...session,
      status: input.outcome === "blocked" ? "blocked" : "completed",
      summary: input.summary,
      completedAt: new Date().toISOString(),
      pendingQuestion: null,
      error: input.outcome === "blocked" ? input.summary : null,
    }, {
      type: "session_completed",
      title: input.outcome === "achieved" ? "Goal achieved" : input.outcome === "blocked" ? "Session blocked" : "Session completed",
      detail: input.summary,
      data: { outcome: input.outcome },
    }, options);
    return { session: next, result: { status: next.status, summary: input.summary }, pause: true };
  }

  throw new Error(`Unknown operator tool: ${tool.name}`);
}

export async function runOperatorSession(id, runtime = {}) {
  const options = runtime.options ?? {};
  let session = getOperatorSession(id, options);
  if (["waiting_for_gate", "waiting_for_input", "completed", "cancelled", "blocked"].includes(session.status)) {
    return session;
  }
  if (session.stepCount >= session.maxSteps) {
    return saveOperatorSession({
      ...session,
      status: "waiting_for_input",
      pendingQuestion: {
        question: "The operator reached its current iteration budget. Continue for another pass?",
        reason: "The session remains durable, but it needs permission to spend another model/tool cycle budget.",
      },
    }, options);
  }

  // Pick the runtime that will reason this session. GTM IDE keeps owning every
  // durable and safety decision below; the runtime only produces turns and asks
  // GTM IDE (via ctx callbacks) to execute the tool calls it proposes.
  const selection = selectRuntime({
    client: runtime.client,
    runtime: runtime.runtime,
    forced: runtime.forced || session.runtime,
  });
  if (!selection.adapter) {
    return addEvent({
      ...session,
      status: "failed",
      error: `No operator runtime is available. ${selection.reason} Sign in to Claude Code (the preferred local runtime) or set ANTHROPIC_API_KEY, then resume this durable session.`,
    }, {
      type: "session_failed",
      title: "No operator runtime connected",
      detail: selection.reason || "No operator runtime is available.",
    }, options);
  }
  const adapter = selection.adapter;
  const workspace = latestWorkspace(session, options);
  const authLabel = authModeLabel(selection.auth);

  session = addEvent({
    ...session,
    status: "running",
    runtime: adapter.id,
    startedAt: session.startedAt || new Date().toISOString(),
    error: null,
    pendingQuestion: null,
  }, {
    type: "operator_started",
    title: session.stepCount ? "Operator resumed" : "Operator started",
    detail: `Running ${session.model} via ${adapter.label}${authLabel ? ` on the ${authLabel}` : ""}.`,
  }, options);

  // The context handed to the runtime. Every callback persists through GTM IDE's
  // own stores, so the runtime never touches session state, the ledger, gates,
  // or cancellation directly — that boundary is what the provider-neutral split
  // is for.
  const ctx = {
    sessionId: id,
    goal: session.goal,
    model: session.model,
    system: systemPrompt(session, workspace),
    tools: TOOLS,
    client: selection.client ?? null,
    query: runtime.query ?? null,
    options,
    env: process.env,
    initialMessages: session.modelMessages?.length ? session.modelMessages : null,
    maxSteps: session.maxSteps,
    stepCount: session.stepCount,
    isCancelled: () => getOperatorSession(id, options).status === "cancelled",
    currentStatus: () => getOperatorSession(id, options).status,
    onTurn: () => {
      session = saveOperatorSession({ ...session, stepCount: session.stepCount + 1 }, options);
      return session.stepCount;
    },
    onText: (text) => {
      session = addEvent(session, { type: "operator_note", title: "Operator reasoning", detail: text }, options);
    },
    onToolStart: (name) => {
      session = addEvent(session, {
        type: "tool_started",
        title: `Using ${name.replaceAll("_", " ")}`,
        detail: null,
        data: { tool: name },
      }, options);
    },
    onToolError: (name, message) => {
      session = addEvent(session, {
        type: "tool_failed",
        title: `${name.replaceAll("_", " ")} failed`,
        detail: message,
        data: { tool: name },
      }, options);
    },
    runTool: async ({ id: toolId, name, input }) => {
      const execution = await executeTool(session, { id: toolId, name, input }, options);
      session = execution.session;
      return { result: execution.result, pause: execution.pause };
    },
    persistMessages: (messages) => {
      session = saveOperatorSession({ ...session, modelMessages: messages }, options);
    },
  };

  try {
    const outcome = await adapter.drive(ctx);
    if (outcome.kind === "cancelled") return getOperatorSession(id, options);
    if (outcome.kind === "completed") {
      return addEvent({
        ...getOperatorSession(id, options),
        status: "completed",
        summary: outcome.summary,
        completedAt: new Date().toISOString(),
      }, {
        type: "session_completed",
        title: "Operator finished",
        detail: outcome.summary || "No additional action was requested.",
      }, options);
    }
    if (outcome.kind === "budget") {
      return addEvent({
        ...getOperatorSession(id, options),
        status: "waiting_for_input",
        pendingQuestion: {
          question: "The operator reached its iteration budget. Continue working this goal?",
          reason: "The session is preserved and can resume with a fresh budget.",
        },
      }, {
        type: "founder_input_requested",
        title: "Iteration budget reached",
        detail: "The session is safely paused rather than guessing indefinitely.",
      }, options);
    }
    // "paused" — executeTool already set waiting_for_gate / waiting_for_input or
    // completed (via the complete tool) and persisted it. Return the truth on disk.
    return getOperatorSession(id, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return addEvent({
      ...getOperatorSession(id, options),
      status: "failed",
      error: message,
    }, {
      type: "session_failed",
      title: "Operator stopped",
      detail: message,
    }, options);
  }
}

export function launchOperatorSession(id, runtime = {}) {
  if (activeSessions.has(id)) return activeSessions.get(id);
  const work = runOperatorSession(id, runtime).finally(() => activeSessions.delete(id));
  activeSessions.set(id, work);
  return work;
}

export function resumeOperatorSession(id, input, runtime = {}) {
  const options = runtime.options ?? {};
  let session = getOperatorSession(id, options);
  if (session.status === "waiting_for_gate") {
    throw new Error("Resolve the founder gate before resuming the operator.");
  }
  if (["completed", "cancelled"].includes(session.status)) throw new Error(`Session is already ${session.status}.`);
  const text = String(input || "").trim();
  if (!text) throw new Error("A founder response is required.");
  session = addEvent({
    ...session,
    status: "ready",
    error: null,
    pendingQuestion: null,
    maxSteps: Math.min(60, Math.max(session.maxSteps, session.stepCount + 12)),
    modelMessages: [
      ...(session.modelMessages ?? []),
      { role: "user", content: `Founder response: ${text}` },
    ],
  }, {
    type: "founder_input_received",
    title: "Founder responded",
    detail: text,
  }, options);
  launchOperatorSession(session.id, runtime);
  return session;
}

export async function resolveOperatorGate(id, payload = {}, runtime = {}) {
  const options = runtime.options ?? {};
  let session = getOperatorSession(id, options);
  if (session.status !== "waiting_for_gate" || !session.pendingGate?.runResult) {
    throw new Error("This operator session is not waiting at a founder gate.");
  }
  const flow = flowFor(session, options);
  const result = await runGraph(flow.graph, {
    approvals: payload.approvals && typeof payload.approvals === "object" ? payload.approvals : {},
    decisions: payload.decisions && typeof payload.decisions === "object" ? payload.decisions : {},
    memory: memoryFor(flow.runs),
    resumeResult: session.pendingGate.runResult,
    stepRuntime: liveStepRuntime({ cwd: options.cwd }),
  });
  recordFlowRun(flow.graph, result, options);
  session = addEvent({
    ...session,
    lastRunId: result.runId,
    pendingGate: result.pendingGates.length
      ? { runId: result.runId, nodeIds: result.pendingGates, runResult: result }
      : null,
    status: result.pendingGates.length ? "waiting_for_gate" : "ready",
    modelMessages: result.pendingGates.length ? session.modelMessages : [
      ...(session.modelMessages ?? []),
      {
        role: "user",
        content: `Founder gate resolved. Continued run ${result.runId}. Result: ${JSON.stringify(summarizeRun(result))}`,
      },
    ],
  }, {
    type: "gate_resolved",
    title: result.pendingGates.length ? "Gate still needs review" : "Founder gate resolved",
    detail: result.pendingGates.length
      ? `${result.pendingGates.length} gate${result.pendingGates.length === 1 ? "" : "s"} still contain undecided items.`
      : "The exact reviewed artifacts continued downstream without rerunning upstream work.",
    data: { runId: result.runId, pendingGates: result.pendingGates },
  }, options);
  if (!result.pendingGates.length) launchOperatorSession(id, runtime);
  return session;
}

export function cancelOperatorSession(id, options = {}) {
  const session = getOperatorSession(id, options);
  return addEvent({
    ...session,
    status: "cancelled",
    completedAt: new Date().toISOString(),
    pendingQuestion: null,
    pendingGate: null,
  }, {
    type: "session_cancelled",
    title: "Operator session cancelled",
    detail: "The durable history remains available.",
  }, options);
}

// Exposed for the Claude Code operator MCP bridge (./operator-mcp.mjs), which
// runs as a subprocess and routes the same typed tools through executeTool
// against the durable session store.
export { TOOLS as operatorTools, executeTool as executeOperatorTool };
