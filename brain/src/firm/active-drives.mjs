import crypto from "node:crypto";
import { emitFirmEvent } from "./firm-events.mjs";
import { emitWorkDelta } from "./work-delta.mjs";
import { dropDriveStream, publishDriveDelta } from "./drive-stream.mjs";

// Process-local by design: a provider drive cannot survive a brain restart. Durable bets, events,
// staged artifacts, and runtime session ids still live in the venture store; this registry owns only
// the live AbortController that can stop the process currently doing work.
const active = new Map();

function publicDrive(entry) {
  return {
    id: entry.id,
    ventureId: entry.ventureId,
    teammateRef: entry.teammateRef,
    betId: entry.betId,
    runtime: entry.runtime,
    startedAt: entry.startedAt,
    abortSupported: entry.abortSupported,
    abortRequestedAt: entry.abortRequestedAt,
    architectureRevision: entry.architectureRevision,
    architectureContextStaleAt: entry.architectureContextStaleAt,
    currentStageId: entry.currentStageId,
    lastBeatAt: entry.lastBeatAt,
    activity: entry.activity,
    // The assistant's reply as it forms inside this drive — process-local presence, exactly like
    // `activity`. The thread-timeline read model surfaces it as a streaming teammate turn; a restart
    // correctly drops it, and the durable conversation message is the truth once the drive settles.
    liveText: entry.liveText ?? "",
    // The tool call the model is composing right now — name plus the partial JSON arguments streamed
    // so far — the same process-local presence contract as liveText. Null when no call is forming.
    liveTool: entry.liveTool ?? null,
    // The model's working texture, same process-local presence contract again: the tool steps this
    // drive has finished, whether a thinking span is open (SHAPE ONLY — never what was thought), and
    // the plan it is keeping. thread-timeline.mjs projects all three so a client with no delta stream
    // open still sees the texture; a restart correctly drops them.
    liveToolResults: entry.liveToolResults ?? [],
    liveThinking: entry.liveThinking ?? null,
    liveTodos: entry.liveTodos ?? [],
    // Nested provider work is temporary Run presence, not another Croki work model. The keyed map
    // stays process-local; clients receive a bounded factual array that can disappear with the drive.
    liveNestedTasks: [...(entry.liveNestedTasks?.values?.() ?? [])],
    // A process-local presence pointer: true when a founder steer arrived for this effort while the
    // drive is running. The durable queue (work-loop-steer.mjs, on the effort's work record) is the
    // truth the resume reads; this only lets a live drive/UI honestly say "a steer will apply next step."
    steerPending: entry.steerPending === true,
  };
}

export function beginActiveDrive({
  id = null,
  ventureId,
  teammateRef,
  betId = null,
  runtime,
  abortSupported,
  architectureRevision = null,
}) {
  const controller = new AbortController();
  const driveId = String(id ?? "").trim() || `drive-${crypto.randomUUID()}`;
  if (active.has(driveId)) throw new Error(`Drive ${driveId} is already active.`);
  const entry = {
    id: driveId,
    ventureId,
    teammateRef,
    betId,
    runtime,
    startedAt: new Date().toISOString(),
    abortSupported: abortSupported === true,
    abortRequestedAt: null,
    architectureRevision: Number.isInteger(architectureRevision) ? architectureRevision : null,
    architectureContextStaleAt: null,
    currentStageId: null,
    lastBeatAt: new Date().toISOString(),
    activity: "Starting work",
    liveText: "",
    liveToolResults: [],
    liveThinking: null,
    liveTodos: [],
    liveNestedTasks: new Map(),
    steerPending: false,
    // Correlates a tool-step's started/finished work deltas and measures its duration. Process-local
    // presence like every other live field; a restart drops it and the durable receipt is the truth.
    stepSeq: 0,
    liveToolStep: null,
    controller,
  };
  active.set(entry.id, entry);
  emitFirmEvent(ventureId, "drive", { betId });
  // A focused node sees the drive start as a live status transition (Reshape decision 27) alongside the
  // data-free "drive" invalidation. Best-effort — the delta never gates the drive.
  emitWorkDelta(ventureId, { betId, delta: { type: "status-changed", status: "working", previous: "idle" } });
  return {
    ...publicDrive(entry),
    signal: controller.signal,
    finish: () => {
      active.delete(entry.id);
      dropDriveStream(entry.id);
      emitFirmEvent(ventureId, "drive", { betId });
      emitWorkDelta(ventureId, { betId, delta: { type: "status-changed", status: "settled", previous: "working" } });
    },
  };
}

// A live causal pointer, not venture truth. The stage id is minted by workflow-projection's shared
// helper at the same seam that appends the event; a restart correctly drops this presence fact.
export function noteDriveBeat(driveId, { currentStageId, activity, at } = {}) {
  const entry = active.get(driveId);
  if (!entry) return null;
  const stageId = String(currentStageId ?? "").trim();
  const activityText = String(activity ?? "").trim();
  if (stageId) entry.currentStageId = stageId;
  if (activityText) entry.activity = activityText;
  entry.lastBeatAt = String(at ?? "").trim() || new Date().toISOString();
  emitFirmEvent(entry.ventureId, "drive", { betId: entry.betId });
  return publicDrive(entry);
}

// The delta itself now rides the drive's own payload-carrying stream (drive-stream.mjs), so a token never
// costs the client a whole thread-timeline refetch. This data-free ping remains ONLY for the degraded
// path — a client with no delta stream open still re-reads the timeline — which is why it runs at about a
// second rather than the 120 ms cadence that turned streaming into a refetch storm.
const FALLBACK_PING_MS = 1_000;
function pingDriveFallback(entry, at) {
  if (at - (entry.lastFallbackPingAt ?? 0) < FALLBACK_PING_MS) return;
  entry.lastFallbackPingAt = at;
  emitFirmEvent(entry.ventureId, "drive", { betId: entry.betId });
}

// Append the newest slice of the assistant's forming reply to a live drive so the founder watches it
// stream, mirroring `noteDriveBeat`'s process-local presence. The buffer is capped so a very long reply
// cannot grow without bound, and it always grows on every call so the read model sees the full reply
// (thread-timeline.mjs still reads liveText — the fallback projection depends on it). The drive's own
// `finish()` drops both the buffer and the stream when work settles, at which point the durable
// conversation message takes over. Best-effort and no-op once the drive is gone.
export function noteDriveText(driveId, text, { now = Date.now } = {}) {
  const entry = active.get(driveId);
  if (!entry) return null;
  const addition = String(text ?? "");
  if (!addition) return publicDrive(entry);
  entry.liveText = (entry.liveText + addition).slice(-8_000);
  entry.lastBeatAt = new Date().toISOString();
  publishDriveDelta(driveId, { kind: "text", text: addition });
  pingDriveFallback(entry, now());
  return publicDrive(entry);
}

// Mirror of noteDriveText for the tool call the model is composing: input_json_delta partial
// arguments stream in here as they form, out to the same delta stream, and a null name clears the
// presence when the tool block closes. Best-effort and no-op once the drive is gone.
export function noteDriveToolInput(driveId, name, partialInput, { now = Date.now } = {}) {
  const entry = active.get(driveId);
  if (!entry) return null;
  const wasForming = entry.liveTool != null;
  entry.liveTool = name ? { name: String(name), partialInput: String(partialInput ?? "").slice(-2_000) } : null;
  entry.lastBeatAt = new Date().toISOString();
  // A tool block opening (name appears where none was forming) is a work step starting. Mint the step id
  // ONCE per block — later partial-argument deltas for the same call do not re-fire it — so the focused
  // node sees one started marker per step, bounded by the serial tool loop.
  if (entry.liveTool && !wasForming) {
    entry.stepSeq += 1;
    entry.liveToolStep = { id: `${driveId}:${entry.stepSeq}`, label: entry.liveTool.name, startedAt: now() };
    emitWorkDelta(entry.ventureId, {
      betId: entry.betId,
      delta: { type: "step-started", stepId: entry.liveToolStep.id, label: entry.liveToolStep.label },
    });
  }
  publishDriveDelta(driveId, { kind: "tool", name: entry.liveTool?.name ?? null, partialInput: entry.liveTool?.partialInput ?? "" });
  pingDriveFallback(entry, now());
  return publicDrive(entry);
}

// The remaining three notes follow noteDriveText exactly: update the process-local drive record so a
// client with no delta stream open still reads the texture off the timeline, then publish the same
// fact onto the drive's delta stream for a client that does. Every cap here is a presence cap, not a
// truth cap — the durable receipts, conversation, and tool authority live on their own seams.
const TOOL_RESULT_CAP = 8;
const TODO_CAP = 12;

// One settled tool step. `at` is stamped here rather than at the adapter seam so every receipt on the
// record shares one clock, and the newest CAP steps are kept because the timeline shows the live edge.
export function noteDriveToolResult(driveId, { name = null, target = null, status = "ok", detail = null } = {}, { now = Date.now } = {}) {
  const entry = active.get(driveId);
  if (!entry) return null;
  const at = new Date().toISOString();
  entry.liveToolResults = [
    ...entry.liveToolResults,
    { name: String(name ?? "").slice(0, 120) || null, target: String(target ?? "").slice(0, 480) || null, status: String(status ?? "ok").slice(0, 40), detail: String(detail ?? "").slice(0, 2_000) || null, at },
  ].slice(-TOOL_RESULT_CAP);
  // A settled call also closes whatever call was forming, the same way the delta stream folds it.
  entry.liveTool = null;
  // The focused node sees the step finish with its measured duration and status — the safe factual shape,
  // never the result body (`detail` stays on the drive-scoped stream, not on this venture delta).
  const step = entry.liveToolStep;
  const stepLabel = String(name ?? "").trim() || step?.label || "tool";
  emitWorkDelta(entry.ventureId, {
    betId: entry.betId,
    delta: {
      type: "step-finished",
      stepId: step?.id ?? `${driveId}:${entry.stepSeq || 1}`,
      label: stepLabel,
      status: String(status ?? "ok"),
      durationMs: step ? now() - step.startedAt : null,
    },
  });
  entry.liveToolStep = null;
  entry.lastBeatAt = at;
  publishDriveDelta(driveId, { kind: "tool-result", name, target, status, detail });
  pingDriveFallback(entry, now());
  return publicDrive(entry);
}

// SHAPE ONLY. A thinking span records that the model is thinking and for how long — never what it
// thought. The runtime seam already drops reasoning content; nothing on this record may carry it.
export function noteDriveThinking(driveId, { state, durationMs = null } = {}, { now = Date.now } = {}) {
  const entry = active.get(driveId);
  if (!entry) return null;
  const at = new Date().toISOString();
  entry.liveThinking = {
    state: state === "stop" ? "stop" : "start",
    durationMs: Number.isFinite(durationMs) ? Math.max(0, Math.round(durationMs)) : null,
    at,
  };
  entry.lastBeatAt = at;
  publishDriveDelta(driveId, { kind: "thinking", state: entry.liveThinking.state, durationMs: entry.liveThinking.durationMs });
  pingDriveFallback(entry, now());
  return publicDrive(entry);
}

// The plan the model is keeping for itself. It replaces rather than appends: a plan message always
// carries the whole current plan, so the latest one is the only honest state.
export function noteDriveTodos(driveId, items, { now = Date.now } = {}) {
  const entry = active.get(driveId);
  if (!entry) return null;
  entry.liveTodos = (Array.isArray(items) ? items : [])
    .map((item) => ({ content: String(item?.content ?? "").slice(0, 480), status: String(item?.status ?? "pending").slice(0, 40) || "pending" }))
    .filter((item) => item.content)
    .slice(0, TODO_CAP);
  entry.lastBeatAt = new Date().toISOString();
  publishDriveDelta(driveId, { kind: "todo", items: entry.liveTodos });
  pingDriveFallback(entry, now());
  return publicDrive(entry);
}

const NESTED_TASK_CAP = 100;
const TERMINAL_NESTED_STATUSES = new Set(["completed", "failed", "cancelled", "stopped", "skipped"]);

// Provider-native subagents and workflows arrive as partial lifecycle facts. Merge them by the
// provider's task id so progress never creates duplicate rows, then publish the same shaped fact to
// the drive stream. Prompts, transcripts, and model reasoning are deliberately absent.
export function noteDriveNestedTask(driveId, event = {}, { now = Date.now } = {}) {
  const entry = active.get(driveId);
  const taskId = String(event.taskId ?? event.task_id ?? "").trim();
  if (!entry || !taskId) return entry ? publicDrive(entry) : null;
  const patch = event.patch && typeof event.patch === "object" ? event.patch : {};
  const previous = entry.liveNestedTasks.get(taskId) ?? { taskId };
  const status = String(
    event.status
      ?? patch.status
      ?? (event.kind === "started" ? "running" : event.kind === "settled" ? "completed" : previous.status ?? "running"),
  ).trim();
  const usage = event.usage && typeof event.usage === "object" ? event.usage : {};
  const next = {
    ...previous,
    taskId,
    parentTaskId: String(event.parentTaskId ?? event.parentId ?? event.parentToolUseId ?? previous.parentTaskId ?? "").trim() || null,
    label: String(event.label ?? event.description ?? patch.description ?? previous.label ?? "").trim().slice(0, 480) || null,
    taskKind: String(event.taskKind ?? event.taskType ?? event.subagentType ?? previous.taskKind ?? "").trim().slice(0, 120) || null,
    status: status || "running",
    completedCount: Number.isFinite(Number(event.completedCount)) ? Math.max(0, Number(event.completedCount)) : (previous.completedCount ?? null),
    totalCount: Number.isFinite(Number(event.totalCount)) ? Math.max(0, Number(event.totalCount)) : (previous.totalCount ?? null),
    inputTokens: Number.isFinite(Number(event.inputTokens ?? usage.inputTokens)) ? Math.max(0, Number(event.inputTokens ?? usage.inputTokens)) : (previous.inputTokens ?? null),
    outputTokens: Number.isFinite(Number(event.outputTokens ?? usage.outputTokens)) ? Math.max(0, Number(event.outputTokens ?? usage.outputTokens)) : (previous.outputTokens ?? null),
    totalTokens: Number.isFinite(Number(event.totalTokens ?? usage.totalTokens))
      ? Math.max(0, Number(event.totalTokens ?? usage.totalTokens))
      : (previous.totalTokens ?? null),
    costUsd: Number.isFinite(Number(event.costUsd ?? usage.costUsd)) ? Math.max(0, Number(event.costUsd ?? usage.costUsd)) : (previous.costUsd ?? null),
    elapsedMs: Number.isFinite(Number(event.elapsedMs ?? usage.durationMs ?? usage.duration_ms))
      ? Math.max(0, Number(event.elapsedMs ?? usage.durationMs ?? usage.duration_ms))
      : (previous.elapsedMs ?? null),
    error: String(event.error ?? patch.error ?? previous.error ?? "").trim().slice(0, 2_000) || null,
    skipTranscript: event.skipTranscript === true || event.hidden === true || previous.skipTranscript === true,
  };
  entry.liveNestedTasks.delete(taskId);
  entry.liveNestedTasks.set(taskId, next);
  while (entry.liveNestedTasks.size > NESTED_TASK_CAP) {
    const settled = [...entry.liveNestedTasks].find(([, task]) => TERMINAL_NESTED_STATUSES.has(task.status));
    entry.liveNestedTasks.delete(settled?.[0] ?? entry.liveNestedTasks.keys().next().value);
  }
  entry.lastBeatAt = new Date().toISOString();
  publishDriveDelta(driveId, { kind: "nested-task", task: next });
  pingDriveFallback(entry, now());
  return publicDrive(entry);
}

export function markArchitectureContextStale(ventureId, currentRevision, now = () => new Date().toISOString()) {
  const marked = [];
  for (const entry of active.values()) {
    if (entry.ventureId !== ventureId || entry.architectureRevision == null || entry.architectureRevision === currentRevision) continue;
    entry.architectureContextStaleAt ??= now();
    marked.push(publicDrive(entry));
  }
  return marked;
}

export function listActiveDrives(ventureId) {
  return [...active.values()]
    .filter((entry) => entry.ventureId === ventureId)
    .map(publicDrive);
}

// Mark that a founder steer is waiting for a live drive on this effort — the process-local half of the
// steer seam (work-loop-steer.mjs owns the durable queue). No-op when no drive on this effort is live;
// the durable queue still carries the steer to the next run. Returns the marked drives (for a caller/UI
// that wants to reflect it immediately).
export function notePendingSteer({ ventureId, betId }) {
  const marked = [];
  for (const entry of active.values()) {
    if (entry.ventureId !== ventureId || entry.betId !== betId) continue;
    entry.steerPending = true;
    marked.push(publicDrive(entry));
  }
  return marked;
}

export function abortActiveDrive({ ventureId, driveId, now = () => new Date().toISOString() }) {
  const entry = active.get(driveId);
  if (!entry || entry.ventureId !== ventureId) {
    throw Object.assign(new Error(`No such active drive in this venture: ${driveId}`), { status: 404 });
  }
  if (!entry.abortSupported) {
    throw Object.assign(new Error(`${entry.runtime} cannot safely stop an active drive.`), { status: 409 });
  }
  if (!entry.abortRequestedAt) {
    entry.abortRequestedAt = now();
    entry.controller.abort(new Error("The founder stopped this work."));
  }
  return publicDrive(entry);
}

// Quit-time teardown: request an abort on every live drive so provider subprocesses stop with the
// desktop shell instead of being killed mid-write. This ignores abortSupported deliberately — that
// flag protects a founder from an unsafe mid-work stop, but at process exit an orderly abort is
// strictly better than the SIGKILL the drive would otherwise get. Durable work records survive;
// recoverDesktopWork offers the resumable scopes on the next launch.
export function abortAllActiveDrives({ now = () => new Date().toISOString() } = {}) {
  let aborted = 0;
  for (const entry of active.values()) {
    if (entry.abortRequestedAt) continue;
    entry.abortRequestedAt = now();
    entry.controller.abort(new Error("Croki is closing."));
    aborted += 1;
  }
  return aborted;
}

export function __resetActiveDrives() {
  for (const entry of active.values()) {
    entry.controller.abort();
    dropDriveStream(entry.id);
  }
  active.clear();
}
