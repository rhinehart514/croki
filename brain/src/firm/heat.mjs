// heat.mjs — the always-on firm (FIRM-SPEC.md firm rail #7: "The firm's heat is one founder dial.
// How hard the inward loop runs — and what it may spend — is a single founder-owned setting with a
// spend rail. It never becomes a scheduler config surface.").
//
// ONE dial (heat: off | steady | full) + ONE spend rail (dailySpendUsd), both venture-scoped and
// founder-writable only. ambient-scheduler.mjs's createTickBudget triad (maxScorerPerTick,
// dailyProbeCap, motionProbeCadenceMs) does NOT get a second life here as three more knobs — the one
// HEAT_TICK_SHAPE table below is the only place that triad's shape survives, folded into what each
// heat word means internally. A caller never sets maxWakesPerTick directly; they set heat.
//
// The tick wakes teammates on live bets that have a next inward move — every wake is an ordinary
// driveTeammate (F2) call, so everything outward still parks at the wall (F3) exactly as a founder-
// initiated drive would. This file adds no new door past the wall; it only decides WHEN driveTeammate
// runs unattended. Away changes nothing here: the scheduler never reads presence (FIRM-SPEC.md: "the
// scheduler never reads presence to decide inward work"; away-safety is the wall's own construction —
// decide({decision:"release"}) already refuses a release while away, so an away-parked item just
// waits, same as a founder-initiated drive's parked item would).
//
// The spend rail durably tracks dollars per UTC calendar day (ports ambient-scheduler.mjs's
// probe-ledger pattern verbatim: read/write through persistence.mjs directly, survives restart, resets
// at UTC midnight with no cleanup needed). Only the Claude Code adapter reports real dollars
// (work.spentUsd, via ctx.onCost); a Codex-routed or cost-silent drive is NOT free — it is charged
// against the rail at a conservative flat per-drive estimate, so an unmeasured drive can never look
// like it cost nothing.

import {
  getVentureDoc,
  setVentureDoc,
  listVentures,
  listVentureDocs,
  openVenture,
} from "./venture-store.mjs";
import { positionOf } from "./bet.mjs";
import { queue as loadWallQueue } from "./wall.mjs";
import { authorizeFounderWriteForRequest } from "../routes/session-guard.mjs";

export const HEAT_LEVELS = Object.freeze(["off", "steady", "full"]);
const DEFAULT_HEAT = "off";
const DEFAULT_DAILY_SPEND_USD = 0;

// The one place the retired maxScorerPerTick/dailyProbeCap/motionProbeCadenceMs triad's shape survives
// (ambient-scheduler.mjs:102-138) — folded into what each heat word means, never exposed as separate
// tunables. "off" wakes nothing; "steady" and "full" differ only in how many bets one tick wakes.
const HEAT_TICK_SHAPE = Object.freeze({
  off: { maxWakesPerTick: 0 },
  steady: { maxWakesPerTick: 2 },
  full: { maxWakesPerTick: 8 },
});

// A conservative flat estimate for a drive whose real cost the runtime can't report (only Claude
// Code's ctx.onCost carries real dollars — Codex reports none). Charged against the rail so an
// unmeasured drive is accounted as spending, never as free.
const UNMEASURED_DRIVE_ESTIMATE_USD = 0.25;

const HEAT_KEY = "heat";
const SPEND_KEY = "spend";

function utcDayKey(nowMs) {
  return new Date(nowMs).toISOString().slice(0, 10); // YYYY-MM-DD
}

// ── The one dial + the one spend rail ───────────────────────────────────────────────────────────────

// The venture's heat settings, or the honest defaults (off, $0/day) for a venture that has never set
// one — a fresh venture never runs unattended until the founder deliberately turns the dial.
export function getHeatSettings(ventureId, options = {}) {
  const stored = getVentureDoc(ventureId, "settings", HEAT_KEY, options);
  return {
    heat: HEAT_LEVELS.includes(stored?.heat) ? stored.heat : DEFAULT_HEAT,
    dailySpendUsd: Number.isFinite(Number(stored?.dailySpendUsd)) && Number(stored.dailySpendUsd) >= 0
      ? Number(stored.dailySpendUsd)
      : DEFAULT_DAILY_SPEND_USD,
  };
}

// Founder-only write of the one dial + one rail — the same two-factor boundary every other founder
// write in this tree stands on (browser-only session; an x-gtm-actor: agent stamp is refused), so a
// model or MCP caller can never turn its own heat up. Fails closed on an unknown venture — matching
// every other venture-scoped write in this tree (venture-store.mjs's own assertVentureExists,
// product-routes.mjs's assertWorkspaceInVenture) — rather than silently writing heat for a venture
// that doesn't exist.
export function setHeatSettings({ ventureId, heat, dailySpendUsd }, auth = {}, options = {}) {
  authorizeFounderWriteForRequest(auth?.req, "Setting the firm's heat");
  if (!openVenture(ventureId, options)) {
    const error = new Error(`No such venture: ${ventureId}`);
    error.code = "venture_not_found";
    throw error;
  }
  if (!HEAT_LEVELS.includes(heat)) {
    throw new Error(`heat must be one of ${HEAT_LEVELS.join(", ")} — got ${heat}.`);
  }
  const spend = Number(dailySpendUsd);
  if (!Number.isFinite(spend) || spend < 0) {
    throw new Error("dailySpendUsd must be a non-negative number.");
  }
  const settings = { id: HEAT_KEY, heat, dailySpendUsd: spend, updatedAt: new Date().toISOString() };
  setVentureDoc(ventureId, "settings", HEAT_KEY, settings, options);
  return settings;
}

// ── The durable per-UTC-day spend ledger (ports ambient-scheduler.mjs's probe-ledger pattern) ─────────

function readSpendLedger(ventureId, nowMs, options) {
  const day = utcDayKey(nowMs);
  let stored = null;
  try {
    stored = getVentureDoc(ventureId, "settings", SPEND_KEY, options);
  } catch {
    stored = null;
  }
  const spent = stored && stored.day === day && Number.isFinite(Number(stored.spentUsd)) ? Number(stored.spentUsd) : 0;
  return { day, spentUsd: spent >= 0 ? spent : 0 };
}

function writeSpendLedger(ventureId, day, spentUsd, options) {
  try {
    setVentureDoc(
      ventureId,
      "settings",
      SPEND_KEY,
      { id: SPEND_KEY, day, spentUsd, updatedAt: new Date().toISOString() },
      options,
    );
  } catch {
    /* the ledger is best-effort — a write failure never breaks a tick */
  }
}

// Charges a drive's real (or, when unmeasured, conservatively estimated) cost against today's ledger.
// Exported standalone so tests can assert the ledger directly without driving a fake teammate.
export function chargeHeatSpend(ventureId, usd, { nowMs = Date.now(), options = {} } = {}) {
  const ledger = readSpendLedger(ventureId, nowMs, options);
  const spentUsd = ledger.spentUsd + (Number.isFinite(Number(usd)) && Number(usd) > 0 ? Number(usd) : 0);
  writeSpendLedger(ventureId, ledger.day, spentUsd, options);
  return spentUsd;
}

// ── Wake candidates ──────────────────────────────────────────────────────────────────────────────────

// Live bets are the tick's wake candidates: not ended, and not currently sitting at the wall waiting on
// the founder (positionOf derives both from the loop itself — never a stored status field, per bet.mjs).
// Which of these actually has "a next inward move" is the crew's own judgment inside driveTeammate
// (FIRM-SPEC.md "What stays open"); the scheduler's only job is not re-waking a bet already paused for
// the founder.
function liveWakeCandidates(ventureId, options) {
  const queue = loadWallQueue(ventureId, options);
  return listVentureDocs(ventureId, "bets", options).filter((bet) => positionOf(bet, queue) === "live");
}

// ── The tick ─────────────────────────────────────────────────────────────────────────────────────────

// Runs one tick for one venture: wakes up to HEAT_TICK_SHAPE[heat].maxWakesPerTick live bets (stopping
// early if the day's spend rail is hit), then always runs the read-only reply poller regardless of
// heat — a founder with heat off still gets replies read and parked, never anything drafted or spent.
// `deps.driveTeammate` and `deps.pollReplies` are injectable (fake runtime, fake clock in tests); the
// live defaults lazily import work-loop.mjs / market.mjs at call time so this module never statically
// depends on either — same lazy-injection convention F2's stage_outward already uses for wall.mjs.
export async function runHeatTick(ventureId, { nowMs = Date.now(), options = {}, deps = {} } = {}) {
  const settings = getHeatSettings(ventureId, options);
  const shape = HEAT_TICK_SHAPE[settings.heat] ?? HEAT_TICK_SHAPE[DEFAULT_HEAT];
  const woken = [];

  if (shape.maxWakesPerTick > 0) {
    const driveTeammate = deps.driveTeammate ?? (await import("./work-loop.mjs")).driveTeammate;
    const candidates = liveWakeCandidates(ventureId, options).slice(0, shape.maxWakesPerTick);
    for (const bet of candidates) {
      const ledger = readSpendLedger(ventureId, nowMs, options);
      if (ledger.spentUsd >= settings.dailySpendUsd) break; // the rail stops further wakes this tick
      if (!bet.teammateRef) continue; // no teammate to wake with — the crew's own judgment names one at fork time

      let result;
      try {
        result = await driveTeammate({
          ventureId,
          teammateRef: bet.teammateRef,
          goal: `Continue "${bet.intent}" — whatever the next inward move is (draft, research, mutate).`,
          betId: bet.id,
          options,
          deps,
        });
      } catch {
        continue; // one bet's wake failing never stops the tick's other candidates
      }

      // Only the Claude Code adapter reports real dollars via ctx.onCost (work.spentUsd). A Codex or
      // cost-silent drive charges the conservative flat estimate instead — never free.
      const measured = Number(result?.work?.spentUsd) || 0;
      chargeHeatSpend(ventureId, measured > 0 ? measured : UNMEASURED_DRIVE_ESTIMATE_USD, { nowMs, options });
      woken.push({ betId: bet.id, outcome: result?.outcome ?? null });
    }
  }

  // The read-only reply poller runs every tick regardless of heat — heat off means nothing drafts and
  // nothing spends, not that the founder stops hearing from the market. market-poll.mjs's pollReplies
  // is F5 step 3's reply-capture path (ports inbox-reader.mjs's read+classify, feeds market.mjs's
  // recordOutcome). Isolated: a poller failure never breaks the tick.
  let polled = null;
  try {
    const pollReplies = deps.pollReplies ?? (await import("./market-poll.mjs")).pollReplies;
    if (typeof pollReplies === "function") polled = await pollReplies(ventureId, options);
  } catch {
    polled = null;
  }

  return { ventureId, heat: settings.heat, woken, polled };
}

// ── The scheduler ────────────────────────────────────────────────────────────────────────────────────

const DEFAULT_TICK_MS = 5 * 60 * 1000;
let active = null;

function resolveIntervalMs(options) {
  if (typeof options.intervalMs === "number") return options.intervalMs;
  const raw = process.env.GTM_IDE_HEAT_TICK_MS;
  if (raw !== undefined && raw !== "") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return DEFAULT_TICK_MS;
}

function isDisabled(intervalMs) {
  if (process.env.GTM_IDE_DISABLE_HEAT === "1") return true;
  return !(intervalMs > 0);
}

// One unref'd in-process timer across every open venture (mirrors ambient-scheduler.mjs's discipline:
// never keeps the process alive, a double start is idempotent, the kill switch stops it entirely).
// `listVentureIds` is injectable so a test can scope a tick run to a fixed set without touching the
// real venture manifest collection.
export function startHeatScheduler(options = {}) {
  const intervalMs = resolveIntervalMs(options);
  if (isDisabled(intervalMs)) return { stop() {} };
  if (active) return active;

  const listVentureIds = options.listVentureIds ?? (() => listVentures(options).map((v) => v.id));

  const timer = setInterval(() => {
    for (const ventureId of listVentureIds()) {
      Promise.resolve(runHeatTick(ventureId, { options, deps: options.deps })).catch(() => {});
    }
  }, intervalMs);

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
