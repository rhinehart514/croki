import * as Schema from "effect/Schema";

import { IsoDateTime, TrimmedNonEmptyString } from "./baseSchemas.ts";

const EvidenceId = TrimmedNonEmptyString.check(Schema.isMaxLength(256));
const EvidenceKind = TrimmedNonEmptyString.check(Schema.isMaxLength(128));
const EvidenceLabel = TrimmedNonEmptyString.check(Schema.isMaxLength(512));

/** The part of venture reality an observation helps explain. */
export const CrokiEvidenceDomain = Schema.Literals([
  "product",
  "customer",
  "market",
  "distribution",
]);
export type CrokiEvidenceDomain = typeof CrokiEvidenceDomain.Type;

/** Stable provenance supplied by a read-only source adapter. */
export const CrokiEvidenceSource = Schema.Struct({
  kind: EvidenceKind,
  id: EvidenceId,
  label: Schema.optional(EvidenceLabel),
  uri: Schema.optional(Schema.String.check(Schema.isMaxLength(4_096))),
});
export type CrokiEvidenceSource = typeof CrokiEvidenceSource.Type;

/**
 * One source-grounded observation. This is evidence, not accepted project
 * truth: adapters may observe it, Threads may reason about it, and only the
 * founder can promote a conclusion into repository-owned canon.
 */
export const CrokiEvidenceObservation = Schema.Struct({
  id: EvidenceId,
  domain: CrokiEvidenceDomain,
  type: EvidenceKind,
  title: EvidenceLabel,
  summary: Schema.optional(Schema.String.check(Schema.isMaxLength(4_000))),
  observedAt: IsoDateTime,
  source: CrokiEvidenceSource,
  confidence: Schema.optional(
    Schema.Number.check(Schema.isGreaterThanOrEqualTo(0), Schema.isLessThanOrEqualTo(1)),
  ),
  /** Adapter-specific fields remain bounded at the activity boundary and are not canon. */
  data: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
});
export type CrokiEvidenceObservation = typeof CrokiEvidenceObservation.Type;

/** Durable Thread activity payload used by future product and GTM source adapters. */
export const CrokiEvidenceObservedActivityPayload = Schema.Struct({
  observations: Schema.Array(CrokiEvidenceObservation).check(Schema.isMaxLength(50)),
});
export type CrokiEvidenceObservedActivityPayload = typeof CrokiEvidenceObservedActivityPayload.Type;

export const isCrokiEvidenceObservedActivityPayload = Schema.is(
  CrokiEvidenceObservedActivityPayload,
);
