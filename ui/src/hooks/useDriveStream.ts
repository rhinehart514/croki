import { useEffect, useRef, useState } from "react";
import {
  driveStreamSupported,
  subscribeDriveStream,
  type DriveStreamDelta,
  type DriveStreamFrame,
  type DriveStreamNestedTask as DriveStreamNestedTaskPayload,
  type DriveStreamSnapshot,
  type DriveStreamTodo,
  type DriveStreamTool,
} from "@/api";

// useDriveStream — the payload half of the live seam (streaming parity, W1).
//
// The venture event stream says "something changed" and a listener re-reads the surface. That is the
// right shape for durable state and the wrong shape for tokens: it used to cost a full timeline
// refetch per ping, ~8 times a second, and replaced the whole transcript object each time. This hook
// subscribes to one drive's own stream, holds the forming reply locally, and appends deltas.
//
// Two properties keep a fast stream cheap:
//   - every applied frame lands in a mutable buffer and one requestAnimationFrame flush publishes it,
//     so a token burst repaints once per frame instead of once per token;
//   - a monotonic `seq` guard drops duplicate or already-applied frames, and a reconnect resumes from
//     the last sequence actually applied (`?since=`) so no text is repeated or lost.

export type DriveStreamStep = { id: string; name: string; target: string | null; status: string | null; detail: string | null };
export type DriveStreamThinking = { active: boolean; durationMs: number | null; startedAt: number | null };
export type DriveStreamChild = { parentToolUseId: string; text: string; tool: DriveStreamTool | null; steps: DriveStreamStep[] };
export type DriveStreamNestedTask = DriveStreamNestedTaskPayload;

type LiveState = {
  text: string;
  tool: DriveStreamTool | null;
  thinking: DriveStreamThinking | null;
  todos: DriveStreamTodo[];
  steps: DriveStreamStep[];
  children: DriveStreamChild[];
  nestedTasks: DriveStreamNestedTask[];
};

export type DriveStreamValue = LiveState & { connected: boolean };

const EMPTY: LiveState = { text: "", tool: null, thinking: null, todos: [], steps: [], children: [], nestedTasks: [] };

// `retry: 3000` on the server side; a route that is not answering yet backs off instead of hammering.
const RECONNECT_MS = 3_000;
const RECONNECT_MAX_MS = 30_000;
// The activity log only ever shows a short tail, so an hour-long drive cannot grow this without bound.
const MAX_STEPS = 40;

const text = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;
const tool = (value: unknown): DriveStreamTool | null => {
  if (!value || typeof value !== "object") return null;
  const shape = value as Record<string, unknown>;
  const name = text(shape.name).trim();
  return name ? { name, partialInput: text(shape.partialInput) } : null;
};
const todos = (value: unknown): DriveStreamTodo[] => Array.isArray(value)
  ? value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    const content = text(item.content).trim();
    return content ? [{ content, status: text(item.status, "pending") }] : [];
  })
  : [];

function nestedTask(value: unknown, fallbackId = ""): DriveStreamNestedTask | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const taskId = text(source.taskId ?? source.id ?? fallbackId).trim();
  if (!taskId) return null;
  const task: DriveStreamNestedTask = { taskId };
  const assignText = (key: keyof DriveStreamNestedTask, aliases: string[] = [key]) => {
    const alias = aliases.find((name) => Object.hasOwn(source, name));
    if (!alias) return;
    const value = source[alias];
    (task as Record<string, unknown>)[key] = value == null ? null : text(value).trim() || null;
  };
  const assignNumber = (key: keyof DriveStreamNestedTask) => {
    if (!Object.hasOwn(source, key)) return;
    const value = source[key];
    (task as Record<string, unknown>)[key] = typeof value === "number" && Number.isFinite(value)
      ? Math.max(0, value)
      : null;
  };
  assignText("parentTaskId", ["parentTaskId", "parentId", "parentToolUseId"]);
  assignText("label");
  assignText("taskKind");
  assignText("status");
  assignNumber("completedCount");
  assignNumber("totalCount");
  assignNumber("inputTokens");
  assignNumber("outputTokens");
  assignNumber("totalTokens");
  assignNumber("costUsd");
  assignNumber("elapsedMs");
  assignText("error");
  if (Object.hasOwn(source, "skipTranscript")) task.skipTranscript = source.skipTranscript === true;
  else if (Object.hasOwn(source, "hidden")) task.skipTranscript = source.hidden === true;
  return task;
}

function mergeNestedTask(tasks: DriveStreamNestedTask[], task: DriveStreamNestedTask): DriveStreamNestedTask[] {
  const existing = tasks.find((entry) => entry.taskId === task.taskId);
  return existing
    ? tasks.map((entry) => entry.taskId === task.taskId ? { ...entry, ...task } : entry)
    : [...tasks, task];
}

function snapshotNestedTasks(value: unknown): DriveStreamNestedTask[] {
  if (Array.isArray(value)) return value.flatMap((entry) => nestedTask(entry) ?? []);
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([taskId, entry]) => nestedTask(entry, taskId) ?? []);
}

function pushStep(steps: DriveStreamStep[], delta: Extract<DriveStreamDelta, { kind: "tool-result" }>): DriveStreamStep[] {
  const name = text(delta.name).trim();
  if (!name) return steps;
  const step: DriveStreamStep = {
    id: `${steps.length}:${name}`,
    name,
    target: text(delta.target).trim() || null,
    status: text(delta.status).trim() || null,
    detail: text(delta.detail).trim() || null,
  };
  return [...steps, step].slice(-MAX_STEPS);
}

function applyChild(children: DriveStreamChild[], parentToolUseId: string, delta: DriveStreamDelta, now: number): DriveStreamChild[] {
  const existing = children.find((child) => child.parentToolUseId === parentToolUseId);
  const base: LiveState = existing
    ? { ...EMPTY, text: existing.text, tool: existing.tool, steps: existing.steps }
    : EMPTY;
  const next = applyDelta(base, delta, now);
  const child: DriveStreamChild = { parentToolUseId, text: next.text, tool: next.tool, steps: next.steps };
  return existing
    ? children.map((entry) => entry.parentToolUseId === parentToolUseId ? child : entry)
    : [...children, child];
}

function applyDelta(state: LiveState, delta: DriveStreamDelta, now: number): LiveState {
  switch (delta.kind) {
    case "text":
      return { ...state, text: state.text + text(delta.text) };
    case "tool":
      return { ...state, tool: delta.name == null ? null : tool(delta) };
    case "tool-result":
      return { ...state, tool: null, steps: pushStep(state.steps, delta) };
    case "thinking":
      // Shape only. The stream carries no thinking content and this hook never invents any.
      return delta.state === "start"
        ? { ...state, thinking: { active: true, durationMs: null, startedAt: now } }
        : {
          ...state,
          thinking: {
            active: false,
            durationMs: typeof delta.durationMs === "number" && Number.isFinite(delta.durationMs)
              ? delta.durationMs
              : state.thinking?.startedAt != null ? now - state.thinking.startedAt : null,
            startedAt: null,
          },
        };
    case "todo":
      return { ...state, todos: todos(delta.items) };
    case "nested-task": {
      const task = nestedTask(delta.task);
      return task ? { ...state, nestedTasks: mergeNestedTask(state.nestedTasks, task) } : state;
    }
    case "child":
      return delta.delta && text(delta.parentToolUseId)
        ? { ...state, children: applyChild(state.children, delta.parentToolUseId, delta.delta, now) }
        : state;
    default:
      return state;
  }
}

// A reconnect can be answered two honest ways: a full snapshot of the forming reply, or only the part
// produced since `?since=`. Neither may duplicate what is already painted, so reconcile by content
// rather than trusting one server behaviour.
function mergeText(local: string, incoming: string): string {
  if (!local) return incoming;
  if (!incoming) return local;
  if (incoming.startsWith(local)) return incoming;
  if (local.endsWith(incoming)) return local;
  return local + incoming;
}

function applySnapshot(state: LiveState, snapshot: DriveStreamSnapshot, now: number): LiveState {
  const children = Array.isArray(snapshot.children)
    ? snapshot.children
    : snapshot.children && typeof snapshot.children === "object"
      ? Object.entries(snapshot.children).map(([parentToolUseId, value]) => ({ parentToolUseId, ...(value as object) }))
      : [];
  // The snapshot reports thinking the way the deltas do — `state: "start" | "stop"` — and shape only.
  const thinkingState = snapshot.thinking && typeof snapshot.thinking === "object"
    ? snapshot.thinking as { state?: string; active?: boolean; durationMs?: number | null }
    : null;
  const thinkingActive = thinkingState ? thinkingState.state === "start" || thinkingState.active === true : false;
  const thinking = thinkingState
    ? {
      active: thinkingActive,
      durationMs: typeof thinkingState.durationMs === "number" ? thinkingState.durationMs : null,
      // The stream carries no wall-clock start, so an active block is measured from the moment it is
      // observed here. A resumed block therefore reads short, never invented.
      startedAt: thinkingActive ? now - (typeof thinkingState.durationMs === "number" ? thinkingState.durationMs : 0) : null,
    }
    : null;
  const nestedTasks = snapshotNestedTasks(snapshot.nestedTasks)
    .reduce((tasks, task) => mergeNestedTask(tasks, task), state.nestedTasks);
  return {
    text: mergeText(state.text, text(snapshot.text)),
    tool: tool(snapshot.tool),
    thinking,
    todos: todos(snapshot.todos),
    steps: state.steps,
    children: children.flatMap((entry) => {
      const child = (entry ?? {}) as Record<string, unknown>;
      const parentToolUseId = text(child.parentToolUseId).trim();
      return parentToolUseId
        ? [{ parentToolUseId, text: text(child.text), tool: tool(child.tool), steps: [] as DriveStreamStep[] }]
        : [];
    }),
    nestedTasks,
  };
}

export function useDriveStream(ventureId: string | null, driveId: string | null): DriveStreamValue {
  const [live, setLive] = useState<LiveState>(EMPTY);
  const [connected, setConnected] = useState(false);
  const buffer = useRef<LiveState>(EMPTY);
  const seq = useRef(0);
  const frame = useRef<number | null>(null);

  // A different drive is a different forming reply: drop what is painted while rendering rather than
  // letting one drive's tokens appear for a moment under another's status.
  const subject = ventureId && driveId ? `${ventureId}:${driveId}` : "";
  const [current, setCurrent] = useState(subject);
  if (current !== subject) {
    setCurrent(subject);
    setLive(EMPTY);
    setConnected(false);
  }

  useEffect(() => {
    buffer.current = EMPTY;
    seq.current = 0;
    if (!ventureId || !driveId || !driveStreamSupported()) return undefined;

    let cancelled = false;
    let stop = () => {};
    let retry: number | null = null;
    let attempt = 0;

    // One rAF flush per burst: a hundred token deltas repaint the transcript once, and the paint is
    // append-only so the transcript's scroll owner is never taken over by this hook.
    const publish = () => {
      if (frame.current != null) return;
      const flush = () => {
        frame.current = null;
        if (!cancelled) setLive(buffer.current);
      };
      frame.current = typeof requestAnimationFrame === "function"
        ? requestAnimationFrame(flush)
        : window.setTimeout(flush, 16);
    };

    const accept = (received: DriveStreamFrame) => {
      if (cancelled) return;
      const now = Date.now();
      if (received.frame === "snapshot") {
        buffer.current = applySnapshot(buffer.current, received.snapshot, now);
        if (typeof received.snapshot.seq === "number") seq.current = Math.max(seq.current, received.snapshot.seq);
      } else {
        const at = received.delta.seq;
        // Out of order or already applied: the sequence is the only truth about what is painted.
        if (typeof at === "number" && at <= seq.current) return;
        buffer.current = applyDelta(buffer.current, received.delta, now);
        if (typeof at === "number") seq.current = at;
      }
      publish();
    };

    const connect = () => {
      if (cancelled) return;
      stop = subscribeDriveStream(ventureId, driveId, accept, (state) => {
        if (cancelled) return;
        setConnected(state === "open");
        if (state === "open") {
          attempt = 0;
          return;
        }
        retry = window.setTimeout(connect, Math.min(RECONNECT_MS * 2 ** attempt++, RECONNECT_MAX_MS));
      }, seq.current || null);
    };
    connect();

    return () => {
      cancelled = true;
      if (retry != null) window.clearTimeout(retry);
      if (frame.current != null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame.current);
      frame.current = null;
      stop();
    };
  }, [driveId, ventureId]);

  return { ...live, connected };
}
