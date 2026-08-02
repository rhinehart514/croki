/**
 * Source-oriented perception packets.
 *
 * A perception frame is an ephemeral view of what a Thread and its attached
 * runtimes currently expose. It is deliberately open to new source families,
 * object kinds, and authority labels so adding a sense does not require a
 * Canvas-specific migration.
 */
import * as Schema from "effect/Schema";

import { NonNegativeInt, TrimmedNonEmptyString } from "./baseSchemas.ts";

const PerceptionId = TrimmedNonEmptyString.check(Schema.isMaxLength(256));
const PerceptionKind = TrimmedNonEmptyString.check(Schema.isMaxLength(128));
const PerceptionLabel = Schema.String.check(Schema.isMaxLength(512));
const PerceptionRevision = NonNegativeInt;

/** Authority labels are extensible: integrations may introduce their own. */
export const CrokiPerceptionAuthority = Schema.String.check(Schema.isMaxLength(128));
export type CrokiPerceptionAuthority = typeof CrokiPerceptionAuthority.Type;

/** A pointer to a rendered frame or another inspectable visual source. */
export const CrokiPerceptionFrameReference = Schema.Struct({
  kind: PerceptionKind,
  ref: TrimmedNonEmptyString.check(Schema.isMaxLength(4_096)),
  mimeType: Schema.optional(Schema.String.check(Schema.isMaxLength(128))),
  width: Schema.optional(Schema.Number.check(Schema.isGreaterThanOrEqualTo(0))),
  height: Schema.optional(Schema.Number.check(Schema.isGreaterThanOrEqualTo(0))),
});
export type CrokiPerceptionFrameReference = typeof CrokiPerceptionFrameReference.Type;

/** Provenance for an observed object or relationship. */
export const CrokiPerceptionProvenance = Schema.Struct({
  kind: PerceptionKind,
  id: Schema.optional(Schema.String),
  uri: Schema.optional(Schema.String),
  activityId: Schema.optional(Schema.String),
  turnId: Schema.NullOr(Schema.String),
  observedAt: Schema.String,
});
export type CrokiPerceptionProvenance = typeof CrokiPerceptionProvenance.Type;

/** `source` is the wire-facing spelling; provenance remains available to callers. */
export const CrokiPerceptionSource = CrokiPerceptionProvenance;
export type CrokiPerceptionSource = typeof CrokiPerceptionSource.Type;

/** A read/propose/approval affordance surfaced by a source object. */
export const CrokiPerceptionAffordance = Schema.Struct({
  id: PerceptionId,
  kind: PerceptionKind,
  label: PerceptionLabel,
  authority: CrokiPerceptionAuthority,
  reversible: Schema.Boolean,
  requiresApproval: Schema.Boolean,
  sourceTool: Schema.optional(Schema.String),
});
export type CrokiPerceptionAffordance = typeof CrokiPerceptionAffordance.Type;

/** One stable semantic object projected from a source activity. */
export const CrokiPerceptionObject = Schema.Struct({
  id: PerceptionId,
  type: PerceptionKind,
  title: PerceptionLabel,
  summary: Schema.optional(Schema.String),
  state: Schema.optional(Schema.String),
  revision: PerceptionRevision,
  source: CrokiPerceptionSource,
  affordances: Schema.Array(CrokiPerceptionAffordance),
  data: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  frame: Schema.optional(CrokiPerceptionFrameReference),
});
export type CrokiPerceptionObject = typeof CrokiPerceptionObject.Type;

/** A typed relation between two observed objects. */
export const CrokiPerceptionRelationship = Schema.Struct({
  id: PerceptionId,
  from: PerceptionId,
  to: PerceptionId,
  kind: PerceptionKind,
  label: Schema.optional(Schema.String),
  revision: PerceptionRevision,
  confidence: Schema.optional(Schema.Number),
  source: Schema.optional(CrokiPerceptionSource),
});
export type CrokiPerceptionRelationship = typeof CrokiPerceptionRelationship.Type;

/** The monotonic changes since a caller's last observed revision. */
export const CrokiPerceptionDelta = Schema.Struct({
  sinceRevision: PerceptionRevision,
  addedObjects: Schema.Array(CrokiPerceptionObject),
  updatedObjects: Schema.Array(CrokiPerceptionObject),
  removedObjectIds: Schema.Array(PerceptionId),
  addedRelationships: Schema.Array(CrokiPerceptionRelationship),
  removedRelationshipIds: Schema.Array(PerceptionId),
});
export type CrokiPerceptionDelta = typeof CrokiPerceptionDelta.Type;

/**
 * The native projection packet consumed by clients and model-facing senses.
 * Frame metadata is required so each packet is a stable consistency boundary;
 * only a rendered-frame pointer is optional because not every source emits one.
 */
export const CrokiPerceptionFrame = Schema.Struct({
  threadId: Schema.String,
  revision: PerceptionRevision,
  sourceRevision: PerceptionRevision,
  changed: Schema.Boolean,
  objects: Schema.Array(CrokiPerceptionObject),
  relationships: Schema.Array(CrokiPerceptionRelationship),
  delta: CrokiPerceptionDelta,
  frame: Schema.optional(CrokiPerceptionFrameReference),
  latestActivityAt: Schema.NullOr(Schema.String),
  activeTurnId: Schema.NullOr(Schema.String),
  truncated: Schema.Boolean,
});
export type CrokiPerceptionFrame = typeof CrokiPerceptionFrame.Type;
