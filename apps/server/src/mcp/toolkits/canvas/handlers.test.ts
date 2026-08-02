import { expect, it } from "@effect/vitest";
import {
  EnvironmentId,
  ProviderInstanceId,
  ThreadId,
  type OrchestrationCommand,
  type OrchestrationThread,
} from "@croki/contracts";
import { parseCrokiCanvasPresentedActivityPayload } from "@croki/shared/crokiCanvasActivity";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";

import {
  OrchestrationEngineService,
  type OrchestrationEngineShape,
} from "../../../orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "../../../orchestration/Services/ProjectionSnapshotQuery.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import { presentCrokiCanvas } from "./handlers.ts";

const threadId = ThreadId.make("thread-canvas-tool");
const invocation: McpInvocationContext.McpInvocationScope = {
  environmentId: EnvironmentId.make("environment-canvas-tool"),
  threadId,
  providerSessionId: "provider-session-canvas-tool",
  providerInstanceId: ProviderInstanceId.make("codex"),
  harnessId: "product-v1",
  capabilities: new Set(["canvas"]),
  issuedAt: 1,
};

const thread = {
  latestTurn: null,
  activities: [
    {
      kind: "croki.canvas.presented",
      payload: { artifact: { revision: 2 } },
    },
  ],
} as unknown as OrchestrationThread;

const testCrypto = Crypto.make({
  randomBytes: (size) => new Uint8Array(size),
  digest: (_algorithm, data) => Effect.succeed(data),
});

it.effect("persists a bounded artifact in the originating Thread activity", () =>
  Effect.gen(function* () {
    const activities: OrchestrationCommand[] = [];
    const projection = Layer.mock(ProjectionSnapshotQuery)({
      getThreadDetailById: () => Effect.succeed(Option.some(thread)),
    });
    const engine = OrchestrationEngineService.of({
      dispatch: (command) =>
        Effect.sync(() => {
          activities.push(command);
          return { sequence: 3 };
        }),
      readEvents: () => Stream.empty,
      streamDomainEvents: Stream.empty,
      latestSequence: Effect.succeed(3),
    } satisfies OrchestrationEngineShape);

    const result = yield* presentCrokiCanvas({
      harnessId: "product-v1",
      presentation: "compare",
      question: "How should Canvas participate in Croki?",
      nodes: [
        {
          id: "artifact",
          role: "route",
          title: "Optional visual artifact",
          body: "A harness-produced scene is not project memory.",
        },
      ],
      edges: [],
    }).pipe(
      Effect.provideService(McpInvocationContext.McpInvocationContext, invocation),
      Effect.provide(projection),
      Effect.provideService(OrchestrationEngineService, engine),
    );

    expect(result.revision).toBe(3);
    expect(result.harnessId).toBe("product-v1");
    expect(activities).toHaveLength(1);
    const command = activities[0];
    expect(command?.type).toBe("thread.activity.append");
    if (!command || command.type !== "thread.activity.append") return;
    expect(command.activity.kind).toBe("croki.canvas.presented");
    expect(command.activity.summary).toBe("Canvas visual ready · 1 items");
    const payload = parseCrokiCanvasPresentedActivityPayload(command.activity.payload);
    expect(payload?.artifact).toMatchObject({
      id: result.artifactId,
      revision: 3,
      threadId,
      harnessId: "product-v1",
      presentation: "compare",
    });
  }).pipe(Effect.provideService(Crypto.Crypto, testCrypto)),
);

it.effect("does not persist when the active invocation is Native", () =>
  Effect.gen(function* () {
    let dispatches = 0;
    const nativeInvocation = { ...invocation, harnessId: "native" as const };
    const projection = Layer.mock(ProjectionSnapshotQuery)({
      getThreadDetailById: () => Effect.succeed(Option.some(thread)),
    });
    const engine = OrchestrationEngineService.of({
      dispatch: () =>
        Effect.sync(() => {
          dispatches += 1;
          return { sequence: 1 };
        }),
      readEvents: () => Stream.empty,
      streamDomainEvents: Stream.empty,
      latestSequence: Effect.succeed(1),
    } satisfies OrchestrationEngineShape);

    const result = yield* presentCrokiCanvas({
      harnessId: "product-v1",
      presentation: "compare",
      question: "Should this be visible?",
      nodes: [{ id: "route", role: "route", title: "No" }],
      edges: [],
    }).pipe(
      Effect.provideService(McpInvocationContext.McpInvocationContext, nativeInvocation),
      Effect.provide(projection),
      Effect.provideService(OrchestrationEngineService, engine),
      Effect.flip,
    );

    expect(result._tag).toBe("CrokiCanvasPresentError");
    expect(result.code).toBe("canvas-unavailable");
    expect(dispatches).toBe(0);
  }).pipe(Effect.provideService(Crypto.Crypto, testCrypto)),
);
