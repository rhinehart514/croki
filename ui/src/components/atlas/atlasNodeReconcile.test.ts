import { describe, expect, it } from "vitest";
import type { AtlasNode } from "./atlasTypes";
import { carryMeasuredDimensions } from "./atlasNodeReconcile";

function node(id: string, measured?: { width: number; height: number }): AtlasNode {
  return { id, position: { x: 0, y: 0 }, data: { kind: "bet" }, measured } as AtlasNode;
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
