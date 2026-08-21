import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SchemaIssue from "effect/SchemaIssue";

import { CROKI_CONTEXT_RELATIVE_PATH } from "./crokiContext.ts";
import {
  CROKI_CANVAS_ARTIFACT_LIMITS,
  CrokiCanvasArtifact,
  type CrokiCanvasArtifact as CrokiCanvasArtifactValue,
} from "./crokiCanvasArtifact.ts";

const NonNegativeInteger = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const LegacyNodeId = Schema.String.check(
  Schema.isNonEmpty(),
  Schema.isMaxLength(CROKI_CANVAS_ARTIFACT_LIMITS.nodeIdChars),
);
const LegacyQuestion = Schema.String.check(
  Schema.isMaxLength(CROKI_CANVAS_ARTIFACT_LIMITS.questionChars),
);

/**
 * Activity payload fields emitted before Thread-scoped immutable artifacts.
 * They remain optional in the shared envelope so existing receipts can still
 * be rendered after the artifact migration.
 */
const LegacyCanvasPresentedActivityFields = {
  relativePath: Schema.optional(Schema.Literal(CROKI_CONTEXT_RELATIVE_PATH)),
  view: Schema.optional(Schema.Literals(["product", "gtm", "workflow"])),
  question: Schema.optional(LegacyQuestion),
  provisionalNodeIds: Schema.optional(
    Schema.Array(LegacyNodeId).check(Schema.isMaxLength(CROKI_CANVAS_ARTIFACT_LIMITS.nodes)),
  ),
  provisionalCount: Schema.optional(
    NonNegativeInteger.check(Schema.isLessThanOrEqualTo(CROKI_CANVAS_ARTIFACT_LIMITS.nodes)),
  ),
  edgeCount: Schema.optional(
    NonNegativeInteger.check(Schema.isLessThanOrEqualTo(CROKI_CANVAS_ARTIFACT_LIMITS.edges)),
  ),
  sha256: Schema.optional(Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u))),
} as const;

/**
 * A content-bounded receipt that lets clients recover the exact artifact. The
 * legacy fields are retained for historical activities and may accompany a
 * new artifact while clients roll forward.
 */
export const CrokiCanvasPresentedActivityPayload = Schema.Struct({
  artifact: Schema.optional(CrokiCanvasArtifact),
  ...LegacyCanvasPresentedActivityFields,
}).check(
  Schema.makeFilter((payload) => {
    if (payload.artifact !== undefined) return true;
    const hasLegacyReceipt =
      payload.relativePath !== undefined &&
      payload.view !== undefined &&
      payload.question !== undefined &&
      payload.provisionalNodeIds !== undefined &&
      payload.provisionalCount !== undefined &&
      payload.edgeCount !== undefined &&
      payload.sha256 !== undefined;
    return (
      hasLegacyReceipt ||
      new SchemaIssue.InvalidValue({
        message: "Canvas presentation activity requires an artifact or a complete legacy receipt.",
      })
    );
  }),
);
export type CrokiCanvasPresentedActivityPayload = typeof CrokiCanvasPresentedActivityPayload.Type;

/** New-protocol receipt shape with an artifact required at compile time. */
export const CrokiCanvasPresentedArtifactActivityPayload = Schema.Struct({
  artifact: CrokiCanvasArtifact,
  ...LegacyCanvasPresentedActivityFields,
});
export type CrokiCanvasPresentedArtifactActivityPayload =
  typeof CrokiCanvasPresentedArtifactActivityPayload.Type;

const decodeCrokiCanvasPresentedActivityPayload = Schema.decodeUnknownOption(
  CrokiCanvasPresentedActivityPayload,
  { onExcessProperty: "error" },
);

/** Safely narrows an untyped orchestration activity payload for UI consumers. */
export function parseCrokiCanvasPresentedActivityPayload(
  input: unknown,
): CrokiCanvasPresentedActivityPayload | null {
  return Option.getOrNull(decodeCrokiCanvasPresentedActivityPayload(input));
}

/** Returns the recovered artifact, if this receipt is from the new protocol. */
export function getCrokiCanvasArtifactFromActivity(
  payload: CrokiCanvasPresentedActivityPayload | null | undefined,
): CrokiCanvasArtifactValue | null {
  return payload?.artifact ?? null;
}
