import { describe, expect, it, vi } from "vitest";
import { PRODUCT_GTM_READABLE_ZOOM, productGtmMotionDuration, productGtmViewportIsAway } from "./productGtmViewport";

describe("Product/GTM viewport", () => {
  it("keeps automatic chapter framing above the readable floor", () => {
    expect(PRODUCT_GTM_READABLE_ZOOM).toBeGreaterThanOrEqual(0.8);
  });

  it("offers a return only after a meaningful pan or zoom", () => {
    const focal = { x: 100, y: 80, zoom: 0.9 };
    expect(productGtmViewportIsAway({ x: 150, y: 100, zoom: 0.86 }, focal)).toBe(false);
    expect(productGtmViewportIsAway({ x: 210, y: 100, zoom: 0.86 }, focal)).toBe(true);
    expect(productGtmViewportIsAway({ x: 100, y: 80, zoom: 0.7 }, focal)).toBe(true);
  });

  it("removes framing motion when the founder requests reduced motion", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    expect(productGtmMotionDuration(180)).toBe(0);
    vi.unstubAllGlobals();
  });
});
