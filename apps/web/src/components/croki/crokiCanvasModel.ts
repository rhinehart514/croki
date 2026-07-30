import type {
  CrokiContext,
  CrokiContextEdge,
  CrokiContextNode,
  CrokiContextReference,
  CrokiNodeDomain,
  CrokiNodeKind,
} from "@t3tools/shared/crokiContext";
import { CROKI_CONTEXT_LIMITS, parseCrokiContextReference } from "@t3tools/shared/crokiContext";

export type CrokiCanvasModelError =
  | "duplicate-edge"
  | "duplicate-reference"
  | "edge-limit"
  | "invalid-body"
  | "invalid-product"
  | "invalid-reference"
  | "missing-node"
  | "node-limit"
  | "reference-limit"
  | "self-edge"
  | "invalid-relation"
  | "invalid-title";

export interface CrokiCanvasTransition {
  readonly context: CrokiContext;
  readonly error: CrokiCanvasModelError | null;
}

interface NewNodeInput {
  readonly id: string;
  readonly kind: CrokiNodeKind;
  readonly domain?: CrokiNodeDomain;
  readonly now: string;
}

interface NewEdgeInput {
  readonly from: string;
  readonly to: string;
  readonly relation: string;
  readonly now: string;
}

export function addCrokiNode(context: CrokiContext, input: NewNodeInput): CrokiCanvasTransition {
  if (context.nodes.length >= CROKI_CONTEXT_LIMITS.nodes) {
    return { context, error: "node-limit" };
  }
  const node: CrokiContextNode = {
    id: input.id,
    kind: input.kind,
    status: "provisional",
    domain: input.domain ?? "product",
    origin: "founder",
    title: `New ${input.kind}`,
    body: "",
    updatedAt: input.now,
  };
  return {
    context: touch(context, input.now, { nodes: [...context.nodes, node] }),
    error: null,
  };
}

export function updateCrokiNode(
  context: CrokiContext,
  id: string,
  patch: Partial<Pick<CrokiContextNode, "title" | "body" | "kind" | "status" | "domain">>,
  now: string,
): CrokiCanvasTransition {
  if (!context.nodes.some((node) => node.id === id)) {
    return { context, error: "missing-node" };
  }
  const error =
    patch.title !== undefined &&
    (!patch.title.trim() || patch.title.length > CROKI_CONTEXT_LIMITS.nodeTitleChars)
      ? "invalid-title"
      : patch.body !== undefined && patch.body.length > CROKI_CONTEXT_LIMITS.nodeBodyChars
        ? "invalid-body"
        : null;
  return {
    context: touch(context, now, {
      nodes: context.nodes.map((node) =>
        node.id === id ? { ...node, ...patch, updatedAt: now } : node,
      ),
    }),
    error,
  };
}

export function addCrokiNodeReference(
  context: CrokiContext,
  id: string,
  input: CrokiContextReference,
  now: string,
): CrokiCanvasTransition {
  const node = context.nodes.find((candidate) => candidate.id === id);
  if (!node) return { context, error: "missing-node" };
  let reference: CrokiContextReference;
  try {
    reference = parseCrokiContextReference(input);
  } catch {
    return { context, error: "invalid-reference" };
  }
  const references = node.references ?? [];
  if (references.length >= CROKI_CONTEXT_LIMITS.referencesPerNode) {
    return { context, error: "reference-limit" };
  }
  if (
    references.some((candidate) => crokiReferenceKey(candidate) === crokiReferenceKey(reference))
  ) {
    return { context, error: "duplicate-reference" };
  }
  return {
    context: touch(context, now, {
      nodes: context.nodes.map((candidate) =>
        candidate.id === id
          ? { ...candidate, references: [...references, reference], updatedAt: now }
          : candidate,
      ),
    }),
    error: null,
  };
}

export function removeCrokiNodeReference(
  context: CrokiContext,
  id: string,
  reference: CrokiContextReference,
  now: string,
): CrokiCanvasTransition {
  const node = context.nodes.find((candidate) => candidate.id === id);
  if (!node) return { context, error: "missing-node" };
  const key = crokiReferenceKey(reference);
  const references = (node.references ?? []).filter(
    (candidate) => crokiReferenceKey(candidate) !== key,
  );
  return {
    context: touch(context, now, {
      nodes: context.nodes.map((candidate) =>
        candidate.id === id ? withCrokiNodeReferences(candidate, references, now) : candidate,
      ),
    }),
    error: null,
  };
}

export function crokiReferenceKey(reference: CrokiContextReference): string {
  return reference.kind === "file"
    ? `file:${reference.path}:${reference.line ?? ""}`
    : `url:${reference.url}`;
}

export function adoptCrokiNode(
  context: CrokiContext,
  id: string,
  now: string,
): CrokiCanvasTransition {
  return updateCrokiNode(context, id, { status: "current" }, now);
}

export function retireCrokiNode(
  context: CrokiContext,
  id: string,
  now: string,
): CrokiCanvasTransition {
  return updateCrokiNode(context, id, { status: "retired" }, now);
}

export function deleteCrokiNode(
  context: CrokiContext,
  id: string,
  now: string,
): CrokiCanvasTransition {
  if (!context.nodes.some((node) => node.id === id)) {
    return { context, error: "missing-node" };
  }
  return {
    context: touch(context, now, {
      nodes: context.nodes.filter((node) => node.id !== id),
      edges: context.edges.filter((edge) => edge.from !== id && edge.to !== id),
    }),
    error: null,
  };
}

export function addCrokiEdge(context: CrokiContext, input: NewEdgeInput): CrokiCanvasTransition {
  const relation = input.relation.trim();
  if (!relation || relation.length > CROKI_CONTEXT_LIMITS.edgeRelationChars) {
    return { context, error: "invalid-relation" };
  }
  if (input.from === input.to) return { context, error: "self-edge" };
  const nodeIds = new Set(context.nodes.map((node) => node.id));
  if (!nodeIds.has(input.from) || !nodeIds.has(input.to)) {
    return { context, error: "missing-node" };
  }
  if (context.edges.length >= CROKI_CONTEXT_LIMITS.edges) {
    return { context, error: "edge-limit" };
  }
  if (
    context.edges.some(
      (edge) => edge.from === input.from && edge.to === input.to && edge.relation === relation,
    )
  ) {
    return { context, error: "duplicate-edge" };
  }
  return {
    context: touch(context, input.now, {
      edges: [...context.edges, { from: input.from, to: input.to, relation }],
    }),
    error: null,
  };
}

export function deleteCrokiEdge(
  context: CrokiContext,
  edge: CrokiContextEdge,
  now: string,
): CrokiContext {
  return touch(context, now, {
    edges: context.edges.filter(
      (candidate) =>
        candidate.from !== edge.from ||
        candidate.to !== edge.to ||
        candidate.relation !== edge.relation,
    ),
  });
}

export function replaceCrokiProduct(
  context: CrokiContext,
  product: string,
  now: string,
): CrokiContext {
  return touch(context, now, { product });
}

export function groupCrokiNodes(context: CrokiContext) {
  return {
    current: context.nodes.filter((node) => node.status === "current"),
    provisional: context.nodes.filter((node) => node.status === "provisional"),
    retired: context.nodes.filter((node) => node.status === "retired"),
  };
}

export function isCrokiContextDirty(context: CrokiContext, baseline: CrokiContext): boolean {
  return editableFingerprint(context) !== editableFingerprint(baseline);
}

export function validateCrokiContextForSave(
  context: CrokiContext,
): readonly CrokiCanvasModelError[] {
  const errors = new Set<CrokiCanvasModelError>();
  if (context.product.length > CROKI_CONTEXT_LIMITS.productChars) {
    errors.add("invalid-product");
  }
  if (context.nodes.length > CROKI_CONTEXT_LIMITS.nodes) errors.add("node-limit");
  if (context.edges.length > CROKI_CONTEXT_LIMITS.edges) errors.add("edge-limit");
  for (const node of context.nodes) {
    if (!node.title.trim() || node.title.length > CROKI_CONTEXT_LIMITS.nodeTitleChars) {
      errors.add("invalid-title");
    }
    if (node.body.length > CROKI_CONTEXT_LIMITS.nodeBodyChars) {
      errors.add("invalid-body");
    }
    if ((node.references?.length ?? 0) > CROKI_CONTEXT_LIMITS.referencesPerNode) {
      errors.add("reference-limit");
    }
    for (const reference of node.references ?? []) {
      try {
        parseCrokiContextReference(reference);
      } catch {
        errors.add("invalid-reference");
      }
    }
  }
  for (const edge of context.edges) {
    if (!edge.relation.trim() || edge.relation.length > CROKI_CONTEXT_LIMITS.edgeRelationChars) {
      errors.add("invalid-relation");
    }
  }
  return [...errors];
}

function editableFingerprint(context: CrokiContext): string {
  return JSON.stringify({
    product: context.product,
    nodes: context.nodes.map(({ updatedAt: _, ...node }) => node),
    edges: context.edges,
  });
}

function withCrokiNodeReferences(
  node: CrokiContextNode,
  references: readonly CrokiContextReference[],
  now: string,
): CrokiContextNode {
  const { references: _, ...withoutReferences } = node;
  return references.length > 0
    ? { ...withoutReferences, references, updatedAt: now }
    : { ...withoutReferences, updatedAt: now };
}

function touch(
  context: CrokiContext,
  now: string,
  patch: Partial<Pick<CrokiContext, "product" | "nodes" | "edges">>,
): CrokiContext {
  return { ...context, ...patch, updatedAt: now };
}
