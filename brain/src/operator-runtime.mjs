import { getEngineState } from "./engine.mjs";
import { liveStepRuntime } from "./agent-bridge.mjs";
import { createClaudeIdeator } from "./ideation.mjs";
import { createClaudeComposer } from "./composition.mjs";
import { createClaudeEvaluator } from "./eval.mjs";
import { createClaudeProductModeler } from "./product-model-generator.mjs";
import { loadFlow, recordFlowRun, saveFlow } from "./flow-store.mjs";
import { loadFeedbackLedger, recordFeedbackSignalsFromRun } from "./feedback-ledger.mjs";
import { applyGraphOperations, validateGraph } from "./graph-operations.mjs";
import { listConnectors, runGraph } from "./graph.mjs";
import { appendDomainEvent, listDomainEvents } from "./domain-events.mjs";
import { executeDomainCommand } from "./domain-commands.mjs";
import { loadCapabilityFoundry } from "./capability-foundry.mjs";
import { listAgentCreationPolicies } from "./agent-policy-store.mjs";
import { listOutcomePrograms, syncProgramStoreFromEvents } from "./program-store.mjs";
import { runProgram } from "./program-runtime.mjs";
import { buildDraftMemory, extractDecisions } from "./memory.mjs";
import { mergeSharedDecisions } from "./shared-judgments.mjs";
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
  setActiveWorkflow,
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

const GRAPH_OPERATIONS_INPUT_SCHEMA = {
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
};

const TOOLS = [
  {
    name: "inspect_projects",
    description: "List product projects and identify the currently active repository scope.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "inspect_portfolio",
    description: "Inspect all outcome-program workflows, their objectives, status, run history, and the shared product-intelligence version.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "inspect_shared_context",
    description: "Inspect the shared repository evidence, product, positioning, ICP, founder taste, contacts, outcomes, experiments, artifacts, and product feedback used by every workflow.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "update_shared_context",
    description: "Update shared GTM intelligence across every workflow. Preserve evidence status and do not present inferred positioning or ICP as proven.",
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
    name: "switch_workflow",
    description: "Switch the durable operator to another outcome-program workflow before inspecting, editing, or running it.",
    input_schema: {
      type: "object",
      properties: { workflowId: { type: "string" } },
      required: ["workflowId"],
    },
  },
  {
    name: "switch_channel",
    description: "Compatibility alias for switch_workflow.",
    input_schema: {
      type: "object",
      properties: { channelId: { type: "string" } },
      required: ["channelId"],
    },
  },
  {
    name: "create_workflow",
    description: "Create a blank outcome-program workflow, make it active, then shape its graph with founder-reviewed typed graph operations.",
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
    name: "create_channel",
    description: "Compatibility alias for create_workflow.",
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
    name: "duplicate_workflow",
    description: "Duplicate an existing outcome-program workflow and its current graph as a new independently editable workflow.",
    input_schema: {
      type: "object",
      properties: {
        workflowId: { type: "string" },
        name: { type: "string" },
        objective: { type: "string" },
      },
      required: ["workflowId", "name"],
    },
  },
  {
    name: "duplicate_channel",
    description: "Compatibility alias for duplicate_workflow.",
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
    name: "update_workflow",
    description: "Rename, clarify, classify, enable, or archive an outcome-program workflow without changing its graph nodes.",
    input_schema: {
      type: "object",
      properties: {
        workflowId: { type: "string" },
        name: { type: "string" },
        objective: { type: "string" },
        kind: { type: "string" },
        enabled: { type: "boolean" },
      },
      required: ["workflowId"],
    },
  },
  {
    name: "update_channel",
    description: "Compatibility alias for update_workflow.",
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
    name: "derive_product_model",
    description: "Generate a first-draft Living Product Picture for the active project: the founder-editable interpretation of the product (core objects, relationships, user goals, key states) derived from the scanned grounding. Interpretation, not cited truth. Produces a draft only; never sends or publishes.",
    input_schema: {
      type: "object",
      properties: {
        grounding: { type: "object", description: "Optional grounding snapshot. Defaults to the project scan." },
        market: { type: "object", description: "Optional buyer/market context." },
      },
      required: [],
    },
  },
  {
    name: "revise_product_model",
    description: "Apply a founder edit to the Living Product Picture's things, relationships, user goals, or states. Each revision bumps the version on the same lineage so edits accumulate. Signals are not edited here; use record_product_signal.",
    input_schema: {
      type: "object",
      properties: {
        modelId: { type: "string", description: "Optional. Defaults to the project's current model." },
        things: { type: "array", items: { type: "object" } },
        relationships: { type: "array", items: { type: "object" } },
        userGoals: { type: "array", items: { type: "object" } },
        states: { type: "array", items: { type: "object" } },
        generatedBy: { type: "string" },
      },
      required: [],
    },
  },
  {
    name: "record_product_signal",
    description: "Pin a real-world feedback signal onto a specific element of the Living Product Picture (thing, relationship, goal, state, or the whole model) so the interpretation stays current. The signal body stays in the feedback ledger; only the pin is recorded here.",
    input_schema: {
      type: "object",
      properties: {
        modelId: { type: "string", description: "Optional. Defaults to the project's current model." },
        signalId: { type: "string", description: "The FeedbackSignal id to pin." },
        target: { type: "object", description: "{ kind: 'thing'|'relationship'|'goal'|'state'|'model', id }." },
        type: { type: "string" },
        summary: { type: "string" },
      },
      required: [],
    },
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
    name: "inspect_program",
    description: "Inspect an outcome program, its domain events, policies, agent instances, evaluations, and feedback signals.",
    input_schema: {
      type: "object",
      properties: { programId: { type: "string" } },
      required: [],
    },
  },
  {
    name: "create_program",
    description: "Create an outcome program from a founder-stated outcome. This emits OutcomeProgramCreated.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        objective: { type: "string" },
        desiredOutcome: { type: "object" },
        measurementPlan: { type: "object" },
      },
      required: ["name"],
    },
  },
  {
    name: "derive_agent_needs",
    description: "Record the agent needs implied by a program before creating personalized agents. The program defaults to the session's current program.",
    input_schema: {
      type: "object",
      properties: {
        programId: { type: "string", description: "Optional. Defaults to the session's current program." },
        needs: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              objective: { type: "string", description: "What this agent must accomplish." },
            },
          },
        },
      },
      required: ["needs"],
    },
  },
  {
    name: "create_personalized_agents",
    description: "Create policy-backed personalized agent instances for an outcome program. The program defaults to the one this session is working on; pass programId only to target a different one.",
    input_schema: {
      type: "object",
      properties: {
        programId: { type: "string", description: "Optional. Defaults to the session's current program." },
        agents: {
          type: "array",
          description: "The agents to create. Each needs at minimum a purpose and a ref.",
          items: {
            type: "object",
            properties: {
              ref: { type: "string", description: "Short kebab-case handle, e.g. founder-outreach-drafter." },
              purpose: { type: "string", description: "The agent's specific job — what it does and why. Required." },
              objective: { type: "string", description: "Optional restatement of the job; purpose is used if omitted." },
              negativeRules: { type: "array", items: { type: "string" }, description: "Things the agent must not do." },
              evidenceRequirements: { type: "array", items: { type: "string" } },
              requiredInputs: { type: "array", items: { type: "string" } },
              requiredOutputs: { type: "array", items: { type: "string" } },
            },
            required: ["ref", "purpose"],
          },
        },
      },
      required: ["agents"],
    },
  },
  {
    name: "compose_program_workflow",
    description: "Attach a composed graph to an outcome program and mark the program ready.",
    input_schema: {
      type: "object",
      properties: {
        programId: { type: "string", description: "Optional. Defaults to the session's current program." },
        graphId: { type: "string" },
        channelId: { type: "string" },
      },
      required: ["graphId"],
    },
  },
  {
    name: "run_program",
    description: "Run an outcome program through workflow, founder gate, feedback, evaluation, and next agent version creation. The program defaults to the session's current program.",
    input_schema: {
      type: "object",
      properties: {
        programId: { type: "string", description: "Optional. Defaults to the session's current program." },
        targetNodeId: { type: "string" },
        resumeRunId: { type: "string" },
        approvals: { type: "object" },
        decisions: { type: "object" },
      },
      required: [],
    },
  },
  {
    name: "inspect_program_feedback",
    description: "Inspect feedback signals, agent evaluations, and policy revisions for a program. Defaults to the session's current program.",
    input_schema: {
      type: "object",
      properties: { programId: { type: "string", description: "Optional. Defaults to the session's current program." } },
      required: [],
    },
  },
  {
    name: "revise_program_from_feedback",
    description: "Revise program agent policies from explicit feedback signals without mutating old runs.",
    input_schema: {
      type: "object",
      properties: {
        programId: { type: "string" },
        signals: { type: "array", items: { type: "object" } },
      },
      required: ["programId", "signals"],
    },
  },
  {
    name: "create_next_agent_version",
    description: "Create the next personalized agent version from a revised policy.",
    input_schema: {
      type: "object",
      properties: {
        programId: { type: "string" },
        previousInstance: { type: "object" },
        policy: { type: "object" },
      },
      required: ["programId", "previousInstance", "policy"],
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
    name: "propose_graph_changes",
    description: "Stage validated, reversible typed graph operations for founder review on the canvas instead of applying them directly. The founder sees the preview and accepts or discards it; the session pauses until that decision.",
    input_schema: GRAPH_OPERATIONS_INPUT_SCHEMA,
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

function memoryFor(runs, options) {
  // Merge this project's gate decisions with the shared taste ledger (the global rig + other
  // projects), so the operator's draft voice compounds across both rigs (HARNESS.md invariant 4).
  return buildDraftMemory(mergeSharedDecisions(extractDecisions(runs), options));
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

function summarizeProgramRun(run) {
  return {
    programId: run.programId,
    graphId: run.graphId,
    programStatus: run.programStatus,
    storedRunCount: run.storedRunCount,
    feedbackSignals: run.feedback.signals.length,
    evaluations: run.evaluations.length,
    nextVersions: run.nextVersions.map((item) => ({
      policyId: item.policy.id,
      agentInstanceId: item.instance.id,
      previousInstanceId: item.instance.previousInstanceId,
      version: item.instance.version,
    })),
    result: summarizeRun(run.result),
  };
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function slugifyRef(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

// Resolve which program a tool call targets, deterministically — code's job, not the model's. The
// model may pass an exact id, a name, or nothing; in every case we bind to the session's program
// first (set when the founder opened it, e.g. the "Build the first agent" button), then the
// session graph's program, then the newest. This removes the "guess the slugified id" seam.
function resolveProgram(session, input = {}, programs = []) {
  const ref = input.programId || input.programName;
  if (ref) {
    const match = programs.find((program) => program.id === ref || program.name === ref);
    if (match) return match;
  }
  if (session?.programId) {
    const bound = programs.find((program) => program.id === session.programId);
    if (bound) return bound;
  }
  if (session?.graphId) {
    const byGraph = programs.find((program) => program.graphId === session.graphId);
    if (byGraph) return byGraph;
  }
  return programs.at(-1) ?? null;
}

function systemPrompt(session, workspace) {
  const grounding = workspace
    ? `The active repository is ${workspace.repo}. The defined win event is "${workspace.outcome}".`
    : "No repository workspace is currently active. State that limitation before making product claims.";
  return `You are the resident GTM operator inside GTM IDE.

Your job is to advance an outcome program through the product's executable domain loop: founder outcome → agent needs → personalized agents → composed workflow → run → founder gate → feedback → evaluation → next agent version. Graph tools are lower-level repair tools, not the first vocabulary.

Founder goal:
${session.goal}

Grounding:
${grounding}

Operating rules:
- Begin by inspecting product truth, programs, and current problems unless a resumed session already contains that evidence.
- For a new product or portfolio goal, inspect projects and generate reviewable opportunities before creating a blank workflow.
- For portfolio goals, inspect all outcome-program workflows and shared context before choosing where to work.
- Do not invent a fixed channel catalog. Keep code-derived and speculative opportunities separate, and do not compose either until the founder has accepted it.
- Prefer inspect_program, create_program, derive_agent_needs, create_personalized_agents, compose_program_workflow, and run_program when the work is an outcome loop.
- Use create_workflow only for an explicitly requested blank motion. Prefer review_opportunity plus compose_opportunity_channel for product-derived systems, then run_program once a program exists.
- Keep product, positioning, ICP, founder taste, contacts, and outcomes in shared context rather than duplicating them into graphs.
- Use propose_graph_changes for graph edits. Never invent a replacement graph or claim a change that the founder has not accepted.
- Prefer running and observing over theorizing. Repair actual failures and rerun affected work.
- Product claims must come from repository evidence or be labeled inferred or blind.
- Never approve a gate. Never send, publish, deploy, charge, or alter an external system.
- When run_program reaches a gate, the runtime pauses automatically for the founder.
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
    memory: memoryFor(flow.runs, options),
    stepRuntime: liveStepRuntime({ cwd: options.cwd }),
  });
  const stored = recordFlowRun(flow.graph, result, options);
  recordFeedbackSignalsFromRun({ projectId: session.projectId || "default", graph: flow.graph, result }, options);
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
      detail: `${project.channels.length} outcome-program workflow${project.channels.length === 1 ? "" : "s"} · shared context v${project.sharedContext.version}`,
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

  if (tool.name === "switch_workflow" || tool.name === "switch_channel") {
    const project = loadProject(options);
    const workflowId = input.workflowId ?? input.channelId;
    const channel = getChannel(project, workflowId);
    setActiveWorkflow(channel.id, options);
    const next = addEvent({
      ...session,
      graphId: channel.graphId,
      graphRevision: loadFlow(channel.graphId, null, options).graph?.revision ?? 0,
    }, {
      type: "workflow_switched",
      title: `Switched to ${channel.name}`,
      detail: channel.objective,
      data: { workflowId: channel.id, channelId: channel.id, graphId: channel.graphId },
    }, options);
    return { session: next, result: { workflow: channel, channel, graphId: channel.graphId }, pause: false };
  }

  if (tool.name === "create_workflow" || tool.name === "create_channel") {
    const project = loadProject(options);
    const created = await executeDomainCommand("CreateProgramWorkflow", {
      ...input,
      projectId: project.id,
    }, { ...options, projectId: project.id });
    setActiveWorkflow(created.channel.id, options);
    const next = addEvent({
      ...session,
      graphId: created.channel.graphId,
      graphRevision: 0,
    }, {
      type: "workflow_created",
      title: `Created ${created.channel.name}`,
      detail: created.channel.objective || "Blank workflow ready to shape.",
      data: { workflowId: created.channel.id, channelId: created.channel.id, graphId: created.channel.graphId },
    }, options);
    return { session: next, result: { ...created.channel, workflowId: created.channel.id }, pause: false };
  }

  if (tool.name === "duplicate_workflow" || tool.name === "duplicate_channel") {
    const workflowId = input.workflowId ?? input.channelId;
    const created = duplicateChannel(workflowId, input, options);
    setActiveWorkflow(created.channel.id, options);
    const revision = loadFlow(created.channel.graphId, null, options).graph?.revision ?? 0;
    const next = addEvent({
      ...session,
      graphId: created.channel.graphId,
      graphRevision: revision,
    }, {
      type: "workflow_duplicated",
      title: `Duplicated as ${created.channel.name}`,
      detail: created.channel.objective || null,
      data: { workflowId: created.channel.id, channelId: created.channel.id, graphId: created.channel.graphId },
    }, options);
    return { session: next, result: { ...created.channel, workflowId: created.channel.id }, pause: false };
  }

  if (tool.name === "update_workflow" || tool.name === "update_channel") {
    const { workflowId: workflowIdInput, channelId: channelIdInput, ...patch } = input;
    const workflowId = workflowIdInput ?? channelIdInput;
    const project = loadProject(options);
    const current = getChannel(project, workflowId, options);
    const program = current.outcomeProgramId
      ? await executeDomainCommand("UpdateProgramWorkflowMetadata", {
          ...patch,
          projectId: project.id,
          programId: current.outcomeProgramId,
          channelId: current.id,
        }, { ...options, projectId: project.id })
      : null;
    const updated = program ? { channel: getChannel(loadProject(options), current.id, options) } : updateChannel(workflowId, patch, options);
    const next = addEvent(session, {
      type: "workflow_updated",
      title: `Updated ${updated.channel.name}`,
      detail: updated.channel.objective || null,
      data: { workflowId: updated.channel.id, channelId: updated.channel.id, enabled: updated.channel.enabled },
    }, options);
    return { session: next, result: { ...updated.channel, workflowId: updated.channel.id }, pause: false };
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

  // Living Product Picture — three in-process commands through executeDomainCommand (the same
  // chokepoint Door 1 uses). derive injects the live generator; revise/signal are pure host state
  // moves. The verbs (Derive/Revise/Record) carry no forbidden outbound meaning — the picture stays
  // inside the founder-gate wall.
  if (tool.name === "derive_product_model") {
    const project = loadProject(options);
    const repo = options.cwd || project.sharedContext?.repository?.repo || process.cwd();
    const productModel = await executeDomainCommand("DeriveProductModel", {
      ...input,
      projectId: project.id,
    }, { ...options, projectId: project.id, generate: options.generate || createClaudeProductModeler({ cwd: repo }) });
    const next = addEvent(session, {
      type: "product_model_derived",
      title: "Derived the product picture",
      detail: `${productModel?.things?.length ?? 0} things · ${productModel?.relationships?.length ?? 0} relationships · ${productModel?.userGoals?.length ?? 0} goals · ${productModel?.states?.length ?? 0} states`,
      data: { modelId: productModel?.id ?? null },
    }, options);
    return { session: next, result: productModel, pause: false };
  }

  if (tool.name === "revise_product_model") {
    const project = loadProject(options);
    const productModel = await executeDomainCommand("ReviseProductModel", {
      ...input,
      projectId: project.id,
    }, { ...options, projectId: project.id });
    const next = addEvent(session, {
      type: "product_model_revised",
      title: "Revised the product picture",
      detail: `Now version ${productModel?.version ?? "?"}.`,
      data: { modelId: productModel?.id ?? null, version: productModel?.version ?? null },
    }, options);
    return { session: next, result: productModel, pause: false };
  }

  if (tool.name === "record_product_signal") {
    const project = loadProject(options);
    const productModel = await executeDomainCommand("RecordProductSignal", {
      ...input,
      projectId: project.id,
    }, { ...options, projectId: project.id });
    const next = addEvent(session, {
      type: "product_signal_recorded",
      title: "Pinned a real-world signal onto the product picture",
      detail: `${productModel?.pinnedSignals?.length ?? 0} signals pinned.`,
      data: { modelId: productModel?.id ?? null },
    }, options);
    return { session: next, result: productModel, pause: false };
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
      evaluate: options.evaluate || createClaudeEvaluator({ cwd: composeRepo }),
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

  if (tool.name === "inspect_program") {
    const project = loadProject(options);
    const programs = listOutcomePrograms(project.id, { ...options, projectId: project.id });
    const selected = resolveProgram(session, input, programs);
    const foundry = loadCapabilityFoundry(project.id, { ...options, projectId: project.id });
    const policies = listAgentCreationPolicies(project.id, { ...options, projectId: project.id });
    const events = listDomainEvents(project.id, selected ? { ...options, aggregateId: selected.id } : options);
    const feedback = loadFeedbackLedger(project.id, { ...options, projectId: project.id });
    const next = addEvent(session, {
      type: "inspection",
      title: selected ? `Inspected ${selected.name}` : "Inspected programs",
      detail: selected ? `${selected.lastRunStatus ?? selected.lifecycle} · ${selected.graphId ? "workflow composed" : "no workflow yet"}` : `${programs.length} programs found`,
    }, options);
    return {
      session: next,
      result: {
        program: selected ?? null,
        programs,
        policies: selected ? policies.filter((policy) => policy.programId === selected.id) : policies,
        instances: selected ? foundry.instances.filter((item) => item.programId === selected.id) : foundry.instances,
        evaluations: selected ? foundry.evaluations.filter((item) => item.programId === selected.id) : foundry.evaluations,
        feedbackSignals: selected
          ? feedback.signals.filter((signal) => signal.graphId === selected.graphId)
          : feedback.signals.slice(-20),
        events,
      },
      pause: false,
    };
  }

  if (tool.name === "create_program") {
    const project = loadProject(options);
    const program = await executeDomainCommand("CreateOutcomeProgram", {
      ...input,
      projectId: project.id,
    }, { ...options, projectId: project.id });
    // Bind the session to the program it just created, so derive_agent_needs / create_personalized
    // _agents / compose / run all target it without the model having to echo the slugified id back.
    const next = addEvent({ ...session, programId: program.id }, {
      type: "program_created",
      title: `Created ${program.name}`,
      detail: program.desiredOutcome?.description || input.objective || "Outcome program created.",
      data: { programId: program.id },
    }, options);
    return { session: next, result: program, pause: false };
  }

  if (tool.name === "derive_agent_needs") {
    const project = loadProject(options);
    const programs = listOutcomePrograms(project.id, { ...options, projectId: project.id });
    const program = resolveProgram(session, input, programs);
    if (!program) throw new Error("No outcome program to derive agent needs for. Create one first.");
    const needs = [];
    for (const need of input.needs ?? []) {
      needs.push(await executeDomainCommand("DeriveAgentNeed", {
        ...need,
        programId: program.id,
        projectId: project.id,
      }, { ...options, projectId: project.id }));
    }
    const next = addEvent(session, {
      type: "agent_needs_derived",
      title: "Derived program agent needs",
      detail: `${needs.length} need${needs.length === 1 ? "" : "s"} recorded.`,
      data: { programId: program.id },
    }, options);
    return { session: next, result: needs, pause: false };
  }

  if (tool.name === "create_personalized_agents") {
    const project = loadProject(options);
    const programs = listOutcomePrograms(project.id, { ...options, projectId: project.id });
    const program = resolveProgram(session, input, programs);
    if (!program) throw new Error("No outcome program to create agents for. Create one first.");
    const created = [];
    for (const agent of input.agents ?? []) {
      // Tolerate the field names a model naturally reaches for. The policy purpose and the agent's
      // job/ref are required downstream, so derive them from any reasonable synonym and only fail if
      // the agent is genuinely unnamed — code's job to absorb input-shape variance, not to crash.
      const purpose = firstNonEmpty(agent.purpose, agent.objective, agent.job, agent.role, agent.description, agent.title, agent.name);
      const job = firstNonEmpty(agent.objective, agent.job, agent.purpose, agent.title, agent.name) || purpose;
      const title = firstNonEmpty(agent.title, agent.name, agent.role, purpose);
      const ref = firstNonEmpty(agent.ref, agent.id, slugifyRef(title));
      if (!purpose || !ref) {
        throw new Error(`Each agent needs a purpose/objective and a name. Got: ${JSON.stringify(agent).slice(0, 160)}`);
      }
      const policy = await executeDomainCommand("CreateAgentCreationPolicy", {
        projectId: project.id,
        programId: program.id,
        sourceOpportunityId: agent.id ?? null,
        purpose,
        positiveRules: agent.positiveRules ?? [],
        negativeRules: agent.negativeRules ?? ["Do not make unsupported outcome claims."],
        evidenceRequirements: agent.evidenceRequirements ?? ["Separate product facts from hypotheses."],
        safetyRules: agent.safetyRules ?? ["External effects must pass through a founder gate."],
        requiredInputs: agent.requiredInputs ?? ["programContext", "productTruth", "upstreamItems"],
        requiredOutputs: agent.requiredOutputs ?? ["structuredResults", "evidence", "uncertainty"],
        evaluationSignals: agent.evaluationSignals ?? ["founderDecision", "founderEdit", "runFailure", "observedOutcome"],
      }, { ...options, projectId: project.id });
      created.push(await executeDomainCommand("CreatePersonalizedAgent", {
        project,
        program,
        policy,
        agentOpportunity: { ...agent, ref, title, objective: job },
      }, { ...options, projectId: project.id }));
    }
    const next = addEvent(session, {
      type: "personalized_agents_created",
      title: "Created personalized agents",
      detail: `${created.length} agent${created.length === 1 ? "" : "s"} created for the program.`,
      data: { programId: program.id },
    }, options);
    return { session: next, result: created, pause: false };
  }

  if (tool.name === "compose_program_workflow") {
    const project = loadProject(options);
    const programs = listOutcomePrograms(project.id, { ...options, projectId: project.id });
    const target = resolveProgram(session, input, programs);
    if (!target) throw new Error("No outcome program to compose a workflow for.");
    const program = await executeDomainCommand("ComposeProgramWorkflow", {
      ...input,
      programId: target.id,
      projectId: project.id,
    }, { ...options, projectId: project.id });
    const next = addEvent({
      ...session,
      graphId: program.graphId || session.graphId,
    }, {
      type: "program_workflow_composed",
      title: `Program workflow ready: ${program.name}`,
      detail: program.graphId,
      data: { programId: program.id, graphId: program.graphId },
    }, options);
    return { session: next, result: program, pause: false };
  }

  if (tool.name === "run_program") {
    const project = loadProject(options);
    const programs = listOutcomePrograms(project.id, { ...options, projectId: project.id });
    const target = resolveProgram(session, input, programs);
    if (!target) throw new Error("No outcome program to run.");
    const run = await runProgram(target.id, {
      ...input,
      projectId: project.id,
      stepRuntime: liveStepRuntime({ cwd: options.cwd }),
    }, { ...options, projectId: project.id });
    const next = addEvent({
      ...session,
      graphId: run.graphId,
      lastRunId: run.result.runId,
      status: run.result.pendingGates.length ? "waiting_for_gate" : session.status,
      pendingGate: run.result.pendingGates.length
        ? { programId: target.id, runId: run.result.runId, nodeIds: run.result.pendingGates, runResult: run.result }
        : null,
    }, {
      type: "program_run_completed",
      title: "Ran the outcome program",
      detail: run.result.pendingGates.length
        ? `Paused at ${run.result.pendingGates.length} founder gate${run.result.pendingGates.length === 1 ? "" : "s"}.`
        : `Program is ${run.programStatus}.`,
      data: {
        programId: target.id,
        runId: run.result.runId,
        programStatus: run.programStatus,
        feedbackSignals: run.feedback.signals.length,
        nextVersions: run.nextVersions.length,
      },
    }, options);
    return { session: next, result: summarizeProgramRun(run), pause: next.status === "waiting_for_gate" };
  }

  if (tool.name === "inspect_program_feedback") {
    const project = loadProject(options);
    const program = resolveProgram(session, input, listOutcomePrograms(project.id, { ...options, projectId: project.id }));
    if (!program) throw new Error("No outcome program to inspect feedback for.");
    const foundry = loadCapabilityFoundry(project.id, { ...options, projectId: project.id });
    const policies = listAgentCreationPolicies(project.id, { ...options, projectId: project.id }).filter((policy) => policy.programId === program.id);
    const policyIds = new Set(policies.map((policy) => policy.id));
    const feedback = loadFeedbackLedger(project.id, { ...options, projectId: project.id }).signals.filter((signal) =>
      signal.graphId === program.graphId || (signal.policyIds ?? []).some((policyId) => policyIds.has(policyId))
    );
    const next = addEvent(session, {
      type: "inspection",
      title: "Inspected program feedback",
      detail: `${feedback.length} signal${feedback.length === 1 ? "" : "s"} · ${policies.length} polic${policies.length === 1 ? "y" : "ies"}`,
    }, options);
    return {
      session: next,
      result: {
        program,
        feedback,
        policies,
        evaluations: foundry.evaluations.filter((item) => item.programId === program.id),
        instances: foundry.instances.filter((item) => item.programId === program.id),
      },
      pause: false,
    };
  }

  if (tool.name === "revise_program_from_feedback") {
    const project = loadProject(options);
    const revisions = await executeDomainCommand("ReviseAgentPolicyFromFeedback", {
      ...input,
      projectId: project.id,
    }, { ...options, projectId: project.id });
    const next = addEvent(session, {
      type: "program_revised",
      title: "Revised program policies",
      detail: `${revisions.length} polic${revisions.length === 1 ? "y" : "ies"} created.`,
      data: { programId: input.programId, policyIds: revisions.map((policy) => policy.id) },
    }, options);
    return { session: next, result: revisions, pause: false };
  }

  if (tool.name === "create_next_agent_version") {
    const project = loadProject(options);
    const program = listOutcomePrograms(project.id, { ...options, projectId: project.id }).find((item) => item.id === input.programId);
    if (!program) throw new Error(`Outcome program not found: ${input.programId}`);
    const created = await executeDomainCommand("CreateNextAgentVersion", {
      ...input,
      project,
      program,
    }, { ...options, projectId: project.id });
    const next = addEvent(session, {
      type: "next_agent_version_created",
      title: `Created ${created.instance.ref} v${created.instance.version}`,
      detail: created.instance.job,
      data: { programId: program.id, agentInstanceId: created.instance.id },
    }, options);
    return { session: next, result: created, pause: false };
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
    const next = addEvent(session, {
      type: "graph_patch_rejected",
      title: "Direct graph patch rejected",
      detail: "Agent graph edits must be staged with propose_graph_changes for founder review.",
      data: { tool: "patch_graph" },
    }, options);
    return {
      session: next,
      result: { ok: false, error: "Use propose_graph_changes; direct agent graph patches are not allowed." },
      pause: false,
    };
  }

  if (tool.name === "propose_graph_changes") {
    const flow = flowFor(session, options);
    // Validate by applying to a clone — this throws on any invalid op and yields the preview the
    // founder will review. The real graph is NOT touched; nothing is saved until they accept.
    const preview = applyGraphOperations(flow.graph, input.operations);
    const proposalId = `proposal-${Date.now()}`;
    const next = addEvent({
      ...session,
      status: "waiting_for_proposal",
      pendingProposal: {
        id: proposalId,
        graphId: flow.graph.id,
        baseRevision: flow.graph.revision ?? 0,
        rationale: input.rationale,
        operations: input.operations,
        changes: preview.changes,
        preview: preview.graph,
      },
      error: null,
    }, {
      type: "graph_proposed",
      title: "Proposed graph changes for review",
      detail: input.rationale,
      data: { proposalId, changes: preview.changes },
    }, options);
    return {
      session: next,
      result: { paused: true, proposalId, changes: preview.changes },
      pause: true,
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
  if (["waiting_for_gate", "waiting_for_proposal", "waiting_for_input", "completed", "cancelled", "blocked"].includes(session.status)) {
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
  if (session.status === "waiting_for_proposal") {
    throw new Error("Accept or discard the proposed graph changes before resuming the operator.");
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
  if (session.pendingGate.programId) {
    const project = loadProject(options);
    const run = await runProgram(session.pendingGate.programId, {
      projectId: project.id,
      resumeRunId: session.pendingGate.runId,
      approvals: payload.approvals && typeof payload.approvals === "object" ? payload.approvals : {},
      decisions: payload.decisions && typeof payload.decisions === "object" ? payload.decisions : {},
      stepRuntime: liveStepRuntime({ cwd: options.cwd }),
    }, { ...options, projectId: project.id });
    session = addEvent({
      ...session,
      graphId: run.graphId,
      lastRunId: run.result.runId,
      pendingGate: run.result.pendingGates.length
        ? { programId: session.pendingGate.programId, runId: run.result.runId, nodeIds: run.result.pendingGates, runResult: run.result }
        : null,
      status: run.result.pendingGates.length ? "waiting_for_gate" : "ready",
      modelMessages: run.result.pendingGates.length ? session.modelMessages : [
        ...(session.modelMessages ?? []),
        {
          role: "user",
          content: `Founder gate resolved. Continued program run ${run.result.runId}. Result: ${JSON.stringify(summarizeProgramRun(run))}`,
        },
      ],
    }, {
      type: "gate_resolved",
      title: "Founder gate resolved",
      detail: run.result.pendingGates.length
        ? "Another founder gate is waiting."
        : `${run.feedback.signals.length} feedback signal${run.feedback.signals.length === 1 ? "" : "s"} recorded.`,
      data: {
        runId: run.result.runId,
        programId: session.pendingGate.programId,
        programStatus: run.programStatus,
        feedbackSignals: run.feedback.signals.length,
        nextVersions: run.nextVersions.length,
      },
    }, options);
    if (session.status === "ready") launchOperatorSession(session.id, runtime);
    return session;
  }
  const flow = flowFor(session, options);
  const result = await runGraph(flow.graph, {
    approvals: payload.approvals && typeof payload.approvals === "object" ? payload.approvals : {},
    decisions: payload.decisions && typeof payload.decisions === "object" ? payload.decisions : {},
    memory: memoryFor(flow.runs, options),
    resumeResult: session.pendingGate.runResult,
    stepRuntime: liveStepRuntime({ cwd: options.cwd }),
  });
  recordFlowRun(flow.graph, result, options);
  recordFeedbackSignalsFromRun({ projectId: session.projectId || "default", graph: flow.graph, result }, options);
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

function persistProgramWorkflowGraph(graph, options = {}) {
  if (!graph?.outcomeProgramId) return;
  const projectId = options.projectId || "default";
  appendDomainEvent(projectId, {
    type: "WorkflowGraphUpdated",
    aggregateType: "OutcomeProgram",
    aggregateId: graph.outcomeProgramId,
    data: { graphId: graph.id, workflowGraph: graph },
  }, options);
  syncProgramStoreFromEvents(projectId, options);
}

// The founder accepts or discards a staged graph proposal. Accept applies the exact reviewed
// operations to the current graph and resumes the operator; discard drops them and resumes the
// operator told not to reapply. Mirrors resolveOperatorGate: founder-only, never an agent tool.
export function resolveOperatorProposal(id, payload = {}, runtime = {}) {
  const options = runtime.options ?? {};
  const session = getOperatorSession(id, options);
  if (session.status !== "waiting_for_proposal" || !session.pendingProposal) {
    throw new Error("This session has no graph proposal waiting for review.");
  }
  const proposal = session.pendingProposal;
  const accept = payload.accept === true || payload.decision === "accept";

  if (accept) {
    const flow = flowFor(session, options);
    // Re-apply against the live graph (not the cached preview) so the commit is valid even if the
    // graph moved since the proposal was staged; applyGraphOperations re-validates and throws if not.
    const patched = applyGraphOperations(flow.graph, proposal.operations);
    const saved = saveFlow(patched.graph, options);
    persistProgramWorkflowGraph(saved.graph, options);
    const next = addEvent({
      ...session,
      status: "ready",
      pendingProposal: null,
      error: null,
      graphRevision: saved.graph.revision ?? 0,
      modelMessages: [
        ...(session.modelMessages ?? []),
        { role: "user", content: `Founder accepted the proposed graph changes (${proposal.changes.length} operation${proposal.changes.length === 1 ? "" : "s"}). They are now applied. Continue.` },
      ],
    }, {
      type: "graph_patched",
      title: "Founder accepted proposed changes",
      detail: proposal.rationale,
      data: { revision: saved.graph.revision, changes: patched.changes, proposalId: proposal.id },
    }, options);
    launchOperatorSession(id, runtime);
    return next;
  }

  const next = addEvent({
    ...session,
    status: "ready",
    pendingProposal: null,
    error: null,
    modelMessages: [
      ...(session.modelMessages ?? []),
      { role: "user", content: "Founder discarded the proposed graph changes. Do not reapply them; consider a different approach." },
    ],
  }, {
    type: "graph_proposal_discarded",
    title: "Founder discarded proposed changes",
    detail: proposal.rationale,
    data: { proposalId: proposal.id },
  }, options);
  launchOperatorSession(id, runtime);
  return next;
}

export function cancelOperatorSession(id, options = {}) {
  const session = getOperatorSession(id, options);
  return addEvent({
    ...session,
    status: "cancelled",
    completedAt: new Date().toISOString(),
    pendingQuestion: null,
    pendingGate: null,
    pendingProposal: null,
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
