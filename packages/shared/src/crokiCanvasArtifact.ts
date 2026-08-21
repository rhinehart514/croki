import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SchemaIssue from "effect/SchemaIssue";

import { IsoDateTime, PositiveInt, ThreadId, TrimmedString, TurnId } from "@croki/contracts";

/**
 * Canvas artifacts are intentionally smaller than repository context. They
 * are presentation snapshots carried by a Thread activity, not a second
 * project-memory store.
 */
export const CROKI_CANVAS_ARTIFACT_LIMITS = {
  artifactIdChars: 128,
  artifactBytes: 256_000,
  questionChars: 600,
  nodes: 24,
  edges: 48,
  nodeIdChars: 120,
  nodeTitleChars: 240,
  nodeBodyChars: 4_000,
  nodeWhyItMattersChars: 1_000,
  edgeRelationChars: 120,
  referencesPerNode: 20,
  revision: 10_000,
} as const;

const CanvasId = TrimmedString.check(
  Schema.isNonEmpty(),
  Schema.isMaxLength(CROKI_CANVAS_ARTIFACT_LIMITS.artifactIdChars),
);
const CanvasNodeId = TrimmedString.check(
  Schema.isNonEmpty(),
  Schema.isMaxLength(CROKI_CANVAS_ARTIFACT_LIMITS.nodeIdChars),
);
const CanvasQuestion = TrimmedString.check(
  Schema.isNonEmpty(),
  Schema.isMaxLength(CROKI_CANVAS_ARTIFACT_LIMITS.questionChars),
);
const CanvasNodeTitle = TrimmedString.check(
  Schema.isNonEmpty(),
  Schema.isMaxLength(CROKI_CANVAS_ARTIFACT_LIMITS.nodeTitleChars),
);
const CanvasNodeBody = Schema.String.check(
  Schema.isMaxLength(CROKI_CANVAS_ARTIFACT_LIMITS.nodeBodyChars),
);
const CanvasWhyItMatters = Schema.String.check(
  Schema.isMaxLength(CROKI_CANVAS_ARTIFACT_LIMITS.nodeWhyItMattersChars),
);
const CanvasEdgeRelation = TrimmedString.check(
  Schema.isNonEmpty(),
  Schema.isMaxLength(CROKI_CANVAS_ARTIFACT_LIMITS.edgeRelationChars),
);
const CanvasThreadId = ThreadId.check(
  Schema.isMaxLength(CROKI_CANVAS_ARTIFACT_LIMITS.artifactIdChars),
);
const CanvasTurnId = TurnId.check(Schema.isMaxLength(CROKI_CANVAS_ARTIFACT_LIMITS.artifactIdChars));
const CanvasReferencePath = TrimmedString.check(
  Schema.isMaxLength(500),
  Schema.makeFilter(isPortableReferencePath),
);
const CanvasReferenceUrl = TrimmedString.check(Schema.isMaxLength(2_048));

/** Visual arrangement selected by a Product or GTM harness. */
export const CrokiCanvasPresentation = Schema.Literals([
  "compare",
  "journey",
  "system",
  "evidence",
]);
export type CrokiCanvasPresentation = typeof CrokiCanvasPresentation.Type;

/** Semantic role used by the deterministic Canvas renderer. */
export const CrokiCanvasNodeRole = Schema.Literals([
  "question",
  "focal",
  "route",
  "evidence",
  "action",
  "warning",
]);
export type CrokiCanvasNodeRole = typeof CrokiCanvasNodeRole.Type;

export const CrokiCanvasHarnessId = Schema.Literals(["product-v1", "gtm-v1"]);
export type CrokiCanvasHarnessId = typeof CrokiCanvasHarnessId.Type;
export const CrokiCanvasArtifactSource = Schema.Literal("user-applied");
export type CrokiCanvasArtifactSource = typeof CrokiCanvasArtifactSource.Type;

export const CrokiCanvasReference = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("file"),
    path: CanvasReferencePath,
    line: Schema.optional(
      Schema.Int.check(Schema.isGreaterThanOrEqualTo(1), Schema.isLessThanOrEqualTo(1_000_000)),
    ),
  }),
  Schema.Struct({
    kind: Schema.Literal("url"),
    url: CanvasReferenceUrl.check(Schema.makeFilter(isHttpUrl)),
  }),
]);
export type CrokiCanvasArtifactReference = typeof CrokiCanvasReference.Type;

const CrokiCanvasArtifactNodeFields = {
  id: CanvasNodeId,
  role: CrokiCanvasNodeRole,
  title: CanvasNodeTitle,
  body: Schema.optional(CanvasNodeBody),
  whyItMatters: Schema.optional(CanvasWhyItMatters),
  references: Schema.optional(
    Schema.Array(CrokiCanvasReference).check(
      Schema.isMaxLength(CROKI_CANVAS_ARTIFACT_LIMITS.referencesPerNode),
    ),
  ),
} as const;

export const CrokiCanvasArtifactNode = Schema.Struct(CrokiCanvasArtifactNodeFields);
export type CrokiCanvasArtifactNode = typeof CrokiCanvasArtifactNode.Type;

export const CrokiCanvasArtifactEdge = Schema.Struct({
  from: CanvasNodeId,
  to: CanvasNodeId,
  relation: CanvasEdgeRelation,
});
export type CrokiCanvasArtifactEdge = typeof CrokiCanvasArtifactEdge.Type;

const CrokiCanvasRevision = PositiveInt.check(
  Schema.isLessThanOrEqualTo(CROKI_CANVAS_ARTIFACT_LIMITS.revision),
);

const CrokiCanvasArtifactBase = Schema.Struct({
  id: CanvasId,
  revision: CrokiCanvasRevision,
  threadId: CanvasThreadId,
  turnId: Schema.NullOr(CanvasTurnId),
  /** New artifacts record explicit user-applied tool access. */
  source: Schema.optional(CrokiCanvasArtifactSource),
  /** Historical Product/GTM attribution. New artifacts never write this field. */
  harnessId: Schema.optional(CrokiCanvasHarnessId),
  presentation: CrokiCanvasPresentation,
  question: CanvasQuestion,
  nodes: Schema.Array(CrokiCanvasArtifactNode).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(CROKI_CANVAS_ARTIFACT_LIMITS.nodes),
  ),
  edges: Schema.Array(CrokiCanvasArtifactEdge).check(
    Schema.isMaxLength(CROKI_CANVAS_ARTIFACT_LIMITS.edges),
  ),
  createdAt: IsoDateTime.check(Schema.makeFilter(isIsoDateTime)),
});

/**
 * Immutable-by-construction revision. A later presentation creates another
 * revision; it never mutates this value in place. Cross-reference checks are
 * part of the schema so both server and client reject malformed artifacts.
 */
export const CrokiCanvasArtifact = CrokiCanvasArtifactBase.check(
  Schema.makeFilter((artifact) => {
    if ((artifact.source === undefined) === (artifact.harnessId === undefined)) {
      return new SchemaIssue.InvalidValue({
        message: "Canvas artifact requires exactly one current source or legacy harness id.",
      });
    }
    if (
      new TextEncoder().encode(JSON.stringify(artifact)).byteLength >
      CROKI_CANVAS_ARTIFACT_LIMITS.artifactBytes
    ) {
      return new SchemaIssue.InvalidValue({
        message: "Canvas artifact exceeds its serialized size limit.",
      });
    }

    const nodeIds = new Set<string>();
    for (const node of artifact.nodes) {
      if (nodeIds.has(node.id)) {
        return new SchemaIssue.InvalidValue({
          message: `Canvas artifact contains duplicate node id '${node.id}'.`,
        });
      }
      nodeIds.add(node.id);
    }

    const edgeKeys = new Set<string>();
    for (const edge of artifact.edges) {
      if (edge.from === edge.to || !nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
        return new SchemaIssue.InvalidValue({
          message: "Canvas artifact contains an edge with invalid endpoints.",
        });
      }
      const key = `${edge.from}\u0000${edge.relation}\u0000${edge.to}`;
      if (edgeKeys.has(key)) {
        return new SchemaIssue.InvalidValue({
          message: "Canvas artifact contains duplicate edges.",
        });
      }
      edgeKeys.add(key);
    }

    return true;
  }),
);
export type CrokiCanvasArtifact = typeof CrokiCanvasArtifact.Type;
/** Explicit alias for callers that name the immutable unit a revision. */
export const CrokiCanvasArtifactRevision = CrokiCanvasArtifact;
export type CrokiCanvasArtifactRevision = CrokiCanvasArtifact;

const decodeArtifact = Schema.decodeUnknownOption(CrokiCanvasArtifact, {
  onExcessProperty: "error",
});

/** Safely parses an untrusted Thread-scoped Canvas revision. */
export function parseCrokiCanvasArtifact(input: unknown): CrokiCanvasArtifact | null {
  return Option.getOrNull(decodeArtifact(input));
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.length > 0;
  } catch {
    return false;
  }
}

function isIsoDateTime(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/u.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function isPortableReferencePath(value: string): boolean {
  if (
    value.length === 0 ||
    value.startsWith("/") ||
    /^[a-z]:\//iu.test(value) ||
    value.includes("\\") ||
    value.split("/").includes("..")
  ) {
    return false;
  }
  return [...value].every((character) => {
    const codePoint = character.codePointAt(0);
    return (
      codePoint !== undefined &&
      codePoint > 0x1f &&
      codePoint !== 0x7f &&
      !(codePoint >= 0x2028 && codePoint <= 0x202e) &&
      !(codePoint >= 0x2066 && codePoint <= 0x2069)
    );
  });
}
