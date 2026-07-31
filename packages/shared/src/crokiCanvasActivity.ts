import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { CROKI_CONTEXT_RELATIVE_PATH } from "./crokiContext.ts";

const NonNegativeInteger = Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0));

/** Refresh receipt emitted after an agent presents a Canvas scene. */
export const CrokiCanvasPresentedActivityPayload = Schema.Struct({
  relativePath: Schema.Literal(CROKI_CONTEXT_RELATIVE_PATH),
  view: Schema.Literals(["product", "gtm", "workflow"]),
  question: Schema.String,
  provisionalNodeIds: Schema.Array(Schema.String),
  provisionalCount: NonNegativeInteger,
  edgeCount: NonNegativeInteger,
  sha256: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u)),
});
export type CrokiCanvasPresentedActivityPayload = typeof CrokiCanvasPresentedActivityPayload.Type;

const decodeCrokiCanvasPresentedActivityPayload = Schema.decodeUnknownOption(
  CrokiCanvasPresentedActivityPayload,
);

/** Safely narrows an untyped orchestration activity payload for UI consumers. */
export function parseCrokiCanvasPresentedActivityPayload(
  input: unknown,
): CrokiCanvasPresentedActivityPayload | null {
  return Option.getOrNull(decodeCrokiCanvasPresentedActivityPayload(input));
}
