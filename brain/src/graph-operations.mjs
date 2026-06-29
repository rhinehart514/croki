import { normalizeContract } from "./contracts.mjs";

const NODE_CATEGORIES = new Set([
  "resource",
  "source",
  "context",
  "enrich",
  "filter",
  "generate",
  "gate",
  "execute",
  "measure",
]);

const EDGE_TYPES = new Set(["data", "context", "feedback"]);

// Node kinds — the open model. "tool" (or absent) is the connector path and still
// requires a registered category. "agent" / "skill" / "code" / "mcp" are open steps the agent
// composes; they require a `ref` instead of a registry category. "mcp" is an external MCP
// server's tool (ref = "<serverId>/<toolName>"); read tools run free, write tools sit behind a gate.
// "switch" is a routing node — it needs neither a registry category nor a ref. It carries no
// step of its own; it routes each upstream item to a downstream branch by a per-edge predicate
// (resolved at run time in graph.mjs). Logic is automatic, so a switch is never a founder gate.
const NODE_KINDS = new Set(["tool", "agent", "skill", "code", "mcp", "switch"]);
const OPEN_KINDS = new Set(["agent", "skill", "code", "mcp"]);

// The fixed predicate op vocabulary a switch edge may use — the same set step-runners' applyPredicate
// understands. A closed op set (no expressions, no eval) keeps routing deterministic and auditable.
const PREDICATE_OPS = new Set(["exists", "missing", "eq", "ne", "gt", "gte", "lt", "lte", "contains", "in"]);

// Validate an optional edge predicate { field, op?, value? }. Returns an error fragment or null.
function predicateError(predicate) {
  if (predicate == null) return null;
  if (typeof predicate !== "object" || Array.isArray(predicate)) return "predicate must be an object";
  if (typeof predicate.field !== "string" || !predicate.field.trim()) return "predicate needs a field name";
  if (predicate.op !== undefined && !PREDICATE_OPS.has(predicate.op)) return `predicate has an unknown op "${predicate.op}"`;
  return null;
}

// Output kinds are OPEN (E3.1), the same un-caging applied to step kinds. A node MAY declare what
// it emits — a "message", an "artifact" (a deployable microproduct cut from the product), a
// "dataset", a "signal", or anything the composer invents — but the set is NEVER closed and
// "message" is NEVER privileged. Validation accepts any non-empty label; these are hints for the
// UI and the composer, not an enum the engine branches on. The anti-cage guard (E3.2) keeps it open.
export const OUTPUT_KIND_HINTS = ["message", "artifact", "dataset", "signal", "none"];

function clone(value) {
  return structuredClone(value);
}

function requireString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function nextRevision(graph) {
  return Number.isInteger(graph.revision) ? graph.revision + 1 : 1;
}

function nodeIndex(graph, nodeId) {
  const index = graph.nodes.findIndex((node) => node.id === nodeId);
  if (index < 0) throw new Error(`Node not found: ${nodeId}`);
  return index;
}

function edgeIndex(graph, edgeId) {
  const index = graph.edges.findIndex((edge) => edge.id === edgeId);
  if (index < 0) throw new Error(`Edge not found: ${edgeId}`);
  return index;
}

function dataGraphHasCycle(nodes, edges) {
  const ids = new Set(nodes.map((node) => node.id));
  const degree = new Map(nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(nodes.map((node) => [node.id, []]));
  for (const edge of edges) {
    if (edge.edgeType !== "data" || !ids.has(edge.source) || !ids.has(edge.target)) continue;
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
    outgoing.get(edge.source).push(edge.target);
  }
  const queue = nodes.filter((node) => degree.get(node.id) === 0).map((node) => node.id);
  let visited = 0;
  while (queue.length) {
    const current = queue.shift();
    visited += 1;
    for (const target of outgoing.get(current) ?? []) {
      const next = degree.get(target) - 1;
      degree.set(target, next);
      if (next === 0) queue.push(target);
    }
  }
  return visited !== nodes.length;
}

export function validateGraph(graph) {
  const errors = [];
  if (!graph || typeof graph !== "object") return { ok: false, errors: ["Graph must be an object."] };
  if (!Array.isArray(graph.nodes)) errors.push("Graph nodes must be an array.");
  if (!Array.isArray(graph.edges)) errors.push("Graph edges must be an array.");
  if (errors.length) return { ok: false, errors };

  const nodeIds = new Set();
  for (const node of graph.nodes) {
    if (!node?.id || typeof node.id !== "string") errors.push("Every node needs an id.");
    else if (nodeIds.has(node.id)) errors.push(`Duplicate node id: ${node.id}`);
    else nodeIds.add(node.id);
    if (node?.kind !== undefined && !NODE_KINDS.has(node.kind)) {
      errors.push(`Node "${node?.id ?? "?"}" has an invalid kind.`);
    }
    if (OPEN_KINDS.has(node?.kind)) {
      if (!node?.ref || typeof node.ref !== "string") {
        errors.push(`Node "${node?.id ?? "?"}" of kind "${node.kind}" needs a ref.`);
      }
    } else if (node?.kind === "switch") {
      // routing node — needs neither ref nor category
    } else if (!NODE_CATEGORIES.has(node?.category)) {
      errors.push(`Node "${node?.id ?? "?"}" has an invalid category.`);
    }
    if (!node?.label || typeof node.label !== "string") errors.push(`Node "${node?.id ?? "?"}" needs a label.`);
    if (!node?.position || !Number.isFinite(node.position.x) || !Number.isFinite(node.position.y)) {
      errors.push(`Node "${node?.id ?? "?"}" needs a numeric position.`);
    }
    if (!node?.config || typeof node.config !== "object" || Array.isArray(node.config)) {
      errors.push(`Node "${node?.id ?? "?"}" config must be an object.`);
    }
    // Open output kind: optional, but when set it must be a real label (never empty). The point is
    // that ANY label is allowed — the engine must not constrain what a node can emit.
    if (node?.outputKind !== undefined && (typeof node.outputKind !== "string" || !node.outputKind.trim())) {
      errors.push(`Node "${node?.id ?? "?"}" outputKind must be a non-empty string when set.`);
    }
    try { normalizeContract(node?.contract); } catch (error) {
      errors.push(`Node "${node?.id ?? "?"}" contract is invalid: ${error.message}`);
    }
  }

  const edgeIds = new Set();
  for (const edge of graph.edges) {
    if (!edge?.id || typeof edge.id !== "string") errors.push("Every edge needs an id.");
    else if (edgeIds.has(edge.id)) errors.push(`Duplicate edge id: ${edge.id}`);
    else edgeIds.add(edge.id);
    if (!nodeIds.has(edge?.source)) errors.push(`Edge "${edge?.id ?? "?"}" has an unknown source.`);
    if (!nodeIds.has(edge?.target)) errors.push(`Edge "${edge?.id ?? "?"}" has an unknown target.`);
    if (!EDGE_TYPES.has(edge?.edgeType)) errors.push(`Edge "${edge?.id ?? "?"}" has an invalid type.`);
    if (edge?.source === edge?.target) errors.push(`Edge "${edge?.id ?? "?"}" cannot connect a node to itself.`);
    const predErr = predicateError(edge?.predicate);
    if (predErr) errors.push(`Edge "${edge?.id ?? "?"}" ${predErr}.`);
  }
  if (!errors.length && dataGraphHasCycle(graph.nodes, graph.edges)) {
    errors.push("Data edges contain a cycle.");
  }
  return { ok: errors.length === 0, errors };
}

function applyOne(graph, operation) {
  const type = requireString(operation?.type, "Operation type");
  if (type === "set_graph_name") {
    const name = requireString(operation.name, "Graph name");
    graph.name = name;
    return `Renamed the loop to "${name}".`;
  }

  if (type === "add_node") {
    const node = clone(operation.node ?? {});
    node.id = requireString(node.id, "Node id");
    if (graph.nodes.some((item) => item.id === node.id)) throw new Error(`Node already exists: ${node.id}`);
    if (node.kind !== undefined && !NODE_KINDS.has(node.kind)) throw new Error(`Invalid node kind: ${node.kind}`);
    if (OPEN_KINDS.has(node.kind)) {
      node.ref = requireString(node.ref, "Node ref");
    } else if (node.kind === "switch") {
      // routing node — needs neither ref nor category
    } else if (!NODE_CATEGORIES.has(node.category)) {
      throw new Error(`Invalid node category: ${node.category}`);
    }
    node.label = requireString(node.label, "Node label");
    node.config = node.config && typeof node.config === "object" && !Array.isArray(node.config) ? node.config : {};
    if (node.outputKind !== undefined) node.outputKind = requireString(node.outputKind, "Node outputKind");
    if (node.contract != null) node.contract = normalizeContract(node.contract);
    node.position = {
      x: Number.isFinite(node.position?.x) ? node.position.x : 640,
      y: Number.isFinite(node.position?.y) ? node.position.y : 180,
    };
    graph.nodes.push(node);
    return `Added ${node.label}.`;
  }

  if (type === "remove_node") {
    const id = requireString(operation.nodeId, "Node id");
    const index = nodeIndex(graph, id);
    const [removed] = graph.nodes.splice(index, 1);
    graph.edges = graph.edges.filter((edge) => edge.source !== id && edge.target !== id);
    return `Removed ${removed.label} and its connections.`;
  }

  if (type === "update_node") {
    const id = requireString(operation.nodeId, "Node id");
    const index = nodeIndex(graph, id);
    const patch = operation.patch;
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
      throw new Error("update_node requires a patch object.");
    }
    const allowed = new Set(["label", "connector", "config", "agentPrompt", "position", "sourceOfTruth", "kind", "ref", "contract", "outputKind"]);
    const unknown = Object.keys(patch).filter((key) => !allowed.has(key));
    if (unknown.length) throw new Error(`Unsupported node patch fields: ${unknown.join(", ")}`);
    const current = graph.nodes[index];
    graph.nodes[index] = {
      ...current,
      ...clone(patch),
      config: patch.config ? { ...current.config, ...clone(patch.config) } : current.config,
      position: patch.position ? { ...current.position, ...clone(patch.position) } : current.position,
      contract: patch.contract === undefined ? current.contract : normalizeContract(patch.contract),
    };
    return `Updated ${graph.nodes[index].label}.`;
  }

  if (type === "connect_nodes") {
    const edge = clone(operation.edge ?? operation);
    edge.id = requireString(edge.id, "Edge id");
    edge.source = requireString(edge.source, "Edge source");
    edge.target = requireString(edge.target, "Edge target");
    edge.edgeType = edge.edgeType ?? "data";
    if (graph.edges.some((item) => item.id === edge.id)) throw new Error(`Edge already exists: ${edge.id}`);
    if (!graph.nodes.some((node) => node.id === edge.source)) throw new Error(`Unknown source node: ${edge.source}`);
    if (!graph.nodes.some((node) => node.id === edge.target)) throw new Error(`Unknown target node: ${edge.target}`);
    if (!EDGE_TYPES.has(edge.edgeType)) throw new Error(`Invalid edge type: ${edge.edgeType}`);
    const predErr = predicateError(edge.predicate);
    if (predErr) throw new Error(`Edge ${edge.id} ${predErr}.`);
    graph.edges.push({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      edgeType: edge.edgeType,
      ...(edge.label ? { label: String(edge.label) } : {}),
      ...(edge.predicate ? { predicate: clone(edge.predicate) } : {}),
    });
    return `Connected ${edge.source} to ${edge.target}.`;
  }

  if (type === "disconnect_nodes") {
    const id = requireString(operation.edgeId, "Edge id");
    const index = edgeIndex(graph, id);
    graph.edges.splice(index, 1);
    return `Removed connection ${id}.`;
  }

  throw new Error(`Unsupported graph operation: ${type}`);
}

export function applyGraphOperations(inputGraph, operations) {
  if (!Array.isArray(operations) || operations.length === 0) {
    throw new Error("At least one graph operation is required.");
  }
  if (operations.length > 24) throw new Error("A single patch may contain at most 24 operations.");

  const graph = clone(inputGraph);
  const changes = operations.map((operation) => ({
    type: operation.type,
    detail: applyOne(graph, operation),
  }));
  graph.revision = nextRevision(inputGraph);
  const validation = validateGraph(graph);
  if (!validation.ok) throw new Error(`Graph patch is invalid: ${validation.errors.join(" ")}`);
  return { graph, changes, validation };
}
