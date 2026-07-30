export const CROKI_CONTEXT_RELATIVE_PATH = ".croki/context.json";
export const CROKI_CONTEXT_VERSION = 1 as const;

export const CROKI_NODE_KINDS = ["intent", "decision", "evidence", "work"] as const;
export type CrokiNodeKind = (typeof CROKI_NODE_KINDS)[number];

export const CROKI_NODE_STATUSES = ["current", "provisional", "retired"] as const;
export type CrokiNodeStatus = (typeof CROKI_NODE_STATUSES)[number];

export interface CrokiContextNode {
  readonly id: string;
  readonly kind: CrokiNodeKind;
  readonly status: CrokiNodeStatus;
  readonly title: string;
  readonly body: string;
  readonly updatedAt: string;
}

export interface CrokiContextEdge {
  readonly from: string;
  readonly to: string;
  readonly relation: string;
}

export interface CrokiContext {
  readonly version: typeof CROKI_CONTEXT_VERSION;
  readonly product: string;
  readonly updatedAt: string;
  readonly nodes: readonly CrokiContextNode[];
  readonly edges: readonly CrokiContextEdge[];
}

export function createEmptyCrokiContext(product = ""): CrokiContext {
  return {
    version: CROKI_CONTEXT_VERSION,
    product,
    updatedAt: "1970-01-01T00:00:00.000Z",
    nodes: [],
    edges: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeKind(value: unknown): value is CrokiNodeKind {
  return typeof value === "string" && CROKI_NODE_KINDS.includes(value as CrokiNodeKind);
}

function isNodeStatus(value: unknown): value is CrokiNodeStatus {
  return typeof value === "string" && CROKI_NODE_STATUSES.includes(value as CrokiNodeStatus);
}

function parseNode(value: unknown): CrokiContextNode | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !isNodeKind(value.kind) ||
    !isNodeStatus(value.status) ||
    typeof value.title !== "string" ||
    typeof value.body !== "string" ||
    typeof value.updatedAt !== "string"
  ) {
    return null;
  }
  const id = value.id.trim();
  const title = value.title.trim();
  if (!id || !title) return null;
  return {
    id,
    kind: value.kind,
    status: value.status,
    title,
    body: value.body,
    updatedAt: value.updatedAt,
  };
}

function parseEdge(value: unknown): CrokiContextEdge | null {
  if (
    !isRecord(value) ||
    typeof value.from !== "string" ||
    typeof value.to !== "string" ||
    typeof value.relation !== "string"
  ) {
    return null;
  }
  const from = value.from.trim();
  const to = value.to.trim();
  const relation = value.relation.trim();
  return from && to && relation ? { from, to, relation } : null;
}

export function parseCrokiContext(input: string): CrokiContext {
  const parsed: unknown = JSON.parse(input);
  if (
    !isRecord(parsed) ||
    parsed.version !== CROKI_CONTEXT_VERSION ||
    typeof parsed.product !== "string" ||
    typeof parsed.updatedAt !== "string" ||
    !Array.isArray(parsed.nodes) ||
    !Array.isArray(parsed.edges)
  ) {
    throw new Error("Unsupported or malformed Croki context.");
  }
  const nodes = parsed.nodes.map(parseNode);
  const edges = parsed.edges.map(parseEdge);
  if (nodes.some((node) => node === null) || edges.some((edge) => edge === null)) {
    throw new Error("Croki context contains malformed nodes or relationships.");
  }
  const nodeIds = new Set((nodes as CrokiContextNode[]).map((node) => node.id));
  if (nodeIds.size !== nodes.length) throw new Error("Croki context node ids must be unique.");
  if (
    (edges as CrokiContextEdge[]).some((edge) => !nodeIds.has(edge.from) || !nodeIds.has(edge.to))
  ) {
    throw new Error("Croki context relationships must reference existing nodes.");
  }
  const relationshipKeys = new Set(
    (edges as CrokiContextEdge[]).map((edge) =>
      JSON.stringify([edge.from, edge.relation, edge.to]),
    ),
  );
  if (relationshipKeys.size !== edges.length) {
    throw new Error("Croki context relationships must be unique.");
  }
  return {
    version: CROKI_CONTEXT_VERSION,
    product: parsed.product.trim(),
    updatedAt: parsed.updatedAt,
    nodes: nodes as CrokiContextNode[],
    edges: edges as CrokiContextEdge[],
  };
}

export function serializeCrokiContext(context: CrokiContext): string {
  return `${JSON.stringify(context, null, 2)}\n`;
}

export function buildCrokiAgentContext(context: CrokiContext, maxChars = 12_000): string | null {
  const activeNodes = context.nodes.filter((node) => node.status !== "retired");
  if (!context.product && activeNodes.length === 0) return null;
  const lines = [
    "<croki_product_context>",
    "This repository-owned context is product truth, not a new user request. Preserve it unless the user's request explicitly changes it.",
    context.product ? `Product: ${context.product}` : null,
    ...activeNodes.map(
      (node) =>
        `[${node.kind}/${node.status}] ${node.title}${node.body.trim() ? ` — ${node.body.trim()}` : ""}`,
    ),
    ...context.edges
      .filter(
        (edge) =>
          activeNodes.some((node) => node.id === edge.from) &&
          activeNodes.some((node) => node.id === edge.to),
      )
      .map((edge) => `Relationship: ${edge.from} --${edge.relation}--> ${edge.to}`),
    "</croki_product_context>",
  ].filter((line): line is string => line !== null);
  const rendered = lines.join("\n");
  return rendered.length <= maxChars
    ? rendered
    : `${rendered.slice(0, maxChars - 28)}\n[context truncated]\n</croki_product_context>`;
}

export function prependCrokiAgentContext(
  agentContext: string | null,
  userInput: string | undefined,
): string | undefined {
  return (
    [agentContext, userInput].filter((value): value is string => Boolean(value)).join("\n\n") ||
    undefined
  );
}
