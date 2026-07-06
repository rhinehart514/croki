import crypto from "node:crypto";
import { persistence } from "./persistence.mjs";
import { safeId, now } from "./store-fs.mjs";
import { effectiveSolidity, normalizeEvidenceList, friendlySource } from "./evidence.mjs";

export const OBJECT_GRAPH_SCHEMA_VERSION = 1;

export const OBJECT_NODE_DOMAINS = [
  "external",
  "market",
  "product",
  "strategy",
  "audience",
  "assets",
  "runs",
  "pipeline",
  "customer",
  "measurement",
  "learning",
];

export const OBJECT_NODE_MATURITIES = ["loose", "typed", "execution", "outcome"];

export const OBJECT_EDGE_TYPES = [
  "supports",
  "weakens",
  "belongs_to",
  "leads_to",
  "targets",
  "uses",
  "measured_by",
  "produced",
  "blocked_by",
  "derived_from",
  "promoted_to",
  "updates",
];

export const OBJECT_EDGE_STATUSES = [
  "proposed",
  "confirmed",
  "swapped",
  "challenged",
  "suppressed",
  "removed",
];

const COLLECTION = "object-graph";
const LAYOUT_COLLECTION = "object-graph-layout";

export function genObjectGraphId(prefix = "obj") {
  const stamp = now().replace(/\D/g, "").slice(0, 14);
  return `${prefix}-${stamp}-${crypto.randomBytes(4).toString("hex")}`;
}

function trimOrNull(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function normalizeSources(list) {
  if (!Array.isArray(list)) return [];
  return list.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const ref = trimOrNull(raw.ref);
    if (!ref) return [];
    // The founder reads this: collapse a raw file path to a plain phrase, keep a real URL, leave ids
    // and plain labels alone. The preview follows suit when none was written for the receipt.
    const display = friendlySource(ref);
    return [{
      kind: trimOrNull(raw.kind) || "founder",
      ref: display,
      preview: trimOrNull(raw.preview) || display,
      at: raw.at || now(),
    }];
  });
}

function normalizeRepair(input) {
  if (!input || typeof input !== "object") return null;
  return {
    verb: trimOrNull(input.verb) || "find_evidence",
    statement: trimOrNull(input.statement) || "Repair this weakness.",
    targetNodeId: trimOrNull(input.targetNodeId),
    compilable: Boolean(input.compilable),
  };
}

export function normalizeWeakness(input) {
  if (!input || typeof input !== "object") throw new Error("Weakness must be an object.");
  const kind = trimOrNull(input.kind);
  if (!kind) throw new Error("Weakness kind is required.");
  const detectedFrom = normalizeSources(input.detectedFrom);
  if (!detectedFrom.length) throw new Error(`Weakness "${kind}" needs detectedFrom evidence.`);
  const severity = Number(input.severity);
  return {
    id: trimOrNull(input.id) || genObjectGraphId("weak"),
    kind,
    statement: trimOrNull(input.statement) || `${kind} weakness detected.`,
    detectedFrom,
    detectedAt: input.detectedAt || now(),
    signal: input.signal && typeof input.signal === "object" && !Array.isArray(input.signal) ? input.signal : {},
    threshold: trimOrNull(input.threshold) || "Derived from stored signal.",
    severity: Number.isFinite(severity) ? Math.min(100, Math.max(0, severity)) : null,
    status: ["open", "repairing", "repaired", "dismissed"].includes(input.status) ? input.status : "open",
    repair: normalizeRepair(input.repair),
    resolution: input.resolution && typeof input.resolution === "object"
      ? {
          at: input.resolution.at || now(),
          by: trimOrNull(input.resolution.by) || "founder",
          ref: trimOrNull(input.resolution.ref),
        }
      : null,
  };
}

export function normalizeObjectNode(input = {}) {
  const createdAt = input.createdAt || now();
  const maturity = OBJECT_NODE_MATURITIES.includes(input.maturity) ? input.maturity : "loose";
  const domain = trimOrNull(input.domain);
  const type = trimOrNull(input.type);
  if (maturity !== "loose" && !domain) throw new Error("Typed, execution, and outcome nodes need a domain.");
  if (maturity !== "loose" && !type) throw new Error("Typed, execution, and outcome nodes need a type.");
  if (domain && !OBJECT_NODE_DOMAINS.includes(domain)) throw new Error(`Unknown object node domain: ${domain}`);
  if (maturity === "outcome" && !["run", "ingest"].includes(input.origin)) {
    throw new Error("Outcome nodes must originate from a run or ingestion.");
  }
  const statement = trimOrNull(input.statement);
  if (!statement) throw new Error("Object nodes need a statement.");
  const evidence = normalizeEvidenceList(input.evidence);
  const declaredSolidity = trimOrNull(input.declaredSolidity ?? input.solidity);
  return {
    schemaVersion: OBJECT_GRAPH_SCHEMA_VERSION,
    id: trimOrNull(input.id) || genObjectGraphId("obj"),
    projectId: input.projectId ?? null,
    domain: domain ?? null,
    type: type ?? null,
    maturity,
    statement,
    evidence,
    declaredSolidity,
    solidity: evidence.length ? effectiveSolidity(declaredSolidity, evidence) : null,
    confidence: Number.isFinite(Number(input.confidence)) ? Math.min(100, Math.max(0, Number(input.confidence))) : null,
    weaknesses: Array.isArray(input.weaknesses) ? input.weaknesses.map(normalizeWeakness) : [],
    sources: normalizeSources(input.sources),
    origin: trimOrNull(input.origin) || "founder",
    originRef: trimOrNull(input.originRef),
    payload: input.payload && typeof input.payload === "object" && !Array.isArray(input.payload) ? input.payload : {},
    createdAt,
    updatedAt: input.updatedAt || createdAt,
    revision: Number.isInteger(input.revision) ? input.revision : 0,
    ...(input.retiredAt ? { retiredAt: input.retiredAt } : {}),
  };
}

export function normalizeObjectEdge(input = {}) {
  const createdAt = input.createdAt || now();
  const source = trimOrNull(input.source);
  const target = trimOrNull(input.target);
  if (!source) throw new Error("Object edges need a source.");
  if (!target) throw new Error("Object edges need a target.");
  const type = trimOrNull(input.type);
  if (!OBJECT_EDGE_TYPES.includes(type)) throw new Error(`Unknown object edge type: ${type}`);
  const basis = normalizeSources(input.basis);
  if (!basis.length) throw new Error(`Object edge "${type}" needs a non-empty basis.`);
  const confidence = Number(input.confidence);
  return {
    schemaVersion: OBJECT_GRAPH_SCHEMA_VERSION,
    id: trimOrNull(input.id) || genObjectGraphId("edge"),
    projectId: input.projectId ?? null,
    source,
    target,
    type,
    status: OBJECT_EDGE_STATUSES.includes(input.status) ? input.status : "proposed",
    basis,
    confidence: Number.isFinite(confidence) ? Math.min(100, Math.max(0, confidence)) : 100,
    ...(trimOrNull(input.label) ? { label: trimOrNull(input.label) } : {}),
    createdAt,
    updatedAt: input.updatedAt || createdAt,
  };
}

export function emptyObjectGraph(projectId = null) {
  return {
    schemaVersion: OBJECT_GRAPH_SCHEMA_VERSION,
    projectId,
    nodes: [],
    edges: [],
    revision: 0,
    updatedAt: now(),
  };
}

function normalizePosition(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const x = Number(input.x);
  const y = Number(input.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

export function normalizeObjectGraphPositions(input = {}) {
  const raw = input.positions && typeof input.positions === "object" && !Array.isArray(input.positions)
    ? input.positions
    : input;
  const positions = {};
  for (const [nodeId, value] of Object.entries(raw ?? {})) {
    const position = normalizePosition(value);
    if (nodeId && position) positions[nodeId] = position;
  }
  return positions;
}

export function normalizeObjectGraph(input = {}, projectId = input.projectId ?? null) {
  return {
    schemaVersion: OBJECT_GRAPH_SCHEMA_VERSION,
    projectId,
    nodes: Array.isArray(input.nodes) ? input.nodes.map((node) => normalizeObjectNode({ ...node, projectId: node.projectId ?? projectId })) : [],
    edges: Array.isArray(input.edges) ? input.edges.map((edge) => normalizeObjectEdge({ ...edge, projectId: edge.projectId ?? projectId })) : [],
    revision: Number.isInteger(input.revision) ? input.revision : 0,
    updatedAt: input.updatedAt || now(),
  };
}

export const objectGraphStore = {
  collection: COLLECTION,
  load(projectId = "default", options = {}) {
    const graph = persistence(options).get(COLLECTION, safeId(projectId));
    return graph ? normalizeObjectGraph(graph, projectId) : emptyObjectGraph(projectId);
  },
  save(graph, options = {}) {
    const projectId = graph?.projectId ?? options.projectId ?? "default";
    const normalized = normalizeObjectGraph({ ...graph, projectId, updatedAt: now() }, projectId);
    persistence(options).set(COLLECTION, safeId(projectId), normalized);
    return normalized;
  },
  delete(projectId = "default", options = {}) {
    return persistence(options).delete(COLLECTION, safeId(projectId));
  },
};

export const objectGraphLayoutStore = {
  collection: LAYOUT_COLLECTION,
  load(projectId = "default", options = {}) {
    const stored = persistence(options).get(LAYOUT_COLLECTION, safeId(projectId));
    return {
      projectId,
      positions: normalizeObjectGraphPositions(stored?.positions ?? {}),
      updatedAt: stored?.updatedAt ?? null,
    };
  },
  save(projectId = "default", positions = {}, options = {}) {
    const normalized = {
      projectId,
      positions: normalizeObjectGraphPositions(positions),
      updatedAt: now(),
    };
    persistence(options).set(LAYOUT_COLLECTION, safeId(projectId), normalized);
    return normalized;
  },
  merge(projectId = "default", positions = {}, options = {}) {
    const current = this.load(projectId, options);
    return this.save(projectId, { ...current.positions, ...normalizeObjectGraphPositions(positions) }, options);
  },
  delete(projectId = "default", options = {}) {
    return persistence(options).delete(LAYOUT_COLLECTION, safeId(projectId));
  },
};
