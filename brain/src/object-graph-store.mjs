import crypto from "node:crypto";
import { PersistenceConflictError, persistence } from "./persistence.mjs";
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
const LAYOUT_SCHEMA_VERSION = 2;

export const PROJECT_CANVAS_LAYOUT_NAMESPACE = "project-canvas";
export const OBJECT_GRAPH_LAYOUT_NAMESPACE = "object-graph";

export class CanvasLayoutConflictError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "CanvasLayoutConflictError";
    this.code = "CANVAS_LAYOUT_CONFLICT";
    Object.assign(this, details);
  }
}

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

function canonicalLayoutNamespace(namespace) {
  const value = trimOrNull(namespace) || PROJECT_CANVAS_LAYOUT_NAMESPACE;
  return value === OBJECT_GRAPH_LAYOUT_NAMESPACE ? PROJECT_CANVAS_LAYOUT_NAMESPACE : value;
}

function normalizeStringList(input) {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.map(trimOrNull).filter(Boolean))];
}

function normalizeViewport(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const x = Number(input.x);
  const y = Number(input.y);
  const zoom = Number(input.zoom);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(zoom) || zoom <= 0) return null;
  return { x, y, zoom };
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalJson(value[key])]));
  }
  return value;
}

function layoutFingerprint(namespace, patch) {
  return crypto.createHash("sha256")
    .update(JSON.stringify(canonicalJson({ namespace, patch })))
    .digest("hex");
}

export function normalizeProjectCanvasLayout(input = {}) {
  return {
    positions: normalizeObjectGraphPositions(input.positions ?? {}),
    collapsedGroups: normalizeStringList(input.collapsedGroups),
    pinnedCrew: normalizeStringList(input.pinnedCrew),
    viewport: normalizeViewport(input.viewport),
    updatedAt: input.updatedAt ?? null,
  };
}

function layoutNamespaces(stored) {
  const namespaces = {};
  for (const [rawNamespace, rawLayout] of Object.entries(stored?.namespaces ?? {})) {
    const namespace = canonicalLayoutNamespace(rawNamespace);
    if (namespaces[namespace] && rawNamespace !== PROJECT_CANVAS_LAYOUT_NAMESPACE) continue;
    namespaces[namespace] = normalizeProjectCanvasLayout(rawLayout);
  }
  if (!namespaces[PROJECT_CANVAS_LAYOUT_NAMESPACE]) {
    namespaces[PROJECT_CANVAS_LAYOUT_NAMESPACE] = normalizeProjectCanvasLayout(stored ?? {});
  }
  return namespaces;
}

function normalizeLayoutDocument(stored, projectId) {
  return {
    schemaVersion: LAYOUT_SCHEMA_VERSION,
    projectId,
    revision: Number.isInteger(stored?.revision) && stored.revision >= 0 ? stored.revision : 0,
    positions: normalizeObjectGraphPositions(stored?.positions ?? {}),
    namespaces: layoutNamespaces(stored),
    idempotency: Array.isArray(stored?.idempotency) ? stored.idempotency.filter((receipt) => (
      receipt && typeof receipt.key === "string" && typeof receipt.fingerprint === "string"
        && Number.isInteger(receipt.resultRevision)
    )) : [],
    updatedAt: stored?.updatedAt ?? null,
  };
}

function saveLayoutDocument(projectId, current, namespaces, options = {}) {
  const updatedAt = now();
  const durableNamespaces = {};
  for (const [namespace, layout] of Object.entries(namespaces)) {
    durableNamespaces[canonicalLayoutNamespace(namespace)] = {
      ...normalizeProjectCanvasLayout(layout),
      updatedAt: layout?.updatedAt ?? updatedAt,
    };
  }
  const canonical = durableNamespaces[PROJECT_CANVAS_LAYOUT_NAMESPACE]
    ?? { ...normalizeProjectCanvasLayout(), updatedAt };
  durableNamespaces[PROJECT_CANVAS_LAYOUT_NAMESPACE] = canonical;
  const durable = {
    schemaVersion: LAYOUT_SCHEMA_VERSION,
    projectId,
    revision: current.revision + 1,
    positions: canonical.positions,
    namespaces: durableNamespaces,
    idempotency: [...current.idempotency, {
      key: options.idempotencyKey,
      fingerprint: options.fingerprint,
      namespace: options.namespace,
      resultRevision: current.revision + 1,
      createdAt: updatedAt,
    }].slice(-500),
    updatedAt,
  };
  try {
    persistence(options).compareAndSet(LAYOUT_COLLECTION, safeId(projectId), current.revision, durable);
  } catch (error) {
    if (error instanceof PersistenceConflictError) {
      throw new CanvasLayoutConflictError(error.message, {
        projectId,
        expectedRevision: current.revision,
        actualRevision: error.actualRevision,
        cause: error,
      });
    }
    throw error;
  }
  return durable;
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
    const layout = this.loadNamespace(projectId, PROJECT_CANVAS_LAYOUT_NAMESPACE, options);
    return {
      projectId,
      positions: layout.positions,
      updatedAt: layout.updatedAt,
    };
  },
  save(projectId = "default", positions = {}, options = {}) {
    const current = this.loadNamespace(projectId, PROJECT_CANVAS_LAYOUT_NAMESPACE, options);
    const layout = this.saveNamespace(projectId, PROJECT_CANVAS_LAYOUT_NAMESPACE, {
      ...current,
      positions: normalizeObjectGraphPositions(positions),
    }, options);
    return { projectId, positions: layout.positions, updatedAt: layout.updatedAt };
  },
  merge(projectId = "default", positions = {}, options = {}) {
    const current = this.load(projectId, options);
    return this.save(projectId, { ...current.positions, ...normalizeObjectGraphPositions(positions) }, options);
  },
  loadNamespace(projectId = "default", namespace = PROJECT_CANVAS_LAYOUT_NAMESPACE, options = {}) {
    const stored = persistence(options).get(LAYOUT_COLLECTION, safeId(projectId));
    const document = normalizeLayoutDocument(stored, projectId);
    const canonical = canonicalLayoutNamespace(namespace);
    const layout = document.namespaces[canonical] ?? normalizeProjectCanvasLayout();
    return { projectId, namespace: canonical, revision: document.revision, ...layout };
  },
  saveNamespace(projectId = "default", namespace = PROJECT_CANVAS_LAYOUT_NAMESPACE, layout = {}, options = {}) {
    const provider = persistence(options);
    const key = safeId(projectId);
    let stored = provider.get(LAYOUT_COLLECTION, key);
    // Layout documents predate optimistic concurrency. Promote one legacy snapshot to revision zero
    // before its first CAS write; after this point every backend treats it as a normal revisioned authority.
    if (stored && (!Number.isInteger(stored.revision) || stored.revision < 0)) {
      stored = {
        ...stored,
        schemaVersion: LAYOUT_SCHEMA_VERSION,
        projectId,
        revision: 0,
        idempotency: [],
      };
      provider.set(LAYOUT_COLLECTION, key, stored);
    }
    const current = normalizeLayoutDocument(stored, projectId);
    const namespaces = current.namespaces;
    const canonical = canonicalLayoutNamespace(namespace);
    const idempotencyKey = trimOrNull(options.idempotencyKey);
    const normalizedLayout = normalizeProjectCanvasLayout(layout);
    const fingerprint = options.mutationFingerprint ?? layoutFingerprint(canonical, normalizedLayout);
    if (idempotencyKey) {
      const receipt = current.idempotency.find((item) => item.key === idempotencyKey);
      if (receipt) {
        if (receipt.fingerprint !== fingerprint || receipt.namespace !== canonical) {
          throw new CanvasLayoutConflictError(`Idempotency key ${idempotencyKey} was already used for a different canvas layout mutation.`, {
            projectId, expectedRevision: options.expectedRevision, actualRevision: current.revision,
          });
        }
        const existing = current.namespaces[canonical] ?? normalizeProjectCanvasLayout();
        return { projectId, namespace: canonical, revision: current.revision, ...existing, deduped: true };
      }
    }
    if (options.expectedRevision != null && options.expectedRevision !== current.revision) {
      throw new CanvasLayoutConflictError(
        `Stale canvas layout revision: expected ${options.expectedRevision}, current ${current.revision}.`,
        { projectId, expectedRevision: options.expectedRevision, actualRevision: current.revision },
      );
    }
    const updatedAt = now();
    namespaces[canonical] = { ...normalizedLayout, updatedAt };
    const durable = saveLayoutDocument(projectId, current, namespaces, {
      ...options,
      namespace: canonical,
      idempotencyKey: idempotencyKey ?? `internal:${crypto.randomUUID()}`,
      fingerprint,
    });
    return { projectId, namespace: canonical, revision: durable.revision, ...durable.namespaces[canonical] };
  },
  mergeNamespace(projectId = "default", namespace = PROJECT_CANVAS_LAYOUT_NAMESPACE, patch = {}, options = {}) {
    const current = this.loadNamespace(projectId, namespace, options);
    const canonical = canonicalLayoutNamespace(namespace);
    const normalizedPatch = {
      ...(patch.positions === undefined ? {} : { positions: normalizeObjectGraphPositions(patch.positions) }),
      ...(patch.collapsedGroups === undefined ? {} : { collapsedGroups: normalizeStringList(patch.collapsedGroups) }),
      ...(patch.pinnedCrew === undefined ? {} : { pinnedCrew: normalizeStringList(patch.pinnedCrew) }),
      ...(patch.viewport === undefined ? {} : { viewport: normalizeViewport(patch.viewport) }),
    };
    return this.saveNamespace(projectId, namespace, {
      positions: patch.positions === undefined
        ? current.positions
        : { ...current.positions, ...normalizeObjectGraphPositions(patch.positions) },
      collapsedGroups: patch.collapsedGroups === undefined ? current.collapsedGroups : patch.collapsedGroups,
      pinnedCrew: patch.pinnedCrew === undefined ? current.pinnedCrew : patch.pinnedCrew,
      viewport: patch.viewport === undefined ? current.viewport : patch.viewport,
    }, { ...options, mutationFingerprint: layoutFingerprint(canonical, normalizedPatch) });
  },
  delete(projectId = "default", options = {}) {
    return persistence(options).delete(LAYOUT_COLLECTION, safeId(projectId));
  },
};
