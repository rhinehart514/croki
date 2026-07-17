import { describe, expect, it } from "vitest";
import { bandForZoom, GLYPH_MAX_ZOOM, CARD_MAX_ZOOM } from "./useSemanticZoom";
import { altitudeForZoom, ORBIT_MAX_ZOOM, GROUND_MAX_ZOOM } from "@/components/atlas/useAtlasCamera";

// Phase 1 acceptance (architecture §4): useSemanticZoom returns glyph|card|detail at the correct zoom
// thresholds. bandForZoom is the pure quantizer the hook wraps; the boundaries must match the atlas
// altitude seams (<=0.78 glyph/venture, <1.1 card/architecture, else detail) so the immersive world
// and the reused camera never disagree at a boundary.
describe("bandForZoom", () => {
  it("reads far zoom as glyph", () => {
    expect(bandForZoom(0.18)).toBe("glyph");
    expect(bandForZoom(0.5)).toBe("glyph");
    expect(bandForZoom(GLYPH_MAX_ZOOM)).toBe("glyph");
  });

  it("reads mid zoom as card", () => {
    expect(bandForZoom(GLYPH_MAX_ZOOM + 0.01)).toBe("card");
    expect(bandForZoom(0.9)).toBe("card");
    expect(bandForZoom(1.0)).toBe("card");
  });

  it("reads near zoom as detail at and above the card ceiling", () => {
    expect(bandForZoom(CARD_MAX_ZOOM)).toBe("detail");
    expect(bandForZoom(1.4)).toBe("detail");
    expect(bandForZoom(1.7)).toBe("detail");
  });

  it("keeps the boundaries aligned with the atlas altitude seams", () => {
    expect(GLYPH_MAX_ZOOM).toBe(0.78);
    expect(CARD_MAX_ZOOM).toBe(1.1);
    // The per-node band constants are the SAME canonical thresholds the altitude readout uses; they are
    // imported from useAtlasCamera, not re-declared, so they cannot drift apart.
    expect(GLYPH_MAX_ZOOM).toBe(ORBIT_MAX_ZOOM);
    expect(CARD_MAX_ZOOM).toBe(GROUND_MAX_ZOOM);
  });
});

// The defect this fix closes: the altimeter label and the per-node detail band split zoom at different
// seams, so the readout could say "Orbit" while cards already showed full Ground-level anatomy. The band
// and the altitude MUST correspond at every zoom: glyph↔venture (Orbit), card↔architecture (Ground),
// detail↔detail (Inside).
describe("band <-> altitude correspondence", () => {
  const bandToAltitude = { glyph: "venture", card: "architecture", detail: "detail" } as const;

  it("maps to the same altitude at every sampled zoom", () => {
    for (const zoom of [0.18, 0.5, 0.78, 0.79, 0.86, 0.95, 1.0, 1.09, 1.1, 1.4, 1.7]) {
      expect(bandToAltitude[bandForZoom(zoom)]).toBe(altitudeForZoom(zoom));
    }
  });

  it("reads Ground (architecture / card) at the reported ~86% defect zoom", () => {
    // At 0.86 the cards re-detail to full anatomy (card band); the altimeter must read Ground, not Orbit.
    expect(bandForZoom(0.86)).toBe("card");
    expect(altitudeForZoom(0.86)).toBe("architecture");
  });
});
