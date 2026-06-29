import { persistence } from "./persistence.mjs";

const COLLECTION = "flows";

function safeId(value) {
  return String(value || "flow").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80);
}

function graphSnapshot(graph) {
  return {
    revision: graph.revision ?? 0,
    name: graph.name,
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      category: node.category,
      connector: node.connector ?? null,
      label: node.label,
      config: node.config ?? {},
      agentPrompt: node.agentPrompt ?? "",
    })),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      edgeType: edge.edgeType,
      label: edge.label ?? null,
    })),
  };
}

export function loadFlow(graphId, fallback, options = {}) {
  const stored = persistence(options).get(COLLECTION, safeId(graphId));
  if (!stored) {
    return {
      graph: fallback,
      runs: [],
      updatedAt: null,
    };
  }
  const graph = fallback?.version && stored.graph?.version !== fallback.version
    ? {
        ...fallback,
        store: {
          path: `.gtm/flows/${safeId(fallback.id)}.json`,
          runs: stored.runs?.length ?? 0,
          lastRunAt: stored.runs?.at(-1)?.createdAt,
        },
      }
    : stored.graph || fallback;
  return {
    graph,
    runs: stored.runs || [],
    updatedAt: stored.updatedAt || null,
  };
}

export function saveFlow(graph, options = {}) {
  const current = loadFlow(graph.id, graph, options);
  const updatedAt = new Date().toISOString();
  const durable = {
    graph: {
      ...graph,
      store: {
        path: `.gtm/flows/${safeId(graph.id)}.json`,
        runs: current.runs.length,
        lastRunAt: current.runs.at(-1)?.createdAt,
      },
    },
    runs: current.runs,
    updatedAt,
  };
  persistence(options).set(COLLECTION, safeId(graph.id), durable);
  return durable;
}

// Summarize a persisted run's per-node results into a compact, founder-facing shape: the total
// items the channel produced and a per-category breakdown. This is the "results back" signal the
// portfolio overview needs without shipping the whole run ledger to the client. Derived from real
// node output only — a run that produced nothing reports zero, never a seeded number.
export function summarizeRunResult(run) {
  const nodes = run?.result?.nodes ?? {};
  const byCategory = {};
  let produced = 0;
  for (const node of Object.values(nodes)) {
    const count = node.items?.length ?? 0;
    if (!count) continue;
    byCategory[node.category] = (byCategory[node.category] ?? 0) + count;
    produced += count;
  }
  return { produced, byCategory };
}

export function recordFlowRun(graph, result, options = {}) {
  const current = loadFlow(graph.id, graph, options);
  const createdAt = new Date().toISOString();
  const runs = [...current.runs, {
    id: result.runId,
    createdAt,
    ok: result.ok,
    targetNodeId: result.targetNodeId,
    pendingGates: result.pendingGates,
    graphSnapshot: graphSnapshot(graph),
    result,
  }].slice(-50);
  const durable = {
    graph: {
      ...graph,
      store: {
        path: `.gtm/flows/${safeId(graph.id)}.json`,
        runs: runs.length,
        lastRunAt: createdAt,
      },
    },
    runs,
    updatedAt: createdAt,
  };
  persistence(options).set(COLLECTION, safeId(graph.id), durable);
  return durable;
}
