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
