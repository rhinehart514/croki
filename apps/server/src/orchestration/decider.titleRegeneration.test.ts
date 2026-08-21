import {
  CommandId,
  MessageId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type OrchestrationReadModel,
} from "@croki/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { decideOrchestrationCommand } from "./decider.ts";

const UPDATED_AT = "2026-01-01T00:00:00.000Z";

const readModel: OrchestrationReadModel = {
  snapshotSequence: 0,
  projects: [],
  threads: [
    {
      id: ThreadId.make("thread-1"),
      projectId: ProjectId.make("project-1"),
      title: "Manual title",
      modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" },
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: null,
      worktreePath: null,
      latestTurn: null,
      createdAt: UPDATED_AT,
      updatedAt: UPDATED_AT,
      archivedAt: null,
      settledOverride: null,
      settledAt: null,
      snoozedUntil: null,
      snoozedAt: null,
      deletedAt: null,
      messages: [],
      proposedPlans: [],
      activities: [],
      checkpoints: [],
      session: null,
    },
  ],
  updatedAt: UPDATED_AT,
};

const workerReadModel: OrchestrationReadModel = {
  ...readModel,
  threads: readModel.threads.map((thread) => ({
    ...thread,
    parentThreadId: ThreadId.make("thread-parent"),
  })),
};

it.layer(NodeServices.layer)("title regeneration decider", (it) => {
  it.effect("preserves updatedAt for a stale completion", () =>
    Effect.gen(function* () {
      const result = yield* decideOrchestrationCommand({
        command: {
          type: "thread.title.regeneration.complete",
          commandId: CommandId.make("cmd-regeneration-complete"),
          threadId: ThreadId.make("thread-1"),
          requestId: CommandId.make("cmd-old-regeneration-request"),
          title: "Generated title",
        },
        readModel,
      });
      const event = Array.isArray(result) ? result[0] : result;

      expect(event.type).toBe("thread.meta-updated");
      if (event.type === "thread.meta-updated") {
        expect(event.payload).toEqual({
          threadId: ThreadId.make("thread-1"),
          updatedAt: UPDATED_AT,
        });
      }
    }),
  );

  it.effect("rejects title regeneration for worker threads", () =>
    Effect.gen(function* () {
      const error = yield* decideOrchestrationCommand({
        command: {
          type: "thread.meta.update",
          commandId: CommandId.make("cmd-regenerate-worker-title"),
          threadId: ThreadId.make("thread-1"),
          regenerateTitle: true,
        },
        readModel: workerReadModel,
      }).pipe(Effect.flip);

      expect(error._tag).toBe("OrchestrationCommandInvariantError");
    }),
  );

  it.effect("rejects turn starts for worker threads", () =>
    Effect.gen(function* () {
      const error = yield* decideOrchestrationCommand({
        command: {
          type: "thread.turn.start",
          commandId: CommandId.make("cmd-start-worker-turn"),
          threadId: ThreadId.make("thread-1"),
          message: {
            messageId: MessageId.make("message-worker-turn"),
            role: "user",
            text: "Continue independently",
            attachments: [],
          },
          runtimeMode: "full-access",
          interactionMode: "default",
          createdAt: UPDATED_AT,
        },
        readModel: workerReadModel,
      }).pipe(Effect.flip);

      expect(error).toMatchObject({
        _tag: "OrchestrationCommandInvariantError",
        commandType: "thread.turn.start",
        detail: "worker thread thread-1 follows its parent lifecycle",
      });
    }),
  );
});
