import {
  CheckpointRef,
  CommandId,
  EventId,
  MessageId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  TurnId,
  type OrchestrationEvent,
  type OrchestrationReadModel,
} from "@croki/contracts";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { projectEvent } from "./projector.ts";

const createdAt = "2026-01-02T03:04:05.000Z";
const sourceThreadId = ThreadId.make("thread-source");
const targetThreadId = ThreadId.make("thread-fork");
const sourceTurnId = TurnId.make("turn-source");
const sourceUserMessageId = MessageId.make("message-user");
const sourceAssistantMessageId = MessageId.make("message-assistant");

const readModel: OrchestrationReadModel = {
  snapshotSequence: 9,
  projects: [],
  threads: [
    {
      id: sourceThreadId,
      projectId: ProjectId.make("project-1"),
      title: "Source",
      modelSelection: {
        instanceId: ProviderInstanceId.make("codex"),
        model: "gpt-5-codex",
      },
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: "main",
      worktreePath: "/tmp/project-1",
      latestTurn: {
        turnId: sourceTurnId,
        state: "completed",
        requestedAt: createdAt,
        startedAt: createdAt,
        completedAt: createdAt,
        assistantMessageId: sourceAssistantMessageId,
      },
      createdAt,
      updatedAt: createdAt,
      archivedAt: null,
      settledOverride: "settled",
      settledAt: createdAt,
      snoozedUntil: null,
      snoozedAt: null,
      deletedAt: null,
      messages: [
        {
          id: sourceUserMessageId,
          role: "user",
          text: "hello",
          turnId: sourceTurnId,
          attachments: [
            {
              type: "image",
              id: "source-image",
              name: "source.png",
              mimeType: "image/png",
              sizeBytes: 42,
            },
          ],
          streaming: false,
          createdAt,
          updatedAt: createdAt,
        },
        {
          id: sourceAssistantMessageId,
          role: "assistant",
          text: "hi",
          turnId: sourceTurnId,
          streaming: false,
          createdAt,
          updatedAt: createdAt,
        },
      ],
      proposedPlans: [
        {
          id: "implemented-plan",
          turnId: sourceTurnId,
          planMarkdown: "done",
          implementedAt: createdAt,
          implementationThreadId: sourceThreadId,
          createdAt,
          updatedAt: createdAt,
        },
        {
          id: "actionable-plan",
          turnId: sourceTurnId,
          planMarkdown: "todo",
          implementedAt: null,
          implementationThreadId: null,
          createdAt,
          updatedAt: createdAt,
        },
      ],
      activities: [
        {
          id: EventId.make("activity-tool"),
          tone: "tool",
          kind: "tool.completed",
          summary: "Tool complete",
          payload: {},
          turnId: sourceTurnId,
          createdAt,
        },
        {
          id: EventId.make("activity-pending"),
          tone: "approval",
          kind: "approval.requested",
          summary: "Approval needed",
          payload: { requestId: "pending-request" },
          turnId: sourceTurnId,
          createdAt,
        },
      ],
      checkpoints: [
        {
          turnId: sourceTurnId,
          checkpointTurnCount: 1,
          checkpointRef: CheckpointRef.make("checkpoint-source"),
          status: "ready",
          files: [],
          assistantMessageId: sourceAssistantMessageId,
          completedAt: createdAt,
        },
      ],
      session: {
        threadId: sourceThreadId,
        status: "ready",
        providerName: "codex",
        runtimeMode: "full-access",
        activeTurnId: null,
        lastError: null,
        updatedAt: createdAt,
      },
    },
  ],
  updatedAt: createdAt,
};

const event: OrchestrationEvent = {
  sequence: 10,
  eventId: EventId.make("event-fork"),
  aggregateKind: "thread",
  aggregateId: targetThreadId,
  type: "thread.fork-requested",
  occurredAt: createdAt,
  commandId: CommandId.make("command-fork"),
  causationEventId: null,
  correlationId: CommandId.make("command-fork"),
  metadata: {},
  payload: {
    threadId: targetThreadId,
    sourceThreadId,
    createdAt,
  },
};

it.effect("atomically projects a sanitized, target-scoped thread fork", () =>
  Effect.gen(function* () {
    const next = yield* projectEvent(readModel, event);
    const source = next.threads.find((thread) => thread.id === sourceThreadId)!;
    const fork = next.threads.find((thread) => thread.id === targetThreadId)!;

    expect(source).toBe(readModel.threads[0]);
    expect(fork.forkedFromThreadId).toBe(sourceThreadId);
    expect(fork.title).toBe("Source (fork)");
    expect(fork.messages.map((message) => message.id)).toEqual([
      `fork:${targetThreadId}:${sourceUserMessageId}`,
      `fork:${targetThreadId}:${sourceAssistantMessageId}`,
    ]);
    expect(fork.messages.map((message) => message.turnId)).toEqual([
      `fork:${targetThreadId}:${sourceTurnId}`,
      `fork:${targetThreadId}:${sourceTurnId}`,
    ]);
    expect(fork.latestTurn?.assistantMessageId).toBe(
      `fork:${targetThreadId}:${sourceAssistantMessageId}`,
    );
    expect(fork.activities.map((activity) => activity.id)).toEqual([
      `fork:${targetThreadId}:activity-tool`,
    ]);
    expect(fork.proposedPlans.map((plan) => plan.id)).toEqual(["implemented-plan"]);
    expect(fork.checkpoints).toEqual([]);
    expect(fork.archivedAt).toBeNull();
    expect(fork.settledOverride).toBeNull();
    expect(fork.session).toMatchObject({
      threadId: targetThreadId,
      status: "starting",
      providerName: null,
      activeTurnId: null,
    });
  }),
);

it.effect("forks immediately before the selected user message", () =>
  Effect.gen(function* () {
    const next = yield* projectEvent(readModel, {
      ...event,
      payload: {
        ...event.payload,
        forkPoint: {
          messageId: sourceUserMessageId,
          turnId: sourceTurnId,
          createdAt,
          rollbackTurns: 1,
        },
      },
    });
    const fork = next.threads.find((thread) => thread.id === targetThreadId)!;

    expect(fork.title).toBe("Source (edit)");
    expect(fork.messages).toEqual([]);
    expect(fork.activities).toEqual([]);
    expect(fork.proposedPlans).toEqual([]);
    expect(fork.latestTurn).toBeNull();
    expect(readModel.threads[0]?.messages).toHaveLength(2);
  }),
);

it.effect("preserves settled history before a middle edit boundary", () =>
  Effect.gen(function* () {
    const secondTurnId = TurnId.make("turn-second");
    const secondUserMessageId = MessageId.make("message-user-second");
    const secondAssistantMessageId = MessageId.make("message-assistant-second");
    const source = readModel.threads[0]!;
    const modelWithTwoTurns: OrchestrationReadModel = {
      ...readModel,
      threads: [
        {
          ...source,
          latestTurn: {
            turnId: secondTurnId,
            state: "completed",
            requestedAt: "2026-01-02T03:05:00.000Z",
            startedAt: "2026-01-02T03:05:00.000Z",
            completedAt: "2026-01-02T03:05:02.000Z",
            assistantMessageId: secondAssistantMessageId,
          },
          messages: [
            ...source.messages.map((message) =>
              message.id === sourceUserMessageId ? { ...message, turnId: null } : message,
            ),
            {
              id: secondUserMessageId,
              role: "user",
              text: "change direction",
              turnId: secondTurnId,
              streaming: false,
              createdAt: "2026-01-02T03:05:00.000Z",
              updatedAt: "2026-01-02T03:05:00.000Z",
            },
            {
              id: secondAssistantMessageId,
              role: "assistant",
              text: "changed",
              turnId: secondTurnId,
              streaming: false,
              createdAt: "2026-01-02T03:05:01.000Z",
              updatedAt: "2026-01-02T03:05:02.000Z",
            },
          ],
          proposedPlans: [
            ...source.proposedPlans,
            {
              id: "second-plan",
              turnId: secondTurnId,
              planMarkdown: "later",
              implementedAt: "2026-01-02T03:05:02.000Z",
              implementationThreadId: sourceThreadId,
              createdAt: "2026-01-02T03:05:01.000Z",
              updatedAt: "2026-01-02T03:05:02.000Z",
            },
          ],
          activities: [
            ...source.activities,
            {
              id: EventId.make("activity-second"),
              tone: "tool",
              kind: "tool.completed",
              summary: "Later tool complete",
              payload: {},
              turnId: secondTurnId,
              createdAt: "2026-01-02T03:05:01.000Z",
            },
          ],
        },
      ],
    };

    const next = yield* projectEvent(modelWithTwoTurns, {
      ...event,
      payload: {
        ...event.payload,
        forkPoint: {
          messageId: secondUserMessageId,
          turnId: secondTurnId,
          createdAt: "2026-01-02T03:05:00.000Z",
          rollbackTurns: 1,
        },
      },
    });
    const fork = next.threads.find((thread) => thread.id === targetThreadId)!;

    expect(fork.messages.map((message) => message.text)).toEqual(["hello", "hi"]);
    expect(fork.messages[0]?.attachments).toEqual(source.messages[0]?.attachments);
    expect(fork.latestTurn?.turnId).toBe(`fork:${targetThreadId}:${sourceTurnId}`);
    expect(fork.latestTurn?.assistantMessageId).toBe(
      `fork:${targetThreadId}:${sourceAssistantMessageId}`,
    );
    expect(fork.proposedPlans.map((plan) => plan.id)).toEqual(["implemented-plan"]);
    expect(fork.activities.map((activity) => activity.id)).toEqual([
      `fork:${targetThreadId}:activity-tool`,
    ]);
    expect(fork.checkpoints).toEqual([]);
  }),
);
