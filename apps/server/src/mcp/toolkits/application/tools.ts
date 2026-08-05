import {
  ApplicationAwarenessError,
  ApplicationAwarenessInput,
  ApplicationAwarenessResult,
  ApplicationScreenInput,
  ApplicationScreenResult,
} from "@croki/contracts";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { Tool, Toolkit } from "effect/unstable/ai";

import { ProjectionSnapshotQuery } from "../../../orchestration/Services/ProjectionSnapshotQuery.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import { UiHistoryStore } from "../../UiHistoryStore.ts";

export const ApplicationAwarenessTool = Tool.make("application_observe", {
  description:
    "Observe the application this Thread is changing. Returns project-declared application lineage with unverified approval, the invoking Thread's checkpoint/file envelope, and read-only project screens and evidence with provenance and coverage gaps. Optionally compare two qualified checked screens. Use it to ground product or user-experience judgment; Croki supplies evidence, not a recommendation or reasoning policy.",
  parameters: ApplicationAwarenessInput,
  success: ApplicationAwarenessResult,
  failure: ApplicationAwarenessError,
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ProjectionSnapshotQuery,
    UiHistoryStore,
    FileSystem.FileSystem,
    Path.Path,
  ],
})
  .annotate(Tool.Title, "Observe application")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

export const ApplicationAwarenessToolkit = Toolkit.make(ApplicationAwarenessTool);

export const ApplicationScreenTool = Tool.make("application_screen", {
  description:
    "Reopen one exact checked screen returned by application_observe, including its preserved PNG, source Thread and turn, current source worktree attribution, and an immutable checkpoint when available. Missing code-revision identity is explicit. The image remains owned by its originating Thread and is exposed read-only within the same project.",
  parameters: ApplicationScreenInput,
  success: ApplicationScreenResult,
  failure: ApplicationAwarenessError,
  dependencies: [McpInvocationContext.McpInvocationContext, UiHistoryStore],
})
  .annotate(Tool.Title, "Open application screen")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);
