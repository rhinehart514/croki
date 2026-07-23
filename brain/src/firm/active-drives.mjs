import crypto from "node:crypto";
import { emitFirmEvent } from "./firm-events.mjs";

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
    // A process-local presence pointer: true when a founder steer arrived for this effort while the
    // drive is running. The durable queue (work-loop-steer.mjs, on the effort's work record) is the
    // truth the resume reads; this only lets a live drive/UI honestly say "a steer will apply next step."
    steerPending: entry.steerPending === true,
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
    lastBeatAt: new Date().toISOString(),
    activity: "Starting work",
    liveText: "",
    steerPending: false,
    controller,
  };
  active.set(entry.id, entry);
  emitFirmEvent(ventureId, "drive", { betId });
  return {
    ...publicDrive(entry),
    signal: controller.signal,
    finish: () => { active.delete(entry.id); emitFirmEvent(ventureId, "drive", { betId }); },
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

// Append the newest slice of the assistant's forming reply to a live drive so the founder watches it
// stream, mirroring `noteDriveBeat`'s process-local presence. The buffer is capped so a very long reply
// cannot grow without bound, and it always grows on every call so the read model sees the full reply.
// The refetch ping is throttled here (onText fires many times a second) so the transcript streams smoothly
// without a refetch storm. The drive's own `finish()` drops the buffer when work settles, at which point
// the durable conversation message takes over. Best-effort and no-op once the drive is gone.
export function noteDriveText(driveId, text, { now = Date.now } = {}) {
  const entry = active.get(driveId);
  if (!entry) return null;
  const addition = String(text ?? "");
  if (!addition) return publicDrive(entry);
  entry.liveText = (entry.liveText + addition).slice(-8_000);
  entry.lastBeatAt = new Date().toISOString();
  const at = now();
  if (at - (entry.lastTextEmitAt ?? 0) >= 120) {
    entry.lastTextEmitAt = at;
    emitFirmEvent(entry.ventureId, "drive", { betId: entry.betId });
  }
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

export function __resetActiveDrives() {
  for (const entry of active.values()) entry.controller.abort();
  active.clear();
}
