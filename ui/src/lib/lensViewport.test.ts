import { describe, expect, it } from "vitest";
import { measuredNodeBounds, resolveCanvasFrame } from "./lensViewport";
import type { Node } from "@xyflow/react";

describe("resolveCanvasFrame", () => {
  it("resolves a bare number padding on every side", () => {
    const frame = resolveCanvasFrame(800, 600, 20);
    expect(frame.padding).toEqual({ top: 20, right: 20, bottom: 20, left: 20 });
    expect(frame.width).toBe(800);
    expect(frame.height).toBe(600);
  });

  it("resolves a percentage padding against the given extent", () => {
    const frame = resolveCanvasFrame(1000, 500, "10%");
    expect(frame.padding).toEqual({ top: 50, right: 100, bottom: 50, left: 100 });
  });

  it("resolves a per-side padding object, defaulting missing sides to 0", () => {
    const frame = resolveCanvasFrame(800, 600, { top: 10, left: "5%" });
    expect(frame.padding).toEqual({ top: 10, right: 0, bottom: 0, left: 40 });
  });

  it("derives offset as half the right-left / bottom-top spread", () => {
    const frame = resolveCanvasFrame(800, 600, { left: 100, right: 20, top: 10, bottom: 30 });
    expect(frame.offset).toEqual({ x: (20 - 100) / 2, y: (30 - 10) / 2 });
  });
});

describe("measuredNodeBounds", () => {
  it("prefers a node's measured size over its declared width/height", () => {
    const nodes = [
      { position: { x: 1, y: 2 }, measured: { width: 50, height: 60 }, width: 999, height: 999 },
    ] as unknown as Node[];
    expect(measuredNodeBounds(nodes)).toEqual([{ x: 1, y: 2, width: 50, height: 60 }]);
  });

  it("falls back to declared width/height, then 0, when unmeasured", () => {
    const nodes = [
      { position: { x: 0, y: 0 }, width: 30, height: 40 },
      { position: { x: 5, y: 5 } },
    ] as unknown as Node[];
    expect(measuredNodeBounds(nodes)).toEqual([
      { x: 0, y: 0, width: 30, height: 40 },
      { x: 5, y: 5, width: 0, height: 0 },
    ]);
  });
});
