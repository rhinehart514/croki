import { useStore } from "@xyflow/react";

// Zoom-responsive card density (contract §3): card detail responds to the canvas zoom *continuously*,
// on the existing render seam — there are no named-altitude modes and no switcher. As the founder zooms
// out, cards simplify to title + glyph (editorial); as they zoom in, body then footer re-detail
// (standard → detailed). This is a pure rendering function of zoom, not a navigable state the founder
// sets. The density-tier thresholds mirror the coarse `altitudeForZoom` seam in useAtlasCamera so the
// two agree, but density reads the *live* React Flow transform (useStore) rather than the settled
// altitude, so cards re-detail while the wheel is still turning instead of snapping only when the
// gesture ends.

export type AtlasDensity = "editorial" | "standard" | "detailed";

// Continuous zoom → three revealed tiers. editorial: title/glyph only (dense, zoomed-out reading).
// standard: title + summary + draft + footer, the shipping default. detailed: everything, incl. the
// last-touched line. The bands align with altitudeForZoom (<=0.78 venture, <1.1 architecture, else
// detail) so the CSS keyed on data-atlas-altitude and the live density never disagree at a boundary.
export function densityForZoom(zoom: number): AtlasDensity {
  if (zoom <= 0.78) return "editorial";
  if (zoom < 1.1) return "standard";
  return "detailed";
}

// Live density from the React Flow store. Must be called inside <ReactFlow> (store context). React Flow
// re-renders the subscriber only when the *selector result* changes, so mapping zoom → tier here means a
// node re-renders on a tier crossing, not on every sub-pixel wheel delta — continuous response without a
// render storm.
export function useAtlasDensity(): AtlasDensity {
  return useStore((state) => densityForZoom(state.transform[2]));
}
