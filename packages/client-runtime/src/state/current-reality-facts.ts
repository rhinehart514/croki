import type { OrchestrationThreadActivity, TurnId } from "@croki/contracts";

import {
  type CurrentRealityFact,
  type CurrentRealityInput,
  type ThreadEvidenceFactState,
} from "./threadEvidence.ts";
import {
  activityPayload,
  asRecord,
  asText,
  checkedScreenActivities,
  checkState,
  commandFromActivity,
  compareActivity,
  exitStateFromActivity,
  fact,
  isCheckActivity,
  isStaleRequest,
  latestCheckpoint,
  likelyVisibleFile,
  source,
  target,
} from "./current-reality-helpers.ts";

export function deriveCheckFacts(
  threadId: CurrentRealityInput["thread"]["id"],
  activities: ReadonlyArray<OrchestrationThreadActivity>,
  turnId: TurnId | null,
): CurrentRealityFact[] {
  const checks = [...activities]
    .filter(
      (activity) => (turnId === null || activity.turnId === turnId) && isCheckActivity(activity),
    )
    .sort(compareActivity)
    .flatMap((activity) => {
      const command = commandFromActivity(activity);
      if (command === null && !/(?:check|test|lint|typecheck|build)/i.test(activity.kind))
        return [];
      const exit = exitStateFromActivity(activity);
      const label = command ?? activity.summary;
      const detail = exit.label ?? "Exit state not captured";
      return [
        fact({
          id: `reality:check:${activity.id}`,
          section: "checks",
          label: "Observed check",
          value: label,
          detail,
          state: checkState(activity, exit.code),
          source: source({
            id: activity.id,
            kind: "activity",
            label: "terminal activity",
            observedAt: activity.createdAt,
            target: target(threadId, "terminal", {
              activityId: activity.id,
              turnId: activity.turnId ?? undefined,
            }),
          }),
        }),
      ];
    });
  if (checks.length > 0 || (turnId === null && activities.length === 0)) return checks;
  return [
    fact({
      id: `reality:checks-missing:${turnId}`,
      section: "checks",
      label: "Observed checks",
      value: "Not captured",
      detail: "No command or check receipt was captured for this turn.",
      state: "missing",
      source: source({
        id: `${turnId}:checks`,
        kind: "derived",
        label: "turn evidence",
        observedAt: null,
        target: target(threadId, "terminal", { turnId }),
      }),
    }),
  ];
}

export function derivePlanFact(
  threadId: CurrentRealityInput["thread"]["id"],
  activities: ReadonlyArray<OrchestrationThreadActivity>,
  turnId: TurnId | null,
): CurrentRealityFact | null {
  const planActivity = [...activities]
    .filter(
      (activity) =>
        activity.kind === "turn.plan.updated" && (turnId === null || activity.turnId === turnId),
    )
    .sort(compareActivity)
    .at(-1);
  if (!planActivity) return null;
  const payload = activityPayload(planActivity);
  const rawPlan = payload?.plan;
  if (!Array.isArray(rawPlan)) return null;
  const steps = rawPlan.flatMap((entry) => {
    const record = asRecord(entry);
    const step = asText(record?.step);
    if (step === null) return [];
    const status =
      record?.status === "inProgress" || record?.status === "completed" ? record.status : "pending";
    return [{ step, status }];
  });
  const current =
    steps.find((entry) => entry.status === "inProgress") ??
    steps.find((entry) => entry.status === "pending");
  if (!current) return null;
  const index = steps.indexOf(current) + 1;
  return fact({
    id: `reality:plan:${planActivity.id}`,
    section: "lane",
    label: "Current plan step",
    value: current.step,
    detail: `Step ${index} of ${steps.length}`,
    state: current.status === "inProgress" ? "active" : "observed",
    source: source({
      id: planActivity.id,
      kind: "plan",
      label: "provider plan activity",
      observedAt: planActivity.createdAt,
      target: target(threadId, "thread", {
        activityId: planActivity.id,
        turnId: planActivity.turnId ?? undefined,
      }),
    }),
  });
}

export function deriveJudgmentFacts(
  threadId: CurrentRealityInput["thread"]["id"],
  activities: ReadonlyArray<OrchestrationThreadActivity>,
): CurrentRealityFact[] {
  const open = new Map<string, OrchestrationThreadActivity>();
  for (const activity of [...activities].sort(compareActivity)) {
    const requestId = asText(activityPayload(activity)?.requestId);
    if (requestId === null) continue;
    if (activity.kind === "approval.requested" || activity.kind === "user-input.requested") {
      open.set(requestId, activity);
    } else if (
      activity.kind === "approval.resolved" ||
      activity.kind === "user-input.resolved" ||
      ((activity.kind.endsWith(".failed") || activity.tone === "error") && isStaleRequest(activity))
    ) {
      open.delete(requestId);
    }
  }

  return [...open.entries()].map(([requestId, activity]) => {
    const input = activity.kind === "user-input.requested";
    return fact({
      id: `reality:judgment:${requestId}`,
      section: "judgment",
      label: input ? "Input needed" : "Approval needed",
      value: activity.summary,
      state: "pending",
      source: source({
        id: activity.id,
        kind: "activity",
        label: input ? "provider question" : "approval request",
        observedAt: activity.createdAt,
        target: target(threadId, "thread", {
          activityId: activity.id,
          turnId: activity.turnId ?? undefined,
        }),
      }),
    });
  });
}

export function deriveFailureFacts(input: CurrentRealityInput): CurrentRealityFact[] {
  const { thread } = input;
  const turn = thread.latestTurn;
  if (turn?.state === "error") {
    return [
      fact({
        id: `reality:failure:${turn.turnId}`,
        section: "judgment",
        label: "Failure",
        value: "The provider turn reported an error",
        ...(thread.session?.lastError ? { detail: thread.session.lastError } : {}),
        state: "failed",
        source: source({
          id: turn.turnId,
          kind: "turn",
          label: "failed provider turn",
          observedAt: turn.completedAt ?? turn.startedAt ?? turn.requestedAt,
          target: target(thread.id, "thread", { turnId: turn.turnId }),
        }),
      }),
    ];
  }
  if (thread.session?.status === "error") {
    return [
      fact({
        id: `reality:failure:session:${thread.session.updatedAt}`,
        section: "judgment",
        label: "Failure",
        value: "The provider session reported an error",
        ...(thread.session.lastError ? { detail: thread.session.lastError } : {}),
        state: "failed",
        source: source({
          id: `${thread.id}:session:${thread.session.updatedAt}`,
          kind: "session",
          label: "provider session",
          observedAt: thread.session.updatedAt,
          target: target(thread.id, "thread", {
            turnId: thread.session.activeTurnId ?? undefined,
          }),
        }),
      }),
    ];
  }
  return [];
}

export function deriveRepositoryFacts(input: CurrentRealityInput): CurrentRealityFact[] {
  const { thread } = input;
  const result: CurrentRealityFact[] = [];
  if (thread.branch !== null) {
    result.push(
      fact({
        id: "reality:branch",
        section: "repository",
        label: "Branch",
        value: thread.branch,
        source: source({
          id: `${thread.id}:branch`,
          kind: "thread",
          label: "Thread checkout",
          observedAt: thread.updatedAt,
          target: target(thread.id, "diff"),
        }),
      }),
    );
  }
  if (thread.worktreePath !== null) {
    result.push(
      fact({
        id: "reality:worktree",
        section: "repository",
        label: "Worktree",
        value: thread.worktreePath,
        source: source({
          id: `${thread.id}:worktree`,
          kind: "thread",
          label: "Thread worktree",
          observedAt: thread.updatedAt,
          target: target(thread.id, "files"),
        }),
      }),
    );
  }

  const latestTurnId = thread.latestTurn?.turnId ?? null;
  const checkpoint = latestCheckpoint(thread.checkpoints, latestTurnId);
  if (checkpoint) {
    const state: ThreadEvidenceFactState =
      checkpoint.status === "ready"
        ? "observed"
        : checkpoint.status === "error"
          ? "failed"
          : "missing";
    const fileCount = checkpoint.files.length;
    result.push(
      fact({
        id: `reality:checkpoint:${checkpoint.turnId}`,
        section: "repository",
        label: "Latest checkpoint",
        value:
          checkpoint.status === "ready"
            ? `${fileCount} changed file${fileCount === 1 ? "" : "s"}`
            : `Checkpoint ${checkpoint.status}`,
        state,
        source: source({
          id: checkpoint.checkpointRef,
          kind: "checkpoint",
          label: "checkpoint",
          observedAt: checkpoint.completedAt,
          target: target(thread.id, "diff", {
            turnId: checkpoint.turnId,
            checkpointRef: checkpoint.checkpointRef,
          }),
        }),
      }),
    );
    if (checkpoint.status === "ready" && checkpoint.files.length > 0) {
      result.push(
        fact({
          id: `reality:files:${checkpoint.turnId}`,
          section: "repository",
          label: "Changed files",
          value: `${checkpoint.files.length} file${checkpoint.files.length === 1 ? "" : "s"}`,
          detail: checkpoint.files.map((file) => file.path).join(", "),
          source: source({
            id: `${checkpoint.checkpointRef}:files`,
            kind: "file",
            label: "checkpoint file list",
            observedAt: checkpoint.completedAt,
            target: target(thread.id, "diff", {
              turnId: checkpoint.turnId,
              checkpointRef: checkpoint.checkpointRef,
            }),
          }),
        }),
      );
    }
  } else if (thread.latestTurn) {
    result.push(
      fact({
        id: `reality:checkpoint-missing:${thread.latestTurn.turnId}`,
        section: "repository",
        label: "Checkpoint",
        value: "Not captured",
        state: "missing",
        source: source({
          id: thread.latestTurn.turnId,
          kind: "checkpoint",
          label: "latest turn checkpoint",
          observedAt: thread.latestTurn.completedAt,
          target: target(thread.id, "diff", { turnId: thread.latestTurn.turnId }),
        }),
      }),
    );
  }
  return result;
}

export function deriveVisualFacts(input: CurrentRealityInput): CurrentRealityFact[] {
  const turnId = input.thread.latestTurn?.turnId ?? null;
  const screens = checkedScreenActivities(input.thread.activities, turnId);
  if (screens.length > 0) {
    const first = screens[0]!;
    const supportingSources = screens.slice(1).map(({ activity, screenId, title }) =>
      source({
        id: activity.id,
        kind: "ui-history",
        label: title,
        observedAt: activity.createdAt,
        target: target(input.thread.id, "preview", {
          activityId: activity.id,
          turnId: activity.turnId ?? undefined,
          screenId,
        }),
      }),
    );
    return [
      fact({
        id: `reality:ui:${turnId ?? "latest"}`,
        section: "checks",
        label: "Checked screens",
        value: `${screens.length} screen${screens.length === 1 ? "" : "s"}`,
        detail: screens.map((entry) => entry.title).join(", "),
        source: source({
          id: first.activity.id,
          kind: "ui-history",
          label: first.title,
          observedAt: first.activity.createdAt,
          target: target(input.thread.id, "preview", {
            activityId: first.activity.id,
            turnId: first.activity.turnId ?? undefined,
            screenId: first.screenId,
          }),
        }),
        ...(supportingSources.length > 0 ? { supportingSources } : {}),
      }),
    ];
  }
  const checkpoint = latestCheckpoint(input.thread.checkpoints, turnId);
  const visibleFiles = checkpoint?.files.filter((file) => likelyVisibleFile(file.path)) ?? [];
  if (visibleFiles.length === 0) return [];
  const openTarget = checkpoint
    ? target(input.thread.id, "diff", {
        turnId: checkpoint.turnId,
        checkpointRef: checkpoint.checkpointRef,
      })
    : target(input.thread.id, "thread");
  if (checkpoint && checkpoint.status !== "ready") {
    return [
      fact({
        id: `reality:ui-unavailable:${turnId ?? "latest"}`,
        section: "checks",
        label: "Visual evidence",
        value: "Not available",
        detail: `Checkpoint ${checkpoint.status}; no screen evidence was captured.`,
        state: checkpoint.status === "error" ? "failed" : "missing",
        source: source({
          id: checkpoint.checkpointRef,
          kind: "checkpoint",
          label: "UI checkpoint",
          observedAt: checkpoint.completedAt,
          target: target(input.thread.id, "diff", {
            turnId: checkpoint.turnId,
            checkpointRef: checkpoint.checkpointRef,
          }),
        }),
      }),
    ];
  }
  return [
    fact({
      id: `reality:ui-missing:${turnId ?? "latest"}`,
      section: "checks",
      label: "Visual evidence",
      value: "Not checked",
      detail: visibleFiles.map((file) => file.path).join(", "),
      state: "missing",
      source: source({
        id: checkpoint?.checkpointRef ?? `${input.thread.id}:visual-evidence`,
        kind: checkpoint ? "checkpoint" : "derived",
        label: checkpoint ? "changed UI files" : "visual evidence basis",
        observedAt: checkpoint?.completedAt ?? input.thread.updatedAt,
        target: openTarget,
      }),
    }),
  ];
}
