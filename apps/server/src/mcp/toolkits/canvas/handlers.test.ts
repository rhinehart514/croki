import { expect, it } from "@effect/vitest";
import {
  EnvironmentId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type CrokiProjectPerceptionSnapshot,
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
import {
  presentCrokiCanvas,
  senseInspect,
  senseObserve,
  senseStatus,
  senseWait,
} from "./handlers.ts";

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

const senseThread = {
  ...thread,
  id: threadId,
  projectId: "project-sense",
  title: "Sense Thread",
  runtimeMode: "local",
  updatedAt: "2026-08-02T18:00:02.000Z",
  latestTurn: null,
} as unknown as OrchestrationThread;

const projectObjectId = "thread-origin:remote-runtime";
const projectSnapshot = {
  projectId: ProjectId.make("project-sense"),
  revision: 12,
  sourceRevision: 12,
  changed: true,
  objects: [
    {
      id: projectObjectId,
      type: "runtime",
      title: "Remote runtime",
      revision: 1,
      source: {
        kind: "thread",
        id: "thread-origin",
        sourceThreadId: ThreadId.make("thread-origin"),
        turnId: null,
        observedAt: "2026-08-02T18:00:03.000Z",
      },
      affordances: [],
    },
  ],
  relationships: [],
  delta: {
    sinceRevision: 0,
    addedObjects: [],
    updatedObjects: [],
    removedObjectIds: [],
    addedRelationships: [],
    removedRelationshipIds: [],
  },
  latestActivityAt: "2026-08-02T18:00:03.000Z",
  sourceThreadIds: [ThreadId.make("thread-origin")],
  activeTurnIds: [],
  truncated: false,
  stale: false,
  status: "ready",
} satisfies CrokiProjectPerceptionSnapshot;

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

it.effect("reads semantic sense state without dispatching a Canvas or receipt activity", () =>
  Effect.gen(function* () {
    let dispatches = 0;
    const projection = Layer.mock(ProjectionSnapshotQuery)({
      getThreadDetailById: () => Effect.succeed(Option.some(senseThread)),
    });
    const engine = OrchestrationEngineService.of({
      dispatch: () =>
        Effect.sync(() => {
          dispatches += 1;
          return { sequence: 9 };
        }),
      readEvents: () => Stream.empty,
      streamDomainEvents: Stream.empty,
      latestSequence: Effect.succeed(9),
    } satisfies OrchestrationEngineShape);
    const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      effect.pipe(
        Effect.provideService(McpInvocationContext.McpInvocationContext, invocation),
        Effect.provide(projection),
        Effect.provideService(OrchestrationEngineService, engine),
      );

    const status = yield* provide(senseStatus({}));
    const observation = yield* provide(senseObserve({}));
    const inspection = yield* provide(
      senseInspect({ objectId: `thread:${threadId}`, revision: observation.revision, depth: 1 }),
    );
    const waited = yield* provide(senseWait({ sinceRevision: observation.revision }));

    expect(status.revision).toBe(observation.revision);
    expect(inspection.object.id).toBe(`thread:${threadId}`);
    expect(waited.changed).toBe(false);
    expect(waited.timedOut).toBe(true);
    expect(dispatches).toBe(0);
  }),
);

it.effect("inspects a project object produced by a sibling Thread", () =>
  Effect.gen(function* () {
    const projection = Layer.mock(ProjectionSnapshotQuery)({
      getThreadDetailById: () => Effect.succeed(Option.some(senseThread)),
      getProjectPerception: () => Effect.succeed(Option.some(projectSnapshot)),
    });

    const inspection = yield* senseInspect({
      objectId: projectObjectId,
      revision: projectSnapshot.revision,
      depth: 0,
    }).pipe(
      Effect.provideService(McpInvocationContext.McpInvocationContext, invocation),
      Effect.provide(projection),
    );

    expect(inspection.observation.revision).toBe(projectSnapshot.revision);
    expect(inspection.object.id).toBe(projectObjectId);
    expect(inspection.object.source.sourceThreadId).toBe(ThreadId.make("thread-origin"));
  }),
);
