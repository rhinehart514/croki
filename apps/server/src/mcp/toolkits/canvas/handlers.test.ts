import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import {
  EnvironmentId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type OrchestrationCommand,
} from "@t3tools/contracts";
import { parseCrokiCanvasPresentedActivityPayload } from "@t3tools/shared/crokiCanvasActivity";
import { serializeCrokiContext } from "@t3tools/shared/crokiContext";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Stream from "effect/Stream";

import {
  OrchestrationEngineService,
  type OrchestrationEngineShape,
} from "../../../orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "../../../orchestration/Services/ProjectionSnapshotQuery.ts";
import * as WorkspaceFileSystem from "../../../workspace/WorkspaceFileSystem.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import { presentCrokiCanvas } from "./handlers.ts";

it.effect("persists a scoped provisional scene and emits only a content-free refresh receipt", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const workspaceRoot = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "croki-canvas-tool-",
      });
      yield* fileSystem.makeDirectory(path.join(workspaceRoot, ".croki"), {
        recursive: true,
      });
      yield* fileSystem.writeFileString(
        path.join(workspaceRoot, ".croki", "context.json"),
        serializeCrokiContext({
          version: 1,
          product: "Croki",
          updatedAt: "2026-07-31T18:00:00.000Z",
          nodes: [
            {
              id: "founder-intent",
              kind: "intent",
              status: "current",
              origin: "founder",
              title: "Keep judgment near the work",
              body: "",
              updatedAt: "2026-07-31T18:00:00.000Z",
            },
          ],
          edges: [],
        }),
      );

      const activities: OrchestrationCommand[] = [];
      let writtenContents = "";
      const threadId = ThreadId.make("thread-canvas-tool");
      const projection = Layer.mock(ProjectionSnapshotQuery)({
        getThreadCheckpointContext: () =>
          Effect.succeed(
            Option.some({
              threadId,
              projectId: ProjectId.make("project-canvas-tool"),
              workspaceRoot,
              worktreePath: null,
              checkpoints: [],
            }),
          ),
      });
      const engine = OrchestrationEngineService.of({
        dispatch: (command) =>
          Effect.sync(() => {
            activities.push(command);
            return { sequence: 1 };
          }),
        readEvents: () => Stream.empty,
        streamDomainEvents: Stream.empty,
        latestSequence: Effect.succeed(1),
      } satisfies OrchestrationEngineShape);
      const workspace = WorkspaceFileSystem.WorkspaceFileSystem.of({
        readFile: () => Effect.die("unused"),
        writeFile: (input) =>
          Effect.sync(() => {
            writtenContents = input.contents;
            return { relativePath: input.relativePath };
          }),
      });
      const invocation: McpInvocationContext.McpInvocationScope = {
        environmentId: EnvironmentId.make("environment-canvas-tool"),
        threadId,
        providerSessionId: "provider-session-canvas-tool",
        providerInstanceId: ProviderInstanceId.make("codex"),
        capabilities: new Set(["canvas"]),
        issuedAt: 1,
      };

      const result = yield* presentCrokiCanvas({
        view: "product",
        question: "What product consequence follows from continuity?",
        nodes: [
          {
            id: "agent-consequence",
            kind: "work",
            title: "Make context inspectable",
            body: "The founder must see why a premise entered a turn.",
            references: [{ kind: "file", path: "spec.md", line: 260 }],
          },
        ],
        edges: [{ from: "agent-consequence", to: "founder-intent", relation: "serves" }],
      }).pipe(
        Effect.provideService(McpInvocationContext.McpInvocationContext, invocation),
        Effect.provide(projection),
        Effect.provideService(OrchestrationEngineService, engine),
        Effect.provideService(WorkspaceFileSystem.WorkspaceFileSystem, workspace),
      );

      expect(result.provisionalNodeIds).toEqual(["agent-consequence"]);
      expect(writtenContents).toContain('"status": "current"');
      expect(writtenContents).toContain('"status": "provisional"');
      expect(writtenContents).toContain('"origin": "agent"');
      expect(activities).toHaveLength(1);
      const activity = activities[0];
      expect(activity?.type).toBe("thread.activity.append");
      if (!activity || activity.type !== "thread.activity.append") return;
      expect(activity.activity.kind).toBe("croki.canvas.presented");
      expect(activity.activity.summary).not.toContain("The founder must see why");
      const payload = parseCrokiCanvasPresentedActivityPayload(activity.activity.payload);
      expect(payload).toEqual({
        relativePath: ".croki/context.json",
        view: "product",
        question: "What product consequence follows from continuity?",
        provisionalNodeIds: ["agent-consequence"],
        provisionalCount: 1,
        edgeCount: 1,
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
      });
      expect(
        parseCrokiCanvasPresentedActivityPayload({
          ...payload,
          provisionalCount: "1",
        }),
      ).toBeNull();
    }),
  ).pipe(Effect.provide(NodeServices.layer)),
);
