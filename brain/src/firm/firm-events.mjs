// firm-events.mjs — the process-local event bus for live work (build contract §2.4, Phase 5). Today the
// UI polls the lens every 900 ms; this bus lets the brain PUSH a small "something changed in this
// venture" signal to any subscribed SSE client, so the founder sees work stream while present without a
// poll storm. The 900 ms poll stays as the reconnect fallback (it is not deleted — see the client hook).
//
// Deliberately tiny and truthful:
//   • It carries NO venture data — only { ventureId, kind, at } notifications. A subscriber that hears
//     "the lens changed" re-reads the lens through the existing venture-scoped, fail-closed read path;
//     the bus never becomes a second data channel that could leak one venture's content to another.
//   • It is process-local by design (like active-drives.mjs). Work runs only while the app is open
//     (decided, honest scope §2.4); there is no cross-process fan-out and no durable event log here —
//     durable truth already lives in the venture store, and "since you left" means "since your last
//     session," never a background service.
//   • Publishing NEVER throws into a caller's happy path: a firm mutation that emits an event must not
//     fail because a listener did. Every emit is best-effort.

const KINDS = new Set(["lens", "conversation", "drive", "wall", "outcome", "timeline", "system", "release"]);

const subscribers = new Map(); // subscriptionId -> { ventureId, listener }
let nextId = 1;

function nowIso() {
  return new Date().toISOString();
}

// Subscribe to one venture's change notifications. Returns an unsubscribe function. `listener` is called
// with { ventureId, kind, at } for every emit scoped to that venture. Scoping is by construction: a
// subscriber never hears another venture's events, mirroring venture-store isolation.
export function subscribeFirmEvents(ventureId, listener) {
  if (!ventureId || typeof listener !== "function") {
    throw new Error("subscribeFirmEvents() needs a ventureId and a listener.");
  }
  const id = nextId++;
  subscribers.set(id, { ventureId, listener });
  return () => subscribers.delete(id);
}

// Emit a change notification for one venture. Best-effort: a throwing listener never breaks the mutation
// that emitted, and an unknown kind is ignored rather than thrown (the caller is a firm mutation, not a
// validation surface). Returns the number of subscribers notified (useful in tests).
export function emitFirmEvent(ventureId, kind, detail = {}) {
  if (!ventureId || !KINDS.has(kind)) return 0;
  const event = {
    ventureId,
    kind,
    at: detail?.at ?? nowIso(),
    ...(detail?.betId ? { betId: String(detail.betId) } : {}),
    ...(detail?.threadRef ? { threadRef: String(detail.threadRef) } : {}),
  };
  let delivered = 0;
  for (const { ventureId: scoped, listener } of subscribers.values()) {
    if (scoped !== ventureId) continue;
    try {
      listener(event);
      delivered += 1;
    } catch {
      /* a broken listener never breaks the emitting mutation */
    }
  }
  return delivered;
}

export function __subscriberCount() {
  return subscribers.size;
}
