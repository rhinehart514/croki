import { describe, expect, it } from "vitest";
import { isRestorableViewport, viewportShowsAnyObject } from "./canvasViewportContract";

describe("canvas viewport contract", () => {
  it("rejects corrupt and unsupported saved cameras", () => {
    expect(isRestorableViewport({ x: Number.NaN, y: 0, zoom: 1 })).toBe(false);
    expect(isRestorableViewport({ x: 0, y: 0, zoom: 0.1 })).toBe(false);
    expect(isRestorableViewport({ x: 0, y: 0, zoom: 1.81 })).toBe(false);
    expect(isRestorableViewport({ x: -420, y: 180, zoom: 0.8 })).toBe(true);
  });

  it("restores a camera only when a real object remains meaningfully visible", () => {
    const size = { width: 1200, height: 760 };
    const objects = [{ x: 100, y: 80, width: 220, height: 96 }];

    expect(viewportShowsAnyObject({ x: 0, y: 0, zoom: 1 }, size, objects)).toBe(true);
    expect(viewportShowsAnyObject({ x: -5000, y: -5000, zoom: 1 }, size, objects)).toBe(false);
    expect(viewportShowsAnyObject({ x: -305, y: 0, zoom: 1 }, size, objects)).toBe(false);
  });
});
