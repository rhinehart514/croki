import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function root(options = {}) {
  return options.root || process.env.GTM_IDE_HOME || path.join(os.homedir(), ".gtm-ide");
}

function safeId(value) {
  return String(value || "flow").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80);
}

function fileFor(graphId, options = {}) {
  return path.join(root(options), "flows", `${safeId(graphId)}.json`);
}

function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, file);
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
  const file = fileFor(graphId, options);
  if (!fs.existsSync(file)) {
    return {
      graph: fallback,
      runs: [],
      updatedAt: null,
    };
  }
  const stored = JSON.parse(fs.readFileSync(file, "utf8"));
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
  write(fileFor(graph.id, options), durable);
  return durable;
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
  write(fileFor(graph.id, options), durable);
  return durable;
}
