import { describe, expect, it } from "vitest";
import { densityForZoom } from "./atlasDensity";

// Zoom-responsive rendering (contract §3): density is a continuous *function of zoom*, not a mode the
// founder sets. Zooming out simplifies cards (editorial); zooming in re-details them (standard →
// detailed). The tier bands align with the coarse altitudeForZoom seam so the CSS and the live density
// never disagree at a boundary.
describe("densityForZoom", () => {
  it("simplifies to editorial when zoomed out", () => {
    expect(densityForZoom(0.18)).toBe("editorial");
    expect(densityForZoom(0.5)).toBe("editorial");
    expect(densityForZoom(0.78)).toBe("editorial");
  });

  it("holds the standard shipping default in the mid band", () => {
    expect(densityForZoom(0.79)).toBe("standard");
    expect(densityForZoom(1.0)).toBe("standard");
    expect(densityForZoom(1.09)).toBe("standard");
  });

  it("re-details to detailed when zoomed in", () => {
    expect(densityForZoom(1.1)).toBe("detailed");
    expect(densityForZoom(1.4)).toBe("detailed");
    expect(densityForZoom(1.7)).toBe("detailed");
  });

  it("is monotonic across the zoom range — never re-hides detail while zooming in", () => {
    const rank = { editorial: 0, standard: 1, detailed: 2 } as const;
    let previous = -1;
    for (let zoom = 0.18; zoom <= 1.7; zoom += 0.02) {
      const current = rank[densityForZoom(zoom)];
      expect(current).toBeGreaterThanOrEqual(previous);
      previous = current;
    }
  });
});
