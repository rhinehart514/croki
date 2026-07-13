// In-process ambient heartbeat.
//
// The default heartbeat does one useful automatic job: read outcomes that already happened. Creative
// work stays founder/operator initiated. Legacy standing briefs, repeated motions, and automatic input
// routing remain callable through their explicit seams but are no longer ambient product behavior.
//
// Outcome reading is read-only: it notices replies and bounces attributable to prior runs, then records
// them through the existing outcome path. It never sends, publishes, approves, calls a model, or spends
// paid probe credits. The older creative drivers retain their own safety and budget seams when explicitly
// enabled for compatibility, but they are not part of the default product loop.
//
// The timer is started ONLY when startAmbientScheduler() is explicitly called by the integrator (inside
// server.listen). Importing this module spins no timer.

import { runDueAmbientTicks } from "./operator-runtime.mjs";
import { runDueMotions } from "./promote-motion.mjs";
import { routeUnroutedInputs } from "./input-routing.mjs";
import { runDueInboxOutcomeReads } from "./connectors/measure/inbox-reader.mjs";
import { listProjects } from "./project-store.mjs";
import { getReallocationTunables } from "./reallocation-tunables-store.mjs";
import { createAmbientWakeScorer } from "./ambient-wake-scorer.mjs";
import { persistence } from "./persistence.mjs";
import { safeLogFailure } from "./failure-log.mjs";

const DEFAULT_TICK_MS = 5 * 60 * 1000; // every 5 minutes

// Default per-tick ceiling on model-backed wake-scorer invocations. Bounds the model spend of one drain
// tick even when the inbox is deep. Overridable per start() call; the daily probe cap comes from the
// founder-tunable reallocation tunables (dailyProbeCap), not a constant here.
const DEFAULT_MAX_SCORER_PER_TICK = 8;

// Default minimum spacing between paid probes for the SAME motion — a cadence floor so one motion cannot
// drain the daily probe budget on back-to-back ticks. Probes themselves are Area 7's (rented MCP reads);
// this is only the throttle the doc places here.
const DEFAULT_MOTION_PROBE_CADENCE_MS = 6 * 60 * 60 * 1000; // 6 hours

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

// The durable day bucket for the paid-probe ledger — UTC calendar day, so "daily cap" means one real day.
function probeDayKey(nowMs) {
  return new Date(nowMs).toISOString().slice(0, 10); // YYYY-MM-DD
}

const PROBE_LEDGER_COLLECTION = "ambient-probe-ledger";

// Read the durable paid-probe ledger for a day: how many probe credits have been spent so far. A missing
// or stale-day record reads as zero spent — the cap resets each calendar day with no cleanup needed.
function readProbeLedger(nowMs, options) {
  const day = probeDayKey(nowMs);
  let stored = null;
  try {
    stored = persistence(options).get(PROBE_LEDGER_COLLECTION, day);
  } catch {
    stored = null;
  }
  const spent = stored && stored.day === day && Number.isFinite(Number(stored.spent)) ? Number(stored.spent) : 0;
  return { day, spent: spent >= 0 ? spent : 0 };
}

function writeProbeLedger(day, spent, options) {
  try {
    persistence(options).set(PROBE_LEDGER_COLLECTION, day, { day, spent, updatedAt: new Date().toISOString() });
  } catch {
    /* the ledger is best-effort — a write failure never breaks a tick */
  }
}

/**
 * Build the per-tick budget the drain driver spends against. Pure bookkeeping — it never sends, runs, or
 * gates. It answers three questions and records the spend:
 *
 *   - takeScorer()          → true if a model-backed scorer invocation is still within the per-tick cap
 *                             (and decrements the remaining count). Returns false once the tick is spent,
 *                             so the router falls back to its blank scorer (no wake) for the rest.
 *   - canProbe(motionRef)   → true if a paid probe for this motion is BOTH under the daily credit cap AND
 *                             past its per-motion cadence. Read-only — it does not spend.
 *   - chargeProbe(motionRef, credits) → durably records `credits` against today's cap and stamps the
 *                             motion's last-probe time. Call ONLY after a probe actually runs.
 *
 * The daily probe cap is the founder-tunable dailyProbeCap (reallocation tunables), never a hardcoded
 * policy constant. The per-motion cadence stamps live in-process for the tick's lifetime — sufficient for
 * a single tick's throttle — while the daily credit total is durable across ticks and restarts.
 */
export function createTickBudget({ nowMs = Date.now(), maxScorerPerTick = DEFAULT_MAX_SCORER_PER_TICK, motionProbeCadenceMs = DEFAULT_MOTION_PROBE_CADENCE_MS, options = {} } = {}) {
  let scorerRemaining = Math.max(0, Math.floor(Number(maxScorerPerTick)) || 0);
  const tunables = getReallocationTunables(options);
  const dailyProbeCap = Math.max(0, Math.floor(Number(tunables.dailyProbeCap)) || 0);
  const ledger = readProbeLedger(nowMs, options);
  let probeSpent = ledger.spent;
  const lastProbeAt = new Map(); // motionRef -> ms of last charged probe this tick

  return {
    // Diagnostic reads (tests + logging) — never a control signal.
    get scorerRemaining() { return scorerRemaining; },
    get probeSpent() { return probeSpent; },
    get dailyProbeCap() { return dailyProbeCap; },

    takeScorer() {
      if (scorerRemaining <= 0) return false;
      scorerRemaining -= 1;
      return true;
    },

    canProbe(motionRef, credits = 1) {
      const cost = Math.max(0, Math.floor(Number(credits)) || 0);
      if (probeSpent + cost > dailyProbeCap) return false;
      const last = lastProbeAt.get(motionRef ?? "__anon");
      if (last != null && nowMs - last < motionProbeCadenceMs) return false;
      return true;
    },

    chargeProbe(motionRef, credits = 1) {
      const cost = Math.max(0, Math.floor(Number(credits)) || 0);
      probeSpent += cost;
      lastProbeAt.set(motionRef ?? "__anon", nowMs);
      writeProbeLedger(ledger.day, probeSpent, options);
      return probeSpent;
    },
  };
}

// The active projects the drain driver walks. The catalog read is honest-blind on failure (no projects →
// no drain, never a throw). We drain EVERY project's inbox, not just the active one, so a signal captured
// for a background product still gets routed on the heartbeat.
function activeProjectIds(options) {
  try {
    return (listProjects(options).projects ?? []).map((p) => p.id).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * The third heartbeat driver: drain the captured-signal inbox per active project.
 *
 * For each project it calls the EXISTING routeUnroutedInputs — the one place allowed to turn a captured
 * signal into a routing side effect. The fuzzy "does this warrant waking a standing brief?" judgment is a
 * rented, model-backed scorer (ambient-wake-scorer.mjs) passed in as the router's wakeScorer seam, wrapped
 * by the per-tick budget so a deep inbox cannot exceed the tick's model-call ceiling. When the budget is
 * spent — or when no scorer is wired (scorer===null) — the router falls back to its blank scorer, which
 * REFUSES to wake, so behavior is byte-identical to today. THE WALL HOLDS: a warranted wake composes and
 * runs to the founder gate through the same wakeAmbientSession path a goal drive uses; nothing sends.
 *
 * `scorer` is injectable so a test supplies a fake (or null to prove the scorer-absent branch); the live
 * default is the real model-backed scorer. A per-project failure is isolated — one bad project never
 * stops the others draining. Returns the per-project results so a caller can observe/log.
 */
export function runDueInputRouting(options = {}) {
  const nowMs = options.nowMs ?? Date.now();
  const budget = options.budget ?? createTickBudget({ nowMs, maxScorerPerTick: options.maxScorerPerTick, options });
  // The rented wake scorer, budgeted. Resolution:
  //   - options.scorer === null  → explicitly no scorer (scorer-absent branch: never wakes)
  //   - options.scorer provided  → use it (a test's fake, or a pre-built one)
  //   - nothing passed           → the live model-backed scorer
  // Whatever scorer is chosen, we wrap it so it is invoked ONLY while the per-tick scorer budget holds;
  // once the tick's model-call ceiling is hit the wrapper returns the blank verdict (no wake), so the
  // rest of a deep inbox drains for free (deterministic channel matches still route).
  let rawScorer;
  if (options.scorer === null) {
    rawScorer = null;
  } else if (typeof options.scorer === "function") {
    rawScorer = options.scorer;
  } else {
    rawScorer = createAmbientWakeScorer({ cwd: options.cwd });
  }
  const budgetedScorer = rawScorer
    ? (signal, ctx) => {
        // Only spend a model call when the budget allows; otherwise refuse to wake (blank verdict).
        if (!budget.takeScorer()) return { warrant: false };
        return rawScorer(signal, ctx) || { warrant: false };
      }
    : undefined; // undefined → routeInput uses its own blank default (never wakes)

  const results = [];
  for (const projectId of activeProjectIds(options)) {
    try {
      const routed = routeUnroutedInputs(projectId, { ...options, wakeScorer: budgetedScorer });
      results.push({ projectId, routed });
    } catch {
      // One project's inbox failing (a broken channel read, a wake throw) never stops the others.
    }
  }
  return results;
}

/**
 * The fourth heartbeat driver: the AUTOMATIC outcome read.
 *
 * Read-only. For each active project it polls the connected inbox for replies / bounces on the threads of
 * what Drover sent and ingests any detected signal back to its run (connectors/measure/inbox-reader.mjs).
 * A project with no connected Gmail reads nothing; a project whose grant is send-only or revoked reports
 * blind and ingests nothing — never a fabricated attribution. It NEVER sends. Per-project failures are
 * isolated inside the reader. Async because the read is a real (mocked-in-test) network call; returns the
 * per-project reports so a caller can observe/log. `projectIds` is injectable for the test; the live
 * heartbeat walks the active projects.
 */
export function recordInboxPollHealth(reports = [], options = {}) {
  for (const entry of Array.isArray(reports) ? reports : []) {
    const report = entry?.report;
    if (!report || report.ok !== false) continue;
    const projectId = entry.projectId ?? options.projectId ?? null;
    // Reuse the system's existing self-observed issue authority. The project-scoped signature dedup-bumps
    // repeated blind polls instead of inventing a scheduler-health store, and routes the reconnect/read-scope
    // state onto the same system issue surface as every other operational failure.
    safeLogFailure({
      category: "node-error",
      projectId,
      graphId: "ambient-gmail-inbox",
      graphLabel: "Automatic Gmail outcome polling",
      node: { id: "gmail-inbox-read", kind: "connector", label: "Read Gmail outcomes" },
      result: {
        ok: false,
        error: report.reason ?? "Gmail outcome polling failed.",
        meta: {
          needsReadScope: report.needsReadScope === true,
          needsReconnect: report.needsReconnect === true,
        },
      },
    }, { ...options, projectId });
  }
  return reports;
}

export async function runDueInboxReads(options = {}) {
  const projectIds = options.projectIds ?? activeProjectIds(options);
  const reports = await runDueInboxOutcomeReads({ ...options, projectIds });
  return recordInboxPollHealth(reports, options);
}

/**
 * Start the in-process ambient heartbeat.
 *
 * By default the heartbeat only reads outcomes. The three legacy creative drivers are an explicit
 * compatibility opt-in; a throw in any enabled driver never breaks the loop or the process, and the
 * timer is unref'd so it never keeps the process alive.
 *
 * @param {{ intervalMs?: number, maxScorerPerTick?: number, scorer?: Function|null }} [options]
 * @returns {{ stop(): void }} handle whose stop() clears the timer (no-op if never started / already stopped)
 */
export function ambientDriverPolicy(options = {}) {
  const creative = options.enableCreativeDrivers === true || process.env.GTM_IDE_ENABLE_AMBIENT_CREATION === "1";
  return { outcomeReads: true, standingBriefs: creative, repeatableMotions: creative, inputRouting: creative };
}

export function startAmbientScheduler(options = {}) {
  const intervalMs = resolveIntervalMs(options);

  // Opt-out: return a no-op handle and start no timer.
  if (isDisabled(intervalMs)) {
    return { stop() {} };
  }

  // Idempotent: a second start returns a handle onto the one already-live timer.
  if (active) return active;
  const policy = ambientDriverPolicy(options);

  const timer = setInterval(() => {
    // DRIVE/STAGE only — never sends, never approves. Each driver is isolated so one throw can't stall
    // the heartbeat. The BUDGET is built once per tick and shared across the drain so a deep inbox is
    // bounded within the tick's model/probe ceiling.
    if (policy.standingBriefs) try {
      runDueAmbientTicks();
    } catch {}
    if (policy.repeatableMotions) try {
      runDueMotions();
    } catch {}
    if (policy.inputRouting) try {
      runDueInputRouting({ maxScorerPerTick: options.maxScorerPerTick, scorer: options.scorer });
    } catch {}
    if (policy.outcomeReads) try {
      // The automatic outcome read is async (a network read); fire-and-forget with an isolated catch so a
      // read failure or a rejected promise never stalls the heartbeat or the other drivers. Read-only.
      Promise.resolve(runDueInboxReads()).catch(() => {});
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
