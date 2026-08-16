import { CheckpointRef, EventId, MessageId, ThreadId, TurnId } from "@croki/contracts";
import { describe, expect, it } from "vite-plus/test";

import { deriveTurnResult } from "./turn-result.ts";
import type { CurrentRealityThread } from "./threadEvidence.ts";

const turnId = TurnId.make("turn-result");
const threadId = ThreadId.make("thread-result");

function settledThread(overrides: Partial<CurrentRealityThread> = {}): CurrentRealityThread {
  return {
    id: threadId,
    title: "Finish the factual receipt",
    branch: "feature/receipt",
    worktreePath: "/workspace/receipt",
    latestTurn: {
      turnId,
      state: "completed",
      requestedAt: "2026-08-16T13:00:00.000Z",
      startedAt: "2026-08-16T13:00:01.000Z",
      completedAt: "2026-08-16T13:04:00.000Z",
      assistantMessageId: MessageId.make("assistant-result"),
    },
    createdAt: "2026-08-16T12:00:00.000Z",
    updatedAt: "2026-08-16T13:04:00.000Z",
    messages: [
      {
        id: MessageId.make("user-result"),
        role: "user",
        text: "Finish the receipt.",
        turnId,
        streaming: false,
        createdAt: "2026-08-16T13:00:00.000Z",
        updatedAt: "2026-08-16T13:00:00.000Z",
      },
      {
        id: MessageId.make("assistant-result"),
        role: "assistant",
        text: "I captured the changed files and the command receipt.",
        turnId,
        streaming: false,
        createdAt: "2026-08-16T13:03:59.000Z",
        updatedAt: "2026-08-16T13:04:00.000Z",
      },
    ],
    proposedPlans: [],
    activities: [
      {
        id: EventId.make("activity-result-check"),
        kind: "command.completed",
        summary: "Ran tests",
        tone: "tool",
        payload: { command: "vp test run", exitCode: 0 },
        turnId,
        createdAt: "2026-08-16T13:03:00.000Z",
      },
    ],
    checkpoints: [
      {
        turnId,
        checkpointTurnCount: 2,
        checkpointRef: CheckpointRef.make("checkpoint-result"),
        status: "ready",
        files: [
          {
            path: "apps/web/src/components/TurnResult.tsx",
            kind: "modified",
            additions: 24,
            deletions: 2,
          },
        ],
        assistantMessageId: MessageId.make("assistant-result"),
        completedAt: "2026-08-16T13:03:45.000Z",
      },
    ],
    session: null,
    ...overrides,
  };
}

describe("Turn Result derivation", () => {
  it("returns one factual result with provider attribution and missing visual evidence", () => {
    const result = deriveTurnResult({ thread: settledThread() });
    expect(result).not.toBeNull();
    expect(result?.id).toBe(`turn-result:${threadId}:${turnId}`);
    expect(result?.status).toBe("completed");
    expect(result?.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "changed-files", value: "1 changed file" }),
        expect.objectContaining({ kind: "check", value: "vp test run", detail: "exit 0" }),
        expect.objectContaining({
          kind: "visual-evidence",
          value: "Not checked",
          state: "missing",
        }),
        expect.objectContaining({
          kind: "provider-conclusion",
          value: "I captured the changed files and the command receipt.",
          attributedTo: "provider",
        }),
        expect.objectContaining({ kind: "git", label: "Branch", value: "feature/receipt" }),
      ]),
    );
    for (const entry of result?.facts ?? []) {
      expect(entry.source.target.threadId).toBe(threadId);
      expect(entry.source.target.surface).toBeTruthy();
    }
    expect(result?.facts.some((fact) => /correct|verified|pass judgment/i.test(fact.value))).toBe(
      false,
    );
  });

  it("keeps an absent checkpoint explicit in the settled result", () => {
    const result = deriveTurnResult({
      thread: settledThread({ checkpoints: [] }),
    });
    expect(result?.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "changed-files",
          label: "Checkpoint",
          value: "Not captured",
          state: "missing",
        }),
      ]),
    );
  });

  it("does not produce a receipt for an unsettled turn", () => {
    expect(
      deriveTurnResult({
        thread: settledThread({
          latestTurn: {
            ...settledThread().latestTurn!,
            state: "running",
            completedAt: null,
          },
        }),
      }),
    ).toBeNull();
  });

  it("keeps interruption distinct from failure", () => {
    const result = deriveTurnResult({
      thread: settledThread({
        latestTurn: {
          ...settledThread().latestTurn!,
          state: "interrupted",
        },
      }),
    });
    expect(result?.status).toBe("interrupted");
    expect(result?.facts.some((fact) => fact.kind === "failure")).toBe(false);
  });
});
