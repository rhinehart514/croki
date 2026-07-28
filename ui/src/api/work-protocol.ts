import type { ThreadTimeline, WorkIndex } from "./work";

export const WORK_PROTOCOL_SCHEMA_VERSION = 1 as const;
export const MAX_BUFFERED_WORK_FRAMES = 256;

export type WorkCommandEnvelope<TCommand extends string = string, TPayload = unknown> = {
  schemaVersion: typeof WORK_PROTOCOL_SCHEMA_VERSION;
  idempotencyKey: string;
  ventureId: string;
  threadId: string;
  runId: string | null;
  expectedProjectionRevision: number;
  command: TCommand;
  payload: TPayload;
};

export type WorkThreadProjection = {
  threadRef: string;
  revision: number;
  value: ThreadTimeline;
};

export type WorkIndexProjection = {
  revision: number;
  value: WorkIndex;
};

export type WorkProtocolSnapshot = {
  ventureId: string;
  cursor: number;
  threads: WorkThreadProjection[];
  work: WorkIndexProjection | null;
};

type WorkPushBase = {
  schemaVersion: typeof WORK_PROTOCOL_SCHEMA_VERSION;
  ventureId: string;
  sequence: number;
  projectionRevision: number;
};

export type WorkPush =
  | (WorkPushBase & {
    projection: "thread";
    threadRef: string;
    value: ThreadTimeline;
  })
  | (WorkPushBase & {
    projection: "work";
    value: WorkIndex;
  })
  | (WorkPushBase & {
    projection: "bundle";
    thread: ThreadTimeline | null;
    work: WorkIndex;
  })
  | (WorkPushBase & {
    projection: "activity";
    threadRef: string | null;
  });

export type WorkHandshake = {
  schemaVersion: number;
  minCompatibleSchemaVersion: number;
  ventureId: string;
  serverInstanceId: string;
  currentCursor: number;
  projectionRevision?: number;
  delivery: "resume" | "snapshot";
  snapshot?: WorkProtocolSnapshot;
};

export type WorkSubscriptionRequest = {
  schemaVersion: typeof WORK_PROTOCOL_SCHEMA_VERSION;
  ventureId: string;
  threadId?: string;
  runId?: string;
  cursor: number;
};

export type WorkProtocolFrame =
  | ({ frame: "handshake" } & WorkHandshake)
  | ({ frame: "push" } & WorkPush);

export type WorkTransportSync = "connecting" | "live" | "degraded" | "incompatible";
export type WorkProjectionSync = "loading" | "current" | "catching-up" | "stale";
export type CanvasSync = "polling" | "current" | "stale";

export type WorkProtocolState = {
  ventureId: string;
  serverInstanceId: string | null;
  cursor: number;
  targetCursor: number;
  projectionRevision: number;
  threads: Record<string, WorkThreadProjection>;
  work: WorkIndexProjection | null;
  pending: Record<number, WorkPush>;
  threadCoverageComplete: boolean;
  transportSync: WorkTransportSync;
  threadSync: WorkProjectionSync;
  workSync: WorkProjectionSync;
  canvasSync: CanvasSync;
  issue: string | null;
};

export function createWorkProtocolState(
  ventureId: string,
  cached?: Pick<WorkProtocolState, "cursor" | "threads" | "work"> & { projectionRevision?: number },
): WorkProtocolState {
  return {
    ventureId,
    serverInstanceId: null,
    cursor: cached?.cursor ?? 0,
    targetCursor: cached?.cursor ?? 0,
    projectionRevision: Math.max(
      cached?.projectionRevision ?? 0,
      cached?.work?.revision ?? 0,
      ...Object.values(cached?.threads ?? {}).map((thread) => thread.revision),
    ),
    threads: cached?.threads ?? {},
    work: cached?.work ?? null,
    pending: {},
    threadCoverageComplete: !cached || Object.keys(cached.threads).length === 0,
    transportSync: "connecting",
    threadSync: cached && Object.keys(cached.threads).length ? "stale" : "loading",
    workSync: cached?.work ? "stale" : "loading",
    canvasSync: "polling",
    issue: null,
  };
}

function schemaIsCompatible(handshake: WorkHandshake) {
  return handshake.schemaVersion >= WORK_PROTOCOL_SCHEMA_VERSION
    && handshake.minCompatibleSchemaVersion <= WORK_PROTOCOL_SCHEMA_VERSION;
}

function validInteger(value: number) {
  return Number.isSafeInteger(value) && value >= 0;
}

function snapshotIsCurrent(state: WorkProtocolState, snapshot: WorkProtocolSnapshot) {
  if (snapshot.ventureId !== state.ventureId || !validInteger(snapshot.cursor)) return false;
  if (snapshot.cursor < state.cursor) return false;
  if (snapshot.work && state.work && snapshot.work.revision < state.work.revision) return false;
  return snapshot.threads.every((candidate) => {
    const current = state.threads[candidate.threadRef];
    return !current || candidate.revision >= current.revision;
  });
}

function applySnapshot(state: WorkProtocolState, snapshot: WorkProtocolSnapshot): WorkProtocolState {
  if (!snapshotIsCurrent(state, snapshot)) {
    return {
      ...state,
      transportSync: "degraded",
      threadSync: Object.keys(state.threads).length ? "stale" : "loading",
      workSync: state.work ? "stale" : "loading",
      issue: "Croki rejected an older or mismatched Work snapshot.",
    };
  }
  // A venture subscription may carry no focused Thread, while a Thread-scoped subscription carries
  // only that one Thread. Preserve other last-coherent Thread entries and replace only projections
  // the coherent snapshot actually owns.
  const threads = {
    ...state.threads,
    ...Object.fromEntries(snapshot.threads.map((thread) => [thread.threadRef, thread])),
  };
  const covered = new Set(snapshot.threads.map((thread) => thread.threadRef));
  const threadCoverageComplete = Object.keys(state.threads).every((threadRef) => covered.has(threadRef));
  return {
    ...state,
    cursor: snapshot.cursor,
    targetCursor: Math.max(state.targetCursor, snapshot.cursor),
    threads,
    work: snapshot.work,
    pending: {},
    threadCoverageComplete,
    threadSync: "current",
    workSync: "current",
    issue: null,
  };
}

export function foldWorkHandshake(
  state: WorkProtocolState,
  handshake: WorkHandshake,
): WorkProtocolState {
  if (handshake.ventureId !== state.ventureId) return state;
  if (!schemaIsCompatible(handshake)) {
    return {
      ...state,
      transportSync: "incompatible",
      threadSync: Object.keys(state.threads).length ? "stale" : "loading",
      workSync: state.work ? "stale" : "loading",
      issue: "This Croki Work stream uses an incompatible protocol version.",
    };
  }
  if (!validInteger(handshake.currentCursor)) {
    return { ...state, transportSync: "degraded", issue: "Croki received an invalid Work cursor." };
  }

  let next: WorkProtocolState = {
    ...state,
    serverInstanceId: handshake.serverInstanceId,
    targetCursor: Math.max(state.cursor, handshake.currentCursor),
    projectionRevision: Number.isSafeInteger(handshake.projectionRevision)
      ? Math.max(state.projectionRevision, Number(handshake.projectionRevision))
      : state.projectionRevision,
    transportSync: "live" as const,
    issue: null,
  };
  if (handshake.delivery === "snapshot") {
    if (!handshake.snapshot || handshake.snapshot.cursor !== handshake.currentCursor) {
      return {
        ...next,
        transportSync: "degraded",
        issue: "Croki did not receive the coherent Work snapshot it requested.",
      };
    }
    next = applySnapshot(next, handshake.snapshot);
  } else {
    // A contiguous resume starts at the exact cursor represented by the coherent cache.
    next = { ...next, threadCoverageComplete: true };
  }
  const caughtUp = next.cursor >= next.targetCursor;
  return {
    ...next,
    threadSync: caughtUp
      ? (next.threadCoverageComplete ? "current" : "stale")
      : (Object.keys(next.threads).length ? "catching-up" : "loading"),
    workSync: caughtUp ? "current" : (next.work ? "catching-up" : "loading"),
  };
}

function validPush(state: WorkProtocolState, push: WorkPush) {
  if (push.schemaVersion !== WORK_PROTOCOL_SCHEMA_VERSION) return false;
  if (push.ventureId !== state.ventureId) return false;
  if (!validInteger(push.sequence) || !validInteger(push.projectionRevision)) return false;
  if (push.projection === "thread") {
    return push.threadRef.length > 0
      && push.value.ventureId === state.ventureId
      && push.value.thread.threadRef === push.threadRef;
  }
  if (push.projection === "work") return push.value.ventureId === state.ventureId;
  if (push.projection === "bundle") {
    return push.work.ventureId === state.ventureId
      && (!push.thread || push.thread.ventureId === state.ventureId);
  }
  return true;
}

function applyContiguousPush(state: WorkProtocolState, push: WorkPush): WorkProtocolState {
  if (push.projection === "thread") {
    const current = state.threads[push.threadRef];
    const threads = current && current.revision >= push.projectionRevision
      ? state.threads
      : {
        ...state.threads,
        [push.threadRef]: {
          threadRef: push.threadRef,
          revision: push.projectionRevision,
          value: push.value,
        },
      };
    return {
      ...state,
      cursor: push.sequence,
      projectionRevision: Math.max(state.projectionRevision, push.projectionRevision),
      threads,
    };
  }
  if (push.projection === "work") {
    const work = state.work && state.work.revision >= push.projectionRevision
      ? state.work
      : { revision: push.projectionRevision, value: push.value };
    return {
      ...state,
      cursor: push.sequence,
      projectionRevision: Math.max(state.projectionRevision, push.projectionRevision),
      work,
    };
  }
  if (push.projection === "bundle") {
    const work = state.work && state.work.revision >= push.projectionRevision
      ? state.work
      : { revision: push.projectionRevision, value: push.work };
    if (!push.thread) {
      return {
        ...state,
        cursor: push.sequence,
        projectionRevision: Math.max(state.projectionRevision, push.projectionRevision),
        work,
      };
    }
    const threadRef = push.thread.thread.threadRef;
    const current = state.threads[threadRef];
    const threads = current && current.revision >= push.projectionRevision
      ? state.threads
      : {
        ...state.threads,
        [threadRef]: {
          threadRef,
          revision: push.projectionRevision,
          value: push.thread,
        },
      };
    return {
      ...state,
      cursor: push.sequence,
      projectionRevision: Math.max(state.projectionRevision, push.projectionRevision),
      threads,
      work,
    };
  }
  return {
    ...state,
    cursor: push.sequence,
    projectionRevision: Math.max(state.projectionRevision, push.projectionRevision),
  };
}

export function foldWorkPush(state: WorkProtocolState, push: WorkPush): WorkProtocolState {
  if (!validPush(state, push)) return state;
  if (push.sequence <= state.cursor) return state;

  if (push.sequence > state.cursor + 1) {
    if (Object.keys(state.pending).length >= MAX_BUFFERED_WORK_FRAMES) {
      return {
        ...state,
        transportSync: "degraded",
        threadSync: Object.keys(state.threads).length ? "stale" : "loading",
        workSync: state.work ? "stale" : "loading",
        issue: "The Work stream fell outside its bounded reorder window.",
      };
    }
    return {
      ...state,
      targetCursor: Math.max(state.targetCursor, push.sequence),
      pending: { ...state.pending, [push.sequence]: push },
      threadSync: Object.keys(state.threads).length ? "catching-up" : "loading",
      workSync: state.work ? "catching-up" : "loading",
    };
  }

  let next = applyContiguousPush(state, push);
  const pending = { ...next.pending };
  delete pending[push.sequence];
  while (pending[next.cursor + 1]) {
    const contiguous = pending[next.cursor + 1];
    delete pending[next.cursor + 1];
    next = applyContiguousPush(next, contiguous);
  }
  const targetCursor = Math.max(next.targetCursor, next.cursor);
  const caughtUp = next.cursor >= targetCursor;
  return {
    ...next,
    targetCursor,
    pending,
    threadSync: caughtUp
      ? (next.threadCoverageComplete ? "current" : "stale")
      : (Object.keys(next.threads).length ? "catching-up" : "loading"),
    workSync: caughtUp ? "current" : (next.work ? "catching-up" : "loading"),
    issue: null,
  };
}

export function seedThreadProjection(
  state: WorkProtocolState,
  timeline: ThreadTimeline,
): WorkProtocolState {
  if (timeline.ventureId !== state.ventureId) return state;
  const threadRef = timeline.thread.threadRef;
  const current = state.threads[threadRef];
  // A REST payload's semantic revision is not a Work projection revision. Seeding that number into the
  // ordered slot can make a later legitimate push look old. A direct read is current at the ordered
  // revision already observed by this client; while live, the stream still owns equal-revision facts.
  if (current && (current.revision > state.projectionRevision
    || (current.revision === state.projectionRevision && state.transportSync === "live"))) return state;
  return {
    ...state,
    threadCoverageComplete: true,
    threads: {
      ...state.threads,
      [threadRef]: { threadRef, revision: state.projectionRevision, value: timeline },
    },
  };
}

export function seedWorkProjection(
  state: WorkProtocolState,
  workIndex: WorkIndex,
): WorkProtocolState {
  if (workIndex.ventureId !== state.ventureId) return state;
  if (state.work && (state.work.revision > state.projectionRevision
    || (state.work.revision === state.projectionRevision && state.transportSync === "live"))) return state;
  return { ...state, work: { revision: state.projectionRevision, value: workIndex } };
}
