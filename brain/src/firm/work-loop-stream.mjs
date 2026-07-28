// work-loop-stream.mjs — the firm-side seam for SDK streaming runs (ported from T3 Code's Claude run
// architecture, stripped of Effect). A sibling of work-loop.mjs on purpose: work-loop.mjs sits at its
// service ceiling. Two responsibilities, both process-local presence over durable venture-store truth:
//
//   1. The live-run registry. While a drive's SDK query is running, its control handle (steer /
//      interrupt / setModel / setPermissionMode) is registered here keyed by the drive. A founder
//      message that reaches a Thread with a live run steers the SAME turn through that handle — no
//      restart, no refusal. When no run is live (or its queue just closed), callers fall back to the
//      durable pendingSteer queue (work-loop-steer.mjs): the unchanged "adjusts on the next step"
//      contract. Like active-drives.mjs, a restart correctly drops this registry.
//
//   2. The streaming ctx callbacks work-loop.mjs spreads into the adapter seam: partial text deltas
//      stream into the live drive presence (the same liveText the timeline already reads), partial
//      tool arguments surface on the same drive record, and the Claude resume cursor half
//      (resumeSessionAt — the last assistant uuid) checkpoints onto the SAME work record that already
//      carries runtimeSessionId, so { sessionId, resumeSessionAt } persist as one pair per Thread.

import { noteDriveNestedTask, noteDriveText, noteDriveThinking, noteDriveTodos, noteDriveToolInput, noteDriveToolResult } from "./active-drives.mjs";
import { publishDriveDelta } from "./drive-stream.mjs";
import { recordFactualActivity, recordFormingReplyCheckpoint } from "./work-journal-runtime.mjs";

const liveRuns = new Map(); // driveId -> { driveId, ventureId, betId, threadRef, handle }

export function registerLiveRun({ driveId, ventureId, betId = null, threadRef = null, handle }) {
  if (!driveId || !ventureId || !handle) return null;
  const entry = { driveId, ventureId, betId: betId ?? null, threadRef: threadRef ?? null, handle };
  liveRuns.set(driveId, entry);
  return entry;
}

export function unregisterLiveRun(driveId) {
  liveRuns.delete(driveId);
}

export function findLiveRun({ ventureId, betId = null, threadRef = null }) {
  for (const entry of liveRuns.values()) {
    if (entry.ventureId !== ventureId) continue;
    if (betId && entry.betId === betId) return entry;
    if (threadRef && entry.threadRef === threadRef) return entry;
  }
  return null;
}

// steerLiveRun — push a founder message onto a live run's prompt queue so it continues the SAME turn.
// Returns the steered run, or null when no live run matched or its queue already closed (the caller
// falls back to the durable queue or a fresh drive — a racing steer never vanishes). A founder model
// change on the steer rides the SDK's own setModel control, best-effort.
export function steerLiveRun({ ventureId, betId = null, threadRef = null, text, model = null, attachments = [] }) {
  const note = String(text ?? "").trim();
  if (!ventureId || !note) return null;
  const entry = findLiveRun({ ventureId, betId, threadRef });
  if (!entry) return null;
  if (model) {
    try { entry.handle.setModel?.(model)?.catch?.(() => {}); } catch { /* model switch is best-effort; the steer still lands */ }
  }
  let accepted = false;
  try { accepted = entry.handle.steer?.(note, attachments) === true; } catch { accepted = false; }
  if (!accepted) {
    liveRuns.delete(entry.driveId);
    return null;
  }
  return { driveId: entry.driveId, betId: entry.betId, threadRef: entry.threadRef };
}

export function __resetLiveRuns() {
  liveRuns.clear();
}

// buildStreamSeam — the streaming ctx callbacks for one drive. getWork/putWork are the drive's own
// single-writer checkpoint accessors, so the resume cursor persists through the exact same seam every
// other work checkpoint uses.
export function buildStreamSeam({ activeDrive, receipts, narration, ventureId, betId = null, threadRef = null, getWork, putWork, driveRun = null, onSettledToolResult = null }) {
  let streamed = false;
  let formingReply = "";
  let receivedLength = 0;
  let checkpointedLength = 0;
  let checkpoint = 0;
  const nestedTasks = new Map();
  const terminalNested = new Set(["completed", "failed", "cancelled", "stopped", "skipped"]);
  const replyId = `reply:${activeDrive.id}`;
  const checkpointReply = (force = false) => {
    if (!formingReply || (!force && checkpoint > 0 && receivedLength - checkpointedLength < 512)) return;
    checkpointedLength = receivedLength;
    checkpoint += 1;
    recordFormingReplyCheckpoint(driveRun, { replyId, boundedText: formingReply, checkpoint });
  };
  return {
    onTextDelta: (delta) => {
      const text = String(delta ?? "");
      if (!text) return;
      streamed = true;
      receivedLength += text.length;
      formingReply = `${formingReply}${text}`.slice(-12 * 1024);
      checkpointReply();
      noteDriveText(activeDrive.id, text);
    },
    onText: (text) => {
      receipts.record({ type: "text", detail: text });
      const line = String(text ?? "").trim();
      if (line) narration.push(line);
      if (!streamed && line) {
        formingReply = line.slice(-12 * 1024);
        receivedLength = line.length;
      }
      checkpointReply(true);
      // Deltas already streamed this reply into the live drive presence; appending the complete
      // message again would double it. A non-streaming adapter keeps the whole-message path.
      if (!streamed) noteDriveText(activeDrive.id, text);
    },
    onToolInputDelta: (name, partialJson) => noteDriveToolInput(activeDrive.id, name, partialJson),
    // Optional streaming passthroughs onto the drive's own delta stream (drive-stream.mjs). A runtime
    // adapter calls these with optional chaining, so an adapter that cannot produce a signal simply never
    // does — nothing here is required for a run to work. They publish presence and nothing else: the
    // durable receipts, tool authority, and conversation truth stay on their existing seams above.
    // onThinking carries SHAPE ONLY — that the model is thinking and for how long, never what it thought.
    // These three route through active-drives rather than straight to the stream so the drive record
    // and the delta stream never disagree: a client with no stream open reads the same texture off the
    // thread timeline. onChildDelta has no drive-record half — a subagent's deltas are stream-only.
    onToolResult: (result) => {
      noteDriveToolResult(activeDrive.id, result);
      onSettledToolResult?.(result);
    },
    onThinking: (span) => noteDriveThinking(activeDrive.id, span),
    onTodos: (items) => noteDriveTodos(activeDrive.id, items),
    onChildDelta: ({ parentToolUseId, delta } = {}) =>
      publishDriveDelta(activeDrive.id, { kind: "child", parentToolUseId, delta }),
    onNestedTask: (event = {}) => {
      const taskId = String(event.taskId ?? event.task_id ?? "").trim();
      if (!taskId) return;
      const prior = nestedTasks.get(taskId) ?? { taskId };
      const patch = event.patch && typeof event.patch === "object" ? event.patch : {};
      const status = String(
        event.status
          ?? patch.status
          ?? (event.kind === "started" ? "running" : event.kind === "settled" ? "completed" : prior.status ?? "running"),
      ).trim();
      const task = {
        ...prior,
        ...event,
        taskId,
        parentTaskId: event.parentTaskId ?? event.parentId ?? event.parentToolUseId ?? prior.parentTaskId ?? null,
        label: event.label ?? event.description ?? patch.description ?? prior.label ?? null,
        taskKind: event.taskKind ?? event.taskType ?? event.subagentType ?? prior.taskKind ?? null,
        skipTranscript: event.skipTranscript === true || event.hidden === true || prior.skipTranscript === true,
        status,
      };
      nestedTasks.set(taskId, task);
      noteDriveNestedTask(activeDrive.id, task);

      // Only unfinished identities need restart recovery. Completed children belong in their
      // provider's final synthesis; keeping thousands of settled workers in the hot work record
      // would turn execution machinery into a second durable model.
      const unfinished = [...nestedTasks.values()]
        .filter((candidate) => !terminalNested.has(candidate.status))
        .slice(-64)
        .map((candidate) => ({
          taskId: candidate.taskId,
          label: String(candidate.label ?? "").slice(0, 480) || null,
          taskKind: String(candidate.taskKind ?? "").slice(0, 120) || null,
          status: candidate.status,
        }));
      const work = getWork();
      putWork({
        ...work,
        nativeNestedTasks: unfinished,
        nestedTaskReceiptCount: (Number(work?.nestedTaskReceiptCount) || 0) + (event.kind === "settled" ? 1 : 0),
      });

      // A root workflow/task is a useful durable receipt; its individual workers are not. Failures
      // also survive so Review and recovery never hide a broken branch.
      const root = !task.parentTaskId;
      if (event.kind === "settled" && (root || task.status === "failed")) {
        const usage = event.usage && typeof event.usage === "object" ? event.usage : null;
        recordFactualActivity(driveRun, {
          activityId: `nested:${taskId}`,
          label: String(task.label ?? task.taskKind ?? "Nested work").slice(0, 480),
          tone: task.status === "failed" ? "attention" : "tool",
          durationMs: Number.isFinite(Number(event.elapsedMs ?? usage?.durationMs ?? usage?.duration_ms))
            ? Math.max(0, Number(event.elapsedMs ?? usage?.durationMs ?? usage?.duration_ms))
            : null,
          usage: usage ? {
            inputTokens: Math.max(0, Number(usage.inputTokens ?? 0) || 0),
            outputTokens: Math.max(0, Number(usage.outputTokens ?? 0) || 0),
            cachedInputTokens: Math.max(0, Number(usage.cachedInputTokens ?? 0) || 0),
            costUsd: Math.max(0, Number(usage.costUsd ?? 0) || 0),
          } : null,
        });
      }
    },
    onResumeCursor: ({ resumeSessionAt } = {}) => {
      const at = String(resumeSessionAt ?? "").trim();
      if (!at || getWork().resumeSessionAt === at) return;
      putWork({ ...getWork(), resumeSessionAt: at });
    },
    onRunHandle: (handle) => {
      if (handle) registerLiveRun({ driveId: activeDrive.id, ventureId, betId, threadRef, handle });
      else unregisterLiveRun(activeDrive.id);
    },
  };
}
