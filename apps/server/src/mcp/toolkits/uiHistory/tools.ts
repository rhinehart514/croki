import {
  UiHistoryEntry,
  UiHistoryError,
  UiHistoryInput,
  UiHistoryListResult,
} from "@croki/contracts";
import * as Schema from "effect/Schema";
import { Tool } from "effect/unstable/ai";

import * as McpInvocationContext from "../../McpInvocationContext.ts";
import { UiHistoryStore } from "../../UiHistoryStore.ts";

const UiHistoryResult = Schema.Union([
  UiHistoryListResult,
  Schema.Struct({ entry: UiHistoryEntry }),
]);

export const UiHistoryTool = Tool.make("ui_history", {
  description:
    "List screens Croki previously checked in this Thread. Pass an exact id to reopen that preserved screenshot with its URL, dimensions, diagnostics, and action count. UI history is read-only evidence from successful preview_snapshot calls.",
  parameters: UiHistoryInput,
  success: UiHistoryResult,
  failure: UiHistoryError,
  dependencies: [McpInvocationContext.McpInvocationContext, UiHistoryStore],
})
  .annotate(Tool.Title, "Read UI history")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);
