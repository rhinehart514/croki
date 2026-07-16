import { describe, expect, it } from "vitest";
import { altitudeForZoom } from "./lensScene";

describe("canvas altitude", () => {
  it("uses semantic thresholds instead of shrinking one full representation", () => {
    expect(altitudeForZoom(0.3)).toBe("far");
    expect(altitudeForZoom(0.8)).toBe("middle");
    expect(altitudeForZoom(1.2)).toBe("near");
  });
});
