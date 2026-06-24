// GTM Graph runner — DAG execution engine.
// Venture doctrine: complete structure, partial activation, local state.
//
// Execution model:
//   1. Topological sort on DATA edges only (context + feedback edges are non-blocking).
//   2. Resource nodes are skipped (visual declarations only).
//   3. Context nodes resolve first, injected as context into downstream nodes.
//   4. Gate nodes pause execution — runner returns pendingGates for founder review.
//   5. Feedback edges are preserved as explicit future-learning relationships.

import { getConnector, defaultGraphTemplate, listConnectors } from "./connectors/registry.mjs";
import { defaultStepRuntime } from "./step-runners.mjs";
import { auditInput, auditOutput } from "./contracts.mjs";

// ─── Topological sort (Kahn's algorithm on data edges) ───────────────────────

function topoSort(nodes, edges) {
  const dataEdges = edges.filter((e) => e.edgeType === "data");
  const nodeIds   = new Set(nodes.map((n) => n.id));
  const inDegree  = new Map(nodes.map((n) => [n.id, 0]));
  const adjOut    = new Map(nodes.map((n) => [n.id, []]));

  for (const e of dataEdges) {
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) continue;
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
    adjOut.get(e.source)?.push(e.target);
  }

  const queue = nodes.filter((n) => (inDegree.get(n.id) ?? 0) === 0).map((n) => n.id);
  const order = [];

  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    for (const next of (adjOut.get(id) ?? [])) {
      const deg = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, deg);
      if (deg === 0) queue.push(next);
    }
  }

  return order;
}

function relatedNodes(targetNodeId, nodes, edges) {
  if (!targetNodeId) return new Set(nodes.map((node) => node.id));
  const allowed = new Set([targetNodeId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of edges) {
      if (edge.edgeType === "feedback") continue;
      if (allowed.has(edge.target) && !allowed.has(edge.source)) {
        allowed.add(edge.source);
        changed = true;
      }
    }
  }
  return allowed;
}

function descendants(nodeId, edges) {
  const found = new Set();
  const queue = [nodeId];
  while (queue.length) {
    const current = queue.shift();
    for (const edge of edges) {
      if (edge.edgeType !== "data" || edge.source !== current || found.has(edge.target)) continue;
      found.add(edge.target);
      queue.push(edge.target);
    }
  }
  return found;
}

// ─── Resolve context inputs for a node ───────────────────────────────────────

function resolveContext(nodeId, edges, nodeResults) {
  const contextEdges = edges.filter((e) => e.edgeType === "context" && e.target === nodeId);
  const ctx = {};
  for (const e of contextEdges) {
    const result = nodeResults.get(e.source);
    if (!result?.ok) continue;
    for (const item of result.items) {
      if (item.type === "context" && item.id) {
        ctx[item.id] = item;
      }
    }
  }
  return ctx;
}

// ─── Resolve upstream data items for a node ──────────────────────────────────

function resolveUpstream(nodeId, edges, nodeResults) {
  const dataEdges = edges.filter((e) => e.edgeType === "data" && e.target === nodeId);
  const items = [];
  for (const e of dataEdges) {
    const result = nodeResults.get(e.source);
    if (!result) continue;
    // Resource nodes produce no items — skip their output
    if (result.meta?.declaration) continue;
    items.push(...(result.items ?? []));
  }
  return items;
}

// ─── Run a single node ───────────────────────────────────────────────────────

async function runNode(node, upstream, context, store, opts = {}) {
  const { approvals = {}, decisions = {} } = opts;
  // Resource nodes: declaration only, no execution
  if (node.category === "resource") {
    return { nodeId: node.id, category: node.category, ok: true, items: [], meta: { declaration: true } };
  }

  // Open node kinds — the un-caging. A step that isn't a "tool" (a registered
  // connector) is an agent, skill, or code step the frontier agent composed. These
  // dispatch through the injectable step runtime, never the connector registry.
  const kind = node.kind ?? "tool";
  if (kind !== "tool") {
    const runner = opts.stepRuntime?.[kind];
    if (typeof runner !== "function") {
      return { nodeId: node.id, category: node.category, kind, ok: false, items: [], error: `No step runtime for kind "${kind}".` };
    }
    try {
      const result = await runner(node, upstream, context, store, opts);
      return { nodeId: node.id, category: node.category, kind, ...result };
    } catch (err) {
      return { nodeId: node.id, category: node.category, kind, ok: false, items: [], error: err.message };
    }
  }

  const connectorId = node.connector || "default";
  // Category takes precedence; fall back to connector id for legacy compatibility
  const connector = getConnector(node.category, connectorId)
    ?? getConnector(connectorId, connectorId)
    ?? null;

  if (!connector) {
    return {
      nodeId: node.id, category: node.category, ok: false, items: [],
      error: `No connector "${connectorId}" registered for category "${node.category}".`,
    };
  }

  // Check key requirement (skip for stubs)
  if (connector.meta.envKey
    && !process.env[connector.meta.envKey]
    && !node.config?.endpoint
    && !connector.meta.stub) {
    return {
      nodeId: node.id, category: node.category, ok: false, items: [],
      error: `${connector.meta.name} requires ${connector.meta.envKey}. Set it in your environment and restart.`,
    };
  }

  // Context nodes receive the node definition, not upstream data
  if (node.category === "context") {
    try {
      const result = await connector.run(node, upstream, context, store);
      return { nodeId: node.id, category: node.category, connector: connectorId, ...result };
    } catch (err) {
      return { nodeId: node.id, category: node.category, ok: false, items: [], error: err.message };
    }
  }

  // Data flow nodes: pass (node, upstream, context, store)
  try {
    // Legacy connectors expect (stage, upstream, context) — node has the same shape as stage
    const runtimeNode = {
      ...node,
      runtime: {
        approved: approvals[node.id] === true,
        decisions: decisions[node.id] ?? null,
      },
    };
    const result = await connector.run(runtimeNode, upstream, context, store);
    return {
      nodeId: node.id,
      category: node.category,
      connector: connectorId,
      ...result,
    };
  } catch (err) {
    return { nodeId: node.id, category: node.category, ok: false, items: [], error: err.message };
  }
}

// ─── Main graph runner ────────────────────────────────────────────────────────

// Runnable-entry invariant, enforced at the run path so it catches EVERY graph — freshly composed,
// operator-attached, or stale-persisted. A loop must not block at an empty source: if the entry
// source has no real items to stand on and can't fetch its own, drop it and let the agent it feeds
// be the self-sourcing entry (that agent finds its own candidates from public signals). Deterministic
// and idempotent, so a fresh run and a later gate-resume see the identical graph.
// When a loop is made self-sourcing, the rigid field contracts (accepts/emits) designed for a
// deterministic seed-list flow no longer fit: the discovery agent emits a generic candidate shape and
// each downstream agent enriches best-effort. Relax the FIELD contracts on every agent/code node on
// the path to a gate (item-flow via minItems is kept) so the chain isn't re-blocked node-by-node —
// the founder still reviews everything at the gate. This is what breaks the one-node-downstream
// whack-a-mole: a self-sourcing agent chain is best-effort, not contract-rigid.
function relaxPreGateContracts(nodes, edges) {
  const incoming = new Map();
  for (const e of edges) {
    if (!incoming.has(e.target)) incoming.set(e.target, []);
    incoming.get(e.target).push(e.source);
  }
  const gateIds = nodes.filter((n) => n.category === "gate").map((n) => n.id);
  const preGate = new Set();
  const stack = [...gateIds];
  while (stack.length) {
    const id = stack.pop();
    for (const src of incoming.get(id) ?? []) {
      if (!preGate.has(src)) { preGate.add(src); stack.push(src); }
    }
  }
  // Everything the founder gate feeds. Post-gate staging must trust the founder's approval, not
  // re-litigate the draft's field names — the gate IS the contract checkpoint.
  const postGate = new Set();
  for (const gateId of gateIds) for (const d of descendants(gateId, edges)) postGate.add(d);
  return nodes.map((n) => {
    // The gate is human review — it must NOT reject real drafts on a field-name technicality (the
    // draft carries `subject`/`body`/`to` while the contract demanded `decisionMaker`/`personalFact`).
    // Clear both sides of its contract: accept whatever the chain staged, and stop promising specific
    // output fields the human-approved item may not carry. Keep minItems 1 so it still pauses on ≥1 draft.
    if (n.category === "gate") return { ...n, contract: { ...(n.contract ?? {}), accepts: [], emits: [], minItems: 1 } };
    if (preGate.has(n.id) && (n.kind === "agent" || n.kind === "code")) {
      return { ...n, contract: { ...(n.contract ?? {}), accepts: [], emits: [] } };
    }
    // Post-gate execute (staging/send) trusts the approval: relax BOTH sides of its field contract.
    // Its input must not block an approved draft on a name mismatch, and its output must not promise
    // send-only fields (messageId/sentAt) that local staging honestly never produces. Measure is
    // deliberately left untouched so it stays honestly blind when the win event carries no source.
    if (postGate.has(n.id) && n.category === "execute") {
      return { ...n, contract: { ...(n.contract ?? {}), accepts: [], emits: [] } };
    }
    return n;
  });
}

function makeEntryRunnable(graph) {
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) return graph;
  const source = graph.nodes.find((n) => n.category === "source" && n.kind !== "agent");
  if (!source) return graph;
  const items = source.config?.items;
  const standsOnData =
    (Array.isArray(items) && items.length > 0)
    || source.connector === "api"
    || !!source.config?.endpoint
    || (source.connector === "csv" && !!source.config?.csv);
  if (standsOnData) return graph;
  const downstreamAgent = graph.edges
    .filter((e) => e.source === source.id)
    .map((e) => graph.nodes.find((n) => n.id === e.target))
    .find((n) => n && n.kind === "agent");
  if (!downstreamAgent) return graph;
  const edges = graph.edges
    .filter((e) => !(e.source === source.id && e.target === downstreamAgent.id))
    .map((e) => (e.target === source.id ? { ...e, target: downstreamAgent.id } : e));
  // The promoted agent is now the entry — it must run on ZERO upstream items and self-source. Clear
  // its incoming-item gate and reframe it for discovery (below); the pre-gate field contracts are then
  // relaxed so the generic candidate shape flows node-to-node without re-blocking.
  let nodes = graph.nodes
    .filter((n) => n.id !== source.id)
    .map((n) => (n.id === downstreamAgent.id
      ? {
          ...n,
          contract: { ...(n.contract ?? {}), accepts: [], minItems: 0 },
          // The agent's own instruction assumed a seed list to enrich; as the self-sourcing entry it
          // was handed nothing and returned 0 items. Reframe it for DISCOVERY so it finds its own
          // candidates from public signals + the product grounding (this is what a working outbound
          // source-agent does). Its original instruction runs second, on what it found.
          agentPrompt: `You are the DISCOVERY entry for this go-to-market loop and you were given NO seed list. Using the product grounding and ICP in your context plus WebSearch/WebFetch on real public sources, FIND 3-5 real, currently-active people or organizations that fit this product's ICP and have a recent public now-trigger.${typeof n.agentPrompt === "string" && n.agentPrompt.trim() ? ` Then apply your role: ${n.agentPrompt.trim()}` : ""} Return ONLY a JSON array of real, source-traceable candidates — each with a name/handle, a source url, and one line on why them. Invent nothing; if you can only verify 2, return 2.`,
        }
      : n));
  nodes = relaxPreGateContracts(nodes, edges);
  return { ...graph, nodes, edges };
}

export async function runGraph(graph, opts = {}) {
  graph = makeEntryRunnable(graph);
  const {
    store,
    targetNodeId,
    approvals = {},
    decisions = {},
    memory = null,
    grounding = null,
    runs = null,
    resumeResult = null,
    stepRuntime = defaultStepRuntime,
    onEvent = null,
  } = opts;
  const emit = typeof onEvent === "function" ? onEvent : () => {};
  const { nodes, edges, id: graphId } = graph;

  const runId = `run-${Date.now()}`;
  const nodeMap   = new Map(nodes.map((n) => [n.id, n]));
  const execOrder = topoSort(nodes, edges);
  const allowedNodes = relatedNodes(targetNodeId, nodes, edges);
  const nodeResults = new Map();
  const pendingGates = [];

  // A founder gate resumes the exact prepared artifacts that were reviewed.
  // Everything outside the pending gate and its descendants is restored from
  // the prior result, so live sources and generation do not silently rerun.
  if (resumeResult?.nodes && Array.isArray(resumeResult.pendingGates)) {
    const rerun = new Set(resumeResult.pendingGates);
    for (const gateId of resumeResult.pendingGates) {
      for (const descendantId of descendants(gateId, edges)) rerun.add(descendantId);
    }
    for (const [nodeId, result] of Object.entries(resumeResult.nodes)) {
      if (!nodeMap.has(nodeId) || rerun.has(nodeId) || !allowedNodes.has(nodeId)) continue;
      nodeResults.set(nodeId, result);
    }
  }

  if (execOrder.length !== nodes.length) {
    return {
      runId,
      graphId: graphId ?? "unknown",
      ok: false,
      nodes: {},
      executionOrder: execOrder,
      pendingGates: [],
      feedbackEdges: [],
      error: "The graph contains a data cycle and cannot run.",
    };
  }

  // Step 1: resolve and run context nodes first
  for (const nodeId of execOrder) {
    const node = nodeMap.get(nodeId);
    if (!node || node.category !== "context" || !allowedNodes.has(nodeId)) continue;
    if (nodeResults.has(nodeId)) continue;
    const result = await runNode(node, [], {}, store, { approvals, decisions, stepRuntime });
    nodeResults.set(nodeId, result);
  }

  // Step 2: execute data-flow nodes in topological order (skipping context)
  for (const nodeId of execOrder) {
    const node = nodeMap.get(nodeId);
    if (!node || node.category === "context" || !allowedNodes.has(nodeId)) continue;
    if (nodeResults.has(nodeId)) continue;

    const upstream = node.category === "gate" && resumeResult?.nodes?.[nodeId]?.items
      ? structuredClone(resumeResult.nodes[nodeId].items)
      : resolveUpstream(nodeId, edges, nodeResults);
    const context  = resolveContext(nodeId, edges, nodeResults);
    context.__run = {
      runId,
      originRunId: resumeResult?.runId ?? runId,
      graphId: graphId ?? "unknown",
    };
    // Inject loop memory (founder decisions from prior runs) for nodes that
    // generate reviewable artifacts. Connectors opt in by reading context.__memory.
    if (memory) context.__memory = memory;
    // Inject grounding and run-state so the context substrate (agent-bridge) can assemble a real
    // base layer for agent/skill steps. The assembler only renders a summary into the prompt, so
    // the full ledger never bloats the model call — just the cited product map and "what's tried".
    if (grounding) context.grounding = grounding;
    if (Array.isArray(runs)) context.__state = runs;

    // Stream the step lifecycle so the UI can animate the flow and reveal content
    // as each step succeeds (not one batch at the end).
    emit({ type: "node_start", nodeId, category: node.category, kind: node.kind ?? "tool", label: node.label });
    const inputAudit = auditInput(node, upstream);
    let result;
    if (inputAudit.state === "blocked" || inputAudit.state === "waiting") {
      result = {
        nodeId,
        category: node.category,
        kind: node.kind ?? "tool",
        ok: false,
        blocked: true,
        items: [],
        error: inputAudit.message,
        contractAudit: inputAudit,
      };
    } else if (inputAudit.state === "blind") {
      // Blind is honest, not fatal. Measurement that can't attribute (e.g. the win event carries no
      // source) is a real product gap, but it must not fail an otherwise-successful run — a fully
      // approved, staged run reads "completed", and Measure reports its gap separately. Let the node
      // run on what it has (it self-labels each item attributed/blind) and flag it blind, not blocked.
      result = await runNode(node, upstream, context, store, { approvals, decisions, stepRuntime });
      result = { ...result, ok: result.ok !== false, blind: true, contractAudit: inputAudit };
    } else {
      result = await runNode(node, upstream, context, store, { approvals, decisions, stepRuntime });
      const outputAudit = result.ok ? auditOutput(node, result.items ?? []) : inputAudit;
      result = { ...result, contractAudit: outputAudit };
      if (result.ok && outputAudit.state === "blocked") {
        result = { ...result, ok: false, blocked: true, error: outputAudit.message };
      }
    }
    nodeResults.set(nodeId, result);
    emit({ type: "node_done", nodeId, result });

    // Gate node: record as pending and continue (don't stop other branches)
    if (result.pendingReview) {
      pendingGates.push(nodeId);
      for (const downstreamId of descendants(nodeId, edges)) {
        if (!allowedNodes.has(downstreamId) || nodeResults.has(downstreamId)) continue;
        nodeResults.set(downstreamId, {
          nodeId: downstreamId,
          category: nodeMap.get(downstreamId)?.category ?? "unknown",
          ok: false,
          blocked: true,
          items: [],
          error: `Waiting for approval at "${node.label}".`,
        });
      }
    }

    // Stop this branch if a non-gate node fails
    if (!result.ok && node.category !== "gate") {
      for (const downstreamId of descendants(nodeId, edges)) {
        if (!allowedNodes.has(downstreamId) || nodeResults.has(downstreamId)) continue;
        const downstreamNode = nodeMap.get(downstreamId);
        const directlyConnected = edges.some((edge) =>
          edge.edgeType === "data" && edge.source === nodeId && edge.target === downstreamId
        );
        const downstreamAudit = directlyConnected && downstreamNode
          ? auditInput(downstreamNode, result.items ?? [])
          : null;
        nodeResults.set(downstreamId, {
          nodeId: downstreamId,
          category: downstreamNode?.category ?? "unknown",
          ok: false,
          blocked: true,
          items: [],
          ...(downstreamAudit ? { contractAudit: downstreamAudit } : {}),
          error: downstreamAudit && downstreamAudit.state !== "ready" && downstreamAudit.state !== "satisfied"
            ? downstreamAudit.message
            : `Blocked because upstream node "${node.label}" failed.`,
        });
      }
    }
  }

  // Step 3: preserve feedback relationships without pretending to execute them
  const feedbackEdges = edges.filter((e) => e.edgeType === "feedback");

  const results = Object.fromEntries(nodeResults.entries());
  // A blind node (measurement that can't attribute yet) is an honest gap, not a failure — it never
  // counts against the run. A pending gate does (the run isn't done until the founder decides).
  const ok = Array.from(nodeResults.values()).every((r) => (r.ok || r.blind) && !r.pendingReview);

  return {
    runId,
    graphId: graphId ?? "unknown",
    ok,
    nodes: results,
    executionOrder: execOrder,
    pendingGates,
    targetNodeId: targetNodeId ?? null,
    resumedFromRunId: resumeResult?.runId ?? null,
    feedbackEdges: feedbackEdges.map((e) => ({ source: e.source, target: e.target, label: e.label })),
    error: ok ? undefined : "One or more nodes failed. See individual node results.",
  };
}

export { defaultGraphTemplate, listConnectors };
