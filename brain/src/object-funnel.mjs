// deriveFunnel — a PURE read-time projection over Area 1's touch ledger + the outcome (Result) ledger.
// It groups every touched object by kind × an EMERGENT advisory bucket. The buckets are DERIVED here from
// touches + outcome joins on every read — there is NO stored state/stage field on an object and NO
// transition table (that was the stage-machine cage Area 1 explicitly cut; see GTM-MACHINE.md §"Staying
// out of the cage" #1). Change the join rule and the funnel changes with the next read; nothing to migrate.
//
// This renders inside the Operator lens (Area 6) as the funnel — it is that lens zoomed to objects, not a
// third surface. Read-only, never seeded: an object with no touches simply isn't here, and an empty
// project returns empty groups honestly.

import { listObjectTouches } from "./gtm-store.mjs";
import { resultStore } from "./gtm-store.mjs";

// Is a set-aside touch still in force at `asOf`? A set-aside with no `until` suppresses indefinitely; one
// with an `until` suppresses only until that timestamp passes. A later touch of ANY other verb does NOT
// automatically clear it — only time (until) or a founder re-touch would, which stays honest to the
// ledger being the single record.
function setAsideActive(touch, asOf) {
  if (!touch || touch.verb !== "set-aside") return false;
  if (!touch.until) return true;
  return String(touch.until) > asOf;
}

// The set of objectKeys a real outcome has joined back to. The honest join available today: a Result's
// buyerRef or joinKey that equals an object's key. Area 7 widens this with motionKind/motionRef; until
// then this is the truthful, narrow join — never a fabricated conversion.
function convertedKeys(projectId, options) {
  const keys = new Set();
  let results = [];
  try {
    results = resultStore.list({ ...options, projectId });
  } catch {
    results = [];
  }
  for (const result of results) {
    if (!result) continue;
    const ref = String(result.buyerRef ?? "").trim();
    if (ref) keys.add(ref);
    const joinKey = String(result.joinKey ?? "").trim();
    if (joinKey) keys.add(joinKey);
  }
  return keys;
}

// The emergent bucket for one object, derived from its touches + the converted-key set. Order of checks
// is the resolution: a founder set-aside that is still active always reads as suppressed; a joined outcome
// reads as handled; a distinct-motion touch count of 2+ reads as in_flight (worked by more than one
// motion, not yet resolved); otherwise the object is simply seen. All ADVISORY — no bucket gates anything.
export function bucketFor(record, { convertedKeySet, asOf } = {}) {
  const touches = Array.isArray(record?.touches) ? record.touches : [];
  const suppressed = touches.some((t) => setAsideActive(t, asOf));
  if (suppressed) return "suppressed";
  if (convertedKeySet && convertedKeySet.has(record.objectKey)) return "handled";
  const motions = new Set(touches.map((t) => t.motionId).filter(Boolean));
  if (motions.size >= 2) return "in_flight";
  return "seen";
}

// Group a project's touched objects by kind × emergent bucket. Returns:
//   { projectId, asOf, kinds: [{ kind, total, buckets: { seen, in_flight, handled, suppressed },
//       objects: [{ objectKey, kind, label, bucket, motionCount, touchCount, lastSeenAt }] }],
//     totals: { seen, in_flight, handled, suppressed, total } }
// Deterministic and read-only; honest-blind (empty kinds[]) on a project nothing has touched yet.
export function deriveFunnel(projectId = "default", options = {}) {
  const asOf = new Date().toISOString();
  const records = listObjectTouches(projectId, options);
  const convertedKeySet = convertedKeys(projectId, options);

  const byKind = new Map();
  const totals = { seen: 0, in_flight: 0, handled: 0, suppressed: 0, total: 0 };

  for (const record of records) {
    if (!record?.objectKey) continue;
    const kind = String(record.kind ?? "").trim() || "object";
    const bucket = bucketFor(record, { convertedKeySet, asOf });
    const touches = Array.isArray(record.touches) ? record.touches : [];
    const motionCount = new Set(touches.map((t) => t.motionId).filter(Boolean)).size;

    if (!byKind.has(kind)) {
      byKind.set(kind, { kind, total: 0, buckets: { seen: 0, in_flight: 0, handled: 0, suppressed: 0 }, objects: [] });
    }
    const group = byKind.get(kind);
    group.total += 1;
    group.buckets[bucket] = (group.buckets[bucket] ?? 0) + 1;
    group.objects.push({
      objectKey: record.objectKey,
      kind,
      label: record.label ?? null,
      bucket,
      motionCount,
      touchCount: touches.length,
      lastSeenAt: record.lastSeenAt ?? null,
    });

    totals[bucket] = (totals[bucket] ?? 0) + 1;
    totals.total += 1;
  }

  const kinds = [...byKind.values()].sort((a, b) => b.total - a.total || a.kind.localeCompare(b.kind));
  for (const group of kinds) {
    group.objects.sort((a, b) => String(b.lastSeenAt ?? "").localeCompare(String(a.lastSeenAt ?? "")));
  }
  return { projectId, asOf, kinds, totals };
}

// get_next_objects — the objects a motion should look at next: those seen or in-flight (touched, not yet
// handled, not suppressed), newest first, optionally scoped to a kind. A pure read the operator/composer
// consults as a strong steer; it NEVER gates a run. Honest-empty when nothing qualifies.
export function deriveNextObjects(projectId = "default", { kind = null, limit = 50 } = {}, options = {}) {
  const funnel = deriveFunnel(projectId, options);
  const wantKind = String(kind ?? "").trim() || null;
  const out = [];
  for (const group of funnel.kinds) {
    if (wantKind && group.kind !== wantKind) continue;
    for (const obj of group.objects) {
      if (obj.bucket === "seen" || obj.bucket === "in_flight") out.push(obj);
    }
  }
  out.sort((a, b) => String(b.lastSeenAt ?? "").localeCompare(String(a.lastSeenAt ?? "")));
  return { projectId, asOf: funnel.asOf, kind: wantKind, objects: out.slice(0, Math.max(0, limit)) };
}
