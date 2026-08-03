import type { OrchestrationThreadActivity } from "@croki/contracts";

/**
 * The small, provider-neutral state that the Thread needs to render native
 * delegated work. Provider payloads are decoded at the adapter boundary, but
 * this projection deliberately remains tolerant of older persisted activity
 * rows that do not contain the optional coordination metadata.
 */
export type CoordinationWorkstreamStatus =
  | "running"
  | "waiting"
  | "completed"
  | "failed"
  | "stopped"
  | "unknown";

export interface CoordinationWorkstreamActor {
  readonly id: string;
  readonly label?: string;
  readonly model?: string;
  readonly reasoning?: string;
}

export interface CoordinationWorkstreamOwnership {
  readonly files: ReadonlyArray<string>;
  readonly areas: ReadonlyArray<string>;
}

export interface CoordinationWorkstreamEvidence {
  readonly kind: "command" | "test" | "build" | "review" | "artifact";
  readonly label: string;
  readonly status: "passed" | "failed" | "unknown";
  readonly referenceId?: string;
}

export interface CoordinationWorkstream {
  /** Stable key scoped to the turn so a reused native task id cannot merge runs. */
  readonly id: string;
  /** The opaque task id reported by the provider. */
  readonly taskId: string;
  readonly turnId: string | null;
  readonly parentTaskId?: string;
  readonly parentId?: string;
  readonly title: string;
  readonly taskType?: string;
  readonly status: CoordinationWorkstreamStatus;
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly completedAt?: string;
  readonly summary?: string;
  readonly lastToolName?: string;
  readonly actor?: CoordinationWorkstreamActor;
  readonly ownership: CoordinationWorkstreamOwnership;
  readonly evidence: ReadonlyArray<CoordinationWorkstreamEvidence>;
  readonly failure?: string;
}

type ActivityKind = "task.started" | "task.progress" | "task.completed";
type RecordValue = Record<string, unknown>;

const TASK_ACTIVITY_KINDS: ReadonlySet<string> = new Set([
  "task.started",
  "task.progress",
  "task.completed",
]);

const COLLAB_ITEM_TYPE = "collab_agent_tool_call";

const TERMINAL_STATUSES: ReadonlySet<CoordinationWorkstreamStatus> = new Set([
  "completed",
  "failed",
  "stopped",
]);

const STATUS_VALUES: ReadonlySet<CoordinationWorkstreamStatus> = new Set([
  "running",
  "waiting",
  "completed",
  "failed",
  "stopped",
  "unknown",
]);

const EVIDENCE_KINDS: ReadonlySet<CoordinationWorkstreamEvidence["kind"]> = new Set([
  "command",
  "test",
  "build",
  "review",
  "artifact",
]);

const EVIDENCE_STATUSES: ReadonlySet<CoordinationWorkstreamEvidence["status"]> = new Set([
  "passed",
  "failed",
  "unknown",
]);

function asRecord(value: unknown): RecordValue | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as RecordValue;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function asArray(value: unknown): ReadonlyArray<unknown> {
  return Array.isArray(value) ? value : [];
}

function parseTaskId(payload: RecordValue): string | undefined {
  return asString(payload.taskId) ?? asString(payload.task_id);
}

function parseStatus(value: unknown): CoordinationWorkstreamStatus | undefined {
  const status = asString(value)?.toLowerCase();
  if (!status) return undefined;
  if (status === "inprogress" || status === "in_progress" || status === "active") {
    return "running";
  }
  if (status === "cancelled" || status === "canceled") {
    return "stopped";
  }
  if (STATUS_VALUES.has(status as CoordinationWorkstreamStatus)) {
    return status as CoordinationWorkstreamStatus;
  }
  return undefined;
}

function parseActor(value: unknown): CoordinationWorkstreamActor | undefined {
  const actor = asRecord(value);
  const id = asString(actor?.id) ?? asString(actor?.actorId) ?? asString(actor?.workerId);
  if (!id) return undefined;
  const label = asString(actor?.label);
  const model = asString(actor?.model);
  const reasoning = asString(actor?.reasoning);
  return {
    id,
    ...(label ? { label } : {}),
    ...(model ? { model } : {}),
    ...(reasoning ? { reasoning } : {}),
  };
}

function parsePayloadActor(payload: RecordValue): CoordinationWorkstreamActor | undefined {
  const nested = parseActor(payload.actor ?? payload.worker);
  if (nested) return nested;
  const id = asString(payload.actorId) ?? asString(payload.workerId);
  if (!id) return undefined;
  const label = asString(payload.actorLabel);
  const model = asString(payload.model);
  const reasoning = asString(payload.reasoning);
  return parseActor({
    id,
    ...(label ? { label } : {}),
    ...(model ? { model } : {}),
    ...(reasoning ? { reasoning } : {}),
  });
}

function parseOwnership(payload: RecordValue): CoordinationWorkstreamOwnership {
  const ownership = asRecord(payload.ownership) ?? asRecord(payload.owner);
  const files = [
    ...asArray(ownership?.files),
    ...asArray(payload.changedFiles),
    ...asArray(payload.changed_files),
    ...asArray(payload.files),
  ]
    .map(asString)
    .filter((path): path is string => path !== undefined);
  const areas = [...asArray(ownership?.areas), ...asArray(payload.areas)]
    .map(asString)
    .filter((area): area is string => area !== undefined);
  return {
    files: uniqueStrings(files),
    areas: uniqueStrings(areas),
  };
}

function parseEvidence(payload: RecordValue): ReadonlyArray<CoordinationWorkstreamEvidence> {
  return asArray(payload.evidence)
    .map((value): CoordinationWorkstreamEvidence | undefined => {
      const evidence = asRecord(value);
      const kind = asString(evidence?.kind);
      const label = asString(evidence?.label);
      const status = asString(evidence?.status);
      if (
        !kind ||
        !EVIDENCE_KINDS.has(kind as CoordinationWorkstreamEvidence["kind"]) ||
        !label ||
        !status ||
        !EVIDENCE_STATUSES.has(status as CoordinationWorkstreamEvidence["status"])
      ) {
        return undefined;
      }
      const referenceId = asString(evidence?.referenceId);
      return {
        kind: kind as CoordinationWorkstreamEvidence["kind"],
        label,
        status: status as CoordinationWorkstreamEvidence["status"],
        ...(referenceId ? { referenceId } : {}),
      };
    })
    .filter((evidence): evidence is CoordinationWorkstreamEvidence => evidence !== undefined);
}

function uniqueStrings(values: ReadonlyArray<string>): string[] {
  return [...new Set(values)];
}

function uniqueEvidence(
  values: ReadonlyArray<CoordinationWorkstreamEvidence>,
): CoordinationWorkstreamEvidence[] {
  const seen = new Set<string>();
  const result: CoordinationWorkstreamEvidence[] = [];
  for (const evidence of values) {
    const key = `${evidence.kind}\u0000${evidence.label}\u0000${evidence.status}\u0000${evidence.referenceId ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(evidence);
  }
  return result;
}

function parseSummary(payload: RecordValue): string | undefined {
  return asString(payload.summary) ?? asString(payload.detail) ?? asString(payload.description);
}

function parseFailure(
  payload: RecordValue,
  activity: OrchestrationThreadActivity,
): string | undefined {
  return (
    asString(payload.error) ??
    asString(payload.errorMessage) ??
    asString(payload.failure) ??
    asString(payload.reason) ??
    (parseStatus(payload.status) === "failed" ? parseSummary(payload) : undefined) ??
    (activity.tone === "error" ? (parseSummary(payload) ?? asString(activity.summary)) : undefined)
  );
}

function timestampMs(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function compareActivities(a: OrchestrationThreadActivity, b: OrchestrationThreadActivity): number {
  const aSequence = a.sequence;
  const bSequence = b.sequence;
  if (aSequence !== undefined && bSequence !== undefined && aSequence !== bSequence) {
    return aSequence - bSequence;
  }
  const aTime = timestampMs(a.createdAt);
  const bTime = timestampMs(b.createdAt);
  if (aTime !== null && bTime !== null && aTime !== bTime) {
    return aTime - bTime;
  }
  if (aTime !== null && bTime === null) return -1;
  if (aTime === null && bTime !== null) return 1;
  return a.id.localeCompare(b.id);
}

function minTimestamp(a: string | undefined, b: string): string {
  if (!a) return b;
  const aMs = timestampMs(a);
  const bMs = timestampMs(b);
  if (aMs === null || bMs === null) return a.localeCompare(b) <= 0 ? a : b;
  return aMs <= bMs ? a : b;
}

function maxTimestamp(a: string | undefined, b: string): string {
  if (!a) return b;
  const aMs = timestampMs(a);
  const bMs = timestampMs(b);
  if (aMs === null || bMs === null) return a.localeCompare(b) >= 0 ? a : b;
  return aMs >= bMs ? a : b;
}

function eventScope(activity: OrchestrationThreadActivity): string {
  return activity.turnId === null ? "thread" : String(activity.turnId);
}

function scopedTaskId(scope: string, taskId: string): string {
  return `${scope}:${taskId}`;
}

function taskTitleFor(
  payload: RecordValue,
  activity: OrchestrationThreadActivity,
  taskId: string,
): { value: string; quality: number } {
  const explicitTitle = asString(payload.title);
  if (explicitTitle) return { value: explicitTitle, quality: 3 };
  const description = asString(payload.description);
  if (description) return { value: description, quality: 2 };
  const detail = asString(payload.detail);
  if (detail) return { value: detail, quality: 2 };
  const taskType = asString(payload.taskType);
  if (taskType) return { value: taskType, quality: 1 };
  const activitySummary = asString(activity.summary);
  if (activitySummary && !/^task\s+(?:started|completed|failed|stopped)$/i.test(activitySummary)) {
    return { value: activitySummary, quality: 1 };
  }
  return { value: `Task ${taskId}`, quality: 0 };
}

interface MutableWorkstream {
  readonly id: string;
  readonly taskId: string;
  readonly turnId: string | null;
  readonly scope: string;
  readonly firstOrder: number;
  title: string;
  titleQuality: number;
  taskType?: string;
  status: CoordinationWorkstreamStatus;
  terminalOrder: number | null;
  startedAt?: string;
  updatedAt?: string;
  completedAt?: string;
  summary?: string;
  summaryOrder: number;
  lastToolName?: string;
  actor?: CoordinationWorkstreamActor;
  ownership: CoordinationWorkstreamOwnership;
  evidence: CoordinationWorkstreamEvidence[];
  parentTaskId?: string;
  failure?: string;
}

function mergeActor(
  existing: CoordinationWorkstreamActor | undefined,
  next: CoordinationWorkstreamActor | undefined,
): CoordinationWorkstreamActor | undefined {
  if (!existing) return next;
  if (!next || existing.id !== next.id) return existing;
  return {
    id: existing.id,
    ...((existing.label ?? next.label) ? { label: existing.label ?? next.label } : {}),
    ...((existing.model ?? next.model) ? { model: existing.model ?? next.model } : {}),
    ...((existing.reasoning ?? next.reasoning)
      ? { reasoning: existing.reasoning ?? next.reasoning }
      : {}),
  };
}

/** True when an activity carries one of the canonical native task lifecycle events. */
function isNativeTaskActivity(activity: OrchestrationThreadActivity): boolean {
  return TASK_ACTIVITY_KINDS.has(activity.kind);
}

export function isCoordinationTaskActivity(activity: OrchestrationThreadActivity): boolean {
  return isNativeTaskActivity(activity) || expandCollabAgentActivities(activity).length > 0;
}

function collabAgentStatus(value: unknown): CoordinationWorkstreamStatus {
  switch (asString(value)?.toLowerCase()) {
    case "pending":
      return "waiting";
    case "running":
      return "running";
    case "completed":
      return "completed";
    case "errored":
      return "failed";
    case "shutdown":
      return "stopped";
    default:
      return "unknown";
  }
}

/**
 * Codex reports native collaborators as tool lifecycle items rather than the
 * canonical task events emitted by Claude. Project them into the same durable
 * parent-Thread workstream model so provider transport does not leak into the
 * product surface.
 */
function expandCollabAgentActivities(
  activity: OrchestrationThreadActivity,
): OrchestrationThreadActivity[] {
  if (!activity.kind.startsWith("tool.")) return [];
  const payload = asRecord(activity.payload);
  if (asString(payload?.itemType) !== COLLAB_ITEM_TYPE) return [];
  const data = asRecord(payload?.data);
  const item = asRecord(data?.item);
  if (asString(item?.type) !== "collabAgentToolCall") return [];

  const states = asRecord(item?.agentsStates) ?? {};
  const receiverIds = uniqueStrings([
    ...asArray(item?.receiverThreadIds)
      .map(asString)
      .filter((id): id is string => Boolean(id)),
    ...Object.keys(states),
  ]);
  const prompt = asString(item?.prompt);
  const model = asString(item?.model);
  const reasoning = asString(item?.reasoningEffort);

  return receiverIds.map((agentId) => {
    const state = asRecord(states[agentId]);
    const status = collabAgentStatus(state?.status);
    const terminal = TERMINAL_STATUSES.has(status);
    return {
      ...activity,
      id: `${activity.id}:${agentId}`,
      kind: terminal
        ? "task.completed"
        : activity.kind === "tool.started"
          ? "task.started"
          : "task.progress",
      summary: terminal ? "Task completed" : (prompt ?? "Parallel investigation"),
      payload: {
        taskId: agentId,
        status,
        ...(prompt ? { title: prompt, description: prompt, detail: prompt } : {}),
        actor: {
          id: agentId,
          ...(model ? { model } : {}),
          ...(reasoning ? { reasoning } : {}),
        },
      },
    } as OrchestrationThreadActivity;
  });
}

/**
 * Reconstructs workstreams from persisted orchestration activities.
 *
 * The projection is intentionally a pure function. Sorting by persisted
 * sequence/timestamp makes reload and replay deterministic; task ids are
 * scoped by turn so a provider can safely reuse an id on a later turn. A
 * terminal event is sticky, so a delayed progress event cannot resurrect a
 * completed or failed workstream.
 */
export function deriveCoordinationWorkstreams(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
): CoordinationWorkstream[] {
  const ordered = activities
    .flatMap((activity) =>
      isNativeTaskActivity(activity) ? [activity] : expandCollabAgentActivities(activity),
    )
    .toSorted(compareActivities);
  const workstreams = new Map<string, MutableWorkstream>();
  const seenEventIds = new Set<string>();

  ordered.forEach((activity, order) => {
    if (seenEventIds.has(activity.id)) return;
    seenEventIds.add(activity.id);

    const payload = asRecord(activity.payload);
    if (!payload) return;
    const taskId = parseTaskId(payload);
    if (!taskId) return;

    const scope = eventScope(activity);
    const id = scopedTaskId(scope, taskId);
    let current = workstreams.get(id);
    if (!current) {
      const title = taskTitleFor(payload, activity, taskId);
      const taskType = asString(payload.taskType);
      const actor = parsePayloadActor(payload);
      const parentTaskId = asString(payload.parentTaskId) ?? asString(payload.parent_task_id);
      const failure = parseFailure(payload, activity);
      current = {
        id,
        taskId,
        turnId: activity.turnId === null ? null : String(activity.turnId),
        scope,
        firstOrder: order,
        title: title.value,
        titleQuality: title.quality,
        ...(taskType ? { taskType } : {}),
        status: "unknown",
        terminalOrder: null,
        startedAt: activity.createdAt,
        updatedAt: activity.createdAt,
        summaryOrder: -1,
        ...(actor ? { actor } : {}),
        ownership: parseOwnership(payload),
        evidence: [...parseEvidence(payload)],
        ...(parentTaskId ? { parentTaskId } : {}),
        ...(failure ? { failure } : {}),
      };
      workstreams.set(id, current);
    }

    const kind = activity.kind as ActivityKind;
    const eventStatus = parseStatus(payload.status);
    const title = taskTitleFor(payload, activity, taskId);
    if (title.quality > current.titleQuality) {
      current.title = title.value;
      current.titleQuality = title.quality;
    }
    const taskType = asString(payload.taskType);
    if (!current.taskType && taskType) {
      current.taskType = taskType;
    }
    const parentTaskId = asString(payload.parentTaskId) ?? asString(payload.parent_task_id);
    if (!current.parentTaskId && parentTaskId) {
      current.parentTaskId = parentTaskId;
    }
    const actor = mergeActor(current.actor, parsePayloadActor(payload));
    if (actor) {
      current.actor = actor;
    }

    const ownership = parseOwnership(payload);
    current.ownership = {
      files: uniqueStrings([...current.ownership.files, ...ownership.files]),
      areas: uniqueStrings([...current.ownership.areas, ...ownership.areas]),
    };
    current.evidence = uniqueEvidence([...current.evidence, ...parseEvidence(payload)]);
    current.startedAt = minTimestamp(current.startedAt, activity.createdAt);
    current.updatedAt = maxTimestamp(current.updatedAt, activity.createdAt);

    if (kind === "task.completed") {
      const completedStatus =
        eventStatus && TERMINAL_STATUSES.has(eventStatus) ? eventStatus : "completed";
      if (current.terminalOrder === null || order >= current.terminalOrder) {
        current.status = completedStatus;
        current.terminalOrder = order;
        current.completedAt = activity.createdAt;
      }
    } else if (current.terminalOrder === null) {
      current.status = eventStatus ?? (kind === "task.progress" ? "running" : "running");
    }

    const summary = parseSummary(payload);
    if (summary && order >= current.summaryOrder) {
      current.summary = summary;
      current.summaryOrder = order;
    }
    const lastToolName = asString(payload.lastToolName) ?? asString(payload.last_tool_name);
    if (lastToolName) {
      current.lastToolName = lastToolName;
    }

    const failure = parseFailure(payload, activity);
    if (failure && (current.failure === undefined || kind === "task.completed")) {
      current.failure = failure;
    }
  });

  return [...workstreams.values()]
    .sort((a, b) => a.firstOrder - b.firstOrder || a.id.localeCompare(b.id))
    .map((workstream) => ({
      id: workstream.id,
      taskId: workstream.taskId,
      turnId: workstream.turnId,
      ...(workstream.parentTaskId ? { parentTaskId: workstream.parentTaskId } : {}),
      ...(workstream.parentTaskId
        ? { parentId: scopedTaskId(workstream.scope, workstream.parentTaskId) }
        : {}),
      title: workstream.title,
      ...(workstream.taskType ? { taskType: workstream.taskType } : {}),
      status: workstream.status,
      startedAt: workstream.startedAt ?? workstream.updatedAt ?? "",
      updatedAt: workstream.updatedAt ?? workstream.startedAt ?? "",
      ...(workstream.completedAt ? { completedAt: workstream.completedAt } : {}),
      ...(workstream.summary ? { summary: workstream.summary } : {}),
      ...(workstream.lastToolName ? { lastToolName: workstream.lastToolName } : {}),
      ...(workstream.actor ? { actor: workstream.actor } : {}),
      ownership: workstream.ownership,
      evidence: workstream.evidence,
      ...(workstream.failure ? { failure: workstream.failure } : {}),
    }));
}

/** Short alias for callers that already have the task activity boundary. */
export const deriveWorkstreams = deriveCoordinationWorkstreams;
