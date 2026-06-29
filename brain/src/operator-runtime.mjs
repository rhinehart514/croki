import { getEngineState } from "./engine.mjs";
import { liveStepRuntime } from "./agent-bridge.mjs";
import { createClaudeComposer } from "./composition.mjs";
import { createClaudeEvaluator } from "./eval.mjs";
import { createClaudeProductModeler } from "./product-model-generator.mjs";
import { loadFlow, recordFlowRun, saveFlow } from "./flow-store.mjs";
import { createDerivedSourceLoader } from "./cross-reference.mjs";
import { recordFeedbackSignalsFromRun } from "./feedback-ledger.mjs";
import { promoteEntrantsFromRun } from "./person-store.mjs";
import { applyGraphOperations, validateGraph } from "./graph-operations.mjs";
import { listConnectors, runGraph } from "./graph.mjs";
import { executeDomainCommand } from "./domain-commands.mjs";
import { buildDraftMemory, extractDecisions } from "./memory.mjs";
import { mergeSharedDecisions } from "./shared-judgments.mjs";
import { getDesignState } from "./design-state-store.mjs";
import {
  appendOperatorEvent,
  getOperatorSession,
  listOperatorSessions,
  saveOperatorSession,
} from "./operator-store.mjs";
import {
  applySharedContextToGraph,
  loadProject,
  projectTeamId,
  updateSharedContext,
} from "./project-store.mjs";
import { canApprove, getMember, resolveCurrentUser } from "./team-store.mjs";
import { composeNakedGraph } from "./workflow-composer.mjs";
import { compareChannelRuns } from "./run-compare.mjs";
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
    name: "compose_and_run",
    description: "Autonomously drive a goal end-to-end in one move: compose the channel's workflow if this session has none yet (research/enrich/draft agents behind a founder gate), then run it through the step runtime until it reaches the shared founder gate. Use this when the founder hands a goal and wants the whole system built and run up to the gate without micromanaging each step. It never sends — it stops at the gate for a human release.",
    input_schema: {
      type: "object",
      properties: {
        goal: { type: "string", description: "The goal to build and run toward. Defaults to the session goal." },
        title: { type: "string", description: "Optional channel name." },
        agents: {
          type: "array",
          description: "Optional inline agent specs (ref/role/objective/prompt). Omit to let the composer design the agents.",
          items: { type: "object" },
        },
      },
      required: [],
    },
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

// The naked harness. The model the founder drives sees ONLY these tools: read the product (truth),
// one build-and-run door (compose_and_run), the inspect/repair loop for a failed run, the founder-input
// channel, and complete — plus the light shared-context (taste/memory) read+write. Everything else the
// operator CAN do (programs, policies, the capability foundry, portfolio/channel CRUD, experiments,
// product-model derivation) is removed from what the model can reach, so it builds and runs instead of
// navigating an ontology. `executeOperatorTool` still routes every tool name, so direct API/MCP callers
// and tests are unaffected — this only narrows what the autonomous model is offered. The wall (founder
// gate) and taste (shared context) are the only constraints that remain on the model's hands.
const NAKED_TOOL_NAMES = new Set([
  "inspect_product",          // truth — read what the product actually is
  "inspect_shared_context",   // taste/memory — ICP, positioning, what's been tried
  "update_shared_context",    // record inferred taste/positioning rather than duplicating into graphs
  "compose_and_run",          // THE move — design the work, build behind a gate, run to the gate
  "inspect_graph",            // inspect/repair a failed run
  "inspect_problems",
  "inspect_run",
  "propose_graph_changes",
  "validate_graph",
  "run_node",
  "run_loop",
  "request_founder_input",    // ask the founder only for a real, unsafe-to-infer decision
  "complete",
]);
const NAKED_TOOLS = TOOLS.filter((t) => NAKED_TOOL_NAMES.has(t.name));

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

function designStateFor(session, options) {
  // The founder's front-end house style for this project (falls back to the seeded global default),
  // injected so any UI an operator step produces starts from captured taste, not the generic mean.
  return getDesignState(session?.projectId || options?.projectId || "default", options);
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
    // Required-consult violations surfaced by graph.mjs at the gate: drafting/UI steps that skipped
    // the founder's taste (and design) signal. Carried through so the operator and founder see the
    // blocking issue at the gate instead of approving a draft as if it were grounded.
    ...(node.consultBlocked ? { consultBlocked: true, consultViolations: node.consultViolations ?? [] } : {}),
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

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

// Cross-session memory: the operator's recall of what it has already worked on in THIS project —
// distinct from the within-session chat memory the runtime resumes (claude-code.mjs). Past sessions
// become a compact brief so a new goal starts from "here is what you have done before," not a blank
// slate. Bounded to the few most recent meaningful sessions so the prompt stays small, and scoped to
// the project so one product's history never leaks into another's.
function recallPriorSessions(session, options) {
  const meaningful = new Set(["completed", "interrupted", "waiting_for_gate", "waiting_for_input", "blocked"]);
  return listOperatorSessions({ ...options, projectId: session.projectId ?? null })
    .filter((prior) => prior.id !== session.id && prior.goal && (prior.summary || meaningful.has(prior.status)))
    .slice(0, 5)
    .map((prior) => ({
      goal: prior.goal,
      status: prior.status,
      summary: prior.summary ? String(prior.summary).slice(0, 240) : null,
    }));
}

function renderPriorSessions(priorSessions = []) {
  if (!priorSessions.length) return "No prior operator sessions in this project — this is a fresh start.";
  return priorSessions
    .map((prior) => `- [${prior.status}] ${prior.goal}${prior.summary ? ` — ${prior.summary}` : ""}`)
    .join("\n");
}

function systemPrompt(session, workspace, priorSessions = []) {
  const grounding = workspace
    ? `The active repository is ${workspace.repo}. The defined win event is "${workspace.outcome}".`
    : "No repository workspace is currently active. State that limitation before making product claims.";
  return `You are the go-to-market operator inside GTM IDE. A founder hands you a goal; you build the work and run it up to their approval gate. That is the whole job — there is no required setup, no program or policy or template to stand up first.

Founder goal:
${session.goal}

What you can read (the product's truth — your claims come from here):
${grounding}

What you've already done in this project (build on it, don't redo it):
${renderPriorSessions(priorSessions)}

How you work:
- One move does most of it: compose_and_run. Given the goal, it designs the agents and steps the goal needs (research, enrich, draft — whatever fits), builds the workflow behind a founder gate, and runs it to that gate. Reach for it first, not last.
- Decide the approach freely from the real product and the goal in front of you. No fixed channel catalog, no ceremony. If the founder asks for several angles, lay them out in plain language first, then build the ones they pick.
- The wall is absolute: nothing sends, publishes, deploys, or charges without the founder approving at the gate. You never approve a gate yourself. compose_and_run always stops at the gate.
- Learn and match the founder's taste from what they've approved and rejected before; don't re-ask what you can infer.
- Product claims come from the repository, or you label them inferred. Never invent traction, metrics, or facts.
- Use the graph tools (inspect_graph, inspect_problems, propose_graph_changes, run_node, run_loop) only to inspect or repair an actual failed run — not as the opening vocabulary.
- Ask the founder only for a real decision you cannot infer safely. Keep going until the work reaches the gate, is honestly blocked, or needs their judgment. Call complete when done.`;
}

function addEvent(session, event, options) {
  return saveOperatorSession(appendOperatorEvent(session, event), options);
}

// JOB 1 — the role-gated release. The gate connector already owns the WALL: nothing sends until a
// human supplies an approve decision. This guard answers the separate question of WHO is allowed to
// supply that decision when the gate is a shared team queue. Viewing (and commenting) is open to the
// whole team; RELEASE (approve/send) requires a team-store role of owner or approver. A solo founder's
// session has no team (teamId null → the founder's personal team) where the founder is the owner, so
// the single-user path stays exactly as before: the founder always passes.
//
// Returns the resolved acting user so the caller can stamp the release event with who cleared it.
function authorizeGateRelease(session, payload = {}, options = {}) {
  // The team that owns this conversation: the session's stamped teamId, else the project's effective
  // team (which resolves to the founder's personal team for a single-user project).
  const teamId = session.teamId
    || (session.projectId ? projectTeamId(session.projectId, options) : null)
    || projectTeamId(null, options);
  // The acting human: explicit payload.userId wins, else identity stamped on the request headers,
  // else the local founder. Same resolver the team routes use, so the UI and the agent door agree.
  const actor = resolveCurrentUser({
    ...options,
    userId: payload.userId,
    request: payload.request ?? options.request,
    headers: payload.headers ?? options.headers,
  });
  if (!canApprove(teamId, actor.userId, options)) {
    const member = getMember(teamId, actor.userId, options);
    const role = member?.role ?? "non-member";
    const error = new Error(
      `${actor.name} (${role}) cannot release this send. Only a team owner or approver may clear the founder gate. Others can view and comment.`,
    );
    error.code = "gate_release_forbidden";
    error.status = 403;
    error.teamId = teamId;
    error.userId = actor.userId;
    throw error;
  }
  return { actor, teamId };
}

async function executeGraphRun(session, { targetNodeId, stream = false } = {}, options = {}) {
  const flow = flowFor(session, options);
  // When streaming is on (the autonomous compose_and_run drive), surface each step as it executes —
  // "running node X", "drafted N items", "reached the gate" — onto the durable session events so the
  // UI can animate progress instead of seeing one batch at the end. The events are persisted through
  // saveOperatorSession (mutating the local `session` ref), the same mechanism every other event uses.
  let live = session;
  const onEvent = stream
    ? (event) => {
        if (event.type === "node_start") {
          live = addEvent(live, {
            type: "operator_node_start",
            title: `Running ${event.label || event.nodeId}`,
            detail: `${event.kind || "tool"} · ${event.category}`,
            data: { nodeId: event.nodeId, category: event.category, kind: event.kind },
          }, options);
        } else if (event.type === "node_done") {
          const r = event.result ?? {};
          const count = Array.isArray(r.items) ? r.items.length : 0;
          live = addEvent(live, {
            type: r.pendingReview ? "operator_reached_gate" : "operator_node_done",
            title: r.pendingReview
              ? `Reached the founder gate · ${count} item${count === 1 ? "" : "s"} awaiting release`
              : `${r.category === "gate" ? "Gate" : r.category === "generate" || r.kind === "agent" ? "Drafted" : "Completed"} ${event.nodeId} · ${count} item${count === 1 ? "" : "s"}`,
            detail: r.ok === false ? (r.error ?? "Step failed.") : null,
            data: { nodeId: event.nodeId, ok: r.ok, itemCount: count, pendingReview: r.pendingReview ?? false },
          }, options);
        }
      }
    : null;
  const result = await runGraph(flow.graph, {
    targetNodeId,
    memory: memoryFor(flow.runs, options),
    designState: designStateFor(session, options),
    // The live subscription-backed step runtime by default; a test injects a fake through
    // options.stepRuntime so the open agent/skill/code steps run keyless.
    stepRuntime: options.stepRuntime || liveStepRuntime({ cwd: options.cwd }),
    loadLastRunItems: createDerivedSourceLoader({ ...options, projectId: session.projectId || "default" }),
    onEvent,
  });
  if (stream) session = live;
  const stored = recordFlowRun(flow.graph, result, options);
  const feedback = recordFeedbackSignalsFromRun({ projectId: session.projectId || "default", graph: flow.graph, result }, options);
  promoteEntrantsFromRun({ projectId: session.projectId || "default", channelId: flow.graph.id, result }, options);
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
      // Crystallized, gated tool-birth proposals — the operator surfaces them to route the founder
      // to the dashboard approval (it never approves; birth is a founder action). LIST only.
      toolBirthProposals: feedback?.toolBirthProposals ?? [],
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
    const run = await executeGraphRun(session, { stream: true }, options);
    return { session: run.session, result: summarizeRun(run.result), pause: run.session.status === "waiting_for_gate" };
  }

  // JOB 2 — the autonomous drive. One move: compose the workflow for the goal if this session has no
  // graph yet, then run it to the shared founder gate, streaming each step onto the session events.
  // It never sends — the run stops at the gate for an authorized human release (JOB 1). This is the
  // operator COMPOSING and DRIVING a goal end-to-end in a single pass.
  if (tool.name === "compose_and_run") {
    const goal = firstNonEmpty(input.goal, session.goal);
    let working = session;

    // Compose only when this session has no executable graph yet — otherwise drive the one it has.
    if (!working.graphId) {
      working = addEvent(working, {
        type: "operator_composing",
        title: "Composing the workflow",
        detail: `Designing the channel for: ${goal}`,
        data: { goal },
      }, options);
      const composeRepo = options.cwd || loadProject(options).sharedContext?.repository?.repo || process.cwd();
      const composed = await composeNakedGraph({
        title: firstNonEmpty(input.title, goal),
        objective: goal,
        agents: Array.isArray(input.agents) ? input.agents : [],
      }, {
        ...options,
        compose: options.compose || createClaudeComposer({ cwd: composeRepo }),
      });
      working = addEvent({
        ...working,
        graphId: composed.channel.graphId,
        graphRevision: composed.graph.revision,
        programId: composed.program?.id ?? working.programId,
      }, {
        type: "operator_workflow_composed",
        title: `Composed ${composed.channel.name}`,
        detail: `${composed.graph.nodes.length} steps with a founder gate — ready to run to the gate.`,
        data: { channelId: composed.channel.id, graphId: composed.channel.graphId, nodes: composed.graph.nodes.length },
      }, options);
    } else {
      working = addEvent(working, {
        type: "operator_composing",
        title: "Driving the existing workflow",
        detail: "This session already has a composed workflow — running it to the gate.",
        data: { graphId: working.graphId },
      }, options);
    }

    working = addEvent(working, {
      type: "operator_running",
      title: "Running the workflow to the gate",
      detail: "Research, enrich, and draft steps run; the run stops at the shared founder gate.",
    }, options);

    const run = await executeGraphRun(working, { stream: true }, options);
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

// The latest "what changed" instruction to feed a resumed conversation. The resume entry points
// (founder response, gate resolved, proposal accepted/discarded) each append a plain-string user
// message to modelMessages describing the change; the Claude Code runtime sends that as the prompt
// when it resumes its persisted SDK session. Null on a fresh session, where the goal is the prompt.
function latestResumeInstruction(session) {
  const messages = session.modelMessages ?? [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "user" && typeof message.content === "string" && message.content.trim()) {
      return message.content;
    }
  }
  return null;
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
    system: systemPrompt(session, workspace, recallPriorSessions(session, options)),
    // The model is handed ONLY the naked toolset (truth + compose_and_run + repair loop + gate + chat).
    // executeOperatorTool below still routes every tool name for direct API/MCP callers and tests.
    tools: NAKED_TOOLS,
    client: selection.client ?? null,
    query: runtime.query ?? null,
    options,
    env: process.env,
    initialMessages: session.modelMessages?.length ? session.modelMessages : null,
    // Conversation continuity for the Claude Code (subscription) runtime. The runtime resumes the
    // SDK session id we stored on the prior drive and replays only the latest "what changed"
    // instruction (founder response, gate resolved, proposal decided) as the new prompt — so the
    // subprocess remembers the chat instead of restarting cold after every founder pause.
    runtimeSessionId: session.runtimeSessionId ?? null,
    resumePrompt: latestResumeInstruction(session),
    onRuntimeSession: (sid) => {
      if (sid && sid !== session.runtimeSessionId) {
        session = saveOperatorSession({ ...session, runtimeSessionId: sid }, options);
      }
    },
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
  // Role-gated release: resolving a founder gate IS the act of releasing a send, so only an authorized
  // team member (owner/approver) may do it. Throws gate_release_forbidden (403) for a viewer/member.
  // The wall in the gate connector is unchanged; this only guards who may stand at it.
  const { actor: releasedBy } = authorizeGateRelease(session, payload, options);
  const flow = flowFor(session, options);
  const result = await runGraph(flow.graph, {
    approvals: payload.approvals && typeof payload.approvals === "object" ? payload.approvals : {},
    decisions: payload.decisions && typeof payload.decisions === "object" ? payload.decisions : {},
    memory: memoryFor(flow.runs, options),
    designState: designStateFor(session, options),
    resumeResult: session.pendingGate.runResult,
    stepRuntime: liveStepRuntime({ cwd: options.cwd }),
    loadLastRunItems: createDerivedSourceLoader({ ...options, projectId: session.projectId || "default" }),
    // Defense-in-depth at the gate point: re-assert authority inside the runner before any approval is
    // applied. authorizeGateRelease already passed above (or this code is unreachable); re-running it
    // here means the wall holds even if a future caller wires runGraph approvals without the front guard.
    authorizeRelease: () => authorizeGateRelease(session, payload, options),
  });
  recordFlowRun(flow.graph, result, options);
  const feedback = recordFeedbackSignalsFromRun({ projectId: session.projectId || "default", graph: flow.graph, result }, options);
  promoteEntrantsFromRun({ projectId: session.projectId || "default", channelId: flow.graph.id, result }, options);
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
    data: {
      runId: result.runId,
      pendingGates: result.pendingGates,
      releasedBy: { userId: releasedBy.userId, name: releasedBy.name },
      toolBirthProposals: feedback?.toolBirthProposals ?? [],
    },
  }, options);
  if (!result.pendingGates.length) launchOperatorSession(id, runtime);
  return session;
}

// The founder accepts or discards a staged graph proposal. Accept applies the exact reviewed
// operations to the current graph and resumes the operator; discard drops them and resumes the
// operator told not to reapply. Mirrors resolveOperatorGate: founder-only, never an agent tool.
export function resolveOperatorProposal(id, payload = {}, runtime = {}) {
  const options = runtime.options ?? {};
  const session = getOperatorSession(id, options);
  // Resolve any session that HOLDS a staged proposal — not only one paused at waiting_for_proposal.
  // The operator often stages the change and finishes its turn (status → completed) with the proposal
  // still pending; the founder reviews it whenever. Accept re-applies and resumes; reject drops and
  // resumes. The only hard requirement is that a proposal actually exists.
  if (!session.pendingProposal) {
    throw new Error("This session has no graph proposal waiting for review.");
  }
  const proposal = session.pendingProposal;
  const accept = payload.accept === true || payload.decision === "accept";
  // The founder's note on the decision. On reject it's a redirect (Claude comes back and changes it);
  // on accept it's a quiet annotation — the operator reads it, and the learning loop can pick it up
  // later. The note never makes the decision; the founder's ✓/✕ does, and the note only colors it.
  const note = typeof payload.note === "string" ? payload.note.trim() : "";

  if (accept) {
    const flow = flowFor(session, options);
    // Re-apply against the live graph (not the cached preview) so the commit is valid even if the
    // graph moved since the proposal was staged; applyGraphOperations re-validates and throws if not.
    const patched = applyGraphOperations(flow.graph, proposal.operations);
    const saved = saveFlow(patched.graph, options);
    const acceptMsg = `Founder accepted the proposed graph changes (${proposal.changes.length} operation${proposal.changes.length === 1 ? "" : "s"}). They are now applied.${note ? ` They left a note: "${note}". Take it as durable guidance for future changes, not a new edit to make now.` : ""} Continue.`;
    const next = addEvent({
      ...session,
      status: "ready",
      pendingProposal: null,
      error: null,
      graphRevision: saved.graph.revision ?? 0,
      modelMessages: [
        ...(session.modelMessages ?? []),
        { role: "user", content: acceptMsg },
      ],
    }, {
      type: "graph_patched",
      title: note ? "Founder accepted with a note" : "Founder accepted proposed changes",
      detail: note || proposal.rationale,
      data: { revision: saved.graph.revision, changes: patched.changes, proposalId: proposal.id, note: note || undefined },
    }, options);
    launchOperatorSession(id, runtime);
    return next;
  }

  const rejectMsg = note
    ? `Founder discarded the proposed graph changes and asked for this instead: "${note}". Do not reapply the discarded changes — make this change instead.`
    : "Founder discarded the proposed graph changes. Do not reapply them; consider a different approach.";
  const next = addEvent({
    ...session,
    status: "ready",
    pendingProposal: null,
    error: null,
    modelMessages: [
      ...(session.modelMessages ?? []),
      { role: "user", content: rejectMsg },
    ],
  }, {
    type: "graph_proposal_discarded",
    title: note ? "Founder redirected the changes" : "Founder discarded proposed changes",
    detail: note || proposal.rationale,
    data: { proposalId: proposal.id, note: note || undefined },
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
