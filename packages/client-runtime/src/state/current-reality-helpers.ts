import type {
  OrchestrationCheckpointSummary,
  OrchestrationMessage,
  OrchestrationThreadActivity,
  TurnId,
} from "@croki/contracts";

import {
  type CurrentRealityFact,
  type CurrentRealityInput,
  type CurrentRealitySection,
  type ThreadEvidenceFactState,
  type ThreadEvidenceOpenTarget,
  type ThreadEvidenceProvenance,
} from "./threadEvidence.ts";

export type RecordLike = Record<string, unknown>;

export function asRecord(value: unknown): RecordLike | null {
  return typeof value === "object" && value !== null ? (value as RecordLike) : null;
}

export function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function source(input: {
  id: string;
  kind: ThreadEvidenceProvenance["kind"];
  label: string;
  observedAt: string | null;
  target: ThreadEvidenceOpenTarget;
}): ThreadEvidenceProvenance {
  return input;
}

export function fact(input: {
  id: string;
  section: CurrentRealitySection;
  label: string;
  value: string;
  detail?: string;
  state?: ThreadEvidenceFactState;
  source: ThreadEvidenceProvenance;
  supportingSources?: ReadonlyArray<ThreadEvidenceProvenance>;
}): CurrentRealityFact {
  const { state = "observed", ...rest } = input;
  return { ...rest, state };
}

export function target(
  threadId: CurrentRealityInput["thread"]["id"],
  surface: ThreadEvidenceOpenTarget["surface"],
  extra: Record<string, unknown> = {},
): ThreadEvidenceOpenTarget {
  return { threadId, surface, ...extra } as ThreadEvidenceOpenTarget;
}

export function compareActivity(
  left: OrchestrationThreadActivity,
  right: OrchestrationThreadActivity,
) {
  if (
    left.sequence !== undefined &&
    right.sequence !== undefined &&
    left.sequence !== right.sequence
  ) {
    return left.sequence - right.sequence;
  }
  const createdAt = left.createdAt.localeCompare(right.createdAt);
  return createdAt !== 0 ? createdAt : left.id.localeCompare(right.id);
}

export function latestByTime<
  T extends {
    readonly createdAt?: string;
    readonly updatedAt?: string;
    readonly completedAt?: string;
  },
>(values: ReadonlyArray<T>): T | null {
  return (
    [...values]
      .toSorted((left, right) => {
        const leftAt = left.updatedAt ?? left.completedAt ?? left.createdAt ?? "";
        const rightAt = right.updatedAt ?? right.completedAt ?? right.createdAt ?? "";
        return leftAt.localeCompare(rightAt);
      })
      .at(-1) ?? null
  );
}

export function latestUserMessage(
  messages: ReadonlyArray<OrchestrationMessage>,
): OrchestrationMessage | null {
  return (
    messages
      .filter((message) => message.role === "user")
      .toSorted(
        (left, right) =>
          left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
      )
      .at(-1) ?? null
  );
}

export function latestCheckpoint(
  checkpoints: ReadonlyArray<OrchestrationCheckpointSummary>,
  turnId: TurnId | null,
): OrchestrationCheckpointSummary | null {
  const candidates =
    turnId === null ? checkpoints : checkpoints.filter((entry) => entry.turnId === turnId);
  return latestByTime(candidates);
}

export function activityPayload(activity: OrchestrationThreadActivity): RecordLike | null {
  return asRecord(activity.payload);
}

export function nestedRecord(record: RecordLike | null, key: string): RecordLike | null {
  return asRecord(record?.[key]);
}

export function commandFromActivity(activity: OrchestrationThreadActivity): string | null {
  const payload = activityPayload(activity);
  const data = nestedRecord(payload, "data");
  const item = nestedRecord(data, "item");
  const input = nestedRecord(item, "input");
  const candidates = [payload?.command, payload?.cmd, data?.command, item?.command, input?.command];
  for (const candidate of candidates) {
    const text = asText(candidate);
    if (text !== null) return text;
  }
  return null;
}

export function exitStateFromActivity(activity: OrchestrationThreadActivity): {
  readonly code: number | null;
  readonly label: string | null;
} {
  const payload = activityPayload(activity);
  const data = nestedRecord(payload, "data");
  const item = nestedRecord(data, "item");
  const result = nestedRecord(item, "result");
  const codeValue =
    payload?.exitCode ??
    payload?.exit_code ??
    data?.exitCode ??
    data?.exit_code ??
    result?.exitCode;
  const code = asNumber(codeValue);
  if (code !== null) return { code, label: `exit ${code}` };

  const detail = asText(payload?.detail) ?? activity.summary;
  const match = /exited with exit code\s+(\d+)/i.exec(detail);
  if (match?.[1] !== undefined) {
    const parsed = Number.parseInt(match[1], 10);
    if (Number.isInteger(parsed)) return { code: parsed, label: `exit ${parsed}` };
  }

  const status = asText(payload?.status)?.toLowerCase();
  if (status === "completed" || status === "success" || status === "passed") {
    return { code: 0, label: status };
  }
  if (status === "failed" || status === "error") {
    return { code: 1, label: status };
  }
  return { code: null, label: null };
}

export function checkState(
  activity: OrchestrationThreadActivity,
  exitCode: number | null,
): ThreadEvidenceFactState {
  if (exitCode !== null) return exitCode === 0 ? "settled" : "failed";
  if (activity.tone === "error") return "failed";
  if (activity.kind.endsWith(".started") || activity.kind.endsWith(".progress")) return "active";
  if (activity.kind.endsWith(".completed") || activity.kind.endsWith(".updated")) return "settled";
  return "observed";
}

export function isCheckActivity(activity: OrchestrationThreadActivity): boolean {
  const text = `${activity.kind} ${activity.summary}`.toLowerCase();
  return /(?:check|test|lint|typecheck|format|build|command|terminal|execute|script)/.test(text);
}

export function isStaleRequest(activity: OrchestrationThreadActivity): boolean {
  const detail = asText(activityPayload(activity)?.detail)?.toLowerCase() ?? "";
  return detail.includes("stale pending") || detail.includes("unknown pending");
}

export function likelyVisibleFile(path: string): boolean {
  const normalized = path.replaceAll("\\", "/").toLowerCase();
  if (
    /(?:^|\/)(?:__tests__|fixtures|test|tests)(?:\/|$)|\.(?:spec|test)\.[^/]+$|\.stories\./.test(
      normalized,
    )
  ) {
    return false;
  }
  const extension = normalized.split(".").at(-1) ?? "";
  return new Set([
    "astro",
    "css",
    "html",
    "jsx",
    "scss",
    "svelte",
    "tsx",
    "vue",
    "webp",
    "png",
    "jpg",
    "jpeg",
    "svg",
    "swift",
    "dart",
  ]).has(extension);
}

export function checkedScreenActivities(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
  turnId: TurnId | null,
): ReadonlyArray<{
  readonly activity: OrchestrationThreadActivity;
  readonly screenId: string;
  readonly title: string;
}> {
  return activities.flatMap((activity) => {
    if (activity.kind !== "preview.snapshot" || (turnId !== null && activity.turnId !== turnId))
      return [];
    const payload = activityPayload(activity);
    const entry = asRecord(payload?.entry);
    const screenId = asText(entry?.id);
    if (screenId === null) return [];
    return [{ activity, screenId, title: asText(entry?.title) ?? screenId }];
  });
}
