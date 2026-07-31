import {
  CROKI_CONTEXT_LIMITS,
  CROKI_NODE_DOMAINS,
  CROKI_NODE_KINDS,
} from "@t3tools/shared/crokiContext";
import * as Crypto from "effect/Crypto";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/unstable/ai";

import { OrchestrationEngineService } from "../../../orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "../../../orchestration/Services/ProjectionSnapshotQuery.ts";
import * as WorkspaceFileSystem from "../../../workspace/WorkspaceFileSystem.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";

export const CROKI_CANVAS_PRESENT_LIMITS = {
  nodes: 24,
  edges: 48,
  questionChars: 600,
} as const;

const NonEmpty = Schema.String.check(Schema.isNonEmpty());
const BoundedId = NonEmpty.check(Schema.isMaxLength(CROKI_CONTEXT_LIMITS.nodeIdChars));
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

export const CrokiCanvasPresentInput = Schema.Struct({
  view: Schema.Literals(["product", "gtm", "workflow"]),
  question: NonEmpty.check(Schema.isMaxLength(CROKI_CANVAS_PRESENT_LIMITS.questionChars)),
  nodes: Schema.Array(
    Schema.Struct({
      id: BoundedId,
      kind: Schema.Literals(CROKI_NODE_KINDS),
      domain: Schema.optional(Schema.Literals(CROKI_NODE_DOMAINS)),
      title: NonEmpty.check(Schema.isMaxLength(CROKI_CONTEXT_LIMITS.nodeTitleChars)),
      body: Schema.optional(
        Schema.String.check(Schema.isMaxLength(CROKI_CONTEXT_LIMITS.nodeBodyChars)),
      ),
      references: Schema.optional(
        Schema.Array(CrokiCanvasReference).check(
          Schema.isMaxLength(CROKI_CONTEXT_LIMITS.referencesPerNode),
        ),
      ),
    }),
  ).check(Schema.isMinLength(1), Schema.isMaxLength(CROKI_CANVAS_PRESENT_LIMITS.nodes)),
  edges: Schema.Array(
    Schema.Struct({
      from: BoundedId,
      to: BoundedId,
      relation: NonEmpty.check(Schema.isMaxLength(CROKI_CONTEXT_LIMITS.edgeRelationChars)),
    }),
  ).check(Schema.isMaxLength(CROKI_CANVAS_PRESENT_LIMITS.edges)),
});
export type CrokiCanvasPresentInput = typeof CrokiCanvasPresentInput.Type;

export const CrokiCanvasPresentResult = Schema.Struct({
  relativePath: Schema.Literal(".croki/context.json"),
  view: Schema.Literals(["product", "gtm", "workflow"]),
  provisionalNodeIds: Schema.Array(Schema.String),
  edgeCount: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
  sha256: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)),
  updatedAt: Schema.String,
});
export type CrokiCanvasPresentResult = typeof CrokiCanvasPresentResult.Type;

export class CrokiCanvasPresentError extends Schema.TaggedErrorClass<CrokiCanvasPresentError>()(
  "CrokiCanvasPresentError",
  {
    code: Schema.Literals([
      "canvas-unavailable",
      "thread-not-found",
      "context-invalid",
      "scene-invalid",
      "write-conflict",
    ]),
    message: Schema.String,
  },
) {}

const dependencies = [
  McpInvocationContext.McpInvocationContext,
  ProjectionSnapshotQuery,
  OrchestrationEngineService,
  WorkspaceFileSystem.WorkspaceFileSystem,
  FileSystem.FileSystem,
  Path.Path,
  Crypto.Crypto,
];

export const CrokiCanvasPresentTool = Tool.make("canvas_present", {
  description:
    "Present one complete, bounded, provisional Croki Canvas scene for founder judgment. Use stable semantic ids, connect claims to evidence and consequences, and cite repository-relative files or HTTP(S) sources. This updates only agent-authored proposals in .croki/context.json; it cannot promote, retire, or overwrite founder-approved canon. Canvas derives the initial semantic layout while user arrangement remains separate from repository truth.",
  parameters: CrokiCanvasPresentInput,
  success: CrokiCanvasPresentResult,
  failure: CrokiCanvasPresentError,
  dependencies,
})
  .annotate(Tool.Title, "Present Canvas scene")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, false)
  .annotate(Tool.OpenWorld, false);

export const CrokiCanvasToolkit = Toolkit.make(CrokiCanvasPresentTool);
