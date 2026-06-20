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

async function runNode(node, upstream, context, store, approvals = {}) {
  // Resource nodes: declaration only, no execution
  if (node.category === "resource") {
    return { nodeId: node.id, category: node.category, ok: true, items: [], meta: { declaration: true } };
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
  if (connector.meta.envKey && !process.env[connector.meta.envKey] && !connector.meta.stub) {
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

export async function runGraph(graph, opts = {}) {
  const { store, targetNodeId, approvals = {} } = opts;
  const { nodes, edges, id: graphId } = graph;

  const runId = `run-${Date.now()}`;
  const nodeMap   = new Map(nodes.map((n) => [n.id, n]));
  const execOrder = topoSort(nodes, edges);
  const allowedNodes = relatedNodes(targetNodeId, nodes, edges);
  const nodeResults = new Map();
  const pendingGates = [];

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
    const result = await runNode(node, [], {}, store, approvals);
    nodeResults.set(nodeId, result);
  }

  // Step 2: execute data-flow nodes in topological order (skipping context)
  for (const nodeId of execOrder) {
    const node = nodeMap.get(nodeId);
    if (!node || node.category === "context" || !allowedNodes.has(nodeId)) continue;
    if (nodeResults.has(nodeId)) continue;

    const upstream = resolveUpstream(nodeId, edges, nodeResults);
    const context  = resolveContext(nodeId, edges, nodeResults);

    const result = await runNode(node, upstream, context, store, approvals);
    nodeResults.set(nodeId, result);

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
        nodeResults.set(downstreamId, {
          nodeId: downstreamId,
          category: nodeMap.get(downstreamId)?.category ?? "unknown",
          ok: false,
          blocked: true,
          items: [],
          error: `Blocked because upstream node "${node.label}" failed.`,
        });
      }
    }
  }

  // Step 3: preserve feedback relationships without pretending to execute them
  const feedbackEdges = edges.filter((e) => e.edgeType === "feedback");

  const results = Object.fromEntries(nodeResults.entries());
  const ok = Array.from(nodeResults.values()).every((r) => r.ok && !r.pendingReview);

  return {
    runId,
    graphId: graphId ?? "unknown",
    ok,
    nodes: results,
    executionOrder: execOrder,
    pendingGates,
    targetNodeId: targetNodeId ?? null,
    feedbackEdges: feedbackEdges.map((e) => ({ source: e.source, target: e.target, label: e.label })),
    error: ok ? undefined : "One or more nodes failed. See individual node results.",
  };
}

export { defaultGraphTemplate, listConnectors };
