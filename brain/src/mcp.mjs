#!/usr/bin/env node
/**
 * GTM IDE MCP server — stdio transport, hand-rolled JSON-RPC 2.0.
 *
 * Runs as a child process of Claude Code. Reads newline-delimited JSON-RPC
 * messages from stdin, dispatches tool calls to the GTM IDE brain HTTP server
 * at http://localhost:4317, and writes JSON-RPC responses to stdout.
 *
 * Start: node brain/src/mcp.mjs
 * Or via npm:  npm run mcp
 */

import { fileURLToPath } from "node:url";

const BRAIN = "http://localhost:4317";

// ---------------------------------------------------------------------------
// Brain HTTP helpers
// ---------------------------------------------------------------------------

async function brainGet(path) {
  const res = await fetch(`${BRAIN}${path}`);
  if (!res.ok) throw new Error(`Brain ${path} → HTTP ${res.status}`);
  return res.json();
}

async function brainPost(path, body) {
  const res = await fetch(`${BRAIN}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Brain ${path} → HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

// Fetch the graph template (graph + last 10 runs).
async function getTemplate(channelId) {
  return brainGet(`/api/graph/template${channelId ? `?channel=${encodeURIComponent(channelId)}` : ""}`);
}

// Resolve which project an outcome tool targets. Code's job, not the model's:
// an explicit projectId wins; otherwise bind to the active project. Deterministic.
async function resolveProjectId(projectId) {
  if (projectId) return projectId;
  const data = await brainGet("/api/projects");
  const active = data.activeProjectId ?? data.projects?.[0]?.id;
  if (!active) throw new Error("No active project. Create one with create_project first.");
  return active;
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

/**
 * list_channels — returns the project's channel list.
 * Relies on GET /api/project added by the A1 task. Falls back to deriving a
 * minimal channel record from the graph template if /api/project is not yet
 * wired.
 */
async function listChannels() {
  try {
    const data = await brainGet("/api/project");
    return { channels: data.project?.channels ?? [] };
  } catch {
    // /api/project may not exist yet — derive a minimal channel from the graph.
    const { graph, runs } = await getTemplate();
    const lastRun = runs?.at(-1) ?? null;
    return {
      channels: [{
        id: graph.id,
        name: graph.name ?? graph.id,
        status: lastRun ? (lastRun.ok ? "ok" : "error") : "idle",
        lastRunAt: lastRun?.createdAt ?? null,
        lastRunOk: lastRun?.ok ?? null,
        nodeCount: graph.nodes?.length ?? 0,
        runCount: runs?.length ?? 0,
      }],
    };
  }
}

async function listWorkflows() {
  const data = await listChannels();
  return { workflows: data.channels ?? [], channels: data.channels ?? [] };
}

/**
 * get_channel — returns graph + last run for a channel.
 * Only one channel exists for now; the id parameter is accepted but ignored.
 */
async function getChannel({ id }) {  // eslint-disable-line no-unused-vars
  const { graph, runs } = await getTemplate(id);
  return { graph, lastRun: runs?.at(-1) ?? null };
}

async function getWorkflow({ id, workflowId }) {
  return getChannel({ id: workflowId ?? id });
}

/**
 * run_channel — runs the full graph and returns the run result.
 */
async function runChannel({ id }) {  // eslint-disable-line no-unused-vars
  const { graph } = await getTemplate(id);
  return brainPost("/api/graph/run", { graph, approvals: {} });
}

async function runWorkflow({ id, workflowId }) {
  return runChannel({ id: workflowId ?? id });
}

/**
 * run_node — runs a single node and returns that node's result.
 */
async function runNode({ channelId, nodeId }) {  // eslint-disable-line no-unused-vars
  const { graph } = await getTemplate(channelId);
  const result = await brainPost("/api/graph/run", {
    graph,
    targetNodeId: nodeId,
    approvals: {},
  });
  const nodeResult = result?.nodes?.[nodeId];
  if (!nodeResult) {
    return { error: `No result for node "${nodeId}". Check nodeId spelling.`, available: Object.keys(result?.nodes ?? {}) };
  }
  return nodeResult;
}

async function runWorkflowNode({ workflowId, channelId, nodeId }) {
  return runNode({ channelId: workflowId ?? channelId, nodeId });
}

/**
 * approve_gate — approves a pending gate node and continues the run.
 */
async function approveGate({ channelId, nodeId }) {  // eslint-disable-line no-unused-vars
  const { graph } = await getTemplate(channelId);
  return brainPost("/api/graph/run", {
    graph,
    approvals: { [nodeId]: true },
  });
}

async function approveWorkflowGate({ workflowId, channelId, nodeId }) {
  return approveGate({ channelId: workflowId ?? channelId, nodeId });
}

/**
 * get_items — returns items from the last run for a given node.
 */
async function getItems({ channelId, nodeId }) {  // eslint-disable-line no-unused-vars
  const { runs } = await getTemplate(channelId);
  const lastRun = runs?.at(-1);
  if (!lastRun) return { items: [], count: 0 };
  const nodeResult = lastRun?.nodes?.[nodeId] ?? lastRun?.result?.nodes?.[nodeId];
  const items = nodeResult?.items ?? [];
  return { items, count: items.length };
}

async function getWorkflowItems({ workflowId, channelId, nodeId }) {
  return getItems({ channelId: workflowId ?? channelId, nodeId });
}

async function listOperatorSessions() {
  return brainGet("/api/operator/sessions");
}

async function startOperatorSession({ goal, workflowId, channelId }) {
  return brainPost("/api/operator/sessions", { goal, graphId: workflowId ?? channelId });
}

async function getOperatorSession({ sessionId }) {
  return brainGet(`/api/operator/sessions/${encodeURIComponent(sessionId)}`);
}

async function resumeOperatorSession({ sessionId, input }) {
  return brainPost(`/api/operator/sessions/${encodeURIComponent(sessionId)}/resume`, { input });
}

async function cancelOperatorSession({ sessionId }) {
  return brainPost(`/api/operator/sessions/${encodeURIComponent(sessionId)}/cancel`, {});
}

async function getSharedContext() {
  return brainGet("/api/project/context");
}

async function updateSharedContext({ patch }) {
  return brainPost("/api/project/context", { patch });
}

async function createWorkflow(input) {
  return brainPost("/api/program-workflows", input);
}

async function duplicateWorkflow({ workflowId, ...input }) {
  return brainPost(`/api/program-workflows/${encodeURIComponent(workflowId)}/duplicate`, input);
}

async function updateWorkflow({ workflowId, ...patch }) {
  return brainPost(`/api/program-workflows/${encodeURIComponent(workflowId)}/update`, patch);
}

async function listProjects() {
  return brainGet("/api/projects");
}

async function createProject(input) {
  return brainPost("/api/projects", input);
}

async function activateProject({ projectId }) {
  return brainPost(`/api/projects/${encodeURIComponent(projectId)}/activate`, {});
}

async function composeChannel({ projectId, ...input }) {
  return brainPost(`/api/projects/${encodeURIComponent(projectId)}/compose`, input);
}

// ---------------------------------------------------------------------------
// Living Product Picture — the founder-editable interpretation of the product
// (its core objects, their relationships, user goals, key states). HTTP client
// to Door 1; the derive route injects the live generator host-side.
// ---------------------------------------------------------------------------

async function getProductModel() {
  return brainGet("/api/product-model");
}

async function deriveProductModel(input = {}) {
  return brainPost("/api/product-model/derive", input);
}

async function reviseProductModel(input = {}) {
  return brainPost("/api/product-model/revise", input);
}

async function recordProductSignal(input = {}) {
  return brainPost("/api/product-model/signal", input);
}

// ---------------------------------------------------------------------------
// Outcome programs — the product's declared domain center (OutcomeProgram).
// ---------------------------------------------------------------------------

// A founder's real outcomes are programs (the rich, compiled form) PLUS the standalone systems
// (channels) that exist before any program is compiled — the operator composes a channel graph well
// before a heavyweight OutcomeProgram ever persists. Reporting only programs would tell an agent
// "0 outcomes" while real systems sit on the canvas — the same seam the human rail closes. The
// active project's systems come from GET /api/project; we merge in only the systems no program wraps.
async function standaloneSystems(projectId, programs) {
  try {
    const proj = await brainGet("/api/project");
    if ((proj.project?.id ?? projectId) !== projectId) return []; // channels are the active project's
    const programIds = new Set((programs ?? []).map((p) => p.id));
    return (proj.project?.channels ?? [])
      .filter((ch) => !ch.outcomeProgramId || !programIds.has(ch.outcomeProgramId))
      .map((ch) => ({
        id: ch.id, name: ch.name, form: "system", objective: ch.objective ?? null,
        status: ch.status, graphId: ch.graphId, runCount: ch.runCount ?? 0, pendingGates: ch.pendingGates ?? 0,
      }));
  } catch {
    return []; // the channel endpoint is optional; fall back to programs only
  }
}

/**
 * list_outcomes — every outcome in the project: programs (with their policies, agents, feedback,
 * and domain-event trail) and the standalone systems not yet wrapped by a program.
 */
async function listOutcomes({ projectId } = {}) {
  const id = await resolveProjectId(projectId);
  const data = await brainGet(`/api/projects/${encodeURIComponent(id)}/programs`);
  const systems = await standaloneSystems(id, data.programs);
  const outcomes = [
    ...(data.programs ?? []).map((p) => ({ id: p.id, name: p.name, form: "program", status: p.lastRunStatus ?? p.lifecycle, graphId: p.graphId ?? null })),
    ...systems,
  ];
  return { projectId: id, outcomes, ...data, systems };
}

/**
 * list_tool_proposals — pending tool-birth proposals (deterministic procedures crystallized from
 * repeated runs, gated and never auto-born) plus the registered, callable self-built tools.
 * Read-only: routes the founder to a decision; birth is a founder action in the dashboard.
 */
async function listToolProposals({ projectId } = {}) {
  const id = await resolveProjectId(projectId);
  return brainGet(`/api/projects/${encodeURIComponent(id)}/tool-proposals`);
}

/**
 * get_outcome — one outcome by id (or name): a program with its policies, or, failing that, a
 * standalone system (channel). The host exposes no single-program endpoint, so both resolve from
 * the project's lists.
 */
async function getOutcome({ outcomeId, projectId }) {
  const id = await resolveProjectId(projectId);
  const data = await brainGet(`/api/projects/${encodeURIComponent(id)}/programs`);
  const program = (data.programs ?? []).find((p) => p.id === outcomeId || p.name === outcomeId);
  if (program) {
    const policies = (data.policies ?? []).filter((policy) => policy.programId === program.id);
    return { projectId: id, form: "program", program, policies };
  }
  const systems = await standaloneSystems(id, data.programs);
  const system = systems.find((s) => s.id === outcomeId || s.name === outcomeId);
  if (system) return { projectId: id, form: "system", system };
  return {
    error: `No outcome "${outcomeId}" in project ${id}.`,
    available: [
      ...(data.programs ?? []).map((p) => ({ id: p.id, name: p.name, form: "program" })),
      ...systems.map((s) => ({ id: s.id, name: s.name, form: "system" })),
    ],
  };
}

// ---------------------------------------------------------------------------
// People — the keystone object, promoted from real run entrants. Read-only
// front door: list, get one, and cross-reference where an object appears.
// ---------------------------------------------------------------------------

async function listPeople({ projectId } = {}) {
  const id = await resolveProjectId(projectId);
  return brainGet(`/api/projects/${encodeURIComponent(id)}/people`);
}

async function getPerson({ personId, projectId }) {
  const id = await resolveProjectId(projectId);
  return brainGet(`/api/projects/${encodeURIComponent(id)}/people/${encodeURIComponent(personId)}`);
}

async function findReferences({ kind, id: refId, projectId }) {
  const id = await resolveProjectId(projectId);
  const params = new URLSearchParams({ kind: kind ?? "" });
  if (refId != null) params.set("id", String(refId));
  return brainGet(`/api/projects/${encodeURIComponent(id)}/references?${params.toString()}`);
}

// ---------------------------------------------------------------------------
// Tool registry
// ---------------------------------------------------------------------------

// One workflow-id schema, shared by canonical tools. The canonical noun is
// "workflow" (the OutcomeProgram's execution plan); "channel" is workflow
// metadata, not a second object. Channel-named tools below are thin
// backward-compatible aliases that delegate to the same handlers.
const WORKFLOW_ID = { type: "string", description: "Workflow id." };
const NODE_ID = { type: "string", description: "Node id within the workflow graph (e.g. 'source-1')." };

const TOOLS = [
  // ── Project scope ──────────────────────────────────────────────────────────
  {
    name: "list_projects",
    description: "List the repository-backed product projects and which one is active. Read first to learn the active scope before any workflow, outcome, or channel call. Does not create or switch projects.",
    inputSchema: { type: "object", properties: {}, required: [] },
    handler: listProjects,
  },
  {
    name: "create_project",
    description: "Create and activate a product project by read-only scanning a local repository and its real win event. Use once per product, before composing channels or workflows. Does not run any go-to-market work; only establishes the grounded scope.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        repoPath: { type: "string" },
        outcome: { type: "string" },
      },
      required: ["repoPath", "outcome"],
    },
    handler: createProject,
  },
  {
    name: "activate_project",
    description: "Switch which product project is active so that following workflow, outcome, channel, and shared-context calls resolve to it. Use to change scope; use list_projects first to find the id. Does not create a project.",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string" } },
      required: ["projectId"],
    },
    handler: activateProject,
  },

  // ── Outcome programs — the domain center (OutcomeProgram) ───────────────────
  {
    name: "list_outcomes",
    description: "List every outcome in a project: compiled outcome programs (the declared domain center, with their agent-creation policies, personalized agents, feedback signals, and domain-event trail) AND the standalone systems (channels) the founder has built that no program wraps yet — each is a real outcome with a goal, a system, and a gate. The unified set is returned in `outcomes`. Defaults to the active project; pass projectId to target another. Read this first to orient on what the product is actually chasing before touching workflows. Read-only; does not create or run anything.",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string", description: "Optional. Defaults to the active project." } },
      required: [],
    },
    handler: listOutcomes,
  },
  {
    name: "get_outcome",
    description: "Get one outcome by id (or name): a compiled program plus its agent-creation policies, or — failing that — a standalone system (channel) the founder built before any program wrapped it. The response's `form` field says which. Use after list_outcomes for the full detail of a single outcome. Defaults to the active project. Read-only; to run the outcome's workflow use run_workflow.",
    inputSchema: {
      type: "object",
      properties: {
        outcomeId: { type: "string", description: "Outcome program id or name." },
        projectId: { type: "string", description: "Optional. Defaults to the active project." },
      },
      required: ["outcomeId"],
    },
    handler: getOutcome,
  },
  {
    name: "list_tool_proposals",
    description: "List a project's pending tool-birth proposals (deterministic procedures crystallized from repeated runs — gated and NEVER auto-born) plus the registered, callable self-built tools. Read-only: it routes the founder to a decision and does NOT approve or birth anything; birth is a founder action in the dashboard. Defaults to the active project.",
    inputSchema: { type: "object", properties: { projectId: { type: "string", description: "Optional. Defaults to the active project." } }, required: [] },
    handler: listToolProposals,
  },

  // ── Channels ───────────────────────────────────────────────────────────────
  {
    name: "compose_channel",
    description: "Compose an inline channel spec and the agents it needs into a validated, gated workflow with input, founder gate, output, measure, and feedback steps. The channel is defined directly here (by the founder or by Claude) — there is no opportunity accept-list to look it up in. Builds the workflow graph; it does not run it (use run_workflow) and never sends anything.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        title: { type: "string", description: "The channel's title." },
        objective: { type: "string", description: "What this channel is trying to achieve." },
        kind: { type: "string", description: "Optional channel label stored as metadata." },
        agents: {
          type: "array",
          description: "The agent teammates this channel needs, as inline specs.",
          items: {
            type: "object",
            properties: {
              ref: { type: "string", description: "Stable agent ref." },
              role: { type: "string" },
              objective: { type: "string" },
              prompt: { type: "string" },
            },
          },
        },
        name: { type: "string", description: "Optional workflow name override (defaults to the channel title)." },
        input: { type: "object" },
        output: { type: "object" },
      },
      required: ["projectId", "title", "objective"],
    },
    handler: composeChannel,
  },

  // ── Workflows — author (the OutcomeProgram's execution plan) ────────────────
  {
    name: "list_workflows",
    description: "List every outcome-program workflow in the active project, with id, program id, status, run history, and graph-shape metadata. Use to find a workflow id before getting, running, or editing one. Read-only.",
    inputSchema: { type: "object", properties: {}, required: [] },
    handler: listWorkflows,
  },
  {
    name: "create_workflow",
    description: "Create a blank outcome-program workflow, then shape its graph with founder-reviewed operations. Use to start a workflow from scratch; use compose_channel instead to build one from an inline channel spec and its agents. Channel is stored only as workflow metadata, not a separate object.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        objective: { type: "string" },
        kind: { type: "string", description: "Optional channel label stored as metadata." },
      },
      required: ["name", "objective"],
    },
    handler: createWorkflow,
  },
  {
    name: "duplicate_workflow",
    description: "Copy an existing outcome-program workflow and its graph into a new, independently editable workflow. Use to fork a working workflow before experimenting. Does not run either workflow.",
    inputSchema: {
      type: "object",
      properties: {
        workflowId: WORKFLOW_ID,
        name: { type: "string" },
        objective: { type: "string" },
      },
      required: ["workflowId", "name"],
    },
    handler: duplicateWorkflow,
  },
  {
    name: "update_workflow",
    description: "Rename, restate the objective, relabel the channel, enable, or archive a workflow's metadata. Use for metadata edits only; to change the graph nodes, start an operator session and use propose_graph_changes. Does not run the workflow.",
    inputSchema: {
      type: "object",
      properties: {
        workflowId: WORKFLOW_ID,
        name: { type: "string" },
        objective: { type: "string" },
        kind: { type: "string", description: "Optional channel label stored as metadata." },
        enabled: { type: "boolean" },
      },
      required: ["workflowId"],
    },
    handler: updateWorkflow,
  },

  // ── Workflows — read ───────────────────────────────────────────────────────
  {
    name: "get_workflow",
    description: "Get the full graph definition and last run result for one workflow. Use after list_workflows to inspect a workflow's nodes and latest output. Read-only; use run_workflow to execute it.",
    inputSchema: {
      type: "object",
      properties: { workflowId: WORKFLOW_ID },
      required: ["workflowId"],
    },
    handler: getWorkflow,
  },
  {
    name: "get_workflow_items",
    description: "Get the items array produced by a specific node in the workflow's last run. Use to inspect what a node actually emitted (leads, drafts, scores) after run_workflow. Read-only; reads stored results, does not re-run.",
    inputSchema: {
      type: "object",
      properties: { workflowId: WORKFLOW_ID, nodeId: NODE_ID },
      required: ["workflowId", "nodeId"],
    },
    handler: getWorkflowItems,
  },

  // ── Workflows — run and gate ───────────────────────────────────────────────
  {
    name: "run_workflow",
    description: "Run the full workflow graph and return per-node output, items, and any pending founder gates. Use to execute an authored workflow end-to-end. Stops at every founder gate and never sends, publishes, or charges; clear gates with approve_workflow_gate.",
    inputSchema: {
      type: "object",
      properties: { workflowId: WORKFLOW_ID },
      required: ["workflowId"],
    },
    handler: runWorkflow,
  },
  {
    name: "run_workflow_node",
    description: "Run one workflow node and its upstream dependencies, then return that node's result. Use to test or debug a single step instead of the whole graph. Stops at any founder gate on the path; never sends.",
    inputSchema: {
      type: "object",
      properties: { workflowId: WORKFLOW_ID, nodeId: NODE_ID },
      required: ["workflowId", "nodeId"],
    },
    handler: runWorkflowNode,
  },
  {
    name: "approve_workflow_gate",
    description: "Record the founder's approval of one pending founder-gate node so a paused run continues from the exact reviewed items. Use only after run_workflow reports a pending gate. This is the single gate-approval verb; it reuses prepared items and does not re-run upstream work.",
    inputSchema: {
      type: "object",
      properties: { workflowId: WORKFLOW_ID, nodeId: { type: "string", description: "Gate node id to approve." } },
      required: ["workflowId", "nodeId"],
    },
    handler: approveWorkflowGate,
  },

  // ── Shared context ─────────────────────────────────────────────────────────
  {
    name: "get_shared_context",
    description: "Read the project-wide GTM intelligence shared by every workflow: product truth, positioning, ICP, founder taste, contacts, outcomes, experiments, artifacts, and product feedback. Read before drafting or composing so work is grounded. Read-only.",
    inputSchema: { type: "object", properties: {}, required: [] },
    handler: getSharedContext,
  },
  {
    name: "update_shared_context",
    description: "Patch the project-wide shared GTM intelligence used across every workflow. Use to record new positioning, contacts, or feedback. Inferred claims must stay marked inferred; do not present them as proven.",
    inputSchema: {
      type: "object",
      properties: { patch: { type: "object" } },
      required: ["patch"],
    },
    handler: updateSharedContext,
  },

  // ── People — the keystone object, promoted from real run entrants ───────────
  {
    name: "list_people",
    description: "List the durable People in a project — real identities promoted from run entrants, deduplicated across channels by a stable identity key. Each carries identity (name, org, handle, email, domain) and its cross-channel appearances. Use to see who has entered the GTM systems, dedup before adding, or check fatigue (who has been hit recently). Defaults to the active project. Read-only; never created by hand, never sends.",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string", description: "Optional. Defaults to the active project." } },
      required: [],
    },
    handler: listPeople,
  },
  {
    name: "get_person",
    description: "Get one Person by id: their stable identity plus every appearance across channels (channel, run, role, the why-now trigger that found them, and when). Use after list_people for the full cross-channel history of one human or org. Defaults to the active project. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        personId: { type: "string", description: "Person id." },
        projectId: { type: "string", description: "Optional. Defaults to the active project." },
      },
      required: ["personId"],
    },
    handler: getPerson,
  },
  {
    name: "find_references",
    description: "Answer 'where does X appear across channels' for a person, icp, claim, or experiment. For a person it returns their durable appearances; for icp/claim/experiment it returns the channels that reference it. Use for focus-to-trace and to understand cross-channel reuse before changing a shared object. Defaults to the active project. Read-only; derived, never seeded.",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", description: "One of: person, icp, claim, experiment." },
        id: { type: "string", description: "The object id (person id, experiment id, claim text or index, or icp identifier)." },
        projectId: { type: "string", description: "Optional. Defaults to the active project." },
      },
      required: ["kind", "id"],
    },
    handler: findReferences,
  },

  // ── Product picture — the founder-editable interpretation of the product ────
  {
    name: "get_product_model",
    description: "Read the current Living Product Picture for the active project: the founder-editable interpretation of the product — its core objects, their relationships, the user goals, the key states, and any real-world signals pinned onto them. This is interpretation, not cited truth; read it to understand how the product is organized for users before drafting or composing. Read-only.",
    inputSchema: { type: "object", properties: {}, required: [] },
    handler: getProductModel,
  },
  {
    name: "derive_product_model",
    description: "Generate a first-draft Living Product Picture by interpreting the active project's scanned grounding through rented intelligence: it proposes the product's core objects, relationships, user goals, and states, citing file:line where derived and marking genuine guesses speculative. Use when no picture exists yet or to re-derive from a fresh scan; the founder edits the result with revise_product_model. Produces an interpretation only; it never sends, publishes, or charges.",
    inputSchema: {
      type: "object",
      properties: {
        grounding: { type: "object", description: "Optional grounding snapshot to interpret. Defaults to the project scan." },
        market: { type: "object", description: "Optional buyer/market context to inform the interpretation." },
      },
      required: [],
    },
    handler: deriveProductModel,
  },
  {
    name: "revise_product_model",
    description: "Apply a founder edit to the Living Product Picture: change the things, relationships, user goals, or states bags. Each revision bumps the version on the same lineage, so edits accumulate and the prior version stays in the event log. Use to correct or sharpen the interpretation. Signals are not edited here; use record_product_signal. Does not send anything.",
    inputSchema: {
      type: "object",
      properties: {
        modelId: { type: "string", description: "The product model id to revise. Defaults to the project's current model." },
        things: { type: "array", items: { type: "object" } },
        relationships: { type: "array", items: { type: "object" } },
        userGoals: { type: "array", items: { type: "object" } },
        states: { type: "array", items: { type: "object" } },
        generatedBy: { type: "string" },
      },
      required: [],
    },
    handler: reviseProductModel,
  },
  {
    name: "record_product_signal",
    description: "Pin a real-world feedback signal onto a specific element of the Living Product Picture (a thing, relationship, goal, state, or the whole model) so the interpretation stays current with what the world actually said. The signal body stays in the feedback ledger; only the pin is recorded here. Use when observed feedback maps onto a part of the product. Does not send or publish.",
    inputSchema: {
      type: "object",
      properties: {
        modelId: { type: "string", description: "Optional. Defaults to the project's current model." },
        signalId: { type: "string", description: "The FeedbackSignal id to pin." },
        target: { type: "object", description: "{ kind: 'thing'|'relationship'|'goal'|'state'|'model', id }." },
        type: { type: "string", description: "The signal type, mirroring the FeedbackSignal." },
        summary: { type: "string" },
      },
      required: [],
    },
    handler: recordProductSignal,
  },

  // ── Operator sessions — the resident GTM operator ──────────────────────────
  {
    name: "list_operator_sessions",
    description: "List the durable resident-operator sessions and their current status. Use to find an existing session to resume before starting a new one. Read-only.",
    inputSchema: { type: "object", properties: {}, required: [] },
    handler: listOperatorSessions,
  },
  {
    name: "start_operator_session",
    description: "Give the resident GTM operator a durable goal; it inspects evidence, edits the graph through reviewed operations, runs, debugs, and pauses at founder gates. Use for open-ended 'work this outcome' tasks rather than driving single tools yourself. It never approves a gate or sends anything.",
    inputSchema: {
      type: "object",
      properties: {
        goal: { type: "string", description: "The market outcome or GTM problem to work." },
        workflowId: { type: "string", description: "Optional workflow id to start from." },
      },
      required: ["goal"],
    },
    handler: startOperatorSession,
  },
  {
    name: "get_operator_session",
    description: "Inspect one operator session: its event trail, any pending question, and any pending founder gate. Use to see why a session paused and what it needs next. Read-only.",
    inputSchema: {
      type: "object",
      properties: { sessionId: { type: "string" } },
      required: ["sessionId"],
    },
    handler: getOperatorSession,
  },
  {
    name: "resume_operator_session",
    description: "Resume a paused or interrupted operator session with explicit founder direction. Use after get_operator_session shows a pending question. Founder gates themselves are resolved in GTM IDE, not here.",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        input: { type: "string", description: "Founder answer or redirection." },
      },
      required: ["sessionId", "input"],
    },
    handler: resumeOperatorSession,
  },
  {
    name: "cancel_operator_session",
    description: "Stop a running operator session while preserving its durable history. Use to abandon a goal; the session record and events are kept. Does not delete prior runs or artifacts.",
    inputSchema: {
      type: "object",
      properties: { sessionId: { type: "string" } },
      required: ["sessionId"],
    },
    handler: cancelOperatorSession,
  },

  // ── Backward-compatible aliases ────────────────────────────────────────────
  // The canonical noun is "workflow". A lean set of the most-referenced legacy
  // channel names is kept so existing external callers keep working; they
  // delegate to the same handlers. Prefer the canonical workflow names.
  {
    name: "get_channel",
    description: "Backward-compatible alias for get_workflow.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Workflow id." } },
      required: ["id"],
    },
    handler: getChannel,
  },
  {
    name: "run_channel",
    description: "Backward-compatible alias for run_workflow.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Workflow id." } },
      required: ["id"],
    },
    handler: runChannel,
  },
  {
    name: "approve_gate",
    description: "Backward-compatible alias for approve_workflow_gate.",
    inputSchema: {
      type: "object",
      properties: {
        channelId: { type: "string", description: "Workflow id." },
        nodeId: { type: "string", description: "Gate node id to approve." },
      },
      required: ["channelId", "nodeId"],
    },
    handler: approveGate,
  },
];

const TOOL_MAP = new Map(TOOLS.map((t) => [t.name, t]));

export { TOOLS, TOOL_MAP };

// ---------------------------------------------------------------------------
// JSON-RPC 2.0 stdio transport
// ---------------------------------------------------------------------------

function respond(id, result) {
  const message = JSON.stringify({ jsonrpc: "2.0", id, result });
  process.stdout.write(message + "\n");
}

function respondError(id, code, message, data) {
  const payload = { jsonrpc: "2.0", id, error: { code, message } };
  if (data !== undefined) payload.error.data = data;
  process.stdout.write(JSON.stringify(payload) + "\n");
}

async function dispatch(message) {
  const { id, method, params } = message;

  // MCP initialization handshake
  if (method === "initialize") {
    return respond(id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "gtm-ide", version: "0.1.0" },
    });
  }

  if (method === "notifications/initialized") {
    // No response needed for notifications.
    return;
  }

  if (method === "tools/list") {
    return respond(id, {
      tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
    });
  }

  if (method === "tools/call") {
    const toolName = params?.name;
    const args = params?.arguments ?? {};
    const tool = TOOL_MAP.get(toolName);
    if (!tool) {
      return respond(id, {
        content: [{ type: "text", text: `Unknown tool: ${toolName}` }],
        isError: true,
      });
    }
    try {
      const result = await tool.handler(args);
      return respond(id, {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      });
    } catch (err) {
      const isBrainDown = err.message?.includes("fetch failed") || err.message?.includes("ECONNREFUSED");
      const text = isBrainDown
        ? "GTM IDE brain not running. Start with: npm start"
        : String(err.message ?? err);
      return respond(id, {
        content: [{ type: "text", text }],
        isError: true,
      });
    }
  }

  // Pings
  if (method === "ping") {
    return respond(id, {});
  }

  // Unknown method
  if (id !== undefined && id !== null) {
    respondError(id, -32601, `Method not found: ${method}`);
  }
}

export { dispatch };

// ---------------------------------------------------------------------------
// Main loop — read newline-delimited JSON from stdin
// ---------------------------------------------------------------------------

function main() {
  let buffer = "";

  process.stdin.setEncoding("utf8");

  process.stdin.on("data", (chunk) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop(); // keep incomplete trailing line
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let message;
      try {
        message = JSON.parse(trimmed);
      } catch {
        respondError(null, -32700, "Parse error");
        continue;
      }
      dispatch(message).catch((err) => {
        respondError(message?.id ?? null, -32603, "Internal error", String(err));
      });
    }
  });

  process.stdin.on("end", () => {
    // Flush any remaining buffer content.
    if (buffer.trim()) {
      let message;
      try { message = JSON.parse(buffer.trim()); } catch { return; }
      dispatch(message).catch(() => {});
    }
  });

  process.stderr.write("GTM IDE MCP server ready (stdio)\n");
}

// Only start the stdio transport when run directly, so the module can be
// imported (e.g. by tests) without hijacking stdin.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
