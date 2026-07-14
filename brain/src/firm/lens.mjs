// lens.mjs — the canvas's projection (FIRM-SPEC.md "The one lens": "A live drawing of the firm: the
// crew, their bets, the wall, and the market's returns... The lens owns placement memory and nothing
// else — it is never a second database, never a store of nodes, and it renders whatever a bet
// contains without a registry of allowed kinds.").
//
// buildLens() reads crew.mjs + bet docs + wall.mjs's queue — it writes nothing and stores nothing of
// its own. Every field returned is either read straight off an existing document or derived by a pure
// function over it (bet.positionOf, latest outcome = newest joined outcome). Deleting the
// placement document loses only where things sit on the canvas; crew, bets, and decisions are
// untouched, because this module never folds placement into any of them.
//
// Placement is the ONE thing this module persists, and it is exactly what FIRM-SPEC.md licenses the
// lens to own: an anchor id -> {x,y} map, nothing else. It lives in the venture's existing
// "placement" collection (F1's VENTURE_COLLECTIONS — no new collection added) as a single
// CAS-versioned document, so two founder tabs dragging nodes at once fail closed with a conflict
// instead of silently clobbering each other's arrangement.

import { getVentureDoc, listVentureDocs, venturePersistence } from "./venture-store.mjs";
import { listCrew } from "./crew.mjs";
import { positionOf } from "./bet.mjs";
import { queue } from "./wall.mjs";
import { PersistenceConflictError } from "../persistence.mjs";

const PLACEMENT_KEY = "canvas";

function trimOrNull(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function latestOutcomeOf(bet, outcomes) {
  return outcomes
    .filter((outcome) => outcome.betId === bet.id)
    .sort((left, right) => String(right.observedAt).localeCompare(String(left.observedAt)))[0] ?? null;
}

// One bet, shaped for the lens: its content untouched, plus the two things only the loop itself can
// derive — position (live/at-wall/ended) and the latest outcome, if the market has spoken. `wallQueue`
// is this venture's own queue (already loaded once by buildLens), so positionOf never re-reads it per
// bet.
function projectBet(bet, wallQueue, outcomes) {
  return {
    ...bet,
    position: positionOf(bet, wallQueue),
    stagedCount: Array.isArray(bet.staged) ? bet.staged.length : 0,
    latestOutcome: latestOutcomeOf(bet, outcomes),
  };
}

// The wall summary the lens draws as its one unmistakable boundary — a count of items waiting, never
// broken down by kind or scored (the founder reads the queue itself at the wall; the lens only
// needs to know the wall has weight). Also the oldest parkedAt, so the lens can flag a queue that has
// sat untouched rather than just how many are in it.
function wallSummary(wallQueue) {
  return {
    count: wallQueue.length,
    oldestParkedAt: wallQueue.length ? wallQueue[0].parkedAt : null,
  };
}

// The venture's placement document, or an empty map if none has ever been saved. Carries its own CAS
// revision (starting at 0 = absent, matching persistence.mjs's compareAndSet convention) so
// putPlacement below can never silently clobber a concurrent drag from another tab.
function loadPlacement(ventureId, options) {
  const doc = getVentureDoc(ventureId, "placement", PLACEMENT_KEY, options);
  return doc ?? { positions: {}, revision: 0 };
}

// GET /api/ventures/:id/lens's whole payload: crew, bets (with position/staged/latest outcome derived),
// the wall summary, and placement. A pure read over three existing stores — nothing here is stored by
// this call.
export function buildLens(ventureId, options = {}) {
  const wallQueue = queue(ventureId, options);
  const crew = listCrew(ventureId, options);
  const outcomes = listVentureDocs(ventureId, "outcomes", options);
  const bets = listVentureDocs(ventureId, "bets", options).map((bet) => projectBet(bet, wallQueue, outcomes));
  return {
    ventureId,
    crew,
    bets,
    wall: wallSummary(wallQueue),
    placement: loadPlacement(ventureId, options),
  };
}

// PUT .../placement — founder placement, compareAndSet. `expectedRevision` must match the document's
// current revision (0 for "no placement saved yet"); a stale write throws PersistenceConflictError,
// exactly like every other CAS document in this tree, so two tabs racing a drag fail closed instead of
// one silently winning. `positions` replaces the whole map — the caller (the lens UI) always sends its
// full current arrangement, never a per-anchor patch, so there is no merge logic to get wrong here.
export function putPlacement(ventureId, { positions, expectedRevision }, options = {}) {
  if (!trimOrNull(ventureId)) throw new Error("putPlacement() needs a ventureId.");
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
    throw new Error("putPlacement() needs a non-negative integer expectedRevision.");
  }
  if (positions == null || typeof positions !== "object" || Array.isArray(positions)) {
    throw new Error("putPlacement() needs a positions map ({ anchorKey: {x,y} }).");
  }
  const next = { positions, revision: expectedRevision + 1 };
  // Route through persistence.mjs's own compareAndSet rather than venture-store's plain setVentureDoc,
  // because CAS is the one write shape venture-store deliberately leaves to the underlying provider
  // (venture-store.mjs's own doc comment: "invents no new persistence mechanism... beyond what
  // persistence.mjs's CAS already provides"). getVentureDoc still covers the fail-closed existence
  // check; venturePersistence is the same scoped provider every other venture-scoped write uses.
  getVentureDoc(ventureId, "placement", PLACEMENT_KEY, options); // asserts the venture exists, fail-closed
  return venturePersistence(options, ventureId).compareAndSet("placement", PLACEMENT_KEY, expectedRevision, next);
}

// Deleting the placement document loses only positions — the acceptance criterion FIRM-SPEC.md names
// for the lens ("deleting the lens store loses only placement"). Exposed for the F6 acceptance fixture
// and for a founder "reset the canvas layout" action; crew/bets/decisions are untouched because this
// only ever touches the "placement" collection.
export function clearPlacement(ventureId, options = {}) {
  getVentureDoc(ventureId, "placement", PLACEMENT_KEY, options); // fail-closed on an unknown venture
  venturePersistence(options, ventureId).delete("placement", PLACEMENT_KEY);
}

export { PersistenceConflictError };
