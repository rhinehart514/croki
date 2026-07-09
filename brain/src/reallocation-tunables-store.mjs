// The reallocation aggressiveness tunables — founder-tunable values, not hardcoded policy.
//
// LEARN's reallocation loop is governed by three numbers that decide HOW FAST the machine reallocates
// and what always-on costs. GTM-MACHINE.md "Open decisions" #4 settles these as TASTE CALLS, not
// derivable arithmetic — so they live in a per-project taste snapshot the founder can tune, right
// beside the signal-weights surface, and are NEVER a hardcoded constant buried in the loop:
//
//   - observationFloor — the minimum measured outcomes before a motion's lift moves the ranking at all.
//     Below it, lift is honest-null (one lucky send never reallocates). Default 5.
//   - tiltClamp — the bounded ceiling on how far a single learned tilt may move a ranking weight
//     (a fraction of the founder's base weight). Founder-saved weights are always the base and can
//     never be inverted, so this caps the tilt at a fraction well under 1. Default 0.35.
//   - dailyProbeCap — the hard daily ceiling on paid MCP probe calls (a geogrid scan costs 50–162
//     credits). Read by Area 2's ambient budget; surfaced here so the founder owns the spend knob.
//     Default 20.
//
// Out of the box this returns the stated defaults, so behavior is identical until a founder tunes it.
// Persistence rides the shared provider (a per-project snapshot under "reallocation-tunables"), the
// same lighter snapshot convention signal-weights uses — this is founder taste, not an event log.

import { persistence } from "./persistence.mjs";
import { now } from "./store-fs.mjs";
import { safeId } from "./store-fs.mjs";

const SCHEMA_VERSION = 1;
const COLLECTION = "reallocation-tunables";

// The stated defaults (GTM-MACHINE.md "Open decisions" #4). Frozen so a caller cannot mutate the
// shared default in place.
export const DEFAULT_REALLOCATION_TUNABLES = Object.freeze({
  observationFloor: 5,
  tiltClamp: 0.35,
  dailyProbeCap: 20,
});

export const REALLOCATION_TUNABLE_KEYS = Object.keys(DEFAULT_REALLOCATION_TUNABLES);

// Sane bounds so a tuned value can never break the loop: the floor is a non-negative integer, the
// clamp is a fraction strictly below 1 (a tilt that could invert the founder's base weight is
// rejected — the base always wins), and the probe cap is a non-negative integer.
function clampFloor(n) {
  const v = Math.floor(Number(n));
  return Number.isFinite(v) && v >= 0 ? v : DEFAULT_REALLOCATION_TUNABLES.observationFloor;
}
function clampTilt(n) {
  const v = Number(n);
  // Strictly (0, 0.9] — a clamp of 0 disables reallocation entirely (honest, allowed); anything at or
  // above 1 could zero-or-invert a base weight, which the "founder weights always win" invariant forbids.
  if (!Number.isFinite(v) || v < 0) return DEFAULT_REALLOCATION_TUNABLES.tiltClamp;
  return Math.min(0.9, v);
}
function clampProbeCap(n) {
  const v = Math.floor(Number(n));
  return Number.isFinite(v) && v >= 0 ? v : DEFAULT_REALLOCATION_TUNABLES.dailyProbeCap;
}

function keyFor(projectId) {
  return safeId(projectId || "default");
}

// Normalize a raw tunables object down to exactly the three known keys, each within its safe bound.
// An unknown key is dropped; a missing or invalid one falls back to its default.
export function normalizeReallocationTunables(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    observationFloor: clampFloor(
      source.observationFloor ?? DEFAULT_REALLOCATION_TUNABLES.observationFloor,
    ),
    tiltClamp: clampTilt(source.tiltClamp ?? DEFAULT_REALLOCATION_TUNABLES.tiltClamp),
    dailyProbeCap: clampProbeCap(
      source.dailyProbeCap ?? DEFAULT_REALLOCATION_TUNABLES.dailyProbeCap,
    ),
  };
}

// The active tunables for a project: a founder's stored tuning merged over the defaults, else the
// exact defaults. A fresh project with nothing stored returns the stated defaults unchanged.
export function getReallocationTunables(options = {}) {
  const stored = persistence(options).get(COLLECTION, keyFor(options.projectId));
  if (!stored) return { ...DEFAULT_REALLOCATION_TUNABLES };
  return normalizeReallocationTunables(stored.tunables ?? stored);
}

// Persist a founder's tuned tunables for a project. The stored table is normalized to the three known
// keys before it is written, and the normalized table is returned so a caller sees exactly what the
// loop will read back.
export function saveReallocationTunables(tunables, options = {}) {
  const normalized = normalizeReallocationTunables(tunables);
  persistence(options).set(COLLECTION, keyFor(options.projectId), {
    schemaVersion: SCHEMA_VERSION,
    projectId: options.projectId || "default",
    tunables: normalized,
    updatedAt: now(),
  });
  return normalized;
}
