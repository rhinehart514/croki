import {
  EventId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type OrchestrationThread,
} from "@croki/contracts";
import { describe, expect, it } from "vite-plus/test";

import { projectProjectPerception } from "./projectPerception.ts";

const now = "2026-08-03T00:00:00.000Z";
const projectId = ProjectId.make("project-perception");
const modelSelection = { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.6" };

function thread(threadId: string, title: string): OrchestrationThread {
  return {
    id: ThreadId.make(threadId),
    projectId,
    title,
    modelSelection,
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    latestTurn: null,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    deletedAt: null,
    messages: [],
    proposedPlans: [],
    activities: [
      {
        id: EventId.make("same-event"),
        tone: "tool",
        kind: "tool.read",
        summary: title,
        payload: { title, detail: `${title} source` },
        turnId: null,
        sequence: 1,
        createdAt: now,
      },
    ],
    checkpoints: [],
    session: null,
  };
}

describe("projectProjectPerception", () => {
  it("keeps identically named source objects from sibling Threads", () => {
    const snapshot = projectProjectPerception(
      projectId,
      [thread("thread-a", "Thread A"), thread("thread-b", "Thread B")],
      { revision: 11 },
    );

    expect(snapshot.revision).toBe(11);
    expect(snapshot.sourceRevision).toBe(11);
    expect(snapshot.sourceThreadIds).toEqual([
      ThreadId.make("thread-a"),
      ThreadId.make("thread-b"),
    ]);
    expect(snapshot.objects.filter((object) => object.type === "runtime")).toHaveLength(2);
    expect(new Set(snapshot.objects.map((object) => object.id)).size).toBe(snapshot.objects.length);
    expect(
      snapshot.objects
        .filter((object) => object.type === "runtime")
        .every((object) => object.source.sourceThreadId !== undefined),
    ).toBe(true);
  });

  it("uses the project event cursor for cross-Thread changes", () => {
    const unchanged = projectProjectPerception(projectId, [thread("thread-a", "A")], {
      revision: 8,
      sinceRevision: 8,
    });
    expect(unchanged.changed).toBe(false);
    expect(unchanged.delta.addedObjects).toHaveLength(0);

    const changed = projectProjectPerception(projectId, [thread("thread-a", "A")], {
      revision: 9,
      sinceRevision: 8,
    });
    expect(changed.changed).toBe(true);
    expect(changed.delta.addedObjects.length).toBeGreaterThan(0);
  });
});
