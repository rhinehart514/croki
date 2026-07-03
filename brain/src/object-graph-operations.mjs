import {
  OBJECT_EDGE_STATUSES,
  OBJECT_EDGE_TYPES,
  normalizeObjectEdge,
  normalizeObjectGraph,
  normalizeObjectNode,
} from "./object-graph-store.mjs";
import { now } from "./store-fs.mjs";

const DERIVED_NODE_FIELDS = new Set(["solidity", "confidence", "weaknesses", "declaredSolidity"]);
const READ_ONLY_GATE_PAYLOAD_FIELDS = new Set(["protects", "requiredApproval", "reviewPayload", "autonomy"]);
const ACYCLIC_EDGE_TYPES = new Set(["belongs_to", "derived_from", "promoted_to"]);

function clone(value) {
  return structuredClone(value);
}

function requireString(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string.`);
  return value.trim();
}

function assertNoDerivedPatch(patch) {
  const forged = Object.keys(patch || {}).filter((key) => DERIVED_NODE_FIELDS.has(key));
  if (forged.length) {
    throw new Error(`Derived object-node fields cannot be written through graph operations: ${forged.join(", ")}.`);
  }
}

function assertNoGatePayloadWrite(node) {
  if (node?.domain !== "runs" || node?.type !== "gate") return;
  const payload = node.payload && typeof node.payload === "object" ? node.payload : {};
  const forged = Object.keys(payload).filter((key) => READ_ONLY_GATE_PAYLOAD_FIELDS.has(key));
  if (forged.length) {
    throw new Error(`runs.gate payload is projection-only; cannot write ${forged.join(", ")}.`);
  }
}

function graphHasCycleForType(nodes, edges, type) {
  const ids = new Set(nodes.map((node) => node.id));
  const outgoing = new Map(nodes.map((node) => [node.id, []]));
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  for (const edge of edges) {
    if (edge.type !== type || !ids.has(edge.source) || !ids.has(edge.target) || edge.status === "removed") continue;
    outgoing.get(edge.source).push(edge.target);
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  }
  const queue = nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id);
  let seen = 0;
  while (queue.length) {
    const id = queue.shift();
    seen += 1;
    for (const target of outgoing.get(id) ?? []) {
      const next = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, next);
      if (next === 0) queue.push(target);
    }
  }
  return seen !== nodes.length;
}

export function validateObjectGraph(input) {
  const errors = [];
  let graph;
  try {
    graph = normalizeObjectGraph(input, input?.projectId ?? null);
  } catch (error) {
    return { ok: false, errors: [error.message] };
  }
  const nodeIds = new Set();
  for (const node of graph.nodes) {
    if (nodeIds.has(node.id)) errors.push(`Duplicate node id: ${node.id}`);
    nodeIds.add(node.id);
    try { assertNoGatePayloadWrite(node); } catch (error) { errors.push(`Node "${node.id}": ${error.message}`); }
    for (const weakness of node.weaknesses ?? []) {
      if (!Array.isArray(weakness.detectedFrom) || weakness.detectedFrom.length === 0) {
        errors.push(`Node "${node.id}" has a seeded weakness with no detectedFrom receipt.`);
      }
    }
  }
  const edgeIds = new Set();
  const triples = new Set();
  for (const edge of graph.edges) {
    if (edgeIds.has(edge.id)) errors.push(`Duplicate edge id: ${edge.id}`);
    edgeIds.add(edge.id);
    if (!nodeIds.has(edge.source)) errors.push(`Edge "${edge.id}" has an unknown source.`);
    if (!nodeIds.has(edge.target)) errors.push(`Edge "${edge.id}" has an unknown target.`);
    if (edge.source === edge.target) errors.push(`Edge "${edge.id}" cannot connect a node to itself.`);
    if (!OBJECT_EDGE_TYPES.includes(edge.type)) errors.push(`Edge "${edge.id}" has an invalid type.`);
    if (!Array.isArray(edge.basis) || edge.basis.length === 0) {
      errors.push(`Edge "${edge.id}" has no basis receipt.`);
    }
    const triple = `${edge.source}\0${edge.target}\0${edge.type}`;
    if (triples.has(triple)) errors.push(`Duplicate edge triple: ${edge.source} ${edge.type} ${edge.target}`);
    triples.add(triple);
  }
  for (const type of ACYCLIC_EDGE_TYPES) {
    if (!errors.length && graphHasCycleForType(graph.nodes, graph.edges, type)) {
      errors.push(`${type} edges contain a cycle.`);
    }
  }
  return { ok: errors.length === 0, errors, graph };
}

function nodeIndex(graph, id) {
  const index = graph.nodes.findIndex((node) => node.id === id);
  if (index < 0) throw new Error(`Object node not found: ${id}`);
  return index;
}

function edgeIndex(graph, id) {
  const index = graph.edges.findIndex((edge) => edge.id === id);
  if (index < 0) throw new Error(`Object edge not found: ${id}`);
  return index;
}

function applyOne(graph, operation) {
  const type = requireString(operation?.type, "Operation type");
  if (type === "add_node") {
    assertNoDerivedPatch(operation.node ?? {});
    const node = normalizeObjectNode({
      ...(operation.node ?? {}),
      projectId: operation.node?.projectId ?? graph.projectId ?? null,
      revision: 0,
    });
    assertNoGatePayloadWrite(node);
    if (graph.nodes.some((item) => item.id === node.id)) throw new Error(`Object node already exists: ${node.id}`);
    graph.nodes.push(node);
    return `Added ${node.statement}.`;
  }

  if (type === "promote_node") {
    const id = requireString(operation.nodeId, "Node id");
    const index = nodeIndex(graph, id);
    const current = graph.nodes[index];
    if (current.maturity !== "loose") throw new Error("Only loose object nodes can be promoted in place.");
    const promoted = normalizeObjectNode({
      ...current,
      domain: requireString(operation.domain, "Domain"),
      type: requireString(operation.nodeType ?? operation.objectType ?? operation.kind, "Node type"),
      maturity: "typed",
      payload: { ...current.payload, ...(operation.payloadPatch && typeof operation.payloadPatch === "object" ? operation.payloadPatch : {}) },
      updatedAt: now(),
      revision: current.revision + 1,
    });
    graph.nodes[index] = promoted;
    return `Promoted ${promoted.statement}.`;
  }

  if (type === "update_node") {
    const id = requireString(operation.nodeId, "Node id");
    const patch = operation.patch;
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("update_node requires a patch object.");
    assertNoDerivedPatch(patch);
    const index = nodeIndex(graph, id);
    const current = graph.nodes[index];
    const allowed = new Set(["statement", "evidence", "sources", "origin", "originRef", "payload", "maturity", "domain", "type"]);
    const unknown = Object.keys(patch).filter((key) => !allowed.has(key));
    if (unknown.length) throw new Error(`Unsupported object-node patch fields: ${unknown.join(", ")}`);
    const next = normalizeObjectNode({
      ...current,
      ...clone(patch),
      payload: patch.payload ? { ...current.payload, ...clone(patch.payload) } : current.payload,
      updatedAt: now(),
      revision: current.revision + 1,
    });
    assertNoGatePayloadWrite(next);
    graph.nodes[index] = next;
    return `Updated ${next.statement}.`;
  }

  if (type === "retire_node") {
    const id = requireString(operation.nodeId, "Node id");
    const index = nodeIndex(graph, id);
    const current = graph.nodes[index];
    const touches = graph.edges.some((edge) => edge.source === id || edge.target === id);
    if (!touches && current.maturity === "loose") {
      graph.nodes.splice(index, 1);
      return `Removed loose card ${current.statement}.`;
    }
    graph.nodes[index] = { ...current, retiredAt: operation.retiredAt || now(), updatedAt: now(), revision: current.revision + 1 };
    return `Retired ${current.statement}.`;
  }

  if (type === "add_edge") {
    const edge = normalizeObjectEdge({
      ...(operation.edge ?? operation),
      projectId: operation.edge?.projectId ?? graph.projectId ?? null,
    });
    if (graph.edges.some((item) => item.id === edge.id)) throw new Error(`Object edge already exists: ${edge.id}`);
    if (!graph.nodes.some((node) => node.id === edge.source)) throw new Error(`Unknown edge source: ${edge.source}`);
    if (!graph.nodes.some((node) => node.id === edge.target)) throw new Error(`Unknown edge target: ${edge.target}`);
    graph.edges.push(edge);
    return `Connected ${edge.source} ${edge.type} ${edge.target}.`;
  }

  if (type === "set_edge_status") {
    const id = requireString(operation.edgeId, "Edge id");
    const status = requireString(operation.status, "Edge status");
    if (!OBJECT_EDGE_STATUSES.includes(status)) throw new Error(`Unknown edge status: ${status}`);
    const index = edgeIndex(graph, id);
    graph.edges[index] = { ...graph.edges[index], status, updatedAt: now() };
    return `Marked edge ${id} ${status}.`;
  }

  if (type === "update_edge") {
    const id = requireString(operation.edgeId, "Edge id");
    const patch = operation.patch;
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("update_edge requires a patch object.");
    const allowed = new Set(["status", "basis", "confidence", "label"]);
    const unknown = Object.keys(patch).filter((key) => !allowed.has(key));
    if (unknown.length) throw new Error(`Unsupported object-edge patch fields: ${unknown.join(", ")}`);
    const index = edgeIndex(graph, id);
    graph.edges[index] = normalizeObjectEdge({ ...graph.edges[index], ...clone(patch), updatedAt: now() });
    return `Updated edge ${id}.`;
  }

  throw new Error(`Unsupported object graph operation: ${type}`);
}

export function applyObjectGraphOperations(input, operations = []) {
  if (!Array.isArray(operations)) throw new Error("Object graph operations must be an array.");
  if (operations.length > 80) throw new Error("Too many object graph operations in one batch.");
  const graph = normalizeObjectGraph(clone(input), input?.projectId ?? null);
  const changes = [];
  for (const operation of operations) {
    changes.push({ type: operation?.type ?? "unknown", detail: applyOne(graph, operation) });
  }
  graph.revision = Number.isInteger(graph.revision) ? graph.revision + 1 : 1;
  graph.updatedAt = now();
  const validation = validateObjectGraph(graph);
  if (!validation.ok) throw new Error(`Object graph validation failed: ${validation.errors.join(" ")}`);
  return { graph: validation.graph, changes, validation };
}
