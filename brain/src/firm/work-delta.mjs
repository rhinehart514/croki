// work-delta.mjs — the ONE typed, payload-carrying event kind that rides the venture-scoped firm-events
// bus (Reshape decisions 27/28: live-work markers and focused-node live detail). It exists so a focused
// canvas node gets sub-second live detail without the ~900 ms lens poll, and WITHOUT teaching the
// data-free invalidation bus to carry arbitrary content.
//
// The contract is deliberately narrow:
//   • The payload is a SMALL discriminated union (below), normalized here before it ever reaches the
//     transport. firm-events.mjs never interprets it — this module owns the type and the safety, the bus
//     owns only venture-scoped fan-out. That keeps the "surface conflicts, never blend" line: the bus
//     stays a dumb delivery mechanism; the one typed exception is named and bounded here.
//   • A delta carries ONLY safe factual shape: a tool-step label, an optional source ref, a status, a
//     step id to correlate started/finished, and a measured duration. It NEVER carries chain-of-thought,
//     raw model prose, secrets, tool output bodies, or file contents. There is intentionally no free-form
//     `detail`/`text`/`body` field anywhere in the union — a field that could smuggle prose cannot exist.
//   • Normalization is total: an unknown `type`, a missing required field, or a junk value yields null and
//     the delta is dropped rather than thrown. The caller is an emission seam, not a validation surface.
//   • Emission is additive and backward compatible: the event is a NEW SSE event name (`work-delta`) that
//     pre-existing invalidation consumers never subscribed to, so they ignore it by construction.
//
// The delta union (discriminated by `type`):
//   { type: "step-started";    stepId, label }
//   { type: "step-finished";   stepId, label, status, durationMs }
//   { type: "source-consulted"; label, ref }
//   { type: "status-changed";  status, previous }

import { emitFirmEvent } from "./firm-events.mjs";

const LABEL_CAP = 120;
const REF_CAP = 480;
const STATUS_CAP = 40;
const STEP_ID_CAP = 128;

function cap(value, max) {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, max) : "";
}

function duration(value) {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
}

// Normalize one delta into the exact safe shape every subscriber can trust, or null to drop it. Only the
// whitelisted fields per type survive; anything else the caller passed is discarded, so a seam cannot
// accidentally widen the payload.
export function normalizeWorkDelta(delta) {
  const type = String(delta?.type ?? "");
  if (type === "step-started") {
    const stepId = cap(delta.stepId, STEP_ID_CAP);
    const label = cap(delta.label, LABEL_CAP);
    return stepId && label ? { type, stepId, label } : null;
  }
  if (type === "step-finished") {
    const stepId = cap(delta.stepId, STEP_ID_CAP);
    const label = cap(delta.label, LABEL_CAP);
    if (!stepId || !label) return null;
    return { type, stepId, label, status: cap(delta.status, STATUS_CAP) || "ok", durationMs: duration(delta.durationMs) };
  }
  if (type === "source-consulted") {
    const label = cap(delta.label, LABEL_CAP);
    return label ? { type, label, ref: cap(delta.ref, REF_CAP) || null } : null;
  }
  if (type === "status-changed") {
    const status = cap(delta.status, STATUS_CAP);
    return status ? { type, status, previous: cap(delta.previous, STATUS_CAP) || null } : null;
  }
  return null;
}

// Emit one typed work delta for a venture, keyed to a subject (a bet/node and/or a Thread) so a focused
// consumer can subscribe to just its own deltas. Best-effort in every direction, exactly like the
// invalidation emit it delegates to: a junk delta is dropped and a throwing subscriber never breaks the
// work loop that emitted. Returns the number of subscribers notified (0 when dropped).
export function emitWorkDelta(ventureId, { delta, betId = null, threadRef = null, at = null } = {}) {
  if (!ventureId) return 0;
  const normalized = normalizeWorkDelta(delta);
  if (!normalized) return 0;
  return emitFirmEvent(ventureId, "work-delta", {
    delta: normalized,
    ...(betId ? { betId } : {}),
    ...(threadRef ? { threadRef } : {}),
    ...(at ? { at } : {}),
  });
}
