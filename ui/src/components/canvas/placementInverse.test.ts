import { describe, expect, it } from "vitest";
import { placementDelta, applyPlacement } from "./placementInverse";

describe("placementDelta (SPEC B, pure prior-positions inverse)", () => {
  it("carries only the ids a drop actually moved", () => {
    const before = { a: { x: 0, y: 0 }, b: { x: 10, y: 10 }, c: { x: 20, y: 20 } };
    const after = { a: { x: 0, y: 0 }, b: { x: 99, y: 99 }, c: { x: 20, y: 20 } };
    const delta = placementDelta(before, after);
    expect(delta.movedIds).toEqual(["b"]);
    expect(delta.forward).toEqual({ b: { x: 99, y: 99 } });
    expect(delta.inverse).toEqual({ b: { x: 10, y: 10 } });
  });

  it("undo of a placement restores the exact prior positions (round-trip)", () => {
    const before = { a: { x: 5, y: 5 }, b: { x: 5, y: 5 } };
    const after = { a: { x: 40, y: 60 }, b: { x: 5, y: 5 } };
    const delta = placementDelta(before, after);
    // Applying inverse over the after-state returns the moved id to its before-position.
    const undone = applyPlacement(after, delta.inverse);
    expect(undone.a).toEqual({ x: 5, y: 5 });
    // Applying forward again redoes it.
    const redone = applyPlacement(undone, delta.forward);
    expect(redone.a).toEqual({ x: 40, y: 60 });
  });

  it("never drops a brand-new id — undo re-sets it rather than deleting it", () => {
    const before = { a: { x: 0, y: 0 } };
    const after = { a: { x: 0, y: 0 }, fresh: { x: 7, y: 8 } };
    const delta = placementDelta(before, after);
    expect(delta.movedIds).toEqual(["fresh"]);
    // A new id has no prior, so its inverse re-sets it to its after-position (a no-op move) — the node
    // never disappears on undo.
    expect(delta.inverse.fresh).toEqual({ x: 7, y: 8 });
    const undone = applyPlacement(after, delta.inverse);
    expect(undone.fresh).toEqual({ x: 7, y: 8 });
  });

  it("applyPlacement leaves ids the delta does not name untouched", () => {
    const base = { a: { x: 1, y: 1 }, b: { x: 2, y: 2 } };
    const next = applyPlacement(base, { a: { x: 9, y: 9 } });
    expect(next).toEqual({ a: { x: 9, y: 9 }, b: { x: 2, y: 2 } });
    // Pure: the base is not mutated.
    expect(base.a).toEqual({ x: 1, y: 1 });
  });
});
