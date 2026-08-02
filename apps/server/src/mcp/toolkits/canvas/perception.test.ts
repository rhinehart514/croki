import { expect, it } from "@effect/vitest";
import { ThreadId } from "@croki/contracts";

import { inspectPerceptionObject, projectThreadPerception } from "./perception.ts";

const thread = {
  id: ThreadId.make("thread-sense"),
  projectId: "project-sense",
  title: "Sense test",
  runtimeMode: "local",
  updatedAt: "2026-08-02T18:00:03.000Z",
  latestTurn: {
    turnId: "turn-sense",
    state: "running",
    requestedAt: "2026-08-02T18:00:00.000Z",
    startedAt: "2026-08-02T18:00:01.000Z",
    completedAt: null,
    assistantMessageId: null,
  },
  activities: [
    {
      id: "event-task",
      tone: "info",
      kind: "task.started",
      summary: "Investigate onboarding",
      payload: { taskId: "task-1", description: "Find the failing path" },
      turnId: "turn-sense",
      sequence: 4,
      createdAt: "2026-08-02T18:00:02.000Z",
    },
    {
      id: "event-frame",
      tone: "tool",
      kind: "preview.snapshot",
      summary: "Preview snapshot",
      payload: {
        frameRef: { url: "http://127.0.0.1:5173", mimeType: "image/png", width: 800, height: 600 },
      },
      turnId: "turn-sense",
      sequence: 5,
      createdAt: "2026-08-02T18:00:03.000Z",
    },
  ],
} as never;

it("projects stable semantic objects, relationships, affordances, and frame references", () => {
  const first = projectThreadPerception(thread);
  const second = projectThreadPerception(thread);

  expect(first.revision).toBe(5);
  expect(first.objects.map((object) => object.id)).toEqual(
    second.objects.map((object) => object.id),
  );
  expect(first.objects.some((object) => object.id === "activity:event-task")).toBe(true);
  expect(first.objects.find((object) => object.id === "thread:thread-sense")?.affordances).toEqual(
    expect.arrayContaining([expect.objectContaining({ authority: "read" })]),
  );
  expect(first.frame).toMatchObject({
    kind: "url",
    ref: "http://127.0.0.1:5173",
    width: 800,
    height: 600,
  });
  expect(first.relationships).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ from: "thread:thread-sense", to: "activity:event-task" }),
    ]),
  );
});

it("returns bounded deltas and inspect neighborhoods from a revision cursor", () => {
  const observation = projectThreadPerception(thread, { sinceRevision: 4 });
  expect(observation.changed).toBe(true);
  expect(observation.delta?.addedObjects.map((object) => object.id) ?? []).toContain(
    "activity:event-frame",
  );
  const inspected = inspectPerceptionObject(observation, "activity:event-task", 1);
  expect(inspected.object?.source.activityId).toBe("event-task");
  expect(inspected.relationships.length).toBeGreaterThan(0);
});
