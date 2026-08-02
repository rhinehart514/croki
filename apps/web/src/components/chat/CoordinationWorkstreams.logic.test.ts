import { EventId, TurnId, type OrchestrationThreadActivity } from "@croki/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  deriveCoordinationWorkstreams,
  isCoordinationTaskActivity,
} from "./CoordinationWorkstreams.logic";

let nextActivityId = 0;

function makeActivity(overrides: {
  id?: string;
  createdAt?: string;
  kind?: string;
  summary?: string;
  tone?: OrchestrationThreadActivity["tone"];
  payload?: Record<string, unknown>;
  turnId?: string;
  sequence?: number;
}): OrchestrationThreadActivity {
  return {
    id: EventId.make(overrides.id ?? `activity-${nextActivityId++}`),
    createdAt: overrides.createdAt ?? "2026-08-02T00:00:00.000Z",
    kind: overrides.kind ?? "task.progress",
    summary: overrides.summary ?? "Task update",
    tone: overrides.tone ?? "info",
    payload: overrides.payload ?? {},
    turnId: overrides.turnId ? TurnId.make(overrides.turnId) : null,
    ...(overrides.sequence !== undefined ? { sequence: overrides.sequence } : {}),
  };
}

describe("isCoordinationTaskActivity", () => {
  it("only recognizes the native task lifecycle", () => {
    expect(
      isCoordinationTaskActivity(
        makeActivity({ kind: "tool.completed", payload: { taskId: "not-a-task" } }),
      ),
    ).toBe(false);
    expect(isCoordinationTaskActivity(makeActivity({ kind: "task.started" }))).toBe(true);
    expect(isCoordinationTaskActivity(makeActivity({ kind: "task.progress" }))).toBe(true);
    expect(isCoordinationTaskActivity(makeActivity({ kind: "task.completed" }))).toBe(true);
  });
});

describe("deriveCoordinationWorkstreams", () => {
  it("reconstructs metadata from out-of-order events and ignores duplicate replay", () => {
    const activities: OrchestrationThreadActivity[] = [
      makeActivity({
        id: "complete",
        sequence: 3,
        createdAt: "2026-08-02T00:00:03.000Z",
        kind: "task.completed",
        turnId: "turn-1",
        payload: {
          taskId: "packaging",
          status: "completed",
          summary: "Package checks passed",
          actor: { id: "worker-1", model: "sol", reasoning: "high" },
          evidence: [{ kind: "test", label: "Packaging tests", status: "passed" }],
        },
      }),
      makeActivity({
        id: "start",
        sequence: 1,
        createdAt: "2026-08-02T00:00:01.000Z",
        kind: "task.started",
        turnId: "turn-1",
        payload: {
          taskId: "packaging",
          description: "Verify release packaging",
          parentTaskId: "release",
          actor: { id: "worker-1", label: "Packaging worker" },
          ownership: { files: ["release.ts"], areas: ["desktop packaging"] },
        },
      }),
      makeActivity({
        id: "progress",
        sequence: 2,
        createdAt: "2026-08-02T00:00:02.000Z",
        kind: "task.progress",
        turnId: "turn-1",
        payload: {
          taskId: "packaging",
          description: "Running package checks",
          summary: "Building the installer",
          lastToolName: "pnpm package",
          actor: { id: "worker-1", model: "sol" },
          ownership: { files: ["release.ts", "installer.ts"] },
        },
      }),
      makeActivity({
        id: "complete",
        sequence: 3,
        createdAt: "2026-08-02T00:00:03.000Z",
        kind: "task.completed",
        turnId: "turn-1",
        payload: {
          taskId: "packaging",
          status: "completed",
          summary: "Package checks passed",
        },
      }),
    ];

    expect(deriveCoordinationWorkstreams(activities)).toEqual([
      {
        id: "turn-1:packaging",
        taskId: "packaging",
        turnId: "turn-1",
        parentTaskId: "release",
        parentId: "turn-1:release",
        title: "Verify release packaging",
        status: "completed",
        startedAt: "2026-08-02T00:00:01.000Z",
        updatedAt: "2026-08-02T00:00:03.000Z",
        completedAt: "2026-08-02T00:00:03.000Z",
        summary: "Package checks passed",
        lastToolName: "pnpm package",
        actor: {
          id: "worker-1",
          label: "Packaging worker",
          model: "sol",
          reasoning: "high",
        },
        ownership: {
          files: ["release.ts", "installer.ts"],
          areas: ["desktop packaging"],
        },
        evidence: [{ kind: "test", label: "Packaging tests", status: "passed" }],
      },
    ]);
  });

  it("scopes reused task ids by turn and keeps terminal status after delayed progress", () => {
    const activities: OrchestrationThreadActivity[] = [
      makeActivity({
        id: "first-complete",
        kind: "task.completed",
        turnId: "turn-1",
        sequence: 2,
        payload: { taskId: "same-id", status: "failed", summary: "Tests failed" },
      }),
      makeActivity({
        id: "first-start",
        kind: "task.started",
        turnId: "turn-1",
        sequence: 1,
        payload: { taskId: "same-id", description: "First run" },
      }),
      makeActivity({
        id: "late-progress",
        kind: "task.progress",
        turnId: "turn-1",
        sequence: 3,
        payload: { taskId: "same-id", summary: "A late update" },
      }),
      makeActivity({
        id: "second-start",
        kind: "task.started",
        turnId: "turn-2",
        payload: { taskId: "same-id", description: "Second run" },
      }),
    ];

    const workstreams = deriveCoordinationWorkstreams(activities);
    expect(workstreams.map(({ id, title, status }) => ({ id, title, status }))).toEqual([
      { id: "turn-1:same-id", title: "First run", status: "failed" },
      { id: "turn-2:same-id", title: "Second run", status: "running" },
    ]);
    expect(workstreams[0]?.failure).toBe("Tests failed");
    expect(workstreams[0]?.summary).toBe("A late update");
  });

  it("fails open for malformed task payloads", () => {
    expect(
      deriveCoordinationWorkstreams([
        makeActivity({ kind: "task.started", payload: null as unknown as Record<string, unknown> }),
        makeActivity({ kind: "task.progress", payload: { description: "No id" } }),
      ]),
    ).toEqual([]);
  });
});
