import { OBJECT_EDGE_TYPES, normalizeObjectEdge, genObjectGraphId } from "../object-graph-store.mjs";
import { now } from "../store-fs.mjs";

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
  const aliased = TYPE_ALIASES.get(type);
  if (aliased) return aliased;
  // A non-empty type we neither recognize nor have an alias for gets parked on the generic
  // derived_from mechanic. Log it so a future mislabeling (a model inventing an edge kind that
  // should have a real mechanic) is VISIBLE instead of silently flattened. An empty/absent type is
  // not mislabeling, so it falls through quietly.
  if (type) {
    console.warn(`[edge-inference] unrecognized edge type "${type}" → routed to derived_from`);
  }
  return "derived_from";
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

