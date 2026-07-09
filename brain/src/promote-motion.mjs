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
  getObjectTouch,
} from "./gtm-store.mjs";
import { gateReviewForRun } from "./run-compile.mjs";
import { assertGateWall } from "./workflow-composer.mjs";
import { objectKey as computeObjectKey, inferKind } from "./object-identity.mjs";
import { bucketFor } from "./object-funnel.mjs";
import { learnedSignal } from "./reallocation.mjs";

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

// Does this motion's topology have a self-sourcing / discovery ENTRY — an entry node that FINDS its own
// items live (an `agent`-kind node with no inbound edge), rather than carrying a fixed population forward?
// A discovery motion re-sources every cycle; a multi-touch motion carries a population and works it down.
// Deterministic read of the compiled steps + edges — no model call. An entry node is one with no inbound
// edge; the motion is self-sourcing when that entry (or any entry) is an agent-kind node.
function hasSelfSourcingEntry(steps, edges) {
  const nodes = Array.isArray(steps) ? steps : [];
  if (!nodes.length) return false;
  const withInbound = new Set((Array.isArray(edges) ? edges : []).map((e) => e?.target).filter(Boolean));
  const entries = nodes.filter((n) => n && !withInbound.has(n.id));
  const roots = entries.length ? entries : nodes;
  return roots.some((n) => String(n?.kind || "").toLowerCase() === "agent");
}

// Compute WHICH objects flow THIS cycle — the runtime's one decision (the topology stays the model's).
// Instead of replaying a frozen item snapshot verbatim, we suppression-filter the carried-forward items
// against Area 1's LIVE touch ledger (via deriveSuppression → dedupeAcrossChannels → the ledger): an item
// whose object already drew a joined outcome or is set aside is a RESPONDER and DROPS; an item whose
// object has not resolved is a NON-RESPONDER and ADVANCES. This is what makes cycle-2's item set differ
// from cycle-1 as outcomes land — non-responders advance, responders drop — without a stored state field,
// derived fresh from the ledger every cycle. For a self-sourcing/discovery motion the same filter applies
// to the last discovered batch, so a re-source never re-works who's already handled. Returns the advancing
// items (joinKeys already stripped by the caller's mapping is preserved here by re-stripping). Honest
// fallback: if the ledger read yields nothing to suppress, every carried item advances (today's behavior).
// The set of objectKeys a real outcome has already joined back to for this project — the RESPONDERS. The
// honest, narrow join object-funnel uses: a Result's buyerRef or joinKey that equals an object's key. Read
// once per cycle. A read failure yields an empty set (nothing drops — today's behavior).
function respondedKeys(projectId, options) {
  const keys = new Set();
  let results = [];
  try {
    results = resultStore.list({ ...options, projectId });
  } catch {
    results = [];
  }
  for (const result of Array.isArray(results) ? results : []) {
    if (!result) continue;
    const ref = String(result.buyerRef ?? "").trim();
    if (ref) keys.add(ref);
    const joinKey = String(result.joinKey ?? "").trim();
    if (joinKey) keys.add(joinKey);
  }
  return keys;
}

export function computeCycleItems(template, projectId, options = {}) {
  const carried = (Array.isArray(template?.items) ? template.items : []).map((item) => {
    const { joinKey, ...rest } = item && typeof item === "object" ? item : {};
    void joinKey;
    return rest;
  });
  if (!carried.length) return carried;

  let convertedKeySet;
  try {
    convertedKeySet = respondedKeys(projectId, options);
  } catch {
    convertedKeySet = new Set();
  }
  const asOf = new Date().toISOString();

  // An item ADVANCES unless its object is a RESPONDER — resolved by a joined outcome (handled) or an active
  // founder set-aside (suppressed). Both are read fresh from the ledger + the converted-key set, so the
  // cycle set is derived every cycle, never a stored state field. An un-keyable item always advances.
  const advancing = carried.filter((item) => {
    const kind = inferKind(item) || "person";
    const key = computeObjectKey(kind, item);
    if (!key) return true;
    if (convertedKeySet.has(key)) return false; // responded (a joined outcome) → drop
    let record = null;
    try {
      record = getObjectTouch(projectId, key, options);
    } catch {
      record = null;
    }
    if (!record) return true; // never touched → advance
    const bucket = bucketFor(record, { convertedKeySet, asOf });
    // Drop only what's genuinely resolved for THIS founder: a joined outcome (handled) or an active
    // set-aside (suppressed). in_flight / seen are non-responders → they advance.
    return bucket !== "handled" && bucket !== "suppressed";
  });

  // If nothing dropped (a fresh ledger with no responders), the advancing set equals the carried set — the
  // honest identity that keeps cycle-1 exactly today's behavior.
  return advancing;
}

// Re-stage a due motion's template as a fresh Run — the scheduler's one action. THE WALL: the re-run
// stages at the founder gate (status "staged", gate pending) and never sends. The carried-forward steps
// already passed the wall in the source run; we re-assert it here (belt and suspenders) and refuse to
// stage a topology that could send without a gate. Appends the new run to the motion's scorekeeping and
// arms the next cadence. Returns { run, motion, gate }.
//
// LIVE CYCLE SET (GTM-MACHINE.md Area 2): instead of replaying the frozen item snapshot verbatim, the
// cycle's items are computed from Area 1's live touch ledger — responders (a joined outcome / a set-aside)
// drop, non-responders advance — so a promoted multi-touch motion's cycle-2 item set genuinely differs
// from cycle-1, and a self-sourcing motion never re-works who's already handled. Topology is untouched;
// only WHICH objects flow this cycle is decided here.
export function runMotionOnce(motion, { nowMs = Date.now() } = {}, options = {}) {
  const projectId = options.projectId ?? motion.projectId ?? "default";
  const template = motion.nextRunTemplate;
  if (!template || !trimOrNull(template.pathId)) {
    throw new Error("This motion has no next-run template to re-stage.");
  }

  // Re-assert the wall on the carried-forward topology before staging anything.
  assertGateWall(Array.isArray(template.steps) ? template.steps : [], Array.isArray(template.edges) ? template.edges : []);

  // The live cycle set: suppression-filtered against the ledger (joinKeys already stripped inside
  // computeCycleItems), so the run store mints fresh keys and this run's Results never collide with the
  // source run's. `selfSourcing` is recorded on the run so a downstream discovery step knows to re-source.
  const selfSourcing = hasSelfSourcingEntry(template.steps, template.edges);
  const items = computeCycleItems(template, projectId, options);
  const run = runStore.create(
    {
      projectId,
      pathId: template.pathId,
      steps: Array.isArray(template.steps) ? template.steps : [],
      edges: Array.isArray(template.edges) ? template.edges : [],
      // selfSourcing rides on gateState (a free-form object the run store round-trips) so a downstream
      // discovery step can tell whether this cycle should re-source live vs. work the carried population.
      gateState: { status: "pending", awaitingReview: items.length, selfSourcing },
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

// The set of starved motion refs for a project — a motion shape that has cleared the observation floor of
// STAGED actions yet measured NOTHING back. This CONSUMES Area 3's learnedSignal read (the one owner of
// the learned signal); Area 2 owns only the mechanics of what to DO with it. Cached per project within one
// tick so the ledger is read once, not once per due motion. A read failure yields an empty set — the tick
// never breaks, it just doesn't flag. Match key is motionRef (the motion's pathId — the stable per-motion
// ref Results carry), so a due motion is matched to its own measured record.
function starvedRefsFor(projectId, cache, options) {
  if (cache.has(projectId)) return cache.get(projectId);
  let refs = new Set();
  try {
    const signal = learnedSignal(projectId, options);
    const floor = signal.minObservations;
    for (const m of Array.isArray(signal.motions) ? signal.motions : []) {
      if (m.motionRef && m.staged >= floor && m.measured === 0) refs.add(m.motionRef);
    }
  } catch {
    refs = new Set();
  }
  cache.set(projectId, refs);
  return refs;
}

// ── The scheduler seam ────────────────────────────────────────────────────────────────────────────
// The background tick the HOST calls (the same server heartbeat that drives ambient wakes) — NOT a
// module-scope timer. It re-stages every motion whose cadence is due, driving each to the founder gate.
// It only STAGES; it never sends, and a motion that throws (a bad template, a stale run) is skipped, not
// allowed to break the tick.
//
// STARVE FLAG (GTM-MACHINE.md Area 2, consuming Area 3): a due motion whose shape has staged enough to
// clear the observation floor yet measured NOTHING back is FLAGGED FOR REVIEW instead of re-staged — it
// becomes a correctable receipt in the founder's batch ("cold email: 0 of 41 measured in 3 weeks"), never
// silently re-run forever and NEVER silently killed. The founder decides in the batch. Advisory only: the
// flag suppresses this ONE re-stage; the motion stays live and standing on its cadence for the founder to
// resume, retune, or retire. Overdrive-shaped, per the settled open decision (advisory-batched, not auto).
//
// Returns { staged: [{ motionId, runId }], flagged: [{ motionId, motionRef, projectId, reason }] } so the
// caller (the heartbeat, the batch surface) can both observe the re-stages and render the flags.
export function runDueMotions(options = {}) {
  const nowMs = options.nowMs ?? Date.now();
  const staged = [];
  const flagged = [];
  const starvedCache = new Map();
  for (const motion of repeatableMotionStore.list(options)) {
    if (!motionDue(motion, nowMs)) continue;
    const projectId = motion.projectId ?? options.projectId ?? "default";
    const motionRef = trimOrNull(motion.nextRunTemplate?.pathId);
    // Consult the learned signal: a starved shape is flagged, not re-staged.
    if (motionRef) {
      const starved = starvedRefsFor(projectId, starvedCache, { ...options, projectId });
      if (starved.has(motionRef)) {
        flagged.push({
          motionId: motion.id,
          motionRef,
          projectId,
          reason: "this motion shape has staged work but measured nothing back — flagged for your review rather than run again",
        });
        continue;
      }
    }
    try {
      const { run } = runMotionOnce(motion, { nowMs }, { ...options, projectId });
      staged.push({ motionId: motion.id, runId: run.id });
    } catch {
      // A motion with a broken template or a topology that fails the wall is skipped — never send, never
      // break the tick for the other due motions.
    }
  }
  return { staged, flagged };
}
