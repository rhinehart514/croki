import { expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  ProjectId,
  ThreadId,
  type CrokiProjectPerceptionSnapshot,
  type OrchestrationCommand,
  type OrchestrationThread,
  type PreviewAutomationSnapshot,
} from "@croki/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";

import * as ServerConfig from "../config.ts";
import {
  OrchestrationEngineService,
  type OrchestrationEngineShape,
} from "../orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "../orchestration/Services/ProjectionSnapshotQuery.ts";
import { UiHistoryStore, layer } from "./UiHistoryStore.ts";

const threadId = ThreadId.make("thread-ui-history");
const forkThreadId = ThreadId.make("thread-ui-history-fork");
const projectId = ProjectId.make("project-ui-history");
const snapshot: PreviewAutomationSnapshot = {
  url: "http://localhost:5173/settings",
  title: "Settings",
  loading: false,
  visibleText: "Settings Save",
  interactiveElements: [
    {
      tag: "button",
      role: null,
      name: "Save",
      selector: "button",
      x: 10,
      y: 10,
      width: 80,
      height: 32,
    },
  ],
  accessibilityTree: {},
  consoleEntries: [{ level: "error", text: "Failed", timestamp: "2026-08-05T12:00:00.000Z" }],
  networkEntries: [
    {
      url: "http://localhost:5173/api/settings",
      method: "GET",
      status: 500,
      failed: true,
      timestamp: "2026-08-05T12:00:00.000Z",
    },
  ],
  actionTimeline: [
    {
      id: "action-1",
      action: "navigate",
      status: "succeeded",
      startedAt: "2026-08-05T12:00:00.000Z",
      completedAt: "2026-08-05T12:00:01.000Z",
    },
  ],
  screenshot: {
    mimeType: "image/png",
    data: "iVBORw0KGgo=",
    width: 1_280,
    height: 800,
  },
};

it.effect("records, lists, and reopens a checked screen", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const activities: OrchestrationThread["activities"][number][] = [];
      const commands: OrchestrationCommand[] = [];
      const thread = {
        id: threadId,
        projectId,
        title: "Source Thread",
        branch: "feature/source",
        worktreePath: "/workspace/source",
        checkpoints: [],
        latestTurn: null,
        activities,
      } as unknown as OrchestrationThread;
      const forkThread = {
        ...thread,
        id: forkThreadId,
        title: "Fork Thread",
        branch: "feature/fork",
        worktreePath: "/workspace/fork",
        activities: [],
      } as unknown as OrchestrationThread;
      const projection = Layer.mock(ProjectionSnapshotQuery)({
        getThreadDetailById: (candidateId) =>
          Effect.succeed(
            candidateId === threadId
              ? Option.some(thread)
              : candidateId === forkThreadId
                ? Option.some(forkThread)
                : Option.none(),
          ),
        getProjectPerception: () => {
          const payload = activities[0]?.payload as Record<string, unknown> | undefined;
          if (!payload) return Effect.succeed(Option.none());
          const baseObject = {
            id: "screen-object-source",
            type: "checked-screen",
            title: "Settings",
            revision: 2,
            source: {
              kind: "preview",
              sourceThreadId: threadId,
              turnId: null,
              observedAt: "2026-08-05T12:00:00.000Z",
            },
            affordances: [],
            data: payload,
            frame: payload.frame,
          };
          return Effect.succeed(
            Option.some({
              status: "ready",
              truncated: false,
              revision: 2,
              objects: [
                baseObject,
                {
                  ...baseObject,
                  id: "screen-object-fork",
                  source: { ...baseObject.source, sourceThreadId: forkThreadId },
                },
              ],
            } as unknown as CrokiProjectPerceptionSnapshot),
          );
        },
      });
      const engine = OrchestrationEngineService.of({
        dispatch: (command) =>
          Effect.sync(() => {
            commands.push(command);
            if (command.type === "thread.activity.append") activities.push(command.activity);
            return { sequence: commands.length };
          }),
        readEvents: () => Stream.empty,
        streamDomainEvents: Stream.empty,
        latestSequence: Effect.sync(() => commands.length),
      } satisfies OrchestrationEngineShape);
      const store = yield* Effect.service(UiHistoryStore).pipe(
        Effect.provide(
          layer.pipe(
            Layer.provide(projection),
            Layer.provide(Layer.succeed(OrchestrationEngineService, engine)),
          ),
        ),
      );

      const entry = yield* store.record(threadId, snapshot);
      const listed = yield* store.list(threadId);
      const reopened = yield* store.read(threadId, entry.id);
      const projectHistory = yield* store.listProject(threadId);
      const projectScreen = yield* store.readProject(threadId, {
        sourceThreadId: String(threadId),
        id: entry.id,
      });
      const guessedScreen = yield* store.readProject(threadId, {
        sourceThreadId: "thread-other-project",
        id: entry.id,
      });

      expect(entry).toMatchObject({
        title: "Settings",
        width: 1_280,
        consoleErrorCount: 1,
        networkFailureCount: 1,
        actionCount: 1,
      });
      expect(listed.entries.map((candidate) => candidate.id)).toEqual([entry.id]);
      expect(reopened?.entry.id).toBe(entry.id);
      expect(reopened?.data.byteLength).toBeGreaterThan(0);
      expect(projectHistory.screens.map((screen) => screen.ref)).toEqual([
        { sourceThreadId: String(threadId), id: entry.id },
        { sourceThreadId: String(forkThreadId), id: entry.id },
      ]);
      expect(projectScreen?.screen.sourceThreadTitle).toBe("Source Thread");
      expect(guessedScreen).toBeNull();
      expect(commands).toHaveLength(1);
      const [command] = commands;
      expect(command?.type).toBe("thread.activity.append");
      if (command?.type !== "thread.activity.append") return;
      expect(command.activity.kind).toBe("preview.snapshot");
      expect(command.activity.summary).toBe("Checked Settings");
    }),
  ).pipe(
    Effect.provide(
      ServerConfig.layerTest(process.cwd(), { prefix: "croki-ui-history-test-" }).pipe(
        Layer.provideMerge(NodeServices.layer),
      ),
    ),
  ),
);
