import { parseCrokiContextReference, type CrokiContextReference } from "@croki/shared/crokiContext";
import {
  CrokiCanvasArtifact,
  type CrokiCanvasArtifact as CrokiCanvasArtifactValue,
  type CrokiCanvasArtifactEdge,
  type CrokiCanvasArtifactNode,
} from "@croki/shared/crokiCanvasArtifact";
import * as Schema from "effect/Schema";

import {
  CROKI_CANVAS_PRESENT_LIMITS,
  type CanonicalCanvasEdgeInput,
  type CanonicalCanvasNodeInput,
  type CrokiCanvasHarnessId,
  type CrokiCanvasPresentation,
  type CrokiCanvasPresentInput,
} from "./tools.ts";

const decodeCrokiCanvasArtifact = Schema.decodeUnknownSync(CrokiCanvasArtifact);

export interface BuildCrokiCanvasArtifactOptions {
  readonly artifactId: string;
  readonly revision: number;
  readonly threadId: string;
  readonly turnId: string | null;
  readonly harnessId: CrokiCanvasHarnessId;
  readonly createdAt: string;
}

interface NormalizedCanvasScene {
  readonly presentation: CrokiCanvasPresentation;
  readonly question: string;
  readonly nodes: readonly CrokiCanvasArtifactNode[];
  readonly edges: readonly CrokiCanvasArtifactEdge[];
}

/**
 * Converts the current and rollout-era tool wire shapes into one immutable
 * artifact. This function is intentionally pure so malformed scenes can fail
 * the MCP tool without touching project context or orchestration state.
 */
export function buildCrokiCanvasArtifact(
  input: CrokiCanvasPresentInput,
  options: BuildCrokiCanvasArtifactOptions,
): CrokiCanvasArtifactValue {
  const scene = normalizeScene(input);
  const artifact = {
    id: options.artifactId.trim(),
    revision: options.revision,
    threadId: options.threadId,
    turnId: options.turnId,
    harnessId: options.harnessId,
    presentation: scene.presentation,
    question: scene.question,
    nodes: scene.nodes,
    edges: scene.edges,
    createdAt: options.createdAt,
  };

  // Decode once more at the artifact boundary. The MCP parameter schema is a
  // helpful first line of defense, while this check protects the activity
  // store from future call sites that bypass the generated tool decoder.
  const encoded = JSON.stringify(artifact);
  if (new TextEncoder().encode(encoded).byteLength > CROKI_CANVAS_PRESENT_LIMITS.artifactBytes) {
    throw new Error("The Canvas visual exceeds the artifact size limit.");
  }
  return decodeCrokiCanvasArtifact(artifact);
}

function normalizeScene(input: CrokiCanvasPresentInput): NormalizedCanvasScene {
  if ("presentation" in input) {
    const nodeIds = new Set<string>();
    const nodes = input.nodes.map((node) => {
      const normalized = normalizeCanonicalNode(node);
      if (nodeIds.has(normalized.id)) {
        throw new Error(`Canvas node id '${normalized.id}' is duplicated.`);
      }
      nodeIds.add(normalized.id);
      return normalized;
    });
    return {
      presentation: input.presentation,
      question: input.question.trim(),
      nodes,
      edges: normalizeEdges(input.edges, nodeIds),
    };
  }

  if (input.view === "workflow") {
    throw new Error("Canvas workflow scenes are no longer supported; choose Product or GTM.");
  }
  const nodeIds = new Set<string>();
  const nodes = input.nodes.map((node) => {
    const normalized = normalizeLegacyNode(node);
    if (nodeIds.has(normalized.id)) {
      throw new Error(`Canvas node id '${normalized.id}' is duplicated.`);
    }
    nodeIds.add(normalized.id);
    return normalized;
  });
  return {
    // A legacy `view` did not carry a presentation kind. Compare is the least
    // surprising projection for old Product/GTM scenes and remains recoverable.
    presentation: "compare",
    question: input.question.trim(),
    nodes,
    edges: normalizeEdges(input.edges, nodeIds),
  };
}

function normalizeCanonicalNode(node: CanonicalCanvasNodeInput): CrokiCanvasArtifactNode {
  return {
    id: node.id.trim(),
    role: node.role,
    title: node.title.trim(),
    ...(node.body !== undefined ? { body: node.body.trim() } : {}),
    ...(node.whyItMatters !== undefined ? { whyItMatters: node.whyItMatters.trim() } : {}),
    ...(node.references !== undefined ? { references: normalizeReferences(node.references) } : {}),
  };
}

function normalizeLegacyNode(
  node: Extract<CrokiCanvasPresentInput, { view: unknown }>["nodes"][number],
): CrokiCanvasArtifactNode {
  const role =
    node.kind === "intent"
      ? "question"
      : node.kind === "decision"
        ? "route"
        : node.kind === "evidence"
          ? "evidence"
          : "action";
  return {
    id: node.id.trim(),
    role,
    title: node.title.trim(),
    ...(node.body !== undefined ? { body: node.body.trim() } : {}),
    ...(node.references !== undefined ? { references: normalizeReferences(node.references) } : {}),
  };
}

function normalizeReferences(references: readonly unknown[]): readonly CrokiContextReference[] {
  return references.map((reference, index) =>
    parseCrokiContextReference(reference, `Canvas node reference ${index}`),
  );
}

function normalizeEdges(
  edges: readonly CanonicalCanvasEdgeInput[],
  nodeIds: ReadonlySet<string>,
): readonly CrokiCanvasArtifactEdge[] {
  const seen = new Set<string>();
  return edges.map((edge) => {
    const from = edge.from.trim();
    const to = edge.to.trim();
    const relation = edge.relation.trim();
    if (from === to) throw new Error("A Canvas relationship cannot point to itself.");
    if (!nodeIds.has(from) || !nodeIds.has(to)) {
      throw new Error(`Canvas relationship '${from}' to '${to}' references a missing node.`);
    }
    const key = JSON.stringify([from, relation, to]);
    if (seen.has(key)) {
      throw new Error(`Canvas relationship '${from}' to '${to}' is duplicated.`);
    }
    seen.add(key);
    return { from, to, relation };
  });
}
