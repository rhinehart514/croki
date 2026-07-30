import {
  EventId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type OrchestrationReadModel,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { projectActivityPayload, projectReadModelSnapshot } from "./ActivityPayloadProjection.ts";

const now = "2026-07-30T00:00:00.000Z";

function makeReadModelWithActivity(
  activity: OrchestrationReadModel["threads"][number]["activities"][number],
): OrchestrationReadModel {
  const projectId = ProjectId.make("project-croki");
  const modelSelection = {
    instanceId: ProviderInstanceId.make("codex"),
    model: "gpt-5.6",
  };
  return {
    snapshotSequence: 1,
    updatedAt: now,
    projects: [
      {
        id: projectId,
        title: "Croki",
        workspaceRoot: "/projects/croki",
        defaultModelSelection: modelSelection,
        scripts: [],
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
    ],
    threads: [
      {
        id: ThreadId.make("thread-croki"),
        projectId,
        title: "Canvas",
        modelSelection,
        interactionMode: "default",
        runtimeMode: "full-access",
        branch: null,
        worktreePath: "/projects/croki-worktree",
        latestTurn: null,
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
        settledOverride: null,
        settledAt: null,
        deletedAt: null,
        messages: [],
        proposedPlans: [],
        activities: [activity],
        checkpoints: [],
        session: null,
      },
    ],
  };
}

describe("projectActivityPayload", () => {
  it("keeps Canvas receipts while removing rendered context", () => {
    const receipt = {
      status: "loaded",
      relativePath: ".croki/context.json",
      version: 1,
      sha256: "a".repeat(64),
      updatedAt: "2026-07-30T00:00:00.000Z",
      activeCount: 2,
      currentCount: 1,
      provisionalCount: 1,
      renderedChars: 123,
      truncated: false,
    };
    const projected = projectActivityPayload({
      id: EventId.make("event-croki-context"),
      tone: "info",
      kind: "croki.context.applied",
      summary: "Applied Canvas context",
      payload: {
        sourceEventId: "source-event",
        messageId: "message-1",
        prompt: "private product context",
        receipt,
      },
      turnId: null,
      createdAt: now,
    });

    expect(projected.payload).toEqual({
      messageId: "message-1",
      receipt,
    });
    expect(JSON.stringify(projected)).not.toContain("private product context");
    expect(JSON.stringify(projected)).not.toContain("source-event");
  });

  it("redacts Canvas prompts from full read-model snapshots", () => {
    const snapshot = makeReadModelWithActivity({
      id: EventId.make("event-croki-context-snapshot"),
      tone: "info",
      kind: "croki.context.applied",
      summary: "Applied Canvas context",
      payload: {
        messageId: "message-1",
        prompt: "private product context",
        receipt: { status: "loaded" },
      },
      turnId: null,
      createdAt: now,
    });

    const projected = projectReadModelSnapshot(snapshot);

    expect(projected.threads[0]?.activities[0]?.payload).toEqual({
      messageId: "message-1",
      receipt: { status: "loaded" },
    });
    expect(JSON.stringify(projected)).not.toContain("private product context");
  });
});
