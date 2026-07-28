import { useState } from "react";
import type { DriveStreamNestedTask } from "@/hooks/useDriveStream";

const VISIBLE_TASKS = 12;
const SETTLED_STATES = new Set(["completed", "complete", "succeeded", "success", "failed", "cancelled", "canceled", "stopped", "skipped"]);

const text = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;
const taskState = (task: DriveStreamNestedTask) => text(task.status, "pending").trim().toLowerCase().replaceAll("-", "_");
const taskLabel = (task: DriveStreamNestedTask) => text(task.label || task.taskKind, "Background work");
const taskNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : null;

function durationLabel(value: unknown) {
  const milliseconds = taskNumber(value);
  if (milliseconds == null) return null;
  if (milliseconds < 1_000) return `${Math.max(1, Math.round(milliseconds))}ms`;
  return `${(milliseconds / 1_000).toFixed(milliseconds < 10_000 ? 1 : 0)}s`;
}

function progressLabel(task: DriveStreamNestedTask) {
  const total = taskNumber(task.totalCount);
  const completed = taskNumber(task.completedCount);
  if (total == null || total <= 0 || completed == null) return null;
  return `${Math.min(completed, total)}/${total}`;
}

function tokensLabel(task: DriveStreamNestedTask) {
  const total = taskNumber(task.totalTokens)
    ?? ((taskNumber(task.inputTokens) ?? 0) + (taskNumber(task.outputTokens) ?? 0));
  if (!total) return null;
  return total >= 1_000 ? `${(total / 1_000).toFixed(total < 10_000 ? 1 : 0)}k tokens` : `${total} tokens`;
}

function statusLabel(task: DriveStreamNestedTask) {
  const status = taskState(task);
  if (["in_progress", "working", "started", "running"].includes(status)) return "Running";
  if (["completed", "complete", "succeeded", "success"].includes(status)) return "Done";
  if (status === "cancelled" || status === "canceled") return "Cancelled";
  if (status === "failed") return "Failed";
  if (status === "paused") return "Paused";
  if (status === "stopped") return "Stopped";
  if (status === "skipped") return "Skipped";
  return status ? `${status.charAt(0).toUpperCase()}${status.slice(1).replaceAll("_", " ")}` : "Pending";
}

function taskTone(task: DriveStreamNestedTask) {
  const status = taskState(task);
  if (status === "failed") return "failed";
  if (["paused", "stopped", "cancelled", "canceled"].includes(status)) return "paused";
  if (SETTLED_STATES.has(status)) return "settled";
  if (status === "pending" || status === "queued") return "pending";
  return "active";
}

function summaryFor(tasks: DriveStreamNestedTask[]) {
  const focal = tasks.find((task) => taskTone(task) === "failed")
    ?? tasks.find((task) => taskTone(task) === "paused")
    ?? tasks.find((task) => taskTone(task) === "active")
    ?? tasks.find((task) => taskTone(task) === "pending")
    ?? tasks.at(-1)!;
  const providerProgress = progressLabel(focal) ?? tasks.map(progressLabel).find(Boolean) ?? null;
  const parentIds = new Set(tasks.map((task) => task.parentTaskId).filter(Boolean));
  const leaves = tasks.filter((task) => !parentIds.has(task.taskId));
  const fallbackProgress = leaves.length > 1
    ? `${leaves.filter((task) => SETTLED_STATES.has(taskState(task))).length}/${leaves.length}`
    : null;
  const tone = taskTone(focal);
  const state = tone === "failed" ? "Failed" : tone === "paused" ? statusLabel(focal) : null;
  return {
    label: taskLabel(focal),
    detail: [state, providerProgress ?? fallbackProgress].filter(Boolean).join(" · "),
    tone,
  };
}

function boundedTasks(tasks: DriveStreamNestedTask[]) {
  if (tasks.length <= VISIBLE_TASKS) return tasks;
  const prioritized = [
    ...tasks.filter((task) => ["failed", "paused", "active"].includes(taskTone(task))),
    ...tasks.slice().reverse(),
  ];
  return prioritized
    .filter((task, index) => prioritized.findIndex((entry) => entry.taskId === task.taskId) === index)
    .slice(0, VISIBLE_TASKS);
}

function TaskRow({ task }: { task: DriveStreamNestedTask }) {
  const facts = [
    statusLabel(task),
    progressLabel(task),
    durationLabel(task.elapsedMs),
    tokensLabel(task),
    taskNumber(task.costUsd) ? `$${taskNumber(task.costUsd)!.toFixed(2)}` : null,
  ].filter(Boolean).join(" · ");
  return (
    <li data-tone={taskTone(task)} data-child={task.parentTaskId ? "true" : undefined}>
      <div>
        <span>{taskLabel(task)}</span>
        {task.error ? <small className="thread-agent-nested-error">{task.error}</small> : null}
      </div>
      <small>{facts}</small>
    </li>
  );
}

export function ThreadNestedWork({ tasks, runId }: { tasks: DriveStreamNestedTask[]; runId: string }) {
  const [expanded, setExpanded] = useState(false);
  const visibleTasks = tasks.filter((task) => !task.skipTranscript);
  if (!visibleTasks.length) return null;
  const summary = summaryFor(visibleTasks);
  const rows = boundedTasks(visibleTasks);
  const detailId = `nested-work-${runId}`;
  return (
    <div className="thread-agent-nested" data-tone={summary.tone}>
      <button
        type="button"
        className="thread-agent-nested-toggle"
        aria-expanded={expanded}
        aria-controls={detailId}
        aria-label={`${expanded ? "Hide" : "Show"} background work`}
        onClick={() => setExpanded((open) => !open)}
      >
        <span>{summary.label}</span>
        {summary.detail ? <small>{summary.detail}</small> : null}
        <i aria-hidden="true" />
      </button>
      {expanded ? <ol id={detailId} aria-label="Background jobs">
        {rows.map((task) => <TaskRow key={task.taskId} task={task} />)}
        {visibleTasks.length > rows.length ? <li className="thread-agent-nested-more">
          <span>{visibleTasks.length - rows.length} more jobs</span>
        </li> : null}
      </ol> : null}
    </div>
  );
}
