// Phase 6 — Promote (light). GTM-ENGINE-REBUILD §4, Phase 6.
//
// Phase 5 closed the loop: a Run stages at the gate, and real outcomes join back to it as Results. This
// module is the ONE light touch that turns a proven run into a repeating one. Promotion does not build a
// new kind of thing — it wraps the run that already worked in a RepeatableMotion (§3): the run it came
// from, a cadence, rolling scorekeeping, and a next-run template carried forward from what worked. Then
// a plain scheduler re-stages that template on cadence, keeps score, and STOPS AT THE GATE every time.
//
// The invariants this file holds (§2):
//   - The wall is UNTOUCHED (§2.1, Phase 6 guard). A promoted motion re-runs by STAGING a fresh Run at
//     the founder gate (status "staged", gate pending) — exactly the Phase 4 shape. It never sends,
//     publishes, or charges, and it never auto-approves. Promotion graduates autonomy only by the
//     separate, explicit founder act (promoteChannel); a re-run on its own always waits at the gate.
//   - No re-grown program cage (§2.6, Phase 6 guard). A RepeatableMotion has NO composition authority.
//     A re-run does not re-compose or re-ideate — it re-stages the compiled topology the proven run
//     already carried. There is no model call anywhere in this file (§2.4): carrying forward a working
//     run and computing when it is next due are lookups and arithmetic, not judgment.
//   - Open shapes (§2.2). `cadence` is an OPEN string. Common labels (daily/weekly/…) and "every N
//     units" parse to an interval; anything else is a MANUAL motion — it exists and keeps score but
//     never fires on its own. An unrecognized cadence is never rejected, only treated as manual.
//   - Learning capture (§2.8). Promoting and each re-run write a Learning with the promotionDecision,
//     so the cross-company schema captures which paths got promoted from day one.

import {
  runStore,
  resultStore,
  repeatableMotionStore,
  learningStore,
  gtmPathStore,
} from "./gtm-store.mjs";
import { gateReviewForRun } from "./run-compile.mjs";
import { assertGateWall } from "./workflow-composer.mjs";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

const NAMED_CADENCES = {
  hourly: HOUR,
  daily: DAY,
  weekly: WEEK,
  biweekly: 2 * WEEK,
  fortnightly: 2 * WEEK,
  monthly: 30 * DAY,
  quarterly: 90 * DAY,
};

const UNIT_MS = {
  minute: MINUTE,
  minutes: MINUTE,
  min: MINUTE,
  hour: HOUR,
  hours: HOUR,
  hr: HOUR,
  day: DAY,
  days: DAY,
  week: WEEK,
  weeks: WEEK,
  month: 30 * DAY,
  months: 30 * DAY,
};

function trimOrNull(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

// Deterministic cadence → interval in ms. An OPEN string maps to an interval only if it is a known label
// or an "every N units" phrase; anything else returns null, meaning MANUAL (never auto-fires). This is
// the one place cadence is interpreted, and it is plain arithmetic — never a model call, never an enum
// that rejects a value the founder typed.
export function cadenceToMs(cadence) {
  const raw = trimOrNull(cadence);
  if (!raw) return null;
  const text = raw.toLowerCase();
  if (NAMED_CADENCES[text]) return NAMED_CADENCES[text];
  // "every 3 days", "every day", "3 days", "every 2 weeks", "48 hours"
  const match = text.match(/^(?:every\s+)?(\d+)?\s*([a-z]+)$/);
  if (match) {
    const count = match[1] ? Number(match[1]) : 1;
    const unit = UNIT_MS[match[2]];
    if (unit && Number.isFinite(count) && count > 0) return count * unit;
  }
  return null;
}

// The score of one run: read its Results and fold them into a plain tally the founder can read — how
// many items were staged, how many drew an outcome, and the count per outcome kind. Deterministic: a
// lookup over stored Results, never a judgment about whether the run "worked".
export function scoreForRun(run, { projectId = "default", results = null, options = {} } = {}) {
  if (!run) return { staged: 0, measured: 0, outcomes: {} };
  const runResults =
    results ?? resultStore.list({ ...options, projectId: run.projectId ?? projectId });
  const stagedKeys = new Set();
  for (const item of Array.isArray(run.items) ? run.items : []) {
    const key = trimOrNull(item?.joinKey);
    if (key) stagedKeys.add(key);
  }
  const outcomes = {};
  const measuredKeys = new Set();
  for (const r of runResults) {
    if (trimOrNull(r.runId) !== trimOrNull(run.id)) continue;
    const key = trimOrNull(r.joinKey);
    if (key) measuredKeys.add(key);
    const kind = r.outcomeKind ?? "unlabeled";
    outcomes[kind] = (outcomes[kind] ?? 0) + 1;
  }
  return { staged: stagedKeys.size, measured: measuredKeys.size, outcomes };
}

// Carry forward what worked: the next-run template is the proven run's compiled topology (steps + edges),
// its bound measurement contract, and the items it staged — WITHOUT their joinKeys, so a re-run mints
// fresh ones and its Results never collide with the source run's. This is a faithful copy of the working
// run, not a re-composition; the wall the source run passed travels with the steps.
function templateFromRun(run) {
  const items = (Array.isArray(run.items) ? run.items : []).map((item) => {
    const { joinKey, ...rest } = item && typeof item === "object" ? item : {};
    void joinKey;
    return rest;
  });
  return {
    pathId: run.pathId ?? null,
    steps: Array.isArray(run.steps) ? run.steps : [],
    edges: Array.isArray(run.edges) ? run.edges : [],
    measurementContract: run.measurementContract ?? null,
    measurementContractId: run.measurementContractId ?? null,
    items,
  };
}

// Write the Learning that captures a promotion or re-run decision (§2.8). Structural signal (channel +
// the source run's score) stays separate from the identifying text (path, offer). Best-effort: a missing
// path never blocks the capture.
function writePromotionLearning({ decision, run, score, projectId, options }) {
  const pathId = trimOrNull(run?.pathId);
  let path = null;
  if (pathId) {
    try {
      path = gtmPathStore.get(pathId, { ...options, projectId });
    } catch {
      path = null;
    }
  }
  const marketObjectRefs = (Array.isArray(path?.restsOn) ? path.restsOn : []).filter((ref) =>
    String(ref?.type ?? "").toLowerCase().includes("market"),
  );
  return learningStore.create(
    {
      projectId,
      structural: {
        productShape: null,
        runType: "repeatable-motion",
        channel: trimOrNull(run?.items?.[0]?.channel),
        result: score ? { staged: score.staged, measured: score.measured, outcomes: score.outcomes } : null,
        promotionDecision: decision,
      },
      identifying: {
        pathId,
        marketObjectRefs,
        offer: trimOrNull(path?.bet?.offer),
        message: null,
      },
    },
    { ...options, projectId },
  );
}

// ── Promote: the one light touch ────────────────────────────────────────────────────────────────────
// Turn a proven run into a RepeatableMotion. The motion carries the source run id, the cadence, a
// scorekeeping ledger seeded with the source run's real score (carry-forward of what worked), and the
// next-run template copied from the run. If the cadence parses to an interval, the next re-run is armed
// one interval out from now; an unparseable/absent cadence leaves the motion MANUAL (nextRunAt null),
// so it exists and keeps score but never fires on its own. Also writes the promotion Learning.
export function promoteRun(runId, { cadence = null, nowMs = Date.now() } = {}, options = {}) {
  const projectId = options.projectId ?? "default";
  const run = runStore.get(runId, { ...options, projectId });
  const score = scoreForRun(run, { projectId, options });
  const intervalMs = cadenceToMs(cadence);
  const nextRunAt = intervalMs ? new Date(nowMs + intervalMs).toISOString() : null;

  const motion = repeatableMotionStore.create(
    {
      projectId,
      sourceRunId: run.id,
      cadence: trimOrNull(cadence),
      // Seed the ledger with the run that earned the promotion: origin marks it as the source, not a
      // re-run the scheduler produced.
      scorekeeping: {
        runs: [{ runId: run.id, origin: true, stagedAt: run.startedAt ?? run.createdAt ?? null, ...score }],
      },
      nextRunTemplate: templateFromRun(run),
      lastRunAt: run.startedAt ?? run.createdAt ?? null,
      nextRunAt,
    },
    { ...options, projectId },
  );

  const learning = writePromotionLearning({ decision: "promoted", run, score, projectId, options });
  return { motion, learning };
}

// Is this motion DUE for a re-run right now? Deterministic: a manual motion (no parseable cadence, or no
// armed nextRunAt) is never due; otherwise it is due once its nextRunAt has arrived. Mirrors the ambient
// tick's due check — plain arithmetic over stored timestamps, no model call.
export function motionDue(motion, nowMs = Date.now()) {
  if (!motion) return false;
  if (!cadenceToMs(motion.cadence)) return false;
  if (!motion.nextRunTemplate?.pathId && !motion.nextRunTemplate) return false;
  const nextAt = motion.nextRunAt ? new Date(motion.nextRunAt).getTime() : NaN;
  return Number.isFinite(nextAt) && nextAt <= nowMs;
}

// Re-stage a due motion's template as a fresh Run — the scheduler's one action. THE WALL: the re-run
// stages at the founder gate (status "staged", gate pending) and never sends. The carried-forward steps
// already passed the wall in the source run; we re-assert it here (belt and suspenders) and refuse to
// stage a topology that could send without a gate. Appends the new run to the motion's scorekeeping and
// arms the next cadence. Returns { run, motion, gate }.
export function runMotionOnce(motion, { nowMs = Date.now() } = {}, options = {}) {
  const projectId = options.projectId ?? motion.projectId ?? "default";
  const template = motion.nextRunTemplate;
  if (!template || !trimOrNull(template.pathId)) {
    throw new Error("This motion has no next-run template to re-stage.");
  }

  // Re-assert the wall on the carried-forward topology before staging anything.
  assertGateWall(Array.isArray(template.steps) ? template.steps : [], Array.isArray(template.edges) ? template.edges : []);

  // Stage the re-run. Items keep whatever shape they had, minus joinKeys — the run store mints fresh
  // ones so this run's Results never collide with the source run's.
  const items = (Array.isArray(template.items) ? template.items : []).map((item) => {
    const { joinKey, ...rest } = item && typeof item === "object" ? item : {};
    void joinKey;
    return rest;
  });
  const run = runStore.create(
    {
      projectId,
      pathId: template.pathId,
      steps: Array.isArray(template.steps) ? template.steps : [],
      edges: Array.isArray(template.edges) ? template.edges : [],
      gateState: { status: "pending", awaitingReview: items.length },
      measurementContract: template.measurementContract ?? null,
      measurementContractId: template.measurementContractId ?? null,
      items,
      status: "staged",
    },
    { ...options, projectId },
  );

  const intervalMs = cadenceToMs(motion.cadence);
  const score = scoreForRun(run, { projectId, options });
  const updated = repeatableMotionStore.save(
    {
      ...motion,
      scorekeeping: {
        ...motion.scorekeeping,
        runs: [
          ...(Array.isArray(motion.scorekeeping?.runs) ? motion.scorekeeping.runs : []),
          { runId: run.id, origin: false, stagedAt: run.startedAt ?? run.createdAt ?? null, ...score },
        ],
      },
      lastRunAt: new Date(nowMs).toISOString(),
      // Re-arm one interval out from now so the motion keeps standing on cadence.
      nextRunAt: intervalMs ? new Date(nowMs + intervalMs).toISOString() : null,
    },
    { ...options, projectId },
  );

  writePromotionLearning({ decision: "recurring-run", run, score, projectId, options });
  return { run, motion: updated, gate: gateReviewForRun(run) };
}

// ── The scheduler seam ────────────────────────────────────────────────────────────────────────────
// The background tick the HOST calls (the same server heartbeat that drives ambient wakes) — NOT a
// module-scope timer. It re-stages every motion whose cadence is due, driving each to the founder gate.
// It only STAGES; it never sends, and a motion that throws (a bad template, a stale run) is skipped, not
// allowed to break the tick. Returns the { motionId, runId } pairs it staged so the caller can observe.
export function runDueMotions(options = {}) {
  const nowMs = options.nowMs ?? Date.now();
  const staged = [];
  for (const motion of repeatableMotionStore.list(options)) {
    if (!motionDue(motion, nowMs)) continue;
    try {
      const { run } = runMotionOnce(motion, { nowMs }, { ...options, projectId: motion.projectId ?? options.projectId });
      staged.push({ motionId: motion.id, runId: run.id });
    } catch {
      // A motion with a broken template or a topology that fails the wall is skipped — never send, never
      // break the tick for the other due motions.
    }
  }
  return staged;
}
