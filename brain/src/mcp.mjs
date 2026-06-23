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

/**
 * mutate_channel — disabled compatibility path.
 * Agent graph edits must be staged through the resident operator's proposal flow.
 */
async function mutateChannel({ channelId, command }) {  // eslint-disable-line no-unused-vars
  return {
    ok: false,
    error: "Direct MCP graph mutation is disabled. Start or resume an operator session and use propose_graph_changes so the founder can review the preview before it is applied.",
  };
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

async function createChannel(input) {
  return brainPost("/api/program-workflows", input);
}

async function createWorkflow(input) {
  return brainPost("/api/program-workflows", input);
}

async function duplicateChannel({ channelId, ...input }) {
  return duplicateWorkflow({ workflowId: channelId, ...input });
}

async function duplicateWorkflow({ workflowId, ...input }) {
  return brainPost(`/api/program-workflows/${encodeURIComponent(workflowId)}/duplicate`, input);
}

async function updateChannel({ channelId, ...patch }) {
  return updateWorkflow({ workflowId: channelId, ...patch });
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

async function listOpportunities({ projectId }) {
  return brainGet(`/api/projects/${encodeURIComponent(projectId)}/opportunities`);
}

async function generateOpportunities({ projectId }) {
  return brainPost(`/api/projects/${encodeURIComponent(projectId)}/opportunities/generate`, {});
}

async function reviewOpportunity({ projectId, opportunityId, patch }) {
  return brainPost(
    `/api/projects/${encodeURIComponent(projectId)}/opportunities/${encodeURIComponent(opportunityId)}`,
    { patch },
  );
}

async function composeOpportunityChannel({ projectId, ...input }) {
  return brainPost(`/api/projects/${encodeURIComponent(projectId)}/compose`, input);
}

// ---------------------------------------------------------------------------
// Tool registry
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: "list_projects",
    description: "List repository-backed GTM projects and identify the active product scope.",
    inputSchema: { type: "object", properties: {}, required: [] },
    handler: listProjects,
  },
  {
    name: "create_project",
    description: "Create and activate a project by scanning a local repository and its real win event.",
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
    description: "Switch the active product project. Channels, opportunities, and shared intelligence follow this scope.",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string" } },
      required: ["projectId"],
    },
    handler: activateProject,
  },
  {
    name: "list_opportunities",
    description: "Inspect durable channel and agent opportunities for a project, including evidence origin and founder review status.",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string" } },
      required: ["projectId"],
    },
    handler: listOpportunities,
  },
  {
    name: "generate_opportunities",
    description: "Generate code-derived and explicitly speculative channel and agent opportunities for a project.",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string" } },
      required: ["projectId"],
    },
    handler: generateOpportunities,
  },
  {
    name: "review_opportunity",
    description: "Edit or mark one channel or agent opportunity accepted, rejected, deferred, or proposed.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        opportunityId: { type: "string" },
        patch: { type: "object" },
      },
      required: ["projectId", "opportunityId", "patch"],
    },
    handler: reviewOpportunity,
  },
  {
    name: "compose_opportunity_channel",
    description: "Compose an accepted channel and accepted agents into a validated gated workflow with input, output, measure, and feedback steps.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        channelOpportunityId: { type: "string" },
        agentOpportunityIds: { type: "array", items: { type: "string" } },
        name: { type: "string" },
        objective: { type: "string" },
        input: { type: "object" },
        output: { type: "object" },
      },
      required: ["projectId", "channelOpportunityId", "agentOpportunityIds"],
    },
    handler: composeOpportunityChannel,
  },
  {
    name: "list_workflows",
    description: "List all outcome-program workflows in the current project. Returns id, program id, status, run history, and graph shape metadata.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
    handler: listWorkflows,
  },
  {
    name: "list_channels",
    description: "Compatibility alias for list_workflows.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
    handler: listChannels,
  },
  {
    name: "create_workflow",
    description: "Create a blank outcome-program workflow. Channel is stored only as workflow metadata.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        objective: { type: "string" },
        kind: { type: "string" },
      },
      required: ["name", "objective"],
    },
    handler: createWorkflow,
  },
  {
    name: "create_channel",
    description: "Compatibility alias for create_workflow.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        objective: { type: "string" },
        kind: { type: "string" },
      },
      required: ["name", "objective"],
    },
    handler: createChannel,
  },
  {
    name: "duplicate_workflow",
    description: "Duplicate an existing outcome-program workflow into a separately editable program-backed workflow.",
    inputSchema: {
      type: "object",
      properties: {
        workflowId: { type: "string" },
        name: { type: "string" },
        objective: { type: "string" },
      },
      required: ["workflowId", "name"],
    },
    handler: duplicateWorkflow,
  },
  {
    name: "duplicate_channel",
    description: "Compatibility alias for duplicate_workflow.",
    inputSchema: {
      type: "object",
      properties: {
        channelId: { type: "string" },
        name: { type: "string" },
        objective: { type: "string" },
      },
      required: ["channelId", "name"],
    },
    handler: duplicateChannel,
  },
  {
    name: "update_workflow",
    description: "Rename, clarify, classify, enable, or archive a program-backed workflow.",
    inputSchema: {
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
    handler: updateWorkflow,
  },
  {
    name: "update_channel",
    description: "Compatibility alias for update_workflow.",
    inputSchema: {
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
    handler: updateChannel,
  },
  {
    name: "get_workflow",
    description: "Get the full graph definition and last run result for an outcome-program workflow.",
    inputSchema: {
      type: "object",
      properties: {
        workflowId: { type: "string", description: "Workflow id" },
      },
      required: ["workflowId"],
    },
    handler: getWorkflow,
  },
  {
    name: "get_channel",
    description: "Compatibility alias for get_workflow.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Workflow/channel id" },
      },
      required: ["id"],
    },
    handler: getChannel,
  },
  {
    name: "run_workflow",
    description: "Run the full workflow graph. Returns the run result with per-node output, items, and any pending gates.",
    inputSchema: {
      type: "object",
      properties: {
        workflowId: { type: "string", description: "Workflow id" },
      },
      required: ["workflowId"],
    },
    handler: runWorkflow,
  },
  {
    name: "run_channel",
    description: "Compatibility alias for run_workflow.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Workflow/channel id" },
      },
      required: ["id"],
    },
    handler: runChannel,
  },
  {
    name: "run_workflow_node",
    description: "Run one workflow node and its dependencies. Returns that node's result.",
    inputSchema: {
      type: "object",
      properties: {
        workflowId: { type: "string", description: "Workflow id" },
        nodeId: { type: "string", description: "Node id to run (e.g. 'source-1')" },
      },
      required: ["workflowId", "nodeId"],
    },
    handler: runWorkflowNode,
  },
  {
    name: "run_node",
    description: "Compatibility alias for run_workflow_node.",
    inputSchema: {
      type: "object",
      properties: {
        channelId: { type: "string", description: "Workflow/channel id" },
        nodeId: { type: "string", description: "Node id to run (e.g. 'source-1')" },
      },
      required: ["channelId", "nodeId"],
    },
    handler: runNode,
  },
  {
    name: "approve_workflow_gate",
    description: "Approve a pending founder gate node to unblock and continue a paused workflow run.",
    inputSchema: {
      type: "object",
      properties: {
        workflowId: { type: "string", description: "Workflow id" },
        nodeId: { type: "string", description: "Gate node id to approve" },
      },
      required: ["workflowId", "nodeId"],
    },
    handler: approveWorkflowGate,
  },
  {
    name: "approve_gate",
    description: "Compatibility alias for approve_workflow_gate.",
    inputSchema: {
      type: "object",
      properties: {
        channelId: { type: "string", description: "Workflow/channel id" },
        nodeId: { type: "string", description: "Gate node id to approve" },
      },
      required: ["channelId", "nodeId"],
    },
    handler: approveGate,
  },
  {
    name: "get_workflow_items",
    description: "Get the items array from the last workflow run for a specific node.",
    inputSchema: {
      type: "object",
      properties: {
        workflowId: { type: "string", description: "Workflow id" },
        nodeId: { type: "string", description: "Node id" },
      },
      required: ["workflowId", "nodeId"],
    },
    handler: getWorkflowItems,
  },
  {
    name: "get_items",
    description: "Compatibility alias for get_workflow_items.",
    inputSchema: {
      type: "object",
      properties: {
        channelId: { type: "string", description: "Workflow/channel id" },
        nodeId: { type: "string", description: "Node id" },
      },
      required: ["channelId", "nodeId"],
    },
    handler: getItems,
  },
  {
    name: "mutate_channel",
    description: "Disabled compatibility path. Agent graph edits must go through the resident operator proposal flow for founder review.",
    inputSchema: {
      type: "object",
      properties: {
        channelId: { type: "string", description: "Workflow/channel id" },
        command: { type: "string", description: "Natural language mutation command" },
      },
      required: ["channelId", "command"],
    },
    handler: mutateChannel,
  },
  {
    name: "get_shared_context",
    description: "Read product truth, positioning, ICP, founder taste, contacts, outcomes, experiments, artifacts, and product feedback shared across all channels.",
    inputSchema: { type: "object", properties: {}, required: [] },
    handler: getSharedContext,
  },
  {
    name: "update_shared_context",
    description: "Update shared GTM intelligence used across every channel. Inferred ideas must remain marked inferred.",
    inputSchema: {
      type: "object",
      properties: { patch: { type: "object" } },
      required: ["patch"],
    },
    handler: updateSharedContext,
  },
  {
    name: "list_operator_sessions",
    description: "List durable resident GTM operator sessions and their current status.",
    inputSchema: { type: "object", properties: {}, required: [] },
    handler: listOperatorSessions,
  },
  {
    name: "start_operator_session",
    description: "Give the resident GTM operator a goal. It will inspect, patch, validate, run, debug, and pause at founder gates.",
    inputSchema: {
      type: "object",
      properties: {
        goal: { type: "string", description: "The market outcome or GTM problem to work." },
        workflowId: { type: "string", description: "Optional workflow id." },
        channelId: { type: "string", description: "Optional compatibility workflow/channel id." },
      },
      required: ["goal"],
    },
    handler: startOperatorSession,
  },
  {
    name: "get_operator_session",
    description: "Inspect one durable operator session, including its event trail, pending question, or pending founder gate.",
    inputSchema: {
      type: "object",
      properties: { sessionId: { type: "string" } },
      required: ["sessionId"],
    },
    handler: getOperatorSession,
  },
  {
    name: "resume_operator_session",
    description: "Resume a paused or interrupted operator session with explicit founder direction. Founder gates must be resolved in GTM IDE.",
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
    description: "Stop a resident operator session while preserving its durable history.",
    inputSchema: {
      type: "object",
      properties: { sessionId: { type: "string" } },
      required: ["sessionId"],
    },
    handler: cancelOperatorSession,
  },
];

const TOOL_MAP = new Map(TOOLS.map((t) => [t.name, t]));

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

// ---------------------------------------------------------------------------
// Main loop — read newline-delimited JSON from stdin
// ---------------------------------------------------------------------------

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
