import type { OrchestrationLatestTurnState, OrchestrationSession, TurnId } from "@croki/contracts";

export interface CompletionSoundSnapshot {
  readonly turnId: TurnId | null;
  readonly state: OrchestrationLatestTurnState | null;
  readonly settled: boolean;
}

export function completionSoundSnapshot(input: {
  readonly latestTurn: {
    readonly turnId: TurnId;
    readonly state: OrchestrationLatestTurnState;
    readonly startedAt: string | null;
    readonly completedAt: string | null;
  } | null;
  readonly session: Pick<OrchestrationSession, "status"> | null;
}): CompletionSoundSnapshot {
  const { latestTurn, session } = input;
  return {
    turnId: latestTurn?.turnId ?? null,
    state: latestTurn?.state ?? null,
    settled: Boolean(
      latestTurn?.startedAt &&
      latestTurn.completedAt &&
      latestTurn.state === "completed" &&
      session?.status !== "running",
    ),
  };
}

export function shouldPlayCompletionSound(
  previous: CompletionSoundSnapshot | undefined,
  current: CompletionSoundSnapshot,
): boolean {
  if (!previous || current.state !== "completed" || !current.settled) return false;

  return previous.turnId !== current.turnId || previous.state !== "completed" || !previous.settled;
}
