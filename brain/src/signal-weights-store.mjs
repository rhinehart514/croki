// The path-ranking signal weights — a founder-tunable table, not a frozen constant.
//
// The composite that ranks GTM paths is a weighted sum of the seven ranking signals (evidence
// strength, product readiness, channel reachability, measurement readiness, speed to test, upside,
// founder fit). HOW those signals trade off is a strategic JUDGMENT — which is why it belongs to the
// taste layer the founder can tune, not to a hardcoded table in the ranking code. The ARITHMETIC of
// combining them stays deterministic code (see compositeRank); only the weight VALUES live here.
//
// Out of the box this returns exactly the numbers ranking has always used, so behavior is identical
// until a founder tunes it. A gate promote / keep / kill can later persist a tuned table per project
// (via saveSignalWeights); until one does, every project reads the same defaults.
//
// Persistence rides the shared provider (a per-project snapshot under the "signal-weights" collection),
// the same lighter snapshot convention DesignState uses — this is founder taste, not an event log.

import { persistence } from "./persistence.mjs";
import { safeId, now } from "./store-fs.mjs";

const SCHEMA_VERSION = 1;
const COLLECTION = "signal-weights";

// The seed defaults — today's exact tuned numbers, lifted verbatim from the old hardcoded
// SIGNAL_WEIGHTS table. Frozen so a caller cannot mutate the shared default in place. The two
// hard-evidence signals lead (is this grounded / is the product ready); the softer proxies trail.
export const DEFAULT_SIGNAL_WEIGHTS = Object.freeze({
  evidenceStrength: 0.22,
  productReadiness: 0.15,
  channelReachability: 0.15,
  measurementReadiness: 0.13,
  speedToTest: 0.13,
  upside: 0.12,
  founderFit: 0.1,
});

// The seven weight keys, in the canonical order the defaults declare them.
export const SIGNAL_WEIGHT_KEYS = Object.keys(DEFAULT_SIGNAL_WEIGHTS);

function keyFor(projectId) {
  return safeId(projectId || "default");
}

// Normalize a raw weights object down to exactly the seven known keys, each a finite number >= 0.
// An unknown key is dropped; a missing or invalid one falls back to its default. This guarantees the
// same shape the composite arithmetic expects, so a tuned or partial table can never break ranking.
export function normalizeSignalWeights(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const out = {};
  for (const key of SIGNAL_WEIGHT_KEYS) {
    const n = Number(source[key]);
    out[key] = Number.isFinite(n) && n >= 0 ? n : DEFAULT_SIGNAL_WEIGHTS[key];
  }
  return out;
}

// The active weights for a project: a founder's stored tuning merged over the defaults, else the
// exact defaults. A fresh project with nothing stored returns today's numbers unchanged, so ranking
// behavior is identical out of the box.
export function getSignalWeights(options = {}) {
  const stored = persistence(options).get(COLLECTION, keyFor(options.projectId));
  if (!stored) return { ...DEFAULT_SIGNAL_WEIGHTS };
  return normalizeSignalWeights(stored.weights ?? stored);
}

// Persist a founder's tuned weights for a project (the future gate promote / keep / kill hook). The
// stored table is normalized to the seven known keys before it is written, and the normalized table
// is returned so a caller sees exactly what ranking will read back.
export function saveSignalWeights(weights, options = {}) {
  const normalized = normalizeSignalWeights(weights);
  persistence(options).set(COLLECTION, keyFor(options.projectId), {
    schemaVersion: SCHEMA_VERSION,
    projectId: options.projectId || "default",
    weights: normalized,
    updatedAt: now(),
  });
  return normalized;
}
