import * as NodeCrypto from "node:crypto";

import { CommandId, EventId } from "@t3tools/contracts";
import type { CrokiCanvasPresentedActivityPayload } from "@t3tools/shared/crokiCanvasActivity";
import {
  createEmptyCrokiContext,
  CROKI_CONTEXT_RELATIVE_PATH,
  parseCrokiContext,
  serializeCrokiContext,
} from "@t3tools/shared/crokiContext";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import { OrchestrationEngineService } from "../../../orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "../../../orchestration/Services/ProjectionSnapshotQuery.ts";
import * as WorkspaceFileSystem from "../../../workspace/WorkspaceFileSystem.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import { applyCrokiCanvasPresentation } from "./presentation.ts";
import {
  CrokiCanvasPresentError,
  CrokiCanvasToolkit,
  type CrokiCanvasPresentInput,
  type CrokiCanvasPresentResult,
} from "./tools.ts";

const sha256 = (contents: string): string =>
  NodeCrypto.createHash("sha256").update(contents, "utf8").digest("hex");

const fail = (
  code: CrokiCanvasPresentError["code"],
  message: string,
): Effect.Effect<never, CrokiCanvasPresentError> =>
  Effect.fail(new CrokiCanvasPresentError({ code, message }));

export const presentCrokiCanvas = Effect.fn("CrokiCanvasToolkit.present")(function* (
  input: CrokiCanvasPresentInput,
) {
  const invocation = yield* McpInvocationContext.McpInvocationContext;
  if (!invocation.capabilities.has("canvas")) {
    return yield* fail(
      "canvas-unavailable",
      "Canvas presentation is available only while Canvas is visible for this Thread.",
    );
  }

  const query = yield* ProjectionSnapshotQuery;
  const threadContext = yield* query.getThreadCheckpointContext(invocation.threadId).pipe(
    Effect.mapError(
      () =>
        new CrokiCanvasPresentError({
          code: "thread-not-found",
          message: "Could not resolve the Canvas project for this Thread.",
        }),
    ),
  );
  if (Option.isNone(threadContext)) {
    return yield* fail("thread-not-found", "Could not resolve the Canvas project for this Thread.");
  }

  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const contextPath = path.join(threadContext.value.workspaceRoot, CROKI_CONTEXT_RELATIVE_PATH);
  const exists = yield* fileSystem.exists(contextPath).pipe(
    Effect.mapError(
      () =>
        new CrokiCanvasPresentError({
          code: "context-invalid",
          message: "Could not inspect the project Canvas.",
        }),
    ),
  );
  const baselineContents = exists
    ? yield* fileSystem.readFileString(contextPath).pipe(
        Effect.mapError(
          () =>
            new CrokiCanvasPresentError({
              code: "context-invalid",
              message: "Could not read the project Canvas.",
            }),
        ),
      )
    : null;
  const baseline = yield* Effect.try({
    try: () =>
      baselineContents === null ? createEmptyCrokiContext() : parseCrokiContext(baselineContents),
    catch: () =>
      new CrokiCanvasPresentError({
        code: "context-invalid",
        message: "The project Canvas must be repaired before an agent can present a scene.",
      }),
  });
  const timestamp = DateTime.formatIso(yield* DateTime.now);
  const next = yield* Effect.try({
    try: () => applyCrokiCanvasPresentation(baseline, input, timestamp),
    catch: (cause) =>
      new CrokiCanvasPresentError({
        code: "scene-invalid",
        message: cause instanceof Error ? cause.message : "The Canvas scene is invalid.",
      }),
  });
  const contents = serializeCrokiContext(next);
  const workspaceFileSystem = yield* WorkspaceFileSystem.WorkspaceFileSystem;
  yield* workspaceFileSystem
    .writeFile({
      cwd: threadContext.value.workspaceRoot,
      relativePath: CROKI_CONTEXT_RELATIVE_PATH,
      contents,
      expectedContentsSha256: baselineContents === null ? null : sha256(baselineContents),
    })
    .pipe(
      Effect.mapError(
        () =>
          new CrokiCanvasPresentError({
            code: "write-conflict",
            message: "Canvas changed while the scene was being presented. Read it and try again.",
          }),
      ),
    );

  const digest = sha256(contents);
  const crypto = yield* Crypto.Crypto;
  const engine = yield* OrchestrationEngineService;
  const [commandUuid, eventUuid] = yield* Effect.all([
    crypto.randomUUIDv4,
    crypto.randomUUIDv4,
  ]).pipe(Effect.orDie);
  const activityPayload = {
    relativePath: CROKI_CONTEXT_RELATIVE_PATH,
    view: input.view,
    question: input.question,
    provisionalNodeIds: input.nodes.map((node) => node.id.trim()),
    provisionalCount: input.nodes.length,
    edgeCount: input.edges.length,
    sha256: digest,
  } satisfies CrokiCanvasPresentedActivityPayload;
  yield* engine
    .dispatch({
      type: "thread.activity.append",
      commandId: CommandId.make(`canvas-presented:${commandUuid}`),
      threadId: invocation.threadId,
      activity: {
        id: EventId.make(eventUuid),
        tone: "info",
        kind: "croki.canvas.presented",
        summary: `Canvas presented (${input.nodes.length} proposals)`,
        payload: activityPayload,
        turnId: null,
        createdAt: timestamp,
      },
      createdAt: timestamp,
    })
    .pipe(
      Effect.catchCause((cause) =>
        Effect.logWarning("Canvas scene saved but refresh activity could not be appended", {
          cause,
          threadId: invocation.threadId,
        }),
      ),
    );

  return {
    relativePath: CROKI_CONTEXT_RELATIVE_PATH,
    view: input.view,
    provisionalNodeIds: input.nodes.map((node) => node.id.trim()),
    edgeCount: input.edges.length,
    sha256: digest,
    updatedAt: timestamp,
  } satisfies CrokiCanvasPresentResult;
});

export const CrokiCanvasToolkitHandlersLive = CrokiCanvasToolkit.toLayer({
  canvas_present: presentCrokiCanvas,
});
