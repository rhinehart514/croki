import { describe, expect, it } from "vitest";
import type { AtlasNode } from "./atlasTypes";
import { applyFounderPositions, carryMeasuredDimensions } from "./atlasNodeReconcile";

function node(id: string, measured?: { width: number; height: number }, position = { x: 0, y: 0 }): AtlasNode {
  return { id, position, data: { kind: "bet" }, measured } as AtlasNode;
}

// F1 regression: replacing the controlled node array (every projection poll / reframe) must not strip a
// node of the dimensions React Flow needs to keep it revealed. React Flow marks any node without
// measured/width dimensions `visibility:hidden`; carryMeasuredDimensions restores the prior measurement
// so a rebuilt scene never blanks the canvas.
describe("carryMeasuredDimensions", () => {
  it("carries prior measurements onto rebuilt nodes so none loses its dimensions", () => {
    const previous = [node("atlas:intent", { width: 208, height: 208 }), node("bet:one", { width: 204, height: 210 })];
    const rebuilt = [node("atlas:intent"), node("bet:one")];
    const merged = carryMeasuredDimensions(previous, rebuilt);
    expect(merged.every((n) => (n.measured?.width ?? 0) > 0 && (n.measured?.height ?? 0) > 0)).toBe(true);
    expect(merged[0].measured).toEqual({ width: 208, height: 208 });
    expect(merged[1].measured).toEqual({ width: 204, height: 210 });
  });

  it("keeps a node's own fresh measurement when it already carries one", () => {
    const previous = [node("bet:one", { width: 204, height: 210 })];
    const rebuilt = [node("bet:one", { width: 204, height: 320 })];
    const merged = carryMeasuredDimensions(previous, rebuilt);
    expect(merged[0].measured).toEqual({ width: 204, height: 320 });
  });

  it("leaves genuinely new nodes untouched (React Flow measures them on first paint)", () => {
    const previous = [node("bet:one", { width: 204, height: 210 })];
    const rebuilt = [node("bet:one", { width: 204, height: 210 }), node("bet:arrived")];
    const merged = carryMeasuredDimensions(previous, rebuilt);
    expect(merged[1].measured).toBeUndefined();
    expect(merged).toHaveLength(2);
  });
});

// The poll snap-back guard: after a founder drop, a ~1.2s poll rebuilds `nodes` from a lens that may not
// yet carry the drop. applyFounderPositions overlays the founder-committed positions so the dropped card
// holds its place (Law 6 / feel non-negotiable); an untouched seed node is never rewritten.
describe("applyFounderPositions — a just-dropped node does not snap back on a racing poll", () => {
  it("overlays the founder position onto a node the poll would otherwise reset to its seed", () => {
    // The rebuilt array carries the SEED position (poll returned a lens without the drop).
    const rebuilt = [node("architecture:sys", undefined, { x: -260, y: 0 })];
    const overlaid = applyFounderPositions(rebuilt, { "architecture:sys": { x: 1234, y: 5678 } });
    // The dropped node holds the founder position, not the seed.
    expect(overlaid[0].position).toEqual({ x: 1234, y: 5678 });
  });

  it("never rewrites a node the founder has not moved", () => {
    const rebuilt = [node("architecture:sys", undefined, { x: -260, y: 0 }), node("atlas:intent", undefined, { x: 0, y: 0 })];
    const overlaid = applyFounderPositions(rebuilt, { "architecture:sys": { x: 1234, y: 5678 } });
    // The untouched hub keeps its seed exactly.
    expect(overlaid[1].position).toEqual({ x: 0, y: 0 });
  });

  it("is a no-op when the founder has moved nothing (returns the same array)", () => {
    const rebuilt = [node("architecture:sys", undefined, { x: -260, y: 0 })];
    expect(applyFounderPositions(rebuilt, {})).toBe(rebuilt);
  });
});
