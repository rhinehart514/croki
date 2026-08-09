/** A source-grounded visual representation derived from Croki perception. */
import * as Schema from "effect/Schema";

import { IsoDateTime, NonNegativeInt, TrimmedNonEmptyString } from "./baseSchemas.ts";

const ViewId = TrimmedNonEmptyString.check(Schema.isMaxLength(256));
const ViewText = Schema.String.check(Schema.isMaxLength(4_096));
const ViewLabel = TrimmedNonEmptyString.check(Schema.isMaxLength(512));

export const CrokiThoughtViewRepresentation = Schema.Literals([
  "system",
  "comparison",
  "possibility",
  "causal",
  "temporal",
  "experience",
  "evidence",
  "counterfactual",
]);
export type CrokiThoughtViewRepresentation = typeof CrokiThoughtViewRepresentation.Type;

export const CrokiThoughtViewEpistemicState = Schema.Literals([
  "observed",
  "attributed",
  "derived",
  "inferred",
  "hypothetical",
  "contradicted",
  "uncovered",
]);
export type CrokiThoughtViewEpistemicState = typeof CrokiThoughtViewEpistemicState.Type;

export const CrokiThoughtViewSource = Schema.Struct({
  id: ViewId,
  objectId: ViewId,
  kind: ViewLabel,
  title: ViewLabel,
  observedAt: IsoDateTime,
  uri: Schema.optional(ViewText),
  sourceThreadId: Schema.optional(ViewId),
});
export type CrokiThoughtViewSource = typeof CrokiThoughtViewSource.Type;

export const CrokiThoughtViewStatement = Schema.Struct({
  id: ViewId,
  objectId: ViewId,
  title: ViewLabel,
  body: ViewText,
  epistemicState: CrokiThoughtViewEpistemicState,
  sourceIds: Schema.Array(ViewId),
  revision: NonNegativeInt,
  kind: ViewLabel,
  status: Schema.optional(ViewText),
});
export type CrokiThoughtViewStatement = typeof CrokiThoughtViewStatement.Type;

export const CrokiThoughtViewRelationship = Schema.Struct({
  id: ViewId,
  from: ViewId,
  to: ViewId,
  label: ViewLabel,
  kind: ViewLabel,
  epistemicState: CrokiThoughtViewEpistemicState,
  sourceIds: Schema.Array(ViewId),
});
export type CrokiThoughtViewRelationship = typeof CrokiThoughtViewRelationship.Type;

export const CrokiThoughtViewRegion = Schema.Struct({
  id: ViewId,
  kind: Schema.Literals(["focus", "lane", "sequence", "evidence", "unknowns"]),
  title: ViewLabel,
  statementIds: Schema.Array(ViewId),
});
export type CrokiThoughtViewRegion = typeof CrokiThoughtViewRegion.Type;

export const CrokiThoughtViewBasis = Schema.Struct({
  question: ViewText,
  foregrounds: Schema.Array(ViewLabel),
  omits: Schema.Array(ViewLabel),
  coverage: ViewLabel,
});
export type CrokiThoughtViewBasis = typeof CrokiThoughtViewBasis.Type;

export const CrokiThoughtView = Schema.Struct({
  version: Schema.Literal(1),
  id: ViewId,
  generatedAt: IsoDateTime,
  sourceRevision: NonNegativeInt,
  representation: CrokiThoughtViewRepresentation,
  alternateRepresentation: CrokiThoughtViewRepresentation,
  basis: CrokiThoughtViewBasis,
  statements: Schema.Array(CrokiThoughtViewStatement),
  relationships: Schema.Array(CrokiThoughtViewRelationship),
  regions: Schema.Array(CrokiThoughtViewRegion),
  sources: Schema.Array(CrokiThoughtViewSource),
});
export type CrokiThoughtView = typeof CrokiThoughtView.Type;

export const CrokiThoughtViewSelection = Schema.Struct({
  viewId: ViewId,
  sourceRevision: NonNegativeInt,
  representation: CrokiThoughtViewRepresentation,
  statementIds: Schema.Array(ViewId),
  sourceIds: Schema.Array(ViewId),
});
export type CrokiThoughtViewSelection = typeof CrokiThoughtViewSelection.Type;
