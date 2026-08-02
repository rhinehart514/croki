import { CommandId, EventId, type OrchestrationThread } from "@croki/contracts";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { OrchestrationEngineService } from "../../../orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "../../../orchestration/Services/ProjectionSnapshotQuery.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import { buildCrokiCanvasArtifact } from "./presentation.ts";
import {
  CrokiCanvasPresentError,
  CrokiCanvasToolkit,
  type CrokiCanvasHarnessId,
  type CrokiCanvasPresentInput,
  type CrokiCanvasPresentResult,
} from "./tools.ts";

const fail = (
  code: CrokiCanvasPresentError["code"],
  message: string,
): Effect.Effect<never, CrokiCanvasPresentError> =>
  Effect.fail(new CrokiCanvasPresentError({ code, message }));

/**
 * Presents a visual as an immutable Thread activity. Project context is not
 * read or written here: Canvas is a harness artifact, never a memory store.
 */
export const presentCrokiCanvas = Effect.fn("CrokiCanvasToolkit.present")(function* (
  input: CrokiCanvasPresentInput,
) {
  const invocation = yield* McpInvocationContext.McpInvocationContext;
  const invocationHarnessId = getInvocationHarnessId(invocation);
  const inputHarnessId = getInputHarnessId(input);

  // During the rollout the invocation scope is authoritative. The capability
  // fallback keeps old MCP sessions and deterministic tests readable until all
  // providers issue explicit harness ids.
  if (
    invocationHarnessId === "native" ||
    (invocationHarnessId === undefined && !invocation.capabilities.has("canvas"))
  ) {
    return yield* fail(
      "canvas-unavailable",
      "Canvas presentation is available only during an explicit Product or GTM turn.",
    );
  }

  const harnessId = invocationHarnessId ?? inputHarnessId;
  if (harnessId !== "product-v1" && harnessId !== "gtm-v1") {
    return yield* fail(
      "canvas-unavailable",
      "Canvas presentation requires an explicit Product or GTM harness.",
    );
  }
  if (inputHarnessId !== undefined && inputHarnessId !== harnessId) {
    return yield* fail(
      "artifact-invalid",
      "Canvas harness attribution does not match the active turn.",
    );
  }

  const query = yield* ProjectionSnapshotQuery;
  const thread = yield* query.getThreadDetailById(invocation.threadId).pipe(
    Effect.mapError(
      () =>
        new CrokiCanvasPresentError({
          code: "thread-not-found",
          message: "Could not resolve the Thread for this Canvas visual.",
        }),
    ),
  );
  if (Option.isNone(thread)) {
    return yield* fail("thread-not-found", "Could not resolve the Thread for this Canvas visual.");
  }

  const revision = nextCanvasRevision(thread.value);
  const timestamp = DateTime.formatIso(yield* DateTime.now);
  const crypto = yield* Crypto.Crypto;
  const artifactId = yield* crypto.randomUUIDv4.pipe(Effect.orDie);
  const commandUuid = yield* crypto.randomUUIDv4.pipe(Effect.orDie);
  const eventUuid = yield* crypto.randomUUIDv4.pipe(Effect.orDie);
  const turnId = thread.value.latestTurn?.turnId ?? null;

  const artifact = yield* Effect.try({
    try: () =>
      buildCrokiCanvasArtifact(input, {
        artifactId,
        revision,
        threadId: invocation.threadId,
        turnId,
        harnessId,
        createdAt: timestamp,
      }),
    catch: (cause) =>
      new CrokiCanvasPresentError({
        code: "artifact-invalid",
        message: cause instanceof Error ? cause.message : "The Canvas visual is invalid.",
      }),
  });

  const engine = yield* OrchestrationEngineService;
  const activityPayload = {
    artifact,
  };
  yield* engine
    .dispatch({
      type: "thread.activity.append",
      commandId: CommandId.make(`canvas-presented:${commandUuid}`),
      threadId: invocation.threadId,
      activity: {
        id: EventId.make(eventUuid),
        tone: "info",
        kind: "croki.canvas.presented",
        summary: `Canvas visual ready · ${artifact.nodes.length} items`,
        payload: activityPayload,
        turnId,
        createdAt: timestamp,
      },
      createdAt: timestamp,
    })
    .pipe(
      Effect.mapError(
        () =>
          new CrokiCanvasPresentError({
            code: "persistence-failed",
            message: "The Canvas visual could not be saved to this Thread.",
          }),
      ),
    );

  return {
    artifactId: artifact.id,
    revision: artifact.revision,
    harnessId: artifact.harnessId,
    presentation: artifact.presentation,
    nodeCount: artifact.nodes.length,
    edgeCount: artifact.edges.length,
    createdAt: artifact.createdAt,
  } satisfies CrokiCanvasPresentResult;
});

function getInvocationHarnessId(
  invocation: McpInvocationContext.McpInvocationScope,
): CrokiCanvasHarnessId | "native" | undefined {
  const value = (
    invocation as McpInvocationContext.McpInvocationScope & {
      readonly harnessId?: unknown;
    }
  ).harnessId;
  return value === "native" || value === "product-v1" || value === "gtm-v1" ? value : undefined;
}

function getInputHarnessId(input: CrokiCanvasPresentInput): CrokiCanvasHarnessId | undefined {
  if ("presentation" in input) {
    return input.harnessId;
  }
  if (input.view === "product") return "product-v1";
  if (input.view === "gtm") return "gtm-v1";
  return undefined;
}

function nextCanvasRevision(thread: OrchestrationThread): number {
  let latest = 0;
  for (const activity of thread.activities) {
    if (activity.kind !== "croki.canvas.presented") continue;
    const revision = readRevision(activity.payload);
    if (revision !== null) latest = Math.max(latest, revision);
  }
  return latest + 1;
}

function readRevision(value: unknown): number | null {
  if (!isRecord(value)) return null;
  const artifact = isRecord(value.artifact) ? value.artifact : undefined;
  const candidate = artifact?.revision ?? value.revision;
  return typeof candidate === "number" && Number.isSafeInteger(candidate) && candidate >= 1
    ? candidate
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const CrokiCanvasToolkitHandlersLive = CrokiCanvasToolkit.toLayer({
  canvas_present: presentCrokiCanvas,
});
