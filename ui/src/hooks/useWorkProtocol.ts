import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { ThreadTimeline, WorkIndex } from "@/api/work";
import {
  WORK_PROTOCOL_SCHEMA_VERSION,
  createWorkProtocolState,
  foldWorkHandshake,
  foldWorkPush,
  seedThreadProjection,
  seedWorkProjection,
  type CanvasSync,
  type WorkProtocolState,
  type WorkSubscriptionRequest,
} from "@/api/work-protocol";
import { normalizeDesktopWorkFrame } from "@/api/work-protocol-bridge";
import { readWorkProtocolCache, writeWorkProtocolCache } from "@/api/work-protocol-cache";
import { noteWorkProjectionRevision } from "@/api/transport";

type WorkFrameListener = (frame: DroverWorkFrame) => void;
type WorkSubscriber = (
  input: WorkSubscriptionRequest,
  listener: WorkFrameListener,
) => Promise<() => void>;
type StateListener = () => void;

const GAP_REPAIR_MS = 300;

export type WorkProtocolClient = {
  getSnapshot: () => WorkProtocolState;
  subscribe: (listener: StateListener) => () => void;
  seedThread: (timeline: ThreadTimeline) => void;
  seedWork: (workIndex: WorkIndex) => void;
  setCanvasSync: (sync: CanvasSync) => void;
};

export function createWorkProtocolClient(
  ventureId: string,
  subscriber: WorkSubscriber | null,
  gapRepairMs = GAP_REPAIR_MS,
  threadId?: string,
): WorkProtocolClient {
  let state = createWorkProtocolState(
    ventureId,
    readWorkProtocolCache(ventureId, threadId) ?? undefined,
  );
  let stopRemote: (() => void) | null = null;
  let generation = 0;
  let gapTimer: ReturnType<typeof setTimeout> | null = null;
  const listeners = new Set<StateListener>();

  const emit = (next: WorkProtocolState) => {
    if (next === state) return;
    state = next;
    noteWorkProjectionRevision(ventureId, state.projectionRevision);
    writeWorkProtocolCache(state, threadId);
    for (const listener of listeners) listener();
  };

  const cancelGapRepair = () => {
    if (gapTimer) clearTimeout(gapTimer);
    gapTimer = null;
  };

  const start = () => {
    cancelGapRepair();
    stopRemote?.();
    stopRemote = null;
    const currentGeneration = ++generation;
    if (!subscriber) {
      emit({
        ...state,
        transportSync: "degraded",
        threadSync: Object.keys(state.threads).length ? "stale" : "loading",
        workSync: state.work ? "stale" : "loading",
        issue: "The ordered Work stream is unavailable outside the desktop host.",
      });
      return;
    }
    emit({ ...state, transportSync: "connecting", issue: null });
    const request = {
      schemaVersion: WORK_PROTOCOL_SCHEMA_VERSION,
      ventureId,
      ...(threadId ? { threadId: threadId.replace(/^thread:/, "") } : {}),
      cursor: state.cursor,
    } satisfies WorkSubscriptionRequest;
    void subscriber(request, (desktopFrame) => {
      if (currentGeneration !== generation || listeners.size === 0) return;
      const frame = normalizeDesktopWorkFrame(desktopFrame, ventureId);
      if (!frame) return;
      const next = frame.frame === "handshake"
        ? foldWorkHandshake(state, frame)
        : foldWorkPush(state, frame);
      emit(next);
      if (Object.keys(next.pending).length === 0) {
        cancelGapRepair();
      } else if (!gapTimer) {
        gapTimer = setTimeout(() => {
          gapTimer = null;
          if (listeners.size > 0) start();
        }, gapRepairMs);
      }
    }).then((stop) => {
      if (currentGeneration !== generation || listeners.size === 0) stop();
      else stopRemote = stop;
    }).catch((error) => {
      if (currentGeneration !== generation || listeners.size === 0) return;
      emit({
        ...state,
        transportSync: "degraded",
        threadSync: Object.keys(state.threads).length ? "stale" : "loading",
        workSync: state.work ? "stale" : "loading",
        issue: error instanceof Error ? error.message : "The ordered Work stream disconnected.",
      });
    });
  };

  return {
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      if (listeners.size === 1) start();
      return () => {
        listeners.delete(listener);
        if (listeners.size > 0) return;
        generation += 1;
        cancelGapRepair();
        stopRemote?.();
        stopRemote = null;
      };
    },
    seedThread: (timeline) => emit(seedThreadProjection(state, timeline)),
    seedWork: (workIndex) => emit(seedWorkProjection(state, workIndex)),
    setCanvasSync: (canvasSync) => emit({ ...state, canvasSync }),
  };
}

const clients = new Map<string, WorkProtocolClient>();

function desktopWorkSubscriber(): WorkSubscriber | null {
  const subscribeWork = window.droverDesktop?.api?.subscribeWork;
  if (!subscribeWork) return null;
  return (input, listener) => subscribeWork(input, listener);
}

function clientFor(ventureId: string, threadRef?: string | null) {
  const key = `${ventureId}\u0000${threadRef ?? ""}`;
  let client = clients.get(key);
  if (!client) {
    client = createWorkProtocolClient(
      ventureId,
      desktopWorkSubscriber(),
      GAP_REPAIR_MS,
      threadRef ?? undefined,
    );
    clients.set(key, client);
  }
  return client;
}

export function clearWorkProtocolClientsForTests() {
  clients.clear();
}

export function useWorkProtocol(ventureId: string, threadRef?: string | null) {
  const client = useMemo(() => clientFor(ventureId, threadRef), [threadRef, ventureId]);
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  const seedThread = useCallback((timeline: ThreadTimeline) => client.seedThread(timeline), [client]);
  const seedWork = useCallback((workIndex: WorkIndex) => client.seedWork(workIndex), [client]);
  const setCanvasSync = useCallback((sync: CanvasSync) => client.setCanvasSync(sync), [client]);
  return { ...state, seedThread, seedWork, setCanvasSync };
}
