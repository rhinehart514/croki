import { persistence } from "./persistence.mjs";
import { safeResolveFailuresForGraph } from "./failure-log.mjs";

const COLLECTION = "flows";

function safeId(value) {
  return String(value || "flow").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80);
}

function normalizeWorkRefs(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const refs = [];
  for (const raw of input) {
    const id = String(typeof raw === "string" ? raw : raw?.id ?? raw?.ref ?? "").trim();
    if (!id) continue;
    const typeValue = typeof raw === "string" ? null : raw?.type ?? raw?.kind ?? null;
    const type = String(typeValue ?? "").trim() || null;
    const key = `${type ?? ""}::${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({ type, id });
  }
  return refs;
}

function workContextFor(...sources) {
  const sourceFor = (key) => sources.find((source) => source && Object.prototype.hasOwnProperty.call(source, key));
  const questionSource = sourceFor("questionId");
  const participantSource = sourceFor("participantRefs");
  const productSource = sourceFor("productRefs");
  return {
    questionId: String(questionSource?.questionId ?? "").trim() || null,
    participantRefs: normalizeWorkRefs(participantSource?.participantRefs),
    productRefs: normalizeWorkRefs(productSource?.productRefs),
  };
}

function normalizeRunReceipt(run, graph = null) {
  if (!run || typeof run !== "object") return run;
  const resultContext = run.result?.workContext && typeof run.result.workContext === "object"
    ? run.result.workContext
    : run.result;
  const projectId = String(run.projectId ?? run.result?.projectId ?? run.result?.workContext?.projectId ?? "").trim() || null;
  return { ...run, ...(projectId ? { projectId } : {}), ...workContextFor(run, resultContext, graph) };
}

function graphSnapshot(graph) {
  return {
    revision: graph.revision ?? 0,
    name: graph.name,
    ...workContextFor(graph),
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
  const normalizedGraph = graph ? { ...graph, ...workContextFor(graph) } : graph;
  return {
    graph: normalizedGraph,
    runs: (stored.runs || []).map((run) => normalizeRunReceipt(run, normalizedGraph)),
    updatedAt: stored.updatedAt || null,
  };
}

export function saveFlow(graph, options = {}) {
  const current = loadFlow(graph.id, graph, options);
  const updatedAt = new Date().toISOString();
  const durable = {
    graph: {
      ...graph,
      ...workContextFor(graph),
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
  const explicitResultContext = result?.workContext && typeof result.workContext === "object"
    ? result.workContext
    : result;
  const workContext = workContextFor(explicitResultContext, options.workContext, graph, current.graph);
  const projectId = String(options.projectId ?? result?.projectId ?? result?.workContext?.projectId ?? graph?.projectId ?? "").trim() || null;
  const runs = [...current.runs, {
    id: result.runId,
    ...(projectId ? { projectId } : {}),
    createdAt,
    ok: result.ok,
    targetNodeId: result.targetNodeId,
    pendingGates: result.pendingGates,
    ...workContext,
    graphSnapshot: graphSnapshot(graph),
    result,
  }].slice(-50);
  const durable = {
    graph: {
      ...graph,
      ...workContextFor(graph, current.graph),
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
  safeResolveFailuresForGraph(graph.id, result, options);
  return durable;
}
