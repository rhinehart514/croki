import type { ThreadTimeline, WorkIndex } from "./work";
import type {
  WorkHandshake,
  WorkProtocolFrame,
  WorkProtocolSnapshot,
  WorkPush,
} from "./work-protocol";

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function timeline(value: unknown, ventureId: string): ThreadTimeline | null {
  const candidate = object(value);
  const thread = object(candidate?.thread);
  if (
    candidate?.ventureId !== ventureId
    || !Number.isSafeInteger(candidate.revision)
    || typeof thread?.threadRef !== "string"
  ) return null;
  return value as ThreadTimeline;
}

function workIndex(value: unknown, ventureId: string): WorkIndex | null {
  const candidate = object(value);
  if (
    candidate?.ventureId !== ventureId
    || !Number.isSafeInteger(candidate.revision)
    || !Array.isArray(candidate.items)
  ) return null;
  return value as WorkIndex;
}

function normalizeSnapshot(
  input: unknown,
  handshakeCursor: number,
  handshakeRevision: number,
): WorkProtocolSnapshot | null {
  const snapshot = object(input);
  const ventureId = typeof snapshot?.ventureId === "string" ? snapshot.ventureId : "";
  const rawThread = snapshot?.thread ?? snapshot?.timeline ?? null;
  const rawWork = snapshot?.work ?? snapshot?.workIndex ?? null;
  const threadValue = rawThread == null ? null : timeline(rawThread, ventureId);
  const workValue = rawWork == null ? null : workIndex(rawWork, ventureId);
  if (!ventureId || !workValue || (rawThread != null && !threadValue)) return null;
  return {
    ventureId,
    cursor: Number.isSafeInteger(snapshot?.cursor) ? Number(snapshot?.cursor) : handshakeCursor,
    threads: threadValue
      ? [{
        threadRef: threadValue.thread.threadRef,
        revision: Number.isSafeInteger(snapshot?.threadRevision)
          ? Number(snapshot?.threadRevision)
          : handshakeRevision,
        value: threadValue,
      }]
      : [],
    work: {
      revision: Number.isSafeInteger(snapshot?.workRevision)
        ? Number(snapshot?.workRevision)
        : handshakeRevision,
      value: workValue,
    },
  };
}

function normalizeHandshake(frame: Extract<DroverWorkFrame, { frame: "handshake" }>): WorkHandshake {
  return {
    schemaVersion: frame.schemaVersion,
    minCompatibleSchemaVersion: frame.minSchemaVersion,
    ventureId: frame.ventureId,
    serverInstanceId: frame.serverInstanceId,
    currentCursor: frame.cursor,
    projectionRevision: frame.projectionRevision,
    delivery: frame.mode,
    ...(frame.snapshot
      ? { snapshot: normalizeSnapshot(frame.snapshot, frame.cursor, frame.projectionRevision) ?? undefined }
      : {}),
  };
}

function normalizePush(frame: Extract<DroverWorkFrame, { frame: "push" }>): WorkPush | null {
  const raw = frame as DroverWorkFrame & {
    projection: string;
    payload: unknown;
    threadId?: string;
  };
  if (frame.schemaVersion !== 1) return null;
  if (raw.projection === "activity") {
    return {
      schemaVersion: 1,
      ventureId: frame.ventureId,
      sequence: frame.sequence,
      projectionRevision: frame.projectionRevision,
      projection: "activity",
      threadRef: raw.threadId ?? null,
    };
  }
  if (raw.projection === "thread") {
    const value = timeline(frame.payload, frame.ventureId);
    const threadRef = value?.thread.threadRef ?? raw.threadId;
    if (!value || !threadRef) return null;
    return {
      schemaVersion: 1,
      ventureId: frame.ventureId,
      sequence: frame.sequence,
      projectionRevision: frame.projectionRevision,
      projection: "thread",
      threadRef,
      value,
    };
  }
  if (raw.projection !== "work" && raw.projection !== "bundle") return null;
  const value = workIndex(frame.payload, frame.ventureId);
  if (value && raw.projection === "work") {
    return {
      schemaVersion: 1,
      ventureId: frame.ventureId,
      sequence: frame.sequence,
      projectionRevision: frame.projectionRevision,
      projection: "work",
      value,
    };
  }
  const payload = object(frame.payload);
  const bundledWork = workIndex(payload?.workIndex, frame.ventureId);
  const bundledThread = payload?.timeline == null
    ? null
    : timeline(payload.timeline, frame.ventureId);
  if (!bundledWork || (payload?.timeline != null && !bundledThread)) return null;
  return {
    schemaVersion: 1,
    ventureId: frame.ventureId,
    sequence: frame.sequence,
    projectionRevision: frame.projectionRevision,
    projection: "bundle",
    thread: bundledThread,
    work: bundledWork,
  };
}

export function normalizeDesktopWorkFrame(
  frame: DroverWorkFrame,
  ventureId: string,
): WorkProtocolFrame | null {
  if (frame.ventureId !== ventureId) return null;
  if (frame.frame === "handshake") {
    return { frame: "handshake", ...normalizeHandshake(frame) };
  }
  const push = normalizePush(frame);
  return push ? { frame: "push", ...push } : null;
}
