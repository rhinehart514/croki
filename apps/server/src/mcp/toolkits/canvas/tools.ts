import { CROKI_CONTEXT_LIMITS } from "@croki/shared/crokiContext";
import {
  CROKI_CANVAS_ARTIFACT_LIMITS,
  CrokiCanvasHarnessId as ArtifactHarnessId,
  CrokiCanvasNodeRole as ArtifactNodeRole,
  CrokiCanvasPresentation as ArtifactPresentation,
} from "@croki/shared/crokiCanvasArtifact";
import type {
  CrokiCanvasHarnessId as CrokiCanvasHarnessIdType,
  CrokiCanvasPresentation as CrokiCanvasPresentationType,
} from "@croki/shared/crokiCanvasArtifact";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/unstable/ai";

import { OrchestrationEngineService } from "../../../orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "../../../orchestration/Services/ProjectionSnapshotQuery.ts";
import * as Crypto from "effect/Crypto";
import * as McpInvocationContext from "../../McpInvocationContext.ts";

/**
 * Canvas presentation is deliberately smaller than project context. A
 * presentation is a bounded visual argument, not a second memory store.
 */
export const CROKI_CANVAS_PRESENT_LIMITS = {
  nodes: CROKI_CANVAS_ARTIFACT_LIMITS.nodes,
  edges: CROKI_CANVAS_ARTIFACT_LIMITS.edges,
  questionChars: CROKI_CANVAS_ARTIFACT_LIMITS.questionChars,
  nodeIdChars: CROKI_CANVAS_ARTIFACT_LIMITS.nodeIdChars,
  nodeTitleChars: CROKI_CANVAS_ARTIFACT_LIMITS.nodeTitleChars,
  nodeBodyChars: CROKI_CANVAS_ARTIFACT_LIMITS.nodeBodyChars,
  nodeWhyItMattersChars: CROKI_CANVAS_ARTIFACT_LIMITS.nodeWhyItMattersChars,
  edgeRelationChars: CROKI_CANVAS_ARTIFACT_LIMITS.edgeRelationChars,
  artifactBytes: CROKI_CANVAS_ARTIFACT_LIMITS.artifactBytes,
} as const;

const NonEmpty = Schema.String.check(Schema.isNonEmpty());
const BoundedId = NonEmpty.check(Schema.isMaxLength(CROKI_CANVAS_PRESENT_LIMITS.nodeIdChars));
const CrokiCanvasReference = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("file"),
    path: NonEmpty.check(Schema.isMaxLength(CROKI_CONTEXT_LIMITS.referencePathChars)),
    line: Schema.optional(Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1))),
  }),
  Schema.Struct({
    kind: Schema.Literal("url"),
    url: NonEmpty.check(Schema.isMaxLength(CROKI_CONTEXT_LIMITS.referenceUrlChars)),
  }),
]);

const CanonicalCanvasNode = Schema.Struct({
  id: BoundedId,
  role: ArtifactNodeRole,
  title: NonEmpty.check(Schema.isMaxLength(CROKI_CANVAS_PRESENT_LIMITS.nodeTitleChars)),
  body: Schema.optional(Schema.String.check(Schema.isMaxLength(4_000))),
  whyItMatters: Schema.optional(
    Schema.String.check(Schema.isMaxLength(CROKI_CANVAS_PRESENT_LIMITS.nodeWhyItMattersChars)),
  ),
  references: Schema.optional(
    Schema.Array(CrokiCanvasReference).check(
      Schema.isMaxLength(CROKI_CONTEXT_LIMITS.referencesPerNode),
    ),
  ),
});

const CanonicalCanvasEdge = Schema.Struct({
  from: BoundedId,
  to: BoundedId,
  relation: NonEmpty.check(Schema.isMaxLength(CROKI_CANVAS_PRESENT_LIMITS.edgeRelationChars)),
});

/** Current tool wire shape. The harness id is normally supplied by invocation scope. */
const CanonicalCanvasPresentInput = Schema.Struct({
  harnessId: Schema.optional(ArtifactHarnessId),
  presentation: ArtifactPresentation,
  question: NonEmpty.check(Schema.isMaxLength(CROKI_CANVAS_PRESENT_LIMITS.questionChars)),
  nodes: Schema.Array(CanonicalCanvasNode).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(CROKI_CANVAS_PRESENT_LIMITS.nodes),
  ),
  edges: Schema.Array(CanonicalCanvasEdge).check(
    Schema.isMaxLength(CROKI_CANVAS_PRESENT_LIMITS.edges),
  ),
});

/**
 * Legacy wire shape accepted during rollout. It is normalized immediately and
 * never persisted. In particular, legacy workflow scenes are rejected by the
 * handler because workflow is no longer a harness.
 */
const LegacyCanvasNode = Schema.Struct({
  id: BoundedId,
  kind: Schema.Literals(["intent", "decision", "evidence", "work"]),
  // Accepted and ignored while old Product/GTM prompts roll forward. Domain
  // was project-context metadata; immutable artifacts carry harness + role.
  domain: Schema.optional(Schema.Literals(["product", "gtm", "workflow", "shared"])),
  title: NonEmpty.check(Schema.isMaxLength(CROKI_CANVAS_PRESENT_LIMITS.nodeTitleChars)),
  body: Schema.optional(Schema.String.check(Schema.isMaxLength(4_000))),
  references: Schema.optional(
    Schema.Array(CrokiCanvasReference).check(
      Schema.isMaxLength(CROKI_CONTEXT_LIMITS.referencesPerNode),
    ),
  ),
});

const LegacyCanvasPresentInput = Schema.Struct({
  view: Schema.Literals(["product", "gtm", "workflow"]),
  question: NonEmpty.check(Schema.isMaxLength(CROKI_CANVAS_PRESENT_LIMITS.questionChars)),
  nodes: Schema.Array(LegacyCanvasNode).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(CROKI_CANVAS_PRESENT_LIMITS.nodes),
  ),
  edges: Schema.Array(CanonicalCanvasEdge).check(
    Schema.isMaxLength(CROKI_CANVAS_PRESENT_LIMITS.edges),
  ),
});

export const CrokiCanvasPresentInput = Schema.Union([
  CanonicalCanvasPresentInput,
  LegacyCanvasPresentInput,
]);
export type CrokiCanvasPresentInput = typeof CrokiCanvasPresentInput.Type;

export const CrokiCanvasPresentResult = Schema.Struct({
  artifactId: Schema.String,
  revision: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1)),
  harnessId: ArtifactHarnessId,
  presentation: ArtifactPresentation,
  nodeCount: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1)),
  edgeCount: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
  createdAt: Schema.String,
});
export type CrokiCanvasPresentResult = typeof CrokiCanvasPresentResult.Type;

export class CrokiCanvasPresentError extends Schema.TaggedErrorClass<CrokiCanvasPresentError>()(
  "CrokiCanvasPresentError",
  {
    code: Schema.Literals([
      "canvas-unavailable",
      "thread-not-found",
      "artifact-invalid",
      "scene-invalid",
      "persistence-failed",
      // Kept for callers that still classify the old project-context failure
      // modes. New artifact persistence does not use these codes internally.
      "context-invalid",
      "write-conflict",
    ]),
    message: Schema.String,
  },
) {}

const dependencies = [
  McpInvocationContext.McpInvocationContext,
  ProjectionSnapshotQuery,
  OrchestrationEngineService,
  Crypto.Crypto,
];

export const CrokiCanvasPresentTool = Tool.make("canvas_present", {
  description:
    "Present one complete, bounded Canvas visual for an explicit Product or GTM turn. Use stable semantic ids, choose a semantic presentation, connect claims to evidence or consequences, and cite repository-relative files or HTTP(S) sources. Canvas is a Thread-scoped immutable artifact; it never changes project context.",
  parameters: CrokiCanvasPresentInput,
  success: CrokiCanvasPresentResult,
  failure: CrokiCanvasPresentError,
  dependencies,
})
  .annotate(Tool.Title, "Present Canvas visual")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, false)
  .annotate(Tool.OpenWorld, false);

export const CrokiCanvasToolkit = Toolkit.make(CrokiCanvasPresentTool);

export type CanonicalCanvasNodeInput = typeof CanonicalCanvasNode.Type;
export type CanonicalCanvasEdgeInput = typeof CanonicalCanvasEdge.Type;
export type CrokiCanvasHarnessId = CrokiCanvasHarnessIdType;
export type CrokiCanvasPresentation = CrokiCanvasPresentationType;
