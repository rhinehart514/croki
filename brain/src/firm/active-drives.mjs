import crypto from "node:crypto";

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
  };
}

export function beginActiveDrive({ ventureId, teammateRef, betId = null, runtime, abortSupported, architectureRevision = null }) {
  const controller = new AbortController();
  const entry = {
    id: `drive-${crypto.randomUUID()}`,
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
    lastBeatAt: null,
    controller,
  };
  active.set(entry.id, entry);
  return {
    ...publicDrive(entry),
    signal: controller.signal,
    finish: () => active.delete(entry.id),
  };
}

// A live causal pointer, not venture truth. The stage id is minted by workflow-projection's shared
// helper at the same seam that appends the event; a restart correctly drops this presence fact.
export function noteDriveBeat(driveId, { currentStageId, at } = {}) {
  const entry = active.get(driveId);
  if (!entry) return null;
  const stageId = String(currentStageId ?? "").trim();
  if (!stageId) return publicDrive(entry);
  entry.currentStageId = stageId;
  entry.lastBeatAt = String(at ?? "").trim() || new Date().toISOString();
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

export function __resetActiveDrives() {
  for (const entry of active.values()) entry.controller.abort();
  active.clear();
}
