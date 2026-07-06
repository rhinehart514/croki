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
  return brainPost("/api/channels", input);
}

async function duplicateWorkflow({ workflowId, ...input }) {
  return brainPost(`/api/channels/${encodeURIComponent(workflowId)}/duplicate`, input);
}

async function updateWorkflow({ workflowId, ...patch }) {
  return brainPost(`/api/channels/${encodeURIComponent(workflowId)}/update`, patch);
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
// Outcomes — a founder's real outcomes are the systems (channels/flows) on the
// canvas: each has a goal, a system, and a founder gate.
// ---------------------------------------------------------------------------

/**
 * list_outcomes — the Result-based outcome report (Phase 5): what actually happened, joined back to
 * the runs that produced it, folded into a per-path picture. Honest about what is still unmeasured.
 */
async function listOutcomes({ projectId } = {}) {
  const id = await resolveProjectId(projectId);
  return brainGet(`/api/projects/${encodeURIComponent(id)}/outcomes`);
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
 * get_outcome — one path's outcome readout (by path id or its plain-language summary) from the
 * Result-based report: how much was staged, how much drew a real outcome, and the count per kind.
 */
async function getOutcome({ outcomeId, projectId }) {
  const id = await resolveProjectId(projectId);
  const report = await brainGet(`/api/projects/${encodeURIComponent(id)}/outcomes`);
  const paths = Array.isArray(report.paths) ? report.paths : [];
  const one = paths.find((p) => p.pathId === outcomeId || p.pathSummary === outcomeId);
  if (one) return { projectId: id, path: one, totals: report.totals };
  return {
    error: `No outcome for "${outcomeId}" in project ${id}.`,
    available: paths.map((p) => ({ pathId: p.pathId, summary: p.pathSummary })),
  };
}

// ── The rebuilt GTM engine's founder rituals — thin HTTP clients to the brain routes ────────────────

/**
 * run_market_research — the buyer-side research ritual (Phase 1). Researches who buys, why, and where
 * they gather, persists the MarketObjects, and returns a plain-language summary. Never sends.
 */
async function runMarketResearchTool({ projectId } = {}) {
  const id = await resolveProjectId(projectId);
  return brainPost(`/api/projects/${encodeURIComponent(id)}/market-research`, {});
}

/**
 * compose_path_portfolio — generate the ranked portfolio of GTM paths (Phase 2) from the project's
 * product truth + buyer picture, persisting the paths so the reasoning canvas renders them.
 */
async function composePathPortfolioTool({ projectId } = {}) {
  const id = await resolveProjectId(projectId);
  return brainPost(`/api/projects/${encodeURIComponent(id)}/path-portfolio`, {});
}

/**
 * promote_run — turn a proven run into a repeatable motion (Phase 6). Still stops at the founder gate
 * on every re-run; never auto-sends. An absent cadence leaves the motion manual.
 */
async function promoteRunTool({ runId, cadence, projectId } = {}) {
  const id = await resolveProjectId(projectId);
  return brainPost(`/api/projects/${encodeURIComponent(id)}/runs/${encodeURIComponent(runId)}/promote`, { cadence });
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

async function getBoard({ projectId } = {}) {
  const id = await resolveProjectId(projectId);
  return brainGet(`/api/projects/${encodeURIComponent(id)}/board`);
}

async function getBench({ projectId } = {}) {
  const id = await resolveProjectId(projectId);
  return brainGet(`/api/projects/${encodeURIComponent(id)}/bench`);
}

async function recordOutcomeTool({ projectId, runId, happened, learned } = {}) {
  const id = await resolveProjectId(projectId);
  return brainPost(`/api/projects/${encodeURIComponent(id)}/outcome`, { runId, happened, learned });
}

async function findReferences({ kind, id: refId, projectId }) {
  const id = await resolveProjectId(projectId);
  const params = new URLSearchParams({ kind: kind ?? "" });
  if (refId != null) params.set("id", String(refId));
  return brainGet(`/api/projects/${encodeURIComponent(id)}/references?${params.toString()}`);
}

// SUGGEST a grouping of existing motions into the arms of one belief test. The founder confirms it on
// the board; there is NO verdict tool on this surface (a verdict is the founder's hand alone). Never a
// precondition, never a gate — post-hoc context only.
async function groupExperiment({ projectId, targetLayer, hypothesis, heldConstant, arms }) {
  const id = await resolveProjectId(projectId);
  return brainPost(`/api/projects/${encodeURIComponent(id)}/experiments`, {
    experiment: { targetLayer, hypothesis, heldConstant, arms },
  });
}

// ---------------------------------------------------------------------------
// Tool registry
// ---------------------------------------------------------------------------

// One workflow-id schema, shared by canonical tools. The canonical noun is
// "workflow" (a channel's execution plan); "channel" is workflow
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

  // ── Outcomes — the Result-based report (Phase 5): what actually happened ─────
  {
    name: "list_outcomes",
    description: "Read the project's real outcomes: the report that folds the run ledger and the outcomes joined back to it into a per-path picture — how much was staged, how much drew a real outcome (reply/meeting/signup/… — an open set), and which path actually produced results, in plain language. Honest about what is still unmeasured; never a fabricated rate. Defaults to the active project; pass projectId to target another. Read-only.",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string", description: "Optional. Defaults to the active project." } },
      required: [],
    },
    handler: listOutcomes,
  },
  {
    name: "get_outcome",
    description: "Get one path's outcome readout — by its path id or its plain-language summary — from the Result-based report: how much was staged under that path, how much was measured, the count per outcome kind, and one plain sentence. Use after list_outcomes for a single path's detail. Defaults to the active project. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        outcomeId: { type: "string", description: "A path id, or the path's plain-language summary." },
        projectId: { type: "string", description: "Optional. Defaults to the active project." },
      },
      required: ["outcomeId"],
    },
    handler: getOutcome,
  },
  {
    name: "run_market_research",
    description: "Invoke the buyer-side research ritual for a project — the twin of scanning the repo. It researches who buys, the pain they feel, the now-trigger, where they gather, the message that lands, and the proof they need, cites each to a real source, labels each by how solid, and persists them as the project's buyer picture. Never invents buyer behavior; an unsourced claim is a flagged hypothesis. Defaults to the active project. Researches and stores only — it never sends, publishes, or charges.",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string", description: "Optional. Defaults to the active project." } },
      required: [],
    },
    handler: runMarketResearchTool,
  },
  {
    name: "compose_path_portfolio",
    description: "Generate the project's portfolio of go-to-market paths — a ranked set of distinct strategic bets built from the product truth (the scan) and the buyer picture (run_market_research first). Each path carries its bet, what it rests on, its risk, and its own measurement plan; ranking is deterministic code over the evidence each rests on. The paths persist, so the reasoning canvas renders them. Defaults to the active project. Composes and stores paths only — it never runs one and never reaches the outside world.",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string", description: "Optional. Defaults to the active project." } },
      required: [],
    },
    handler: composePathPortfolioTool,
  },
  {
    name: "promote_run",
    description: "Turn a proven run into a repeatable motion: it re-stages the run that worked on a cadence, keeps score, and STILL STOPS AT THE FOUNDER GATE every time — it never auto-sends. An absent or unparseable cadence leaves the motion manual (it keeps score but only re-runs when asked). Autonomy is never granted here. Defaults to the active project.",
    inputSchema: {
      type: "object",
      properties: {
        runId: { type: "string", description: "The id of the proven run to promote." },
        cadence: { type: "string", description: "Optional open cadence, e.g. 'weekly' or 'every 3 days'. Absent = manual." },
        projectId: { type: "string", description: "Optional. Defaults to the active project." },
      },
      required: ["runId"],
    },
    handler: promoteRunTool,
  },
  {
    name: "list_tool_proposals",
    description: "List a project's pending tool-birth proposals (deterministic procedures crystallized from repeated runs — gated and NEVER auto-born) plus the registered, callable self-built tools. Read-only: it routes the founder to a decision and does NOT approve or birth anything; birth is a founder action in the dashboard. Defaults to the active project.",
    inputSchema: { type: "object", properties: { projectId: { type: "string", description: "Optional. Defaults to the active project." } }, required: [] },
    handler: listToolProposals,
  },

  // ── Workflows — author (the channel's execution plan) ──────────────────────
  {
    name: "list_workflows",
    description: "List every workflow in the active project, with id, status, run history, and graph-shape metadata. Use to find a workflow id before getting, running, or editing one. Read-only.",
    inputSchema: { type: "object", properties: {}, required: [] },
    handler: listWorkflows,
  },
  {
    name: "create_workflow",
    description: "Create a blank channel/workflow, then shape its graph with founder-reviewed operations. Use to start a workflow from scratch. Channel is stored only as workflow metadata, not a separate object.",
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
    description: "Copy an existing workflow and its graph into a new, independently editable workflow. Use to fork a working workflow before experimenting. Does not run either workflow.",
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
    name: "get_board",
    description: "Read the GTM Board: the nine belief layers grouped Strategy (ICP, problem/trigger, positioning, offer), Motion (channels, staged work), and Loop (people, measure, learn). Each layer carries the current belief, how it is grounded (stated by the founder, gated, or derived from runs), a confidence and status (assumed/testing/validated/blind) DERIVED from real verdicts, approvals, and citations, and the experiments testing it. A layer with no signal honestly reports blind. Read-only; derived, never seeded, and never gates a run. Defaults to the active project.",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string", description: "Optional. Defaults to the active project." } },
      required: [],
    },
    handler: getBoard,
  },
  {
    name: "record_outcome",
    description: "Record what actually happened on a run, in the founder's own words — the manual way to close one real loop. `happened` is a plain label (got replies / booked calls / got paid / got ignored / got objections / other), optionally with a count; `learned` is the lesson the market taught. It writes a Result and its paired Learning through the existing outcome path and joins back to the run when it can. This records what ALREADY happened — it never sends, publishes, charges, or runs anything. Defaults to the active project.",
    inputSchema: {
      type: "object",
      properties: {
        runId: { type: "string", description: "Optional id of the run this outcome came from — joins the outcome back to what was sent when it matches a staged run." },
        happened: { type: "string", description: "A plain label of what happened: got replies / booked calls / got paid / got ignored / got objections / other. An object { label, count } is also accepted for a count." },
        learned: { type: "string", description: "Optional free text — what the market taught you." },
        projectId: { type: "string", description: "Optional. Defaults to the active project." },
      },
      required: ["happened"],
    },
    handler: recordOutcomeTool,
  },
  {
    name: "get_bench",
    description: "Read the agent bench: the whole roster of specialist agents as one lens over the run ledger. Each agent carries a role, its one-line job, and a track record DERIVED from real gate decisions — how many runs it produced a gated item in, and how many the founder approved, rejected, or edited. An agent that has never run reads honestly ('no runs yet'), never a seeded number. Agents with a track record sort first, most-approved on top. Read-only; derived, never seeded, and never gates a run. Defaults to the active project.",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string", description: "Optional. Defaults to the active project." } },
      required: [],
    },
    handler: getBench,
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
  {
    name: "group_experiment",
    description: "SUGGEST that two or more existing motions are really the ARMS of one belief test — e.g. that a PCO-outbound channel and a restaurant-outbound channel are two arms of one ICP experiment, the same pilot offer held constant. This only STATES the grouping as post-hoc context for the founder to confirm on the board; it never gates, triggers, or shapes a run, and it NEVER records a verdict (resolving the experiment is the founder's hand alone — there is no verdict tool here). Grouping must reflect a real strategic relationship, never auto-inferred from channel-name similarity. Defaults to the active project.",
    inputSchema: {
      type: "object",
      properties: {
        targetLayer: { type: "string", description: "The belief layer the arms test, e.g. \"market\" for an ICP experiment, \"positioning\", or \"offer\"." },
        hypothesis: { type: "string", description: "What the experiment is testing in one line (e.g. \"PCO owners convert on the pilot better than restaurants\")." },
        heldConstant: { type: "string", description: "What stays the same across every arm (e.g. \"$49 pilot\") — the control that makes the comparison fair." },
        arms: {
          type: "array",
          description: "The motions under test, one per arm.",
          items: {
            type: "object",
            properties: {
              label: { type: "string", description: "Human label for the arm (e.g. \"PCO Outbound\")." },
              channelId: { type: "string", description: "The channel this arm runs through, when it is a channel." },
              kind: { type: "string", description: "Arm kind; defaults to \"channel\"." },
            },
            required: ["label"],
          },
        },
        projectId: { type: "string", description: "Optional. Defaults to the active project." },
      },
      required: ["targetLayer", "arms"],
    },
    handler: groupExperiment,
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
    description: "Resume a paused or interrupted operator session with explicit founder direction. Use after get_operator_session shows a pending question. Founder gates themselves are resolved in Drover, not here.",
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
  {
    name: "report_friction",
    description: "File a dogfood report about Drover ITSELF — a bug, rough edge, or wish the founder hits mid-flow ('the gate card hid the citation', 'I wish the queue showed all ventures'). Use it the moment the complaint is uttered; don't make the founder switch tools. Writes an agent-readable markdown item into the product repo's dogfood/queue/ with the current project and pending-gate state auto-attached, for the nightly build loop to work into gated PRs. This is feedback about the PRODUCT and never touches GTM taste memory — judgments about a draft belong at the gate, not here.",
    inputSchema: {
      type: "object",
      properties: {
        report: { type: "string", description: "The friction, verbatim — what got in the way or what's wished for." },
        kind: { type: "string", enum: ["friction", "bug", "wish"], description: "Defaults to friction." },
        context: { type: "string", description: "What was happening when it hit (one or two sentences)." },
        projectId: { type: "string", description: "Project the founder was working in. Defaults to the active project." },
      },
      required: ["report"],
    },
    handler: (args) => brainPost("/api/friction", { ...args, source: "mcp" }),
  },
  {
    name: "request_feature",
    description: "Ask Drover to BUILD a new capability for itself — usable from any codebase, any session. The request is queued instantly, then a builder agent works it in an isolated branch of the Drover repo (one build at a time, tests run, work committed). The result is a dogfood/* branch WAITING for founder review — this tool can never merge, push, or ship anything. Use for 'Drover should be able to…' wishes; use report_friction for plain bug notes that don't need a build now.",
    inputSchema: {
      type: "object",
      properties: {
        report: { type: "string", description: "The feature, in the founder's words — what should Drover be able to do, and for what moment?" },
        context: { type: "string", description: "What the founder was doing when they wished for it (one or two sentences)." },
        projectId: { type: "string", description: "Project the founder was working in. Defaults to the active project." },
      },
      required: ["report"],
    },
    handler: (args) => brainPost("/api/feature-request", { ...args, source: "mcp" }),
  },
  {
    name: "get_dogfood_queue",
    description: "Read Drover's own dogfood queue — every friction report and feature request with its status (open, queued, building, ready-for-review, declined, interrupted, failed) and the dogfood/* branch when a build produced one. Use to answer 'what's in the queue / what's building / what's ready for my review'. Read-only.",
    inputSchema: { type: "object", properties: {}, required: [] },
    handler: () => brainGet("/api/friction"),
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
        ? "Drover brain not running. Start with: npm start"
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

  process.stderr.write("Drover MCP server ready (stdio)\n");
}

// Only start the stdio transport when run directly, so the module can be
// imported (e.g. by tests) without hijacking stdin.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
