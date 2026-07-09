// Close the grounding ordering window. The deep LLM product model derives fire-and-forget after a
// project is grounded/activated (kickProductModelDerive in routes/projects.mjs). A run started right
// after that can reach buildRunGrounding BEFORE the rich model lands, so it silently grounds on only
// the cheap scan facts even though the richer model was about to be available.
//
// This module holds a per-project registry of the in-flight derive promise. The kicker registers its
// promise here; a run path awaits it — with a bounded timeout so it NEVER blocks forever — right
// before it assembles grounding. When the derive has already finished (or none is in flight), the
// await resolves immediately. When it is mid-flight, the run waits just long enough for the model to
// land; when it exceeds the budget, the run proceeds on whatever facts it has (graceful degrade), the
// grounding stays honest, and nothing is fabricated.
//
// Deterministic bookkeeping only — no model call lives here. A settled promise is cleared so the
// registry never pins a stale derive.

const inFlight = new Map(); // projectId -> Promise (resolves/rejects when that derive settles)

// Register the in-flight derive for a project. Called by the fire-and-forget kicker with the SAME
// promise it already launched, so awaiting here awaits the real derive (never a second run). The
// promise is stored settle-swallowed (a failed derive must not reject an awaiting run) and cleared on
// settle so a later run does not await a long-finished derive. Passing a non-promise is a no-op.
export function registerProductModelDerive(projectId, promise) {
  if (!projectId || !promise || typeof promise.then !== "function") return promise;
  // Swallow rejection for the stored copy: an awaiting run cares only that the derive is DONE, not
  // whether it succeeded — a failed derive still degrades gracefully to the cheap scan facts.
  const settled = Promise.resolve(promise).then(
    () => {},
    () => {},
  );
  inFlight.set(projectId, settled);
  // Clear on settle, but only if this same promise is still the registered one (a newer derive may
  // have replaced it in the meantime — do not clobber the newer registration).
  settled.finally(() => {
    if (inFlight.get(projectId) === settled) inFlight.delete(projectId);
  });
  return promise;
}

// Await a pending derive for a project, bounded by timeoutMs so a run NEVER blocks forever. Resolves
// immediately when nothing is in flight. When a derive is mid-flight it resolves as soon as the derive
// settles OR the timeout elapses, whichever comes first — the run then grounds on whatever is present.
// Returns { waited, timedOut } for observability; never throws (a rejected derive resolves the await).
export async function awaitProductModelReady(projectId, { timeoutMs = 4000 } = {}) {
  const pending = projectId ? inFlight.get(projectId) : null;
  if (!pending) return { waited: false, timedOut: false };
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve("timeout"), Math.max(0, timeoutMs));
    // NOTE: the timer is intentionally NOT unref'd. Unref'ing let the event loop drain while a run
    // was still awaiting this budget, so node's test runner cancelled the pending tests
    // ("Promise resolution is still pending but the event loop has already resolved"). The
    // clearTimeout after the Promise.race below already prevents a leak, and in the real server the
    // in-flight HTTP request keeps the loop alive — so production behavior is unchanged.
  });
  const outcome = await Promise.race([pending.then(() => "settled"), timeout]);
  clearTimeout(timer);
  return { waited: true, timedOut: outcome === "timeout" };
}

// Test-only: clear the registry so one test's in-flight derive never leaks into the next.
export function _resetProductModelReady() {
  inFlight.clear();
}
