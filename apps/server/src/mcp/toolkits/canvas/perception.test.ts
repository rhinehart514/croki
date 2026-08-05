import { expect, it } from "@effect/vitest";
import { ThreadId } from "@croki/contracts";

import { inspectPerceptionObject, projectThreadPerception } from "./perception.ts";

const threadFixture = {
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
};
const thread = threadFixture as never;

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

it("preserves attachment-backed UI history frames", () => {
  const observation = projectThreadPerception({
    ...threadFixture,
    activities: [
      ...threadFixture.activities,
      {
        id: "event-checked-screen",
        tone: "info",
        kind: "preview.snapshot",
        summary: "Checked Settings",
        payload: {
          frame: {
            kind: "attachment",
            ref: "thread-sense-00000000-0000-4000-8000-000000000001",
            mimeType: "image/png",
            width: 1_280,
            height: 800,
          },
        },
        turnId: "turn-sense",
        sequence: 6,
        createdAt: "2026-08-02T18:00:04.000Z",
      },
    ],
  } as never);

  expect(observation.frame).toMatchObject({
    kind: "attachment",
    ref: "thread-sense-00000000-0000-4000-8000-000000000001",
  });
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

it("projects product and GTM evidence as read-only source-grounded objects", () => {
  const evidenceThread = {
    ...threadFixture,
    activities: [
      ...threadFixture.activities,
      {
        id: "event-evidence",
        tone: "info",
        kind: "croki.evidence.observed",
        summary: "Customer evidence observed",
        payload: {
          observations: [
            {
              id: "objection-17",
              domain: "customer",
              type: "customer-objection",
              title: "Setup felt too technical",
              summary: "The first useful result arrived after repository setup.",
              observedAt: "2026-08-02T18:00:04.000Z",
              source: {
                kind: "customer-call",
                id: "call-17",
                label: "Activation interview",
                uri: "notion://calls/17",
              },
              confidence: 0.9,
              data: { privateTranscript: "must not enter the perception packet" },
            },
          ],
        },
        turnId: "turn-sense",
        sequence: 6,
        createdAt: "2026-08-02T18:00:04.000Z",
      },
    ],
  } as never;

  const observation = projectThreadPerception(evidenceThread);
  const evidence = observation.objects.find((object) => object.id === "evidence:objection-17");
  expect(evidence).toMatchObject({
    type: "customer-objection",
    title: "Setup felt too technical",
    source: {
      kind: "customer-call",
      id: "call-17",
      uri: "notion://calls/17",
      sourceThreadId: "thread-sense",
    },
    affordances: [expect.objectContaining({ authority: "read" })],
    data: { domain: "customer", confidence: 0.9, sourceLabel: "Activation interview" },
  });
  expect(JSON.stringify(evidence)).not.toContain("privateTranscript");
  expect(
    observation.relationships.some(
      (relationship) =>
        relationship.from === "activity:event-evidence" &&
        relationship.to === "evidence:objection-17" &&
        relationship.kind === "observed",
    ),
  ).toBe(true);
});
