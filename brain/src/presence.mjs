// Founder presence — the "away" / unattended state (EXPERIMENT-MACHINE-SPEC rail 1, second half:
// "when the founder is away, nothing outward runs").
//
// This is RUNTIME STATE, not a business ontology — a single volatile lease the founder's browser
// refreshes with a heartbeat, and the backend checks before it lets any STANDING (blessed-pattern)
// autonomy auto-approve an outward item. It is deliberately NOT a schema, enum, or role taxonomy, and
// NOT persisted to disk: the process IS the session for a local single-founder desktop app, and a
// restart honestly resets to "away" (the conservative default) until a browser heartbeats again.
//
// The wall is UNCHANGED. Away never loosens anything — it can only turn a would-be auto-approval into a
// held, pending item. A live human decision (an explicit gate approval, a per-run blessed pattern the
// founder just stamped) is unaffected: away holds only the UNATTENDED auto-apply of a standing pattern.
//
// Detection is AUTOMATIC (a heartbeat/lease), which is the founder's recommended default. The mechanism
// is intentionally swappable: `markPresent` / `markAway` are the only writers, and a manual toggle would
// call the same two functions — nothing else in the system reads presence except through `getPresence`
// and `isFounderPresent`, so switching automatic → manual is a one-file change here.

// How long a heartbeat keeps the founder "present" before the lease lapses to "away". The browser
// re-pings well inside this window; a closed tab, a sleeping laptop, or a crashed page simply stops
// pinging and the lease lapses on its own — no explicit "I'm leaving" signal is required. Generous
// enough to survive a brief network hiccup, short enough that a genuinely-gone founder holds outward
// work within a minute.
export const PRESENCE_LEASE_MS = 60_000;

// The single volatile lease. `lastHeartbeatAt` is the wall-clock of the most recent browser ping; null
// means no browser has ever heartbeated in this process lifetime (a fresh boot → away, conservatively).
const lease = { lastHeartbeatAt: null, source: null };

// Injectable clock so tests can drive the lease deterministically without real timers.
let now = () => Date.now();
export function __setPresenceClock(fn) { now = typeof fn === "function" ? fn : () => Date.now(); }

// Record a browser heartbeat — the founder's page is open and attending. `source` is a free-form label
// (e.g. "heartbeat", "manual") kept only for the indicator's honesty about WHY the state is what it is;
// it is never branched on. This is the "present" writer; a manual toggle would call it too.
export function markPresent(source = "heartbeat") {
  lease.lastHeartbeatAt = now();
  lease.source = String(source || "heartbeat");
  return getPresence();
}

// Explicitly drop to away (e.g. the founder closed the app, or a future manual toggle). Lapsing the lease
// naturally also yields away; this is the explicit form. The conservative writer — it can only ADD hold.
export function markAway(source = "explicit") {
  lease.lastHeartbeatAt = null;
  lease.source = String(source || "explicit");
  return getPresence();
}

// Is the founder present RIGHT NOW? True only while a heartbeat is within the lease window. Pure read;
// this is the one predicate the outward-hold checks. Everything conservative flows from here: no
// heartbeat ever → away; a lapsed lease → away; a fresh heartbeat → present.
export function isFounderPresent() {
  if (lease.lastHeartbeatAt == null) return false;
  return now() - lease.lastHeartbeatAt < PRESENCE_LEASE_MS;
}

// The always-visible indicator's data. A quiet STATE CHIP, never a KPI: it reports which state the
// system thinks it is in (so it is never guessing silently), the lease age, and the automatic default.
// `presentUntil` lets the browser know when it must re-ping to stay present.
export function getPresence() {
  const present = isFounderPresent();
  return {
    state: present ? "present" : "away",
    present,
    // When away, outward standing-autonomy auto-approval is held; the wall itself is unchanged.
    outwardHold: !present,
    lastHeartbeatAt: lease.lastHeartbeatAt,
    presentUntil: lease.lastHeartbeatAt == null ? null : lease.lastHeartbeatAt + PRESENCE_LEASE_MS,
    leaseMs: PRESENCE_LEASE_MS,
    source: lease.source,
    // The recommended-default flag. Automatic detection is the founder's default; keeping it explicit
    // here documents that the mechanism is overturnable to a manual toggle without a data-shape change.
    detection: "automatic",
    since: now(),
  };
}

// Test-only reset so the volatile lease starts clean between cases.
export function __resetPresence() {
  lease.lastHeartbeatAt = null;
  lease.source = null;
  now = () => Date.now();
}
