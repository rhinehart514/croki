// Desktop binding for the Work protocol. This is intentionally beside WorkIndex rather than the
// semantic-model store: Product/Canvas remain authoritative in their existing store and transport.

import crypto from "node:crypto";

import { buildThreadTimeline } from "./thread-timeline.mjs";
import { subscribeFirmEvents } from "./firm-events.mjs";
import { buildWorkIndex } from "./work-index.mjs";
import { listVentures, openVenture, venturePersistence } from "./venture-store.mjs";
import {
  createWorkProtocol,
  WORK_PROTOCOL_SCHEMA_VERSION,
} from "./work-protocol.mjs";

const COLLECTION = "workProtocol";
const STATE_KEY = "transport";
const eventSubscriptions = new Map();

function projectionFor(ventureId, { threadId = null, runId = null } = {}) {
  const workIndex = buildWorkIndex(ventureId);
  let exactThreadId = String(threadId ?? "").replace(/^thread:/, "") || null;
  if (!exactThreadId && runId) {
    const runRef = `run:${String(runId).replace(/^run:/, "")}`;
    exactThreadId = String(workIndex.items.find((item) => item.runRefs?.includes(runRef))?.threadRef ?? "")
      .replace(/^thread:/, "") || null;
  }
  let timeline = null;
  if (exactThreadId) {
    try { timeline = buildThreadTimeline(ventureId, exactThreadId); } catch { /* a deleted Thread has no timeline */ }
  }
  return {
    ventureId,
    workIndex,
    timeline,
  };
}

function loadState(ventureId) {
  return venturePersistence({}, ventureId).get(COLLECTION, STATE_KEY);
}

// All mutation is a synchronous venture-local CAS. The cursor therefore survives a Brain restart and
// two near-simultaneous publishers can never stamp the same sequence.
function mutateState(ventureId, mutate) {
  const provider = venturePersistence({}, ventureId);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const stored = provider.get(COLLECTION, STATE_KEY);
    const state = {
      revision: Number.isInteger(stored?.revision) ? stored.revision : 0,
      sequence: Number.isInteger(stored?.sequence) ? stored.sequence : 0,
      projectionRevision: Number.isInteger(stored?.projectionRevision) ? stored.projectionRevision : 0,
      retained: Array.isArray(stored?.retained) ? structuredClone(stored.retained) : [],
      commands: Array.isArray(stored?.commands) ? structuredClone(stored.commands) : [],
      updatedAt: stored?.updatedAt ?? null,
    };
    const result = mutate(state);
    state.revision += 1;
    if (!stored) {
      const inserted = provider.setIfAbsent(COLLECTION, STATE_KEY, state);
      if (inserted.inserted) return result;
      continue;
    }
    try {
      provider.compareAndSet(COLLECTION, STATE_KEY, stored.revision, state);
      return result;
    } catch (error) {
      if (error?.code !== "PERSISTENCE_CONFLICT") throw error;
    }
  }
  throw Object.assign(new Error("Work protocol state remained busy; retry the command."), {
    code: "work_protocol_busy",
    status: 409,
  });
}

export const desktopWorkProtocol = createWorkProtocol({
  serverInstanceId: crypto.randomUUID(),
  loadState,
  mutateState,
  project: projectionFor,
  assertScope: (ventureId) => {
    if (!openVenture(ventureId)) {
      throw Object.assign(new Error(`No such venture: ${ventureId}`), {
        code: "venture_not_found",
        status: 404,
      });
    }
  },
});

function threadIdFor(event) {
  return String(event?.threadRef ?? "").replace(/^thread:/, "") || null;
}

function publishFirmChange(event) {
  // Provider text/tool-input tokens have their own per-Run stream. The old one-second `drive`
  // fallback ping is deliberately ignored here, so it cannot trigger a WorkIndex rebuild.
  if (event.kind === "drive" || event.kind === "system") return;
  // Factual activity deltas keep riding the existing venture stream. Advancing the ordered cursor with
  // a projection the renderer intentionally ignores would create an artificial gap.
  if (event.kind === "work-delta" && event.delta?.type !== "status-changed") return;
  const threadId = threadIdFor(event);
  const projected = projectionFor(event.ventureId, { threadId });
  // One durable event becomes one durable frame. Persisting Work and Thread as separate frames would
  // let a Brain exit between them expose a newer Work cursor with an older Thread projection.
  desktopWorkProtocol.publish({
    ventureId: event.ventureId,
    ...(threadId ? { threadId } : {}),
    projection: "bundle",
    kind: event.kind === "work-delta" ? "status-changed" : `${event.kind}-changed`,
    payload: {
      workIndex: projected.workIndex,
      timeline: projected.timeline,
    },
  });
}

function retainFirmBridge(ventureId) {
  const known = eventSubscriptions.get(ventureId);
  if (known) return;
  eventSubscriptions.set(ventureId, {
    stop: subscribeFirmEvents(ventureId, publishFirmChange),
  });
}

export function subscribeToWork(input, listener) {
  const ventureId = String(input?.ventureId ?? "").trim();
  retainFirmBridge(ventureId);
  return desktopWorkProtocol.subscribe({
    ...input,
    schemaVersion: input?.schemaVersion ?? WORK_PROTOCOL_SCHEMA_VERSION,
  }, listener);
}

export function acceptDesktopWorkCommand(command, handler) {
  return desktopWorkProtocol.acceptCommand(command, handler);
}

export function workHandshake(input) {
  return desktopWorkProtocol.handshake({
    ...input,
    schemaVersion: input?.schemaVersion ?? WORK_PROTOCOL_SCHEMA_VERSION,
  });
}

export function __resetDesktopWorkProtocolSubscriptions() {
  for (const entry of eventSubscriptions.values()) entry.stop();
  eventSubscriptions.clear();
}

// A renderer crash must not pause cursor capture while the supervised Brain keeps running. Existing
// ventures are bridged as the Brain loads; newly created ventures attach on their first subscription
// and remain attached for this Brain instance.
for (const venture of listVentures()) retainFirmBridge(venture.id);
