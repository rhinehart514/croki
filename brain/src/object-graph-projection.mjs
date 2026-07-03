import {
  productTruthStore,
  marketObjectStore,
  gtmPathStore,
  measurementContractStore,
} from "./gtm-store.mjs";
import { objectGraphStore, normalizeObjectEdge, normalizeObjectNode, genObjectGraphId } from "./object-graph-store.mjs";
import { marketObjectToNode } from "./graph-intelligence/spray.mjs";
import { deriveWeaknessForGraph } from "./graph-intelligence/weakness.mjs";
import { recommend } from "./graph-intelligence/path-ranking.mjs";
import { now } from "./store-fs.mjs";

function sourceRef(kind, ref, preview) {
  return { kind, ref, preview: preview || ref, at: now() };
}

function objectIdForRecord(id) {
  return `obj-${id}`;
}

function productTruthToNode(truth, { projectId }) {
  return normalizeObjectNode({
    id: objectIdForRecord(truth.id),
    projectId,
    domain: "product",
    type: "capability",
    maturity: "typed",
    statement: truth.statement,
    evidence: truth.evidence,
    sources: (truth.evidence ?? []).map((item) => sourceRef("scan", item.source || truth.id, item.notes || item.claim || truth.statement)),
    origin: "scan",
    originRef: truth.id,
    payload: { productTruthId: truth.id, citations: (truth.evidence ?? []).map((item) => ({ source: item.source, text: item.notes })) },
  });
}

function measurementContractToNode(contract, { projectId }) {
  return normalizeObjectNode({
    id: objectIdForRecord(contract.id),
    projectId,
    domain: "measurement",
    type: "contract",
    maturity: "execution",
    statement: contract.successCriteria || `Measure ${contract.outcomeKinds?.join(", ") || "this path"}`,
    evidence: [],
    sources: [sourceRef("run", contract.id, "stored measurement contract")],
    origin: "run",
    originRef: contract.id,
    payload: {
      measurementContractId: contract.id,
      outcomeKinds: contract.outcomeKinds ?? [],
      sources: contract.sources ?? [],
      joinKey: contract.joinKey ?? null,
      successCriteria: contract.successCriteria ?? null,
      pathId: contract.pathId ?? null,
    },
  });
}

function pathToNode(path, { projectId }) {
  const restsOn = (path.restsOn ?? []).map((ref) => {
    const id = typeof ref === "string" ? ref : ref?.id;
    return id ? { type: ref?.type ?? null, id: objectIdForRecord(id), sourceId: id } : null;
  }).filter(Boolean);
  return normalizeObjectNode({
    id: objectIdForRecord(path.id),
    projectId,
    domain: "runs",
    type: "path",
    maturity: "typed",
    statement: path.summary,
    evidence: [],
    sources: [sourceRef("run", path.id, "stored GTM path")],
    origin: "spray",
    originRef: path.id,
    payload: {
      gtmPathId: path.id,
      bet: path.bet ?? {},
      restsOn,
      rankingSignals: path.rankingSignals ?? {},
      risk: path.risk ?? null,
      measurementContractId: path.measurementContractId ? objectIdForRecord(path.measurementContractId) : null,
    },
  });
}

function addEdge(edges, seen, input) {
  const key = `${input.source}\0${input.target}\0${input.type}`;
  if (seen.has(key)) return;
  seen.add(key);
  edges.push(normalizeObjectEdge({
    id: input.id || genObjectGraphId("edge"),
    projectId: input.projectId,
    source: input.source,
    target: input.target,
    type: input.type,
    status: input.status || "proposed",
    basis: input.basis,
    confidence: input.confidence ?? 100,
    label: input.label,
  }));
}

function projectedEdges(nodes, { projectId }) {
  const ids = new Set(nodes.map((node) => node.id));
  const edges = [];
  const seen = new Set();
  for (const pathNode of nodes.filter((node) => node.domain === "runs" && node.type === "path")) {
    for (const ref of pathNode.payload?.restsOn ?? []) {
      if (!ids.has(ref.id)) continue;
      addEdge(edges, seen, {
        projectId,
        source: ref.id,
        target: pathNode.id,
        type: "supports",
        basis: [sourceRef("run", pathNode.originRef, "path rests on this card")],
      });
      const rested = nodes.find((node) => node.id === ref.id);
      if (rested?.domain === "market" || rested?.domain === "audience") {
        addEdge(edges, seen, {
          projectId,
          source: pathNode.id,
          target: ref.id,
          type: "targets",
          basis: [sourceRef("run", pathNode.originRef, "path targets this market card")],
        });
      } else {
        addEdge(edges, seen, {
          projectId,
          source: pathNode.id,
          target: ref.id,
          type: "uses",
          basis: [sourceRef("run", pathNode.originRef, "path uses this product proof")],
        });
      }
    }
    if (pathNode.payload?.measurementContractId && ids.has(pathNode.payload.measurementContractId)) {
      addEdge(edges, seen, {
        projectId,
        source: pathNode.id,
        target: pathNode.payload.measurementContractId,
        type: "measured_by",
        basis: [sourceRef("run", pathNode.originRef, "path measurement contract")],
      });
    }
  }
  return edges;
}

function mergeNodes(existing, projected) {
  const byId = new Map();
  for (const node of projected) byId.set(node.id, node);
  for (const node of existing) byId.set(node.id, node);
  return [...byId.values()];
}

function mergeEdges(existing, projected) {
  const byTriple = new Map();
  for (const edge of projected) byTriple.set(`${edge.source}\0${edge.target}\0${edge.type}`, edge);
  for (const edge of existing) byTriple.set(`${edge.source}\0${edge.target}\0${edge.type}`, edge);
  return [...byTriple.values()];
}

export function objectGraphForProject(projectId = "default", options = {}) {
  const stored = objectGraphStore.load(projectId, options);
  const productNodes = productTruthStore.list({ ...options, projectId }).map((truth) => productTruthToNode(truth, { projectId }));
  const marketNodes = marketObjectStore.list({ ...options, projectId }).map((object) => marketObjectToNode(object, { projectId }));
  const pathNodes = gtmPathStore.list({ ...options, projectId }).map((path) => pathToNode(path, { projectId }));
  const contractNodes = measurementContractStore.list({ ...options, projectId }).map((contract) => measurementContractToNode(contract, { projectId }));
  const projectedNodes = [...productNodes, ...marketNodes, ...pathNodes, ...contractNodes];
  const nodes = mergeNodes(stored.nodes ?? [], projectedNodes);
  const edges = mergeEdges(stored.edges ?? [], projectedEdges(nodes, { projectId }));
  const graph = deriveWeaknessForGraph({
    schemaVersion: 1,
    projectId,
    nodes,
    edges,
    revision: stored.revision ?? 0,
    updatedAt: now(),
  });
  return {
    graph,
    recommendation: recommend(graph),
  };
}
