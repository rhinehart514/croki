import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  CommandId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type OrchestrationCommand,
  type OrchestrationReadModel,
} from "@t3tools/contracts";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { decideOrchestrationCommand } from "./decider.ts";

const createdAt = "2026-01-02T03:04:05.000Z";
const sourceThreadId = ThreadId.make("thread-source");
const targetThreadId = ThreadId.make("thread-fork");

function makeReadModel(
  overrides: Partial<OrchestrationReadModel["threads"][number]> = {},
): OrchestrationReadModel {
  return {
    snapshotSequence: 1,
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
        latestTurn: null,
        createdAt,
        updatedAt: createdAt,
        archivedAt: null,
        settledOverride: null,
        settledAt: null,
        deletedAt: null,
        messages: [],
        proposedPlans: [],
        activities: [],
        checkpoints: [],
        session: null,
        ...overrides,
      },
    ],
    updatedAt: createdAt,
  };
}

function forkCommand(): Extract<OrchestrationCommand, { type: "thread.fork" }> {
  return {
    type: "thread.fork",
    commandId: CommandId.make("command-fork"),
    threadId: targetThreadId,
    sourceThreadId,
    createdAt,
  };
}

it.effect("decides a canonical thread.fork-requested event", () =>
  Effect.gen(function* () {
    const event = yield* decideOrchestrationCommand({
      command: forkCommand(),
      readModel: makeReadModel(),
    });
    expect(Array.isArray(event)).toBe(false);
    if (!("type" in event)) return;
    expect(event.type).toBe("thread.fork-requested");
    expect(event.aggregateId).toBe(targetThreadId);
    expect(event.payload).toEqual({
      threadId: targetThreadId,
      sourceThreadId,
      createdAt,
    });
  }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect("rejects missing sources, existing targets, and running sources", () =>
  Effect.gen(function* () {
    const missingSource = yield* decideOrchestrationCommand({
      command: forkCommand(),
      readModel: { ...makeReadModel(), threads: [] },
    }).pipe(Effect.flip);
    expect(missingSource._tag).toBe("OrchestrationCommandInvariantError");
    if (missingSource._tag !== "OrchestrationCommandInvariantError") return;
    expect(missingSource.detail).toContain("does not exist");

    const existingTarget = yield* decideOrchestrationCommand({
      command: forkCommand(),
      readModel: {
        ...makeReadModel(),
        threads: [
          ...makeReadModel().threads,
          { ...makeReadModel().threads[0]!, id: targetThreadId },
        ],
      },
    }).pipe(Effect.flip);
    expect(existingTarget._tag).toBe("OrchestrationCommandInvariantError");
    if (existingTarget._tag !== "OrchestrationCommandInvariantError") return;
    expect(existingTarget.detail).toContain("already exists");

    const runningSource = yield* decideOrchestrationCommand({
      command: forkCommand(),
      readModel: makeReadModel({
        session: {
          threadId: sourceThreadId,
          status: "running",
          providerName: "codex",
          runtimeMode: "full-access",
          activeTurnId: null,
          lastError: null,
          updatedAt: createdAt,
        },
      }),
    }).pipe(Effect.flip);
    expect(runningSource._tag).toBe("OrchestrationCommandInvariantError");
    if (runningSource._tag !== "OrchestrationCommandInvariantError") return;
    expect(runningSource.detail).toContain("is running");
  }).pipe(Effect.provide(NodeServices.layer)),
);
