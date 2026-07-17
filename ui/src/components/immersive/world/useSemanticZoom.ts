import { useStore } from "@xyflow/react";
import { ORBIT_MAX_ZOOM, GROUND_MAX_ZOOM } from "@/components/atlas/useAtlasCamera";

// Semantic-zoom band for the immersive world (architecture §1/§2). Quantizes the *live* React Flow
// zoom into three bands so node archetypes re-detail as the founder zooms, without churning on every
// sub-pixel wheel delta (React Flow re-renders a useStore subscriber only when the selector *result*
// changes, so a node re-renders on a band crossing, not per frame).
//
// The band boundaries are the SAME canonical thresholds the altitude readout uses — imported from
// useAtlasCamera (ORBIT_MAX_ZOOM / GROUND_MAX_ZOOM) rather than re-declared here — so the per-node
// detail band and the altimeter's altitude label can never disagree at a boundary:
//   glyph  — venture altitude  (zoom <= ORBIT_MAX_ZOOM):   title + kicker only.       → Orbit
//   card   — architecture altitude (zoom < GROUND_MAX_ZOOM): the full resting card.   → Ground
//   detail — detail altitude  (zoom >= GROUND_MAX_ZOOM):    every line, footer.        → Inside
// The band ↔ altitude correspondence is exact: bandForZoom(z) and altitudeForZoom(z) split z at the
// same two cutpoints, so at any zoom where the card shows full anatomy the altimeter reads "Ground".
export type SemanticZoomBand = "glyph" | "card" | "detail";

export const GLYPH_MAX_ZOOM = ORBIT_MAX_ZOOM;
export const CARD_MAX_ZOOM = GROUND_MAX_ZOOM;

export function bandForZoom(zoom: number): SemanticZoomBand {
  if (zoom <= GLYPH_MAX_ZOOM) return "glyph";
  if (zoom < CARD_MAX_ZOOM) return "card";
  return "detail";
}

// Live band from the React Flow store. Must be called inside <ReactFlow> (store context).
export function useSemanticZoom(): SemanticZoomBand {
  return useStore((state) => bandForZoom(state.transform[2]));
}
