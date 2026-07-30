import {
  CROKI_CONTEXT_LIMITS,
  CrokiContextParseError,
  parseCrokiContext,
  parseCrokiContextEdge,
  parseCrokiContextNode,
  type CrokiContext,
  type CrokiContextEdge,
  type CrokiContextParseErrorCode,
  type CrokiContextNode,
} from "./crokiContext.ts";

export interface CrokiContextRecoveryIssue {
  readonly code: CrokiContextParseErrorCode;
  readonly message: string;
  readonly path: `nodes[${number}]` | `edges[${number}]`;
}

export interface CrokiContextRecovery {
  readonly context: CrokiContext;
  readonly issues: readonly CrokiContextRecoveryIssue[];
}

/**
 * Recovers independently valid nodes and relationships from a structurally
 * valid context file. Invalid JSON, envelopes, and source limits still fail so
 * repository data cannot invent a different Canvas boundary.
 */
export function recoverCrokiContext(input: string): CrokiContextRecovery {
  if (new TextEncoder().encode(input).byteLength > CROKI_CONTEXT_LIMITS.sourceBytes) {
    throw new CrokiContextParseError(
      "limit-exceeded",
      `Croki context exceeds ${CROKI_CONTEXT_LIMITS.sourceBytes} source bytes.`,
    );
  }

  let value: unknown;
  try {
    value = JSON.parse(input);
  } catch {
    throw new CrokiContextParseError("invalid-json", "Croki context is not valid JSON.");
  }
  if (!isRecord(value) || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
    throw new CrokiContextParseError("malformed", "Croki context is malformed.");
  }
  if (value.nodes.length > CROKI_CONTEXT_LIMITS.nodes) {
    throw new CrokiContextParseError(
      "limit-exceeded",
      `Croki context exceeds ${CROKI_CONTEXT_LIMITS.nodes} nodes.`,
    );
  }
  if (value.edges.length > CROKI_CONTEXT_LIMITS.edges) {
    throw new CrokiContextParseError(
      "limit-exceeded",
      `Croki context exceeds ${CROKI_CONTEXT_LIMITS.edges} relationships.`,
    );
  }

  const envelope = parseCrokiContext(
    JSON.stringify({
      ...value,
      nodes: [],
      edges: [],
    }),
  );
  const issues: CrokiContextRecoveryIssue[] = [];
  const nodes: CrokiContextNode[] = [];
  const nodeIds = new Set<string>();

  value.nodes.forEach((candidate, index) => {
    try {
      const node = parseCrokiContextNode(candidate, index);
      if (nodeIds.has(node.id)) {
        issues.push({
          code: "duplicate-node-id",
          message: `Croki context node ${index} duplicates id '${node.id}'.`,
          path: `nodes[${index}]`,
        });
        return;
      }
      nodeIds.add(node.id);
      nodes.push(node);
    } catch (error) {
      issues.push(issueFromError(error, `nodes[${index}]`));
    }
  });

  const edges: CrokiContextEdge[] = [];
  const edgeKeys = new Set<string>();
  value.edges.forEach((candidate, index) => {
    try {
      const edge = parseCrokiContextEdge(candidate, index);
      if (edge.from === edge.to || !nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
        issues.push({
          code: "invalid-edge",
          message: `Croki context relationship ${index} does not connect distinct recovered nodes.`,
          path: `edges[${index}]`,
        });
        return;
      }
      const key = JSON.stringify([edge.from, edge.relation, edge.to]);
      if (edgeKeys.has(key)) {
        issues.push({
          code: "duplicate-edge",
          message: `Croki context relationship ${index} is duplicated.`,
          path: `edges[${index}]`,
        });
        return;
      }
      edgeKeys.add(key);
      edges.push(edge);
    } catch (error) {
      issues.push(issueFromError(error, `edges[${index}]`));
    }
  });

  return {
    context: {
      ...envelope,
      nodes,
      edges,
    },
    issues,
  };
}

function issueFromError(
  error: unknown,
  path: CrokiContextRecoveryIssue["path"],
): CrokiContextRecoveryIssue {
  return error instanceof CrokiContextParseError
    ? { code: error.code, message: error.message, path }
    : { code: "malformed", message: "Croki context entry is malformed.", path };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
