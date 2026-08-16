import {
  CheckpointRef,
  EventId,
  MessageId,
  ThreadId,
  TurnId,
  type OrchestrationThreadActivity,
} from "@croki/contracts";
import { describe, expect, it } from "vite-plus/test";

import { deriveCurrentReality, shouldShowCurrentReality } from "./current-reality.ts";
import type { CurrentRealityThread } from "./threadEvidence.ts";

const threadId = ThreadId.make("thread-reality");
const turnId = TurnId.make("turn-reality");

function activity(input: {
  id: string;
  kind: string;
  summary: string;
  createdAt: string;
  payload: Record<string, unknown>;
  tone?: OrchestrationThreadActivity["tone"];
}): OrchestrationThreadActivity {
  return {
    id: EventId.make(input.id),
    kind: input.kind,
    summary: input.summary,
    createdAt: input.createdAt,
    payload: input.payload,
    tone: input.tone ?? "tool",
    turnId,
  };
}

function makeThread(overrides: Partial<CurrentRealityThread> = {}): CurrentRealityThread {
  return {
    id: threadId,
    title: "Ship the source-grounded entry view",
    branch: "feature/reality",
    worktreePath: "/workspace/croki",
    latestTurn: {
      turnId,
      state: "running",
      requestedAt: "2026-08-16T12:00:00.000Z",
      startedAt: "2026-08-16T12:00:01.000Z",
      completedAt: null,
      assistantMessageId: null,
    },
    createdAt: "2026-08-16T11:00:00.000Z",
    updatedAt: "2026-08-16T12:05:00.000Z",
    messages: [
      {
        id: MessageId.make("message-direction"),
        role: "user",
        text: "Keep missing evidence visible and link every fact to a source.",
        turnId,
        streaming: false,
        createdAt: "2026-08-16T12:00:00.000Z",
        updatedAt: "2026-08-16T12:00:00.000Z",
      },
    ],
    proposedPlans: [],
    activities: [
      activity({
        id: "activity-check",
        kind: "command.completed",
        summary: "Ran typecheck",
        createdAt: "2026-08-16T12:04:00.000Z",
        payload: { command: "vp run typecheck", exitCode: 0 },
      }),
      activity({
        id: "activity-approval",
        kind: "approval.requested",
        summary: "Command approval requested",
        createdAt: "2026-08-16T12:04:30.000Z",
        payload: { requestId: "request-1", requestKind: "command", detail: "git push" },
        tone: "approval",
      }),
      activity({
        id: "activity-plan",
        kind: "turn.plan.updated",
        summary: "Plan updated",
        createdAt: "2026-08-16T12:03:00.000Z",
        payload: {
          plan: [
            { step: "Add source contracts", status: "completed" },
            { step: "Render the entry view", status: "inProgress" },
          ],
        },
      }),
    ],
    checkpoints: [
      {
        turnId,
        checkpointTurnCount: 1,
        checkpointRef: CheckpointRef.make("checkpoint-reality"),
        status: "ready",
        files: [
          {
            path: "apps/web/src/components/CurrentReality.tsx",
            kind: "modified",
            additions: 10,
            deletions: 1,
          },
          { path: "apps/server/src/runtime.ts", kind: "modified", additions: 4, deletions: 0 },
        ],
        assistantMessageId: null,
        completedAt: "2026-08-16T12:04:45.000Z",
      },
    ],
    session: {
      threadId,
      status: "running",
      providerName: "Codex",
      activeTurnId: turnId,
      lastError: null,
      updatedAt: "2026-08-16T12:05:00.000Z",
      runtimeMode: "full-access",
    },
    ...overrides,
  };
}

describe("Current Reality derivation", () => {
  it("keeps deterministic facts source-labelled and explicit about missing visual evidence", () => {
    const projection = deriveCurrentReality({
      thread: makeThread(),
      lastVisitedAt: "2026-08-16T12:01:00.000Z",
      workers: [
        {
          threadId: ThreadId.make("worker-reality"),
          title: "Check the responsive route",
          state: "working",
          attempt: 2,
          updatedAt: "2026-08-16T12:04:30.000Z",
        },
      ],
    });

    expect(projection.showOnEntry).toBe(true);
    expect(projection.sections.outcome[0]).toMatchObject({
      value: "Ship the source-grounded entry view",
      source: { kind: "thread", target: { surface: "thread", threadId } },
    });
    expect(projection.sections.direction[0]?.value).toContain("missing evidence visible");
    expect(projection.sections.judgment[0]).toMatchObject({
      label: "Approval needed",
      state: "pending",
      source: {
        kind: "activity",
        target: { surface: "thread", activityId: EventId.make("activity-approval") },
      },
    });
    expect(projection.sections.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: "vp run typecheck", detail: "exit 0" }),
        expect.objectContaining({ value: "Not checked", state: "missing" }),
      ]),
    );
    expect(projection.sections.work[0]).toMatchObject({
      label: "Worker Thread · Attempt 2",
      source: {
        kind: "worker-thread",
        target: { surface: "thread", workerThreadId: ThreadId.make("worker-reality") },
      },
    });

    for (const entry of projection.facts) {
      expect(entry.source.id.length).toBeGreaterThan(0);
      expect(entry.source.target.threadId).toBe(threadId);
      expect(entry.source.target.surface).toBeTruthy();
    }
  });

  it("does not show the entry projection when no source changed since the visit", () => {
    const thread = makeThread({ updatedAt: "2026-08-16T12:05:00.000Z" });
    expect(
      shouldShowCurrentReality({
        thread,
        lastVisitedAt: "2026-08-16T12:05:00.000Z",
      }),
    ).toBe(false);
  });

  it("distinguishes missing visual capture from an unavailable UI checkpoint", () => {
    const projection = deriveCurrentReality({
      thread: makeThread({
        checkpoints: [
          {
            ...makeThread().checkpoints[0]!,
            status: "error",
            files: [
              {
                path: "apps/web/src/components/CurrentReality.tsx",
                kind: "modified",
                additions: 1,
                deletions: 0,
              },
            ],
          },
        ],
      }),
    });

    expect(projection.sections.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Visual evidence",
          value: "Not available",
          state: "failed",
        }),
      ]),
    );
  });
});
