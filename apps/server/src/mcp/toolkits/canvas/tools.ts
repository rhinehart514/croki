import { CROKI_CONTEXT_LIMITS } from "@croki/shared/crokiContext";
import {
  CROKI_CANVAS_ARTIFACT_LIMITS,
  CrokiCanvasHarnessId as ArtifactHarnessId,
  CrokiCanvasNodeRole as ArtifactNodeRole,
  CrokiCanvasPresentation as ArtifactPresentation,
} from "@croki/shared/crokiCanvasArtifact";
import {
  CrokiPerceptionAffordance,
  CrokiPerceptionDelta,
  CrokiPerceptionFrame,
  CrokiPerceptionFrameReference,
  CrokiPerceptionObject,
  CrokiPerceptionRelationship,
  CrokiPerceptionSource,
  type CrokiPerceptionAffordance as CrokiPerceptionAffordanceValue,
  type CrokiPerceptionDelta as CrokiPerceptionDeltaValue,
  type CrokiPerceptionFrame as CrokiPerceptionFrameValue,
  type CrokiPerceptionFrameReference as CrokiPerceptionFrameReferenceValue,
  type CrokiPerceptionObject as CrokiPerceptionObjectValue,
  type CrokiPerceptionRelationship as CrokiPerceptionRelationshipValue,
  type CrokiPerceptionSource as CrokiPerceptionSourceValue,
} from "@croki/contracts/perception";
import type {
  CrokiCanvasHarnessId as CrokiCanvasHarnessIdType,
  CrokiCanvasPresentation as CrokiCanvasPresentationType,
} from "@croki/shared/crokiCanvasArtifact";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/unstable/ai";

import { ProjectionSnapshotQuery } from "../../../orchestration/Services/ProjectionSnapshotQuery.ts";
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

/** Current wire shape. A harness id is accepted only to reject legacy callers clearly. */
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
  source: Schema.Literal("user-applied"),
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

/**
 * The sense protocol is intentionally source-oriented.  Canvas is a client
 * projection of these packets; models observe the Thread, runtime, preview,
 * and other source activity without manipulating a Canvas scene.
 */
const SenseObjectId = NonEmpty.check(Schema.isMaxLength(256));
const SenseRevision = Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0));
const SenseLimit = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThanOrEqualTo(1),
  Schema.isLessThanOrEqualTo(200),
);

const SenseTargetInput = Schema.Struct({
  /** A Thread id is accepted for forwards compatibility but invocation scope wins. */
  threadId: Schema.optional(Schema.String),
});

export const CrokiSenseStatusInput = Schema.Struct({
  ...SenseTargetInput.fields,
});
export type CrokiSenseStatusInput = typeof CrokiSenseStatusInput.Type;

export const CrokiSenseObserveInput = Schema.Struct({
  ...SenseTargetInput.fields,
  sinceRevision: Schema.optional(SenseRevision),
  limit: Schema.optional(SenseLimit),
  /** Restrict the packet to source families; omitted means every source. */
  sources: Schema.optional(Schema.Array(Schema.String).check(Schema.isMaxLength(32))),
});
export type CrokiSenseObserveInput = typeof CrokiSenseObserveInput.Type;

export const CrokiSenseInspectInput = Schema.Struct({
  ...SenseTargetInput.fields,
  objectId: SenseObjectId,
  revision: Schema.optional(SenseRevision),
  depth: Schema.optional(
    Schema.Number.check(
      Schema.isInt(),
      Schema.isGreaterThanOrEqualTo(0),
      Schema.isLessThanOrEqualTo(3),
    ),
  ),
});
export type CrokiSenseInspectInput = typeof CrokiSenseInspectInput.Type;

export const CrokiSenseWaitInput = Schema.Struct({
  ...SenseTargetInput.fields,
  sinceRevision: SenseRevision,
  timeoutMs: Schema.optional(
    Schema.Number.check(
      Schema.isInt(),
      Schema.isGreaterThanOrEqualTo(0),
      Schema.isLessThanOrEqualTo(30_000),
    ),
  ),
  pollIntervalMs: Schema.optional(
    Schema.Number.check(
      Schema.isInt(),
      Schema.isGreaterThanOrEqualTo(10),
      Schema.isLessThanOrEqualTo(2_000),
    ),
  ),
});
export type CrokiSenseWaitInput = typeof CrokiSenseWaitInput.Type;

/** Generic perception contract aliases retained for MCP naming ergonomics. */
export const CrokiSenseAffordance = CrokiPerceptionAffordance;
export type CrokiSenseAffordance = CrokiPerceptionAffordanceValue;
export const CrokiSenseFrameReference = CrokiPerceptionFrameReference;
export type CrokiSenseFrameReference = CrokiPerceptionFrameReferenceValue;
export const CrokiSenseSource = CrokiPerceptionSource;
export type CrokiSenseSource = CrokiPerceptionSourceValue;
export const CrokiSenseObject = CrokiPerceptionObject;
export type CrokiSenseObject = CrokiPerceptionObjectValue;
export const CrokiSenseRelationship = CrokiPerceptionRelationship;
export type CrokiSenseRelationship = CrokiPerceptionRelationshipValue;
export const CrokiSenseDelta = CrokiPerceptionDelta;
export type CrokiSenseDelta = CrokiPerceptionDeltaValue;
export const CrokiSenseObservation = CrokiPerceptionFrame;
export type CrokiSenseObservation = CrokiPerceptionFrameValue;

export const CrokiSenseStatus = Schema.Struct({
  threadId: Schema.String,
  available: Schema.Boolean,
  revision: SenseRevision,
  sourceRevision: SenseRevision,
  objectCount: Schema.Number,
  relationshipCount: Schema.Number,
  latestActivityAt: Schema.NullOr(Schema.String),
  activeTurnId: Schema.NullOr(Schema.String),
  sources: Schema.Array(Schema.String),
  affordances: Schema.Array(CrokiPerceptionAffordance),
});
export type CrokiSenseStatus = typeof CrokiSenseStatus.Type;

export const CrokiSenseInspection = Schema.Struct({
  observation: CrokiPerceptionFrame,
  object: CrokiPerceptionObject,
  relationships: Schema.Array(CrokiPerceptionRelationship),
  relatedObjects: Schema.Array(CrokiPerceptionObject),
});
export type CrokiSenseInspection = typeof CrokiSenseInspection.Type;

export const CrokiSenseWaitResult = Schema.Struct({
  observation: CrokiSenseObservation,
  changed: Schema.Boolean,
  timedOut: Schema.Boolean,
  waitedMs: Schema.Number,
});
export type CrokiSenseWaitResult = typeof CrokiSenseWaitResult.Type;

export class CrokiSenseError extends Schema.TaggedErrorClass<CrokiSenseError>()("CrokiSenseError", {
  code: Schema.Literals([
    "thread-not-found",
    "invalid-revision",
    "object-not-found",
    "persistence-failed",
    "observation-failed",
  ]),
  message: Schema.String,
}) {}

const senseDependencies = [McpInvocationContext.McpInvocationContext, ProjectionSnapshotQuery];

export const CrokiSenseStatusTool = Tool.make("sense_status", {
  description:
    "Read the current perceptual state of the invocation Thread. This is a source-oriented capability: it reports live revision, active turn, observed source families, and safe read affordances. Canvas is only one possible projection of this state.",
  parameters: CrokiSenseStatusInput,
  success: CrokiSenseStatus,
  failure: CrokiSenseError,
  dependencies: senseDependencies,
})
  .annotate(Tool.Title, "Sense status")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

export const CrokiSenseObserveTool = Tool.make("sense_observe", {
  description:
    "Observe the live Thread as stable semantic objects and relationships. Returns a monotonic source revision, deltas since an optional revision, affordances with authority annotations, and a rendered-frame reference when one is present in source activity. This is read-only; source events are projected automatically.",
  parameters: CrokiSenseObserveInput,
  success: CrokiSenseObservation,
  failure: CrokiSenseError,
  dependencies: senseDependencies,
})
  .annotate(Tool.Title, "Observe live sources")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

export const CrokiSenseInspectTool = Tool.make("sense_inspect", {
  description:
    "Inspect one stable semantic object from the current Thread observation, including its source evidence, relationships, and nearby objects. Use the returned revision as the consistency boundary for a follow-up source action.",
  parameters: CrokiSenseInspectInput,
  success: CrokiSenseInspection,
  failure: CrokiSenseError,
  dependencies: senseDependencies,
})
  .annotate(Tool.Title, "Inspect sensed object")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

export const CrokiSenseWaitTool = Tool.make("sense_wait", {
  description:
    "Wait for a Thread perceptual revision newer than sinceRevision, then return the same semantic observation shape. The wait is bounded and never performs a source action.",
  parameters: CrokiSenseWaitInput,
  success: CrokiSenseWaitResult,
  failure: CrokiSenseError,
  dependencies: senseDependencies,
})
  .annotate(Tool.Title, "Wait for sensed change")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

export const CrokiSenseToolkit = Toolkit.make(
  CrokiSenseStatusTool,
  CrokiSenseObserveTool,
  CrokiSenseInspectTool,
  CrokiSenseWaitTool,
);

export type CanonicalCanvasNodeInput = typeof CanonicalCanvasNode.Type;
export type CanonicalCanvasEdgeInput = typeof CanonicalCanvasEdge.Type;
export type CrokiCanvasHarnessId = CrokiCanvasHarnessIdType;
export type CrokiCanvasPresentation = CrokiCanvasPresentationType;
