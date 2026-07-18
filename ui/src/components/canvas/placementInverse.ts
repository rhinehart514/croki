// placementInverse — PURE prior-positions inverse for the canvas revision stack (SPEC B).
//
// A placement (a founder drop) is undoable by re-applying the positions the moved nodes HAD before the drop.
// This module snapshots the prior positions for exactly the ids a drop touched and computes the forward and
// inverse position maps, so the revision stack can carry a placement as a `{ forward, inverse }` entry that
// rides the SAME conflict-safe putPlacement path a normal drop does (poll-safe — undo is just another
// placement write, never a force).
//
// It is pure: it derives maps from the before/after snapshots the stage passes in. It never writes, never
// reads the store, never touches sessionStorage.

export type PlacementPositions = Record<string, { x: number; y: number }>;

// The forward + inverse position maps for a placement, scoped to the ids the drop actually MOVED. Only moved
// ids are carried so undo re-applies the minimum: a node the founder never touched is never rewritten by an
// undo, and a compound action's placement half stays small.
export type PlacementDelta = {
  // The positions to write to REDO the placement (the ids' after-positions).
  forward: PlacementPositions;
  // The positions to write to UNDO the placement (the ids' before-positions). An id that did not exist
  // before the drop maps to its after-position under forward and is simply re-set on undo; the stage's
  // putPlacement tolerates re-setting an existing id, so no id is ever left dangling.
  inverse: PlacementPositions;
  // The ids this placement moved — the entry's scope, for the receipt's founder-facing name and for the
  // stage to know which nodes an undo will move.
  movedIds: string[];
};

function samePoint(a: { x: number; y: number } | undefined, b: { x: number; y: number } | undefined): boolean {
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y;
}

// Compute the delta between the positions BEFORE a drop and the positions AFTER it. An id is "moved" when
// its after-position differs from its before-position (a genuinely new id — no before — also counts as
// moved). Ids present before but unchanged are excluded so the entry carries only real movement.
export function placementDelta(before: PlacementPositions, after: PlacementPositions): PlacementDelta {
  const forward: PlacementPositions = {};
  const inverse: PlacementPositions = {};
  const movedIds: string[] = [];

  for (const [id, afterPos] of Object.entries(after)) {
    const beforePos = before[id];
    if (samePoint(beforePos, afterPos)) continue;
    movedIds.push(id);
    forward[id] = { x: afterPos.x, y: afterPos.y };
    // Undo restores the prior position when there was one; a brand-new id has no prior, so undo re-sets it
    // to its after-position (a no-op move) rather than dropping it — the node never disappears on undo.
    inverse[id] = beforePos ? { x: beforePos.x, y: beforePos.y } : { x: afterPos.x, y: afterPos.y };
  }

  return { forward, inverse, movedIds };
}

// Merge a placement delta's positions onto a base position map — the operation the stage runs to APPLY
// either the forward (redo) or inverse (undo) side of a placement entry. Pure: returns a new map, leaving
// ids the delta does not name untouched.
export function applyPlacement(base: PlacementPositions, delta: PlacementPositions): PlacementPositions {
  const next: PlacementPositions = { ...base };
  for (const [id, point] of Object.entries(delta)) {
    next[id] = { x: point.x, y: point.y };
  }
  return next;
}
