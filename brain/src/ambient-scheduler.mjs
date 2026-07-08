// In-process ambient heartbeat.
//
// Drives the SAME two due-work functions the manual POST /api/operator/ambient/tick route calls,
// on a fixed interval, so promoted motions actually re-fire and ambient briefs actually wake without
// an external cron. The manual route stays as the external/manual hook — this file does not touch it.
//
// SAFETY: this only DRIVES / STAGES standing work — it never sends, publishes, or approves. Every due
// item still stops at the founder gate exactly as it would from a manual tick. There is deliberately
// no send path here.
//
// The timer is started ONLY when startAmbientScheduler() is explicitly called by the integrator
// (inside server.listen). Importing this module spins no timer.

import { runDueAmbientTicks } from "./operator-runtime.mjs";
import { runDueMotions } from "./promote-motion.mjs";

const DEFAULT_TICK_MS = 5 * 60 * 1000; // every 5 minutes

// One live timer across the process, so a double start is idempotent.
let active = null;

function resolveIntervalMs(options) {
  if (typeof options.intervalMs === "number") return options.intervalMs;
  const raw = process.env.GTM_IDE_AMBIENT_TICK_MS;
  if (raw !== undefined && raw !== "") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return DEFAULT_TICK_MS;
}

function isDisabled(intervalMs) {
  // Explicit opt-outs: kill switch, zero/negative cadence.
  if (process.env.GTM_IDE_DISABLE_AMBIENT === "1") return true;
  if (!(intervalMs > 0)) return true;
  return false;
}

/**
 * Start the in-process ambient heartbeat.
 *
 * On each tick it calls the two due-work drivers independently — a throw in one never breaks the loop
 * or the process, and neither keeps the process alive (timer is unref'd). When nothing is due the
 * underlying functions no-op, so an idle heartbeat is cheap.
 *
 * @param {{ intervalMs?: number }} [options]
 * @returns {{ stop(): void }} handle whose stop() clears the timer (no-op if never started / already stopped)
 */
export function startAmbientScheduler(options = {}) {
  const intervalMs = resolveIntervalMs(options);

  // Opt-out: return a no-op handle and start no timer.
  if (isDisabled(intervalMs)) {
    return { stop() {} };
  }

  // Idempotent: a second start returns a handle onto the one already-live timer.
  if (active) return active;

  const timer = setInterval(() => {
    // DRIVE/STAGE only — never sends, never approves. Each driver is isolated so one throw can't stall
    // the heartbeat.
    try {
      runDueAmbientTicks();
    } catch {}
    try {
      runDueMotions();
    } catch {}
  }, intervalMs);

  // Never keep the process alive for the heartbeat — tests and CLI exit clean.
  if (typeof timer.unref === "function") timer.unref();

  const handle = {
    stop() {
      if (active === handle) {
        clearInterval(timer);
        active = null;
      }
    },
  };
  active = handle;
  return handle;
}
