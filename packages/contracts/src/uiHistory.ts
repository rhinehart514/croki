import * as Schema from "effect/Schema";

import { IsoDateTime, NonNegativeInt, TrimmedNonEmptyString } from "./baseSchemas.ts";
import { CrokiPerceptionFrameReference } from "./perception.ts";
import { PreviewAutomationSnapshotConcept } from "./previewAutomation.ts";

export const UI_HISTORY_ACTIVITY_KIND = "preview.snapshot" as const;

/** One rendered screen that Croki preserved after a model inspected Preview. */
export const UiHistoryEntry = Schema.Struct({
  id: TrimmedNonEmptyString.check(Schema.isMaxLength(256)),
  attachmentId: TrimmedNonEmptyString.check(Schema.isMaxLength(256)),
  url: Schema.String.check(Schema.isMaxLength(4_096)),
  title: Schema.String.check(Schema.isMaxLength(512)),
  concept: Schema.optional(PreviewAutomationSnapshotConcept),
  observedAt: IsoDateTime,
  width: NonNegativeInt,
  height: NonNegativeInt,
  interactiveElementCount: NonNegativeInt,
  consoleErrorCount: NonNegativeInt,
  networkFailureCount: NonNegativeInt,
  actionCount: NonNegativeInt,
});
export type UiHistoryEntry = typeof UiHistoryEntry.Type;

/** Durable Thread activity payload for a checked screen. */
export const UiHistoryActivityPayload = Schema.Struct({
  version: Schema.Literal(1),
  entry: UiHistoryEntry,
  frame: CrokiPerceptionFrameReference,
});
export type UiHistoryActivityPayload = typeof UiHistoryActivityPayload.Type;

export const UiHistoryInput = Schema.Struct({
  id: Schema.optional(
    TrimmedNonEmptyString.check(Schema.isMaxLength(256)).annotate({
      description: "Exact checked-screen id to reopen. Omit to list recent UI history.",
    }),
  ),
  limit: Schema.optional(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 25 })).annotate({
      description: "Maximum recent checked screens to list. Defaults to 10; maximum 25.",
    }),
  ),
});
export type UiHistoryInput = typeof UiHistoryInput.Type;

export const UiHistoryListResult = Schema.Struct({
  entries: Schema.Array(UiHistoryEntry),
  truncated: Schema.Boolean,
});
export type UiHistoryListResult = typeof UiHistoryListResult.Type;

export class UiHistoryError extends Schema.TaggedErrorClass<UiHistoryError>()("UiHistoryError", {
  code: Schema.Literals(["not-found", "read-failed"]),
  message: Schema.String,
}) {}
