import {
  ApplicationScreenInput,
  ApplicationScreenResult,
  UiHistoryEntry,
  UiHistoryInput,
  UiHistoryListResult,
  PreviewAutomationSnapshotInput,
  type PreviewAutomationSnapshot,
} from "@croki/contracts";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import type * as Types from "effect/Types";
import { McpProtocol, McpSchema, McpServer, Tool } from "effect/unstable/ai";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";

import packageJson from "../../package.json" with { type: "json" };
import * as McpInvocationContext from "./McpInvocationContext.ts";
import * as McpSessionRegistry from "./McpSessionRegistry.ts";
import * as PreviewAutomationBroker from "./PreviewAutomationBroker.ts";
import { UiHistoryStore } from "./UiHistoryStore.ts";
import {
  PreviewSnapshotToolkitHandlersLive,
  PreviewStandardToolkitHandlersLive,
} from "./toolkits/preview/handlers.ts";
import {
  PreviewSnapshotTool,
  PreviewSnapshotToolkit,
  PreviewStandardToolkit,
} from "./toolkits/preview/tools.ts";
import { CrokiSenseToolkitHandlersLive } from "./toolkits/canvas/handlers.ts";
import { CrokiSenseToolkit } from "./toolkits/canvas/tools.ts";
import { ApplicationAwarenessToolkitHandlersLive } from "./toolkits/application/handlers.ts";
import {
  ApplicationAwarenessToolkit,
  ApplicationScreenTool,
} from "./toolkits/application/tools.ts";
import { UiHistoryTool } from "./toolkits/uiHistory/tools.ts";

const unauthorized = HttpServerResponse.jsonUnsafe(
  {
    error: "invalid_mcp_credential",
    message: "A valid provider-scoped MCP bearer credential is required.",
  },
  {
    status: 401,
    headers: {
      "cache-control": "no-store",
      "www-authenticate": "Bearer",
    },
  },
);

type AuthenticatedHttpEffect = Effect.Effect<
  HttpServerResponse.HttpServerResponse,
  Types.unhandled,
  McpInvocationContext.McpInvocationContext
>;

type McpAuthMiddleware = (
  httpEffect: AuthenticatedHttpEffect,
) => Effect.Effect<
  HttpServerResponse.HttpServerResponse,
  Types.unhandled,
  HttpServerRequest.HttpServerRequest
>;

export const normalizeMcpHttpResponse = (
  response: HttpServerResponse.HttpServerResponse,
): HttpServerResponse.HttpServerResponse => {
  const bodyIsEmpty =
    response.body._tag === "Empty" ||
    (response.body._tag === "Uint8Array" && response.body.contentLength === 0) ||
    (response.body._tag === "Raw" && response.body.contentLength === 0);
  return response.status === 200 && bodyIsEmpty
    ? HttpServerResponse.setStatus(response, 202)
    : response;
};

const makeMcpAuthMiddleware = McpSessionRegistry.McpSessionRegistry.pipe(
  Effect.map(
    (registry): McpAuthMiddleware =>
      Effect.fn("McpHttpServer.authenticateRequest")(function* (httpEffect) {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const authorization = request.headers.authorization;
        const token =
          authorization?.startsWith("Bearer ") === true
            ? authorization.slice("Bearer ".length).trim()
            : "";
        const invocation = yield* registry.resolve(token);
        if (!invocation) {
          // Without this the only symptom of a dead credential is the agent
          // quietly losing the whole `croki` toolkit for the rest of its
          // session, with nothing on the server to explain why.
          yield* Effect.logWarning("rejected MCP request with an unusable credential", {
            reason: token.length === 0 ? "missing_bearer_token" : "unknown_or_expired_token",
          });
          return unauthorized;
        }
        return yield* httpEffect.pipe(
          Effect.provideService(McpInvocationContext.McpInvocationContext, invocation),
          Effect.map(normalizeMcpHttpResponse),
        );
      }),
  ),
  Effect.withSpan("McpHttpServer.makeAuthMiddleware"),
);

const McpAuthMiddlewareLive = HttpRouter.middleware<{
  provides: McpInvocationContext.McpInvocationContext;
}>()(makeMcpAuthMiddleware).layer;

const decodePreviewSnapshotInput = Schema.decodeUnknownOption(PreviewAutomationSnapshotInput);

const previewSnapshotFailure = <E>(cause: Cause.Cause<E>) => {
  if (Cause.hasInterrupts(cause) || cause.reasons.some(Cause.isDieReason)) {
    return Effect.failCause(cause).pipe(Effect.orDie);
  }
  const failures = cause.reasons.filter(Cause.isFailReason);
  const firstFailure = failures[0]?.error;
  const errorTag =
    typeof firstFailure === "object" &&
    firstFailure !== null &&
    "_tag" in firstFailure &&
    typeof firstFailure._tag === "string"
      ? firstFailure._tag
      : "PreviewSnapshotError";
  const result = new McpSchema.CallToolResult({
    isError: true,
    structuredContent: {
      error: {
        _tag: errorTag,
        operation: "snapshot",
        failureCount: failures.length,
      },
    },
    content: [{ type: "text", text: "Preview snapshot failed." }],
  });
  return Effect.logWarning("preview snapshot failed", {
    operation: "snapshot",
    errorTag,
    failureCount: failures.length,
  }).pipe(Effect.as(result));
};

function previewSnapshotResult(
  snapshot: PreviewAutomationSnapshot,
  history: { readonly saved: true; readonly id: string } | { readonly saved: false },
): McpSchema.CallToolResult {
  const { screenshot, ...page } = snapshot;
  const metadata = {
    ...page,
    screenshot: {
      mimeType: screenshot.mimeType,
      width: screenshot.width,
      height: screenshot.height,
    },
    uiHistory: history,
  };
  return new McpSchema.CallToolResult({
    isError: false,
    structuredContent: metadata,
    content: [
      { type: "text", text: JSON.stringify(metadata) },
      {
        type: "image",
        data: new Uint8Array(Buffer.from(screenshot.data, "base64")),
        mimeType: screenshot.mimeType,
      },
    ],
  });
}

const registerPreviewSnapshot = Effect.fn("McpHttpServer.registerPreviewSnapshot")(function* () {
  const server = yield* McpServer.McpServer;
  const broker = yield* PreviewAutomationBroker.PreviewAutomationBroker;
  const uiHistory = yield* UiHistoryStore;
  const built = yield* PreviewSnapshotToolkit;
  const tool = PreviewSnapshotTool;
  yield* server.addTool({
    tool: new McpSchema.Tool({
      name: tool.name,
      description: Tool.getDescription(tool),
      inputSchema: Tool.getJsonSchema(tool),
      annotations: {
        ...Context.getOption(tool.annotations, Tool.Title).pipe(
          Option.map((title) => ({ title })),
          Option.getOrUndefined,
        ),
        readOnlyHint: Context.get(tool.annotations, Tool.Readonly),
        destructiveHint: Context.get(tool.annotations, Tool.Destructive),
        idempotentHint: Context.get(tool.annotations, Tool.Idempotent),
        openWorldHint: Context.get(tool.annotations, Tool.OpenWorld),
      },
    }),
    annotations: tool.annotations,
    handle: (payload) =>
      Effect.withFiber((fiber) => {
        const invocation = Context.getUnsafe(
          fiber.context,
          McpInvocationContext.McpInvocationContext,
        );
        return built.handle("preview_snapshot", payload).pipe(
          Stream.unwrap,
          Stream.run(Sink.last()),
          Effect.flatMap(Effect.fromOption),
          Effect.provideService(PreviewAutomationBroker.PreviewAutomationBroker, broker),
          Effect.provideService(McpInvocationContext.McpInvocationContext, invocation),
          Effect.matchCauseEffect({
            onFailure: previewSnapshotFailure,
            onSuccess: ({ encodedResult }) => {
              const snapshot = encodedResult as PreviewAutomationSnapshot;
              const concept = Option.getOrUndefined(decodePreviewSnapshotInput(payload))?.concept;
              return uiHistory.record(invocation.threadId, snapshot, concept).pipe(
                Effect.matchEffect({
                  onFailure: (error) =>
                    Effect.logWarning("failed to preserve preview snapshot in UI history", {
                      threadId: invocation.threadId,
                      operation: error.operation,
                    }).pipe(Effect.as(previewSnapshotResult(snapshot, { saved: false }))),
                  onSuccess: (entry) =>
                    Effect.succeed(previewSnapshotResult(snapshot, { saved: true, id: entry.id })),
                }),
              );
            },
          }),
        );
      }),
  });
});

const decodeUiHistoryInput = Schema.decodeUnknownEffect(UiHistoryInput);
const encodeUiHistoryListJson = Schema.encodeSync(Schema.fromJsonString(UiHistoryListResult));
const UiHistoryEntryResult = Schema.Struct({ entry: UiHistoryEntry });
const encodeUiHistoryEntryJson = Schema.encodeSync(Schema.fromJsonString(UiHistoryEntryResult));

const uiHistoryFailure = (code: "not-found" | "read-failed", message: string) =>
  new McpSchema.CallToolResult({
    isError: true,
    structuredContent: { error: { _tag: "UiHistoryError", code, message } },
    content: [{ type: "text", text: message }],
  });

const registerUiHistory = Effect.fn("McpHttpServer.registerUiHistory")(function* () {
  const server = yield* McpServer.McpServer;
  const history = yield* UiHistoryStore;
  const tool = UiHistoryTool;
  yield* server.addTool({
    tool: new McpSchema.Tool({
      name: tool.name,
      description: Tool.getDescription(tool),
      inputSchema: Tool.getJsonSchema(tool),
      annotations: {
        ...Context.getOption(tool.annotations, Tool.Title).pipe(
          Option.map((title) => ({ title })),
          Option.getOrUndefined,
        ),
        readOnlyHint: Context.get(tool.annotations, Tool.Readonly),
        destructiveHint: Context.get(tool.annotations, Tool.Destructive),
        idempotentHint: Context.get(tool.annotations, Tool.Idempotent),
        openWorldHint: Context.get(tool.annotations, Tool.OpenWorld),
      },
    }),
    annotations: tool.annotations,
    handle: (payload) =>
      Effect.withFiber((fiber) => {
        const invocation = Context.getUnsafe(
          fiber.context,
          McpInvocationContext.McpInvocationContext,
        );
        return Effect.gen(function* () {
          const input = yield* decodeUiHistoryInput(payload).pipe(Effect.orDie);
          if (input.id) {
            const image = yield* history.read(invocation.threadId, input.id);
            if (!image) {
              return uiHistoryFailure("not-found", "That checked screen is no longer available.");
            }
            return new McpSchema.CallToolResult({
              isError: false,
              structuredContent: { entry: image.entry },
              content: [
                { type: "text", text: encodeUiHistoryEntryJson({ entry: image.entry }) },
                { type: "image", data: image.data, mimeType: "image/png" },
              ],
            });
          }
          const result = yield* history.list(invocation.threadId, input.limit);
          return new McpSchema.CallToolResult({
            isError: false,
            structuredContent: result,
            content: [{ type: "text", text: encodeUiHistoryListJson(result) }],
          });
        }).pipe(
          Effect.catchTag("UiHistoryStoreError", (error) =>
            Effect.succeed(uiHistoryFailure("read-failed", error.message)),
          ),
        );
      }),
  });
});

const decodeApplicationScreenInput = Schema.decodeUnknownEffect(ApplicationScreenInput);
const encodeApplicationScreenJson = Schema.encodeSync(
  Schema.fromJsonString(ApplicationScreenResult),
);

const registerApplicationScreen = Effect.fn("McpHttpServer.registerApplicationScreen")(
  function* () {
    const server = yield* McpServer.McpServer;
    const history = yield* UiHistoryStore;
    const tool = ApplicationScreenTool;
    yield* server.addTool({
      tool: new McpSchema.Tool({
        name: tool.name,
        description: Tool.getDescription(tool),
        inputSchema: Tool.getJsonSchema(tool),
        annotations: {
          ...Context.getOption(tool.annotations, Tool.Title).pipe(
            Option.map((title) => ({ title })),
            Option.getOrUndefined,
          ),
          readOnlyHint: Context.get(tool.annotations, Tool.Readonly),
          destructiveHint: Context.get(tool.annotations, Tool.Destructive),
          idempotentHint: Context.get(tool.annotations, Tool.Idempotent),
          openWorldHint: Context.get(tool.annotations, Tool.OpenWorld),
        },
      }),
      annotations: tool.annotations,
      handle: (payload) =>
        Effect.withFiber((fiber) => {
          const invocation = Context.getUnsafe(
            fiber.context,
            McpInvocationContext.McpInvocationContext,
          );
          return Effect.gen(function* () {
            const input = yield* decodeApplicationScreenInput(payload).pipe(Effect.orDie);
            const image = yield* history.readProject(invocation.threadId, input);
            if (!image) {
              return new McpSchema.CallToolResult({
                isError: true,
                structuredContent: {
                  error: {
                    _tag: "ApplicationAwarenessError",
                    code: "evidence-not-found",
                    message: "That checked screen is not available in this project.",
                  },
                },
                content: [
                  { type: "text", text: "That checked screen is not available in this project." },
                ],
              });
            }
            const result = { screen: image.screen };
            return new McpSchema.CallToolResult({
              isError: false,
              structuredContent: result,
              content: [
                { type: "text", text: encodeApplicationScreenJson(result) },
                { type: "image", data: image.data, mimeType: "image/png" },
              ],
            });
          }).pipe(
            Effect.catchTag("UiHistoryStoreError", (error) =>
              Effect.succeed(
                new McpSchema.CallToolResult({
                  isError: true,
                  structuredContent: {
                    error: {
                      _tag: "ApplicationAwarenessError",
                      code: "observation-failed",
                      message: error.message,
                    },
                  },
                  content: [{ type: "text", text: error.message }],
                }),
              ),
            ),
          );
        }),
    });
  },
);

const PreviewStandardToolkitRegistrationLive = McpServer.toolkit(PreviewStandardToolkit).pipe(
  Layer.provide(PreviewStandardToolkitHandlersLive),
);

const PreviewSnapshotRegistrationLive = Layer.effectDiscard(registerPreviewSnapshot()).pipe(
  Layer.provide(PreviewSnapshotToolkitHandlersLive),
);

export const UiHistoryRegistrationLive = Layer.effectDiscard(registerUiHistory());

export const PreviewToolkitRegistrationLive = Layer.mergeAll(
  PreviewStandardToolkitRegistrationLive,
  PreviewSnapshotRegistrationLive,
);

export const CrokiSenseToolkitRegistrationLive = McpServer.toolkit(CrokiSenseToolkit).pipe(
  Layer.provide(CrokiSenseToolkitHandlersLive),
);

export const ApplicationAwarenessToolkitRegistrationLive = McpServer.toolkit(
  ApplicationAwarenessToolkit,
).pipe(Layer.provide(ApplicationAwarenessToolkitHandlersLive));

export const ApplicationScreenRegistrationLive = Layer.effectDiscard(registerApplicationScreen());

export const CrokiToolkitRegistrationLive = Layer.mergeAll(
  PreviewToolkitRegistrationLive,
  CrokiSenseToolkitRegistrationLive,
  ApplicationAwarenessToolkitRegistrationLive,
  ApplicationScreenRegistrationLive,
  UiHistoryRegistrationLive,
);

const McpTransportLive = McpServer.layerHttp({
  name: "Croki",
  version: packageJson.version,
  path: "/mcp",
  protocols: [McpProtocol.v2025_06_18],
}).pipe(Layer.provide(McpAuthMiddlewareLive));

export const layer = CrokiToolkitRegistrationLive.pipe(Layer.provideMerge(McpTransportLive));
