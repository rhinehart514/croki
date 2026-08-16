import {
  ApprovalRequestId,
  CommandId,
  EventId,
  MessageId,
  type OrchestrationProject,
  type OrchestrationReadModel,
  type OrchestrationThread,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  TurnId,
} from "@croki/contracts";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";

import { decideOrchestrationCommand } from "./decider.ts";
import { projectEvent } from "./projector.ts";

const now = "2026-01-01T00:00:00.000Z";
const projectId = ProjectId.make("project-multiplayer");
const threadId = ThreadId.make("thread-multiplayer");
const modelSelection = {
  instanceId: ProviderInstanceId.make("codex"),
  model: "gpt-5-codex",
};

const project: OrchestrationProject = {
  id: projectId,
  title: "Multiplayer",
  workspaceRoot: "/tmp/multiplayer",
  defaultModelSelection: modelSelection,
  scripts: [],
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
};

const baseThread = (): OrchestrationThread => ({
  id: threadId,
  projectId,
  title: "Thread",
  modelSelection,
  runtimeMode: "full-access",
  interactionMode: "default",
  branch: null,
  worktreePath: null,
  latestTurn: null,
  queuedTurnStarts: [],
  createdAt: now,
  updatedAt: now,
  archivedAt: null,
  settledOverride: null,
  settledAt: null,
  deletedAt: null,
  messages: [],
  proposedPlans: [],
  activities: [],
  checkpoints: [],
  session: null,
});

const modelWithThread = (thread: OrchestrationThread): OrchestrationReadModel => ({
  snapshotSequence: 0,
  projects: [project],
  threads: [thread],
  updatedAt: now,
});

const startCommand = (commandId: string, messageId: string, createdAt: string) => ({
  type: "thread.turn.start" as const,
  commandId: CommandId.make(commandId),
  threadId,
  message: {
    messageId: MessageId.make(messageId),
    role: "user" as const,
    text: messageId,
    attachments: [],
  },
  runtimeMode: "full-access" as const,
  interactionMode: "default" as const,
  createdAt,
});

const activeThread = () => {
  return {
    ...baseThread(),
    session: {
      threadId,
      status: "running" as const,
      providerName: "codex",
      providerInstanceId: modelSelection.instanceId,
      runtimeMode: "full-access" as const,
      activeTurnId: TurnId.make("turn-active"),
      lastError: null,
      updatedAt: now,
    },
    latestTurn: {
      turnId: TurnId.make("turn-active"),
      state: "running" as const,
      requestedAt: now,
      startedAt: now,
      completedAt: null,
      assistantMessageId: null,
    },
  };
};

it.layer(NodeServices.layer)("multiplayer canonical lane decider", (it) => {
  it.effect("queues an ordinary start behind the active primary turn", () =>
    Effect.gen(function* () {
      const result = yield* decideOrchestrationCommand({
        command: startCommand("cmd-queued", "message-queued", "2026-01-01T00:00:01.000Z"),
        readModel: modelWithThread(activeThread()),
      });

      expect(Array.isArray(result)).toBe(true);
      const events = Array.isArray(result) ? result : [result];
      const start = events.find((event) => event.type === "thread.turn-start-requested");
      expect(start?.type).toBe("thread.turn-start-requested");
      if (start?.type === "thread.turn-start-requested") {
        expect(start.payload.queued).toBe(true);
      }
      expect(events.some((event) => event.type === "thread.activity-appended")).toBe(true);
    }),
  );

  it.effect("rejects an interrupt targeted at a stale active turn", () =>
    Effect.gen(function* () {
      const failure = yield* Effect.flip(
        decideOrchestrationCommand({
          command: {
            type: "thread.turn.interrupt",
            commandId: CommandId.make("cmd-stale-interrupt"),
            threadId,
            turnId: TurnId.make("turn-stale"),
            createdAt: now,
          },
          readModel: modelWithThread(activeThread()),
        }),
      );

      expect(failure.message).toContain("is not running expected turn turn-stale");
    }),
  );

  it.effect("accepts only the first response for a pending approval", () =>
    Effect.gen(function* () {
      const thread = {
        ...baseThread(),
        activities: [
          {
            id: EventId.make("approval-requested"),
            tone: "approval" as const,
            kind: "approval.requested" as const,
            summary: "Approval requested",
            payload: { requestId: "approval-1" },
            turnId: null,
            createdAt: now,
          },
        ],
      };
      const readModel = modelWithThread(thread);
      const first = yield* decideOrchestrationCommand({
        command: {
          type: "thread.approval.respond",
          commandId: CommandId.make("cmd-approval-first"),
          threadId,
          requestId: ApprovalRequestId.make("approval-1"),
          decision: "accept",
          createdAt: now,
        },
        readModel,
      });
      expect(Array.isArray(first)).toBe(true);
      const firstEvents = Array.isArray(first) ? first : [first];
      expect(firstEvents.some((event) => event.type === "thread.activity-appended")).toBe(true);

      let next = readModel;
      for (const [index, event] of firstEvents.entries()) {
        next = yield* projectEvent(next, { ...event, sequence: index + 1 });
      }
      const secondFailure = yield* Effect.flip(
        decideOrchestrationCommand({
          command: {
            type: "thread.approval.respond",
            commandId: CommandId.make("cmd-approval-second"),
            threadId,
            requestId: ApprovalRequestId.make("approval-1"),
            decision: "decline",
            createdAt: "2026-01-01T00:00:02.000Z",
          },
          readModel: next,
        }),
      );
      expect(secondFailure.message).toContain("is not pending");
    }),
  );
});
