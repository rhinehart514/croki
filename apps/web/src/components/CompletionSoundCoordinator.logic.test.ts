import { describe, expect, it } from "@effect/vitest";
import { TurnId } from "@t3tools/contracts";

import {
  completionSoundSnapshot,
  type CompletionSoundSnapshot,
  shouldPlayCompletionSound,
} from "./CompletionSoundCoordinator.logic";

const RUNNING: CompletionSoundSnapshot = {
  turnId: TurnId.make("turn-1"),
  state: "running",
  settled: false,
};
const COMPLETED: CompletionSoundSnapshot = {
  turnId: TurnId.make("turn-1"),
  state: "completed",
  settled: true,
};

describe("completion sound", () => {
  it("plays once when a running turn completes", () => {
    expect(shouldPlayCompletionSound(RUNNING, COMPLETED)).toBe(true);
    expect(shouldPlayCompletionSound(COMPLETED, COMPLETED)).toBe(false);
  });

  it("does not play for initial state, interruptions, or errors", () => {
    expect(shouldPlayCompletionSound(undefined, COMPLETED)).toBe(false);
    expect(shouldPlayCompletionSound(RUNNING, { ...COMPLETED, state: "interrupted" })).toBe(false);
    expect(shouldPlayCompletionSound(RUNNING, { ...COMPLETED, state: "error" })).toBe(false);
  });

  it("plays when a new turn arrives already completed", () => {
    expect(
      shouldPlayCompletionSound(COMPLETED, {
        ...COMPLETED,
        turnId: TurnId.make("turn-2"),
      }),
    ).toBe(true);
  });

  it("waits until the completed turn leaves the running session", () => {
    const latestTurn = {
      turnId: TurnId.make("turn-1"),
      state: "completed" as const,
      startedAt: "2026-08-01T12:00:00.000Z",
      completedAt: "2026-08-01T12:00:01.000Z",
    };

    expect(completionSoundSnapshot({ latestTurn, session: { status: "running" } }).settled).toBe(
      false,
    );
    expect(completionSoundSnapshot({ latestTurn, session: { status: "ready" } }).settled).toBe(
      true,
    );
  });
});
