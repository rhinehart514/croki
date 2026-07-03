import { OBJECT_EDGE_TYPES, normalizeObjectEdge, genObjectGraphId } from "../object-graph-store.mjs";
import { now } from "../store-fs.mjs";

export const INFER_EDGES_PROMPT = `Infer typed causal edges between GTM object graph cards.
Return ONLY JSON edges: [{ "source": "node id", "target": "node id", "type": "supports|weakens|belongs_to|leads_to|targets|uses|measured_by|produced|blocked_by|derived_from|promoted_to|updates", "confidence": 0.0, "cites": ["node id"], "clause": "one plain clause" }].
Only cite ids present in the grounding. Unknown edge types will be routed by code to the nearest known graph mechanic.`;

const TYPE_ALIASES = new Map([
  ["backs", "supports"],
  ["supports_claim", "supports"],
  ["contradicts", "weakens"],
  ["part_of", "belongs_to"],
  ["member_of", "belongs_to"],
  ["causes", "leads_to"],
  ["converts_to", "leads_to"],
  ["aims_at", "targets"],
  ["depends_on", "uses"],
  ["consumes", "uses"],
  ["measures", "measured_by"],
  ["creates", "produced"],
  ["blocks", "blocked_by"],
  ["from", "derived_from"],
  ["derived", "derived_from"],
  ["promotes", "promoted_to"],
  ["changes", "updates"],
]);

export function routeEdgeType(raw) {
  const type = String(raw ?? "").trim().toLowerCase();
  if (OBJECT_EDGE_TYPES.includes(type)) return type;
  return TYPE_ALIASES.get(type) ?? "derived_from";
}

function toSourceRef(ref, nodeById, clause) {
  const node = nodeById.get(ref);
  if (!node) return null;
  return {
    kind: node.origin || "object",
    ref: node.id,
    preview: clause || node.statement || node.id,
    at: now(),
  };
}

export function validateInferredEdges(rawEdges = [], graph = {}) {
  const nodeById = new Map((graph.nodes ?? []).map((node) => [node.id, node]));
  const seen = new Map();
  for (const raw of Array.isArray(rawEdges) ? rawEdges : []) {
    const source = String(raw?.source ?? "").trim();
    const target = String(raw?.target ?? "").trim();
    if (!source || !target || source === target) continue;
    if (!nodeById.has(source) || !nodeById.has(target)) continue;
    const type = routeEdgeType(raw.type);
    const cites = Array.isArray(raw.cites) ? raw.cites : [];
    const basis = cites.map((ref) => toSourceRef(String(ref), nodeById, raw.clause)).filter(Boolean);
    if (!basis.length) continue;
    const confidence = Number(raw.confidence);
    const edge = normalizeObjectEdge({
      id: raw.id || genObjectGraphId("edge"),
      projectId: graph.projectId ?? null,
      source,
      target,
      type,
      status: "proposed",
      basis,
      confidence: Number.isFinite(confidence) && confidence <= 1 ? Math.round(confidence * 100) : confidence,
      label: raw.clause,
    });
    const key = `${edge.source}\0${edge.target}\0${edge.type}`;
    const prior = seen.get(key);
    if (!prior || edge.confidence > prior.confidence) seen.set(key, edge);
  }
  return [...seen.values()];
}

export function structuralEdgesForGraph(graph = {}) {
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = [];
  const seen = new Set();
  const add = (source, target, type, preview) => {
    if (!nodeIds.has(source) || !nodeIds.has(target) || source === target) return;
    const key = `${source}\0${target}\0${type}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push(normalizeObjectEdge({
      id: genObjectGraphId("edge"),
      projectId: graph.projectId ?? null,
      source,
      target,
      type,
      status: "proposed",
      basis: [{ kind: "object", ref: source, preview, at: now() }],
      confidence: 100,
    }));
  };
  for (const node of nodes) {
    const restsOn = Array.isArray(node.payload?.restsOn) ? node.payload.restsOn : [];
    for (const ref of restsOn) {
      const id = typeof ref === "string" ? ref : ref?.id;
      add(id, node.id, "supports", `${id} supports ${node.statement}`);
    }
    if (node.domain === "runs" && node.type === "run" && node.payload?.pathId) {
      add(node.id, node.payload.pathId, "derived_from", "run compiled from path");
    }
    if (node.domain === "runs" && node.type === "run" && node.payload?.measurementContractId) {
      add(node.id, node.payload.measurementContractId, "measured_by", "run measurement contract");
    }
  }
  return edges;
}

export async function inferEdges({ graph, infer }) {
  if (typeof infer !== "function") return [];
  const raw = await infer({
    nodes: (graph.nodes ?? []).map((node) => ({ id: node.id, domain: node.domain, type: node.type, statement: node.statement, solidity: node.solidity })),
  });
  return validateInferredEdges(raw?.edges ?? raw, graph);
}
