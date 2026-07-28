// work-loop-steer.mjs — the checkpoint steer seam (build contract §2.7, Phase 5). A founder reply the
// dialogue classifier reads as `steer` (dialogue-act.mjs) does NOT interrupt a running drive token-by-
// token (true interruption is out of scope and honestly named). Instead it is enqueued here and folded
// into the NEXT resume's brief. The founder-facing truth is "this adjusts on the next step," never a
// fake real-time interrupt.
//
// This lands in its OWN sibling module (never in work-loop.mjs, which is already over the service
// ceiling — invariant §5.7). It owns two tiny operations: enqueue a steer note onto an effort, and
// drain the pending notes into a resume-brief string. The queue is DURABLE (persisted on the effort's
// own work record), so a steer reaches the next run even across a brain restart or when no drive is
// currently live — that is what makes "adjusts on the next step" real rather than dependent on a live,
// process-local drive being up at the moment the founder speaks.
//
// active-drives.mjs also carries a process-local pendingSteer pointer for a LIVE drive (a presence fact,
// not truth) so a running drive can surface "a steer is waiting" without reloading the store; this
// module is the durable half the resume actually reads from.

import { getVentureDoc, setVentureDoc, now } from "./venture-store.mjs";
import { notePendingSteer } from "./active-drives.mjs";
import { drainQueuedFounderTurns } from "./founder-turn-queue.mjs";

function trimOrNull(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

// The durable queue lives on the effort's own work record — the same `{ runtimeSessionId, stepCount,
// spentUsd, pausedFor }` record every drive already loads and checkpoints. A steer note is
// { text, at, fromMessageId }. Capped so a chatty founder never grows the bet file without bound.
const MAX_PENDING_STEER = 20;

// enqueueSteer — a founder steer addressed to an effort. Persists it onto the effort's work record so
// the next drive folds it in, and (best-effort) notes it on any live process-local drive so a running
// drive can surface "a steer is waiting." Returns the stored note.
export function enqueueSteer({ ventureId, betId, text, fromMessageId = null } = {}, options = {}) {
  const venture = trimOrNull(ventureId);
  const bet = trimOrNull(betId);
  const note = trimOrNull(text);
  if (!venture) throw new Error("enqueueSteer() needs a ventureId.");
  if (!bet) throw new Error("enqueueSteer() needs a betId — a steer is always addressed to an effort.");
  if (!note) throw new Error("enqueueSteer() needs steer text.");

  const record = getVentureDoc(venture, "bets", bet, options);
  if (!record) throw new Error(`No such effort to steer: ${bet}`);
  const work = record.work && typeof record.work === "object" ? record.work : {};
  const pending = Array.isArray(work.pendingSteer) ? work.pendingSteer : [];
  const stored = { text: note, at: now(), fromMessageId: trimOrNull(fromMessageId) };
  const nextPending = [...pending, stored].slice(-MAX_PENDING_STEER);
  setVentureDoc(venture, "bets", bet, {
    ...record,
    work: { ...work, pendingSteer: nextPending },
    updatedAt: now(),
  }, options);

  // Best-effort live pointer: if a drive on this effort is running right now, mark that a steer is
  // waiting so the UI can honestly say "will adjust on the next step." Never fatal.
  try {
    notePendingSteer({ ventureId: venture, betId: bet });
  } catch { /* the durable queue above is the truth; the live pointer is a convenience */ }

  return stored;
}

// pendingSteerFor — the notes currently queued on an effort, without draining them (a read for the UI /
// a resume brief builder that wants to peek).
export function pendingSteerFor(ventureId, betId, options = {}) {
  const record = getVentureDoc(trimOrNull(ventureId), "bets", trimOrNull(betId), options);
  const pending = record?.work?.pendingSteer;
  return Array.isArray(pending) ? pending : [];
}

// drainSteer — take and CLEAR the pending steer notes for an effort, returning a single brief string to
// fold into the resume prompt (or null when nothing is queued). Called at a resume checkpoint by the
// work loop so the steer reaches exactly one next run, then is cleared. Draining is a store write, so it
// is idempotent across a crash: a steer already folded into a resume is gone from the queue.
export function drainSteer({ ventureId, betId } = {}, options = {}) {
  const venture = trimOrNull(ventureId);
  const bet = trimOrNull(betId);
  if (!venture || !bet) return null;
  const record = getVentureDoc(venture, "bets", bet, options);
  const work = record?.work && typeof record.work === "object" ? record.work : null;
  const pending = Array.isArray(work?.pendingSteer) ? work.pendingSteer : [];
  if (!pending.length) return null;
  setVentureDoc(venture, "bets", bet, {
    ...record,
    work: { ...work, pendingSteer: [] },
    updatedAt: now(),
  }, options);
  const lines = pending.map((note) => `- ${note.text}`).join("\n");
  return `The founder steered this work while it ran (applies from this step forward):\n${lines}`;
}

export function drainFounderContext({ ventureId, betId } = {}, options = {}) {
  const steer = drainSteer({ ventureId, betId }, options);
  const followUps = drainQueuedFounderTurns({ ventureId, betId }, options);
  return [steer, followUps].filter(Boolean).join("\n\n") || null;
}
