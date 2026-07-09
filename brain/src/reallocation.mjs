// The learn-and-reallocate loop (GTM-MACHINE.md Area 3) — the ONE reader that turns recorded outcomes
// into a signal the NEXT compose consults. Write-only learning ends here: an outcome from motion A
// demonstrably shapes the next compose's grounding and the next ranking's weights.
//
// The invariants this file holds:
//   - Deterministic code, no model call (ENGINEERING.md: if code can answer, code answers). Every
//     function here is a plain fold over stored records — the efficiency table, the taste-style block,
//     the bounded weight tilt. Judgment about WHICH motion is working is arithmetic over real outcomes,
//     not a model's guess.
//   - CONSUMES Area 7's one efficiency reader. `learnedSignal` calls `deriveMotionEfficiency`
//     (outcome-ingest.mjs) — the SINGLE efficiency derivation in the codebase — and adds ONLY what
//     Measurement doesn't: an observation floor, lift-vs-project-mean, and an ignored-rate roll-up. It
//     never re-derives efficiency and never re-keys on `structural.channel` (dead on arrival).
//   - ADVISORY, never policy (GTM-MACHINE.md §"Staying out of the cage" #5). This file emits a signal
//     — a table, a bounded weight tilt, a plain-text block — consulted like taste, never obeyed. The
//     founder's saved signal-weights are ALWAYS the base and can never be inverted; a starved motion is
//     FLAGGED for the founder's batch, never auto-killed. No closed motion enum: motionKind stays an
//     open string throughout (this file joins CORE_ENGINE_FILES so a closed enum fails the build).
//   - Honest-null under the floor. Below `minObservations` measured outcomes, a motion's lift is null —
//     one lucky send never reallocates. No fabricated rate anywhere; an unmeasured motion stays
//     unmeasured.

import { deriveMotionEfficiency } from "./outcome-ingest.mjs";
import { learningStore, structuralProjection } from "./gtm-store.mjs";
import { getSignalWeights, SIGNAL_WEIGHT_KEYS } from "./signal-weights-store.mjs";
import { getReallocationTunables } from "./reallocation-tunables-store.mjs";

// ── Small pure helpers ───────────────────────────────────────────────────────────────────────────
function outcomeTotal(outcomesByKind) {
  return Object.values(outcomesByKind ?? {}).reduce((s, n) => s + (Number(n) || 0), 0);
}

function clampNonNeg(n, fallback = 0) {
  const v = Number(n);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

// A motion is WORKING when it clears the observation floor, actually earned outcomes, and sits at or
// above the field mean (a non-negative lift). "At or above" — not "strictly above" — so a lone measured
// motion, whose lift is 0 against a field of one, still reads as working: it earned real wins and there's
// nothing outperforming it. The floor is what keeps one lucky send out; the lift keeps a below-average
// motion from being called a winner when better ones exist.
function isWorking(m) {
  return Boolean(m.motionKind) && m.meetsFloor && m.observed > 0 && m.lift !== null && m.lift >= 0;
}

// ── learnedSignal — the reader (consumes deriveMotionEfficiency; adds floor + lift + ignored-rate) ──
//
// Reads Area 7's per-motion efficiency table and layers on the three things reallocation needs that
// Measurement deliberately leaves out:
//
//   - The OBSERVATION FLOOR. A motion's `lift` (how far its outcome yield sits above the project mean)
//     is honest-null until it has at least `minObservations` MEASURED outcomes. One lucky reply never
//     tilts the machine. The floor is a founder-tunable value (reallocation-tunables), default 5.
//   - LIFT-VS-PROJECT-MEAN. Per qualifying motion, its measured-outcome count relative to the mean
//     measured count across qualifying motions — positive means "earning more than its share", negative
//     means "drawing less". Deterministic; no model call.
//   - The IGNORED-RATE roll-up. Per motion, staged-but-never-measured / staged — the share of this
//     motion's work that drew nothing observable. Null when nothing is staged (never a fabricated 0).
//
// Non-outbound outcome kinds (`ranked`, `activated`, `cited`, `review`, …) move the signal IDENTICALLY
// to `reply` — the fold counts observed outcomes by kind without privileging any kind, so a page that
// ranked lifts exactly as a cold email that got a reply.
//
// Returns { projectId, minObservations, motions: [{ motionKind, motionRef, staged, measured,
//   outcomesByKind, coverage, lastOutcomeAt, orderRank, observed, meetsFloor, lift, ignoredRate }],
//   projectMean, totals }. Honest-empty (motions: []) on a project with nothing measured.
export function learnedSignal(projectId = "default", options = {}) {
  const efficiency = deriveMotionEfficiency({ projectId }, options);
  const tunables = getReallocationTunables({ ...options, projectId });
  const minObservations = clampNonNeg(tunables.observationFloor, 5);

  const rows = Array.isArray(efficiency.motions) ? efficiency.motions : [];

  // Enrich each Area-7 row with observed count + whether it clears the floor. `observed` is the total
  // measured outcomes across kinds — the same non-privileging count for every kind.
  const enriched = rows.map((row) => {
    const observed = outcomeTotal(row.outcomesByKind);
    const meetsFloor = observed >= minObservations;
    const ignoredRate =
      row.staged > 0 ? clampNonNeg((row.staged - row.measured) / row.staged) : null;
    return {
      motionKind: row.motionKind ?? null,
      motionRef: row.motionRef ?? null,
      staged: row.staged ?? 0,
      measured: row.measured ?? 0,
      outcomesByKind: row.outcomesByKind ?? {},
      coverage: row.coverage ?? null,
      lastOutcomeAt: row.lastOutcomeAt ?? null,
      orderRank: row.orderRank ?? null,
      observed,
      meetsFloor,
      ignoredRate,
    };
  });

  // The project mean is the mean OBSERVED count across every NAMED motion with staged work — the real
  // denominator for "is this motion pulling more than its share". A starved sibling (staged, 0 measured)
  // counts as a real 0 in that mean, so a lone winner surrounded by dead motions correctly reads as
  // ABOVE average, not merely "average against itself". Only motions that clear the floor get a lift at
  // all — that's what keeps one lucky send from reallocating — but they are compared to the whole field.
  const staffed = enriched.filter((m) => m.motionKind && m.staged > 0);
  const projectMean = staffed.length
    ? staffed.reduce((s, m) => s + m.observed, 0) / staffed.length
    : null;
  const qualifying = enriched.filter((m) => m.meetsFloor && m.motionKind);

  // Lift is defined ONLY for a floor-clearing motion, against the whole-field mean. Below the floor (or
  // with no staffed field to compare against) lift is honest-null — the machine does not tilt.
  const motions = enriched.map((m) => ({
    ...m,
    lift: m.meetsFloor && projectMean !== null ? m.observed - projectMean : null,
  }));

  return {
    projectId,
    minObservations,
    motions,
    projectMean,
    totals: {
      motions: motions.length,
      qualifying: qualifying.length,
      staged: motions.reduce((s, m) => s + m.staged, 0),
      measured: motions.reduce((s, m) => s + m.measured, 0),
    },
  };
}

// ── renderLearnedSignal — the plain-text "what's working / what drew nothing" block ─────────────────
//
// Mirrors renderTasteProfile in memory.mjs: a compact base-layer block folded into the compose
// grounding beside taste. It names the motion shapes that earned outcomes ("what's working") and the
// ones that drew nothing measured ("what drew nothing"), in plain founder register, strictly honest —
// no rate is invented, a motion under the floor is not called a winner. Returns "" when there's nothing
// measured yet, so a fresh project adds no learn block (exactly as an untrained taste bank stays empty).
export function renderLearnedSignal(signal) {
  if (!signal || !Array.isArray(signal.motions) || !signal.motions.length) return "";

  const named = signal.motions.filter((m) => m.motionKind);

  // What's working: floor-clearing motions at or above the field mean that earned outcomes, most-lifted
  // first (a lone measured winner has lift 0 and still counts — nothing is outperforming it).
  const working = named
    .filter(isWorking)
    .sort((a, b) => b.lift - a.lift || b.observed - a.observed);

  // What drew nothing: motions with staged work and zero measured outcomes.
  const drewNothing = named
    .filter((m) => m.staged > 0 && m.measured === 0)
    .sort((a, b) => b.staged - a.staged);

  if (!working.length && !drewNothing.length) return "";

  const parts = [];
  if (working.length) {
    parts.push(
      "Motion shapes that are EARNING WINS (lean toward these — compose more of this shape):\n" +
        working
          .map((m) => {
            const kinds = Object.entries(m.outcomesByKind)
              .sort((a, b) => b[1] - a[1])
              .map(([kind, n]) => `${n} ${kind}`)
              .join(", ");
            return `- ${m.motionKind}: ${kinds || `${m.observed} measured`} (above this product's average)`;
          })
          .join("\n"),
    );
  }
  if (drewNothing.length) {
    parts.push(
      "Motion shapes that have DRAWN NOTHING measured (don't lean on these; a fresh angle beats repeating them):\n" +
        drewNothing
          .map((m) => `- ${m.motionKind}: ${m.staged} action${m.staged === 1 ? "" : "s"} staged, 0 measured`)
          .join("\n"),
    );
  }
  return "\n\n--- What your outcomes have taught the machine so far ---\n" + parts.join("\n\n");
}

// ── reallocationWeights — the bounded, clamped ranking tilt ──────────────────────────────────────
//
// Produces a tilted copy of the founder's base ranking weights so the NEXT ranking leans toward the
// signals a working motion embodies — WITHOUT ever inverting or overriding the founder. The base
// weights (signal-weights-store) are the anchor; the tilt is a bounded nudge on top, clamped so no
// weight moves by more than `tiltClamp` of its base value (a founder tunable, default 0.35).
//
// The mapping (deterministic, honest): a motion earns outcomes only when it is grounded in real,
// measurable market signal — so a positive net lift across the project tilts UP the two hard-evidence
// signals ranking already leads with (evidenceStrength, measurementReadiness), and eases the softer
// proxies (upside, founderFit) proportionally. This says "reward the ranking dimensions that correlate
// with motions that actually convert", the same logic taste applies to voice — it never encodes WHICH
// channel to run (that stays the model's open composition). With no floor-clearing lift, the tilt is a
// no-op and the base weights pass through unchanged.
//
// Returns { weights, applied, tilt, reasons } — `weights` is the tilted table ranking consumes;
// `applied` is false (and weights === base) when nothing cleared the floor; `reasons` is a plain-words
// receipt of what moved and why, for the reallocation card. Founder weights ALWAYS win: every returned
// weight stays strictly positive and within the clamp of its base, so the ordering the founder tuned
// can never be inverted by a tilt.
export function reallocationWeights(signal, baseWeights) {
  const base = {};
  for (const key of SIGNAL_WEIGHT_KEYS) {
    const n = Number(baseWeights?.[key]);
    base[key] = Number.isFinite(n) && n >= 0 ? n : 0;
  }

  const noOp = { weights: { ...base }, applied: false, tilt: {}, reasons: [] };
  if (!signal || !Array.isArray(signal.motions)) return noOp;

  // The clamp comes from the same tunables the floor does; a signal that carried its minObservations
  // implies the tunables are loaded, but the clamp is read fresh so it can't drift from the store.
  const clamp = clampFraction(signal.tiltClamp);

  // The confident winners: motions that cleared the floor and sit at or above the field mean (a lone
  // measured winner counts — its lift is 0 but nothing outperforms it). No winner → no tilt.
  const lifted = signal.motions.filter(isWorking);
  if (!lifted.length) return noOp;

  // Tilt strength scales with how much of the project's OBSERVED outcomes come from confident winners —
  // if every measured outcome came from a winning shape, the machine leans at the full clamp; if winners
  // are only a slice of what's been measured, it leans proportionally less. Hard-capped at the founder's
  // clamp, so the base weight is never inverted. (Observed share, not raw lift, so a lone winner whose
  // lift is 0 against a one-motion field still drives a real, honest tilt.)
  const winnerObserved = lifted.reduce((s, m) => s + (m.observed || 0), 0);
  const totalObserved = signal.motions.reduce((s, m) => s + (m.observed || 0), 0) || 1;
  const winnerShare = Math.min(1, winnerObserved / totalObserved);
  const strength = clamp * winnerShare;

  const UP = ["evidenceStrength", "measurementReadiness"];
  const DOWN = ["upside", "founderFit"];

  const weights = { ...base };
  const tilt = {};
  for (const key of UP) {
    if (base[key] > 0) {
      const delta = base[key] * strength;
      weights[key] = base[key] + delta;
      tilt[key] = delta;
    }
  }
  for (const key of DOWN) {
    if (base[key] > 0) {
      const delta = base[key] * strength;
      // Ease down, never below a floor of (1 - clamp) of the base — the founder's weight can't be zeroed.
      weights[key] = Math.max(base[key] * (1 - clamp), base[key] - delta);
      tilt[key] = weights[key] - base[key];
    }
  }

  const reasons = [
    `${lifted.length} motion${lifted.length === 1 ? "" : "s"} cleared the observation floor and earned outcomes at or above this product's average`,
    `tilted ranking toward hard evidence (evidence + measurement) by up to ${(strength * 100).toFixed(0)}% of your base, clamped so your weights always win`,
  ];

  return { weights, applied: true, tilt, reasons };
}

function clampFraction(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return 0.35;
  return Math.min(0.9, v);
}

// A signal-weights read pre-baked with the tilt applied, for the ranking seam. Reads the founder's
// saved base for the project, folds in the project's learned signal (with its live tunable clamp), and
// returns the tilted table plus the receipt. path-ranking.mjs:182 calls THIS instead of getSignalWeights
// so ranking scores against the reallocated weights — the loop closing on the ranking side. With nothing
// measured, `applied` is false and the returned weights are byte-identical to the founder's base.
export function tiltedSignalWeights(options = {}) {
  const projectId = options.projectId ?? "default";
  const base = getSignalWeights({ ...options, projectId });
  const signal = learnedSignal(projectId, options);
  const tunables = getReallocationTunables({ ...options, projectId });
  const result = reallocationWeights({ ...signal, tiltClamp: tunables.tiltClamp }, base);
  return { base, ...result, signal };
}

// ── learnedSignalAcross — the cross-product prior ───────────────────────────────────────────────────
//
// A WEAK prior for a product with no measured signal of its own: what has worked across OTHER products.
// It finally consumes `structuralProjection` (gtm-store) — the PII-stripped, non-identifying half of
// every Learning — pooled across projects with the excluded project's own learnings dropped. Every
// identifying field is already gone at the projection boundary, so this pools shapes and outcome kinds,
// never customer text.
//
// It is FLOORED so it never overrides a project's own measured signal: it returns a prior only, ranked
// by pooled observed outcomes per motion shape, and the caller uses it solely when the project's own
// learnedSignal has nothing measured. A single cross-product observation is not a winner — the same
// observation floor applies to the pool.
//
// Returns { motions: [{ productShape, channel, observed, kinds }], observedProjects, floored: true }.
// Honest-empty when the pool is empty. NO aggregation across companies beyond this read; no recommendation.
export function learnedSignalAcross({ excludeProjectId = null } = {}, options = {}) {
  let learnings = [];
  try {
    // Pool across EVERY project: list without a projectId filter so all learnings from all products come
    // back (the store filters by projectId only when one is passed). We drop the excluded project below,
    // so a new product's prior is genuinely OTHER-product signal.
    learnings = learningStore.list({ ...options, projectId: null }) ?? [];
  } catch {
    learnings = [];
  }

  const minObservations = clampNonNeg(
    getReallocationTunables({ ...options, projectId: null }).observationFloor,
    5,
  );

  // Pool the STRUCTURAL projection only — identity is stripped at the projection boundary. Drop the
  // excluded project's own learnings so a new product's prior is genuinely other-product signal.
  const byShape = new Map();
  const projects = new Set();
  for (const learning of Array.isArray(learnings) ? learnings : []) {
    if (!learning) continue;
    if (excludeProjectId && learning.projectId === excludeProjectId) continue;
    const projection = structuralProjection(learning);
    if (!projection) continue;
    const result = projection.result ?? null;
    // Only a joined, real outcome counts toward the prior — an unjoined learning is not evidence a shape works.
    if (!result || !result.joined) continue;
    const shape = String(projection.productShape ?? projection.runType ?? "").trim() || "unlabeled";
    const channel = String(projection.channel ?? "").trim() || null;
    const outcomeKind = String(result.outcomeKind ?? "").trim() || "unlabeled";
    const poolKey = `${shape}\0${channel ?? ""}`;
    if (!byShape.has(poolKey)) {
      byShape.set(poolKey, { productShape: shape === "unlabeled" ? null : shape, channel, observed: 0, kinds: {} });
    }
    const row = byShape.get(poolKey);
    row.observed += 1;
    row.kinds[outcomeKind] = (row.kinds[outcomeKind] ?? 0) + 1;
    if (learning.projectId) projects.add(learning.projectId);
  }

  const motions = [...byShape.values()]
    // Floored: a pooled shape is a prior only past the same observation floor — a single cross-product
    // observation is not evidence.
    .filter((row) => row.observed >= minObservations)
    .sort((a, b) => b.observed - a.observed);

  return { motions, observedProjects: projects.size, floored: true, minObservations };
}

// ── Starve — the read Area 2 consumes to flag a motion for the founder's batch ──────────────────────
//
// ADVISORY ONLY (decided-question 1, Overdrive). This NEVER auto-kills. It returns the motions whose
// shape has drawn nothing measured over a meaningful amount of staged work — a correctable receipt for
// the founder's batch ("cold email: 0 of 41 measured in 3 weeks"), NOT a pause and NOT a kill. Area 2's
// runDueMotions consumes this to decide whether a due motion gets FLAGGED-for-review instead of
// re-staged; the flag is the founder's to overturn.
//
// A motion is starved when it has staged at least `minStaged` actions (past the noise of a first send)
// and measured ZERO outcomes. `minStaged` defaults to the observation floor so the same tunable governs
// both directions. Returns { motions: [{ motionKind, motionRef, staged, measured, reason }], minStaged }.
// Honest-empty when nothing qualifies.
export function starvedMotions(projectId = "default", options = {}) {
  const signal = learnedSignal(projectId, options);
  const minStaged = signal.minObservations;
  const motions = signal.motions
    .filter((m) => m.motionKind && m.staged >= minStaged && m.measured === 0)
    .map((m) => ({
      motionKind: m.motionKind,
      motionRef: m.motionRef,
      staged: m.staged,
      measured: 0,
      // Plain counts the founder reads in the batch — never a verdict, never a kill.
      reason: `${m.staged} action${m.staged === 1 ? "" : "s"} staged, 0 measured — nothing has come back from this motion shape yet`,
    }))
    .sort((a, b) => b.staged - a.staged);
  return { projectId, minStaged, motions };
}

// ── The reallocation receipt — the Overdrive card the batch renders ─────────────────────────────────
//
// One plain-language object the founder's batch/gate surface renders as a correctable receipt: what the
// machine tilted, why, drawn from which outcomes, plus the starved motions flagged for a decision. It is
// a RECEIPT, never a hidden policy — everything on it is overturnable (retune the weights, un-flag a
// motion). Pure read; composes learnedSignal + reallocationWeights + starvedMotions.
export function reallocationReceipt(projectId = "default", options = {}) {
  const tilted = tiltedSignalWeights({ ...options, projectId });
  const starved = starvedMotions(projectId, options);
  const working = (tilted.signal.motions ?? [])
    .filter(isWorking)
    .sort((a, b) => b.lift - a.lift || b.observed - a.observed)
    .map((m) => ({
      motionKind: m.motionKind,
      motionRef: m.motionRef,
      observed: m.observed,
      outcomesByKind: m.outcomesByKind,
    }));
  return {
    projectId,
    applied: tilted.applied,
    base: tilted.base,
    weights: tilted.weights,
    tilt: tilted.tilt,
    reasons: tilted.reasons,
    working,
    starved: starved.motions,
    minObservations: tilted.signal.minObservations,
  };
}
