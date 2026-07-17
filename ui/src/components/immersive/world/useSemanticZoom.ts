import { useSemanticBand } from "@/components/atlas/semanticBandContext";
import { rawBandForZoom, type SemanticBand } from "@/components/atlas/semanticBand";
import { ORBIT_MAX_ZOOM, GROUND_MAX_ZOOM } from "@/components/atlas/useAtlasCamera";

// Legacy immersive-world band vocabulary (glyph | card | detail). Slice 2 collapses band state into the
// one SemanticBandProvider; this hook now READS that shared band and maps it onto the three legacy words
// the warm-paper immersive archetypes render against, so the immersive nodes and the altimeter consume
// the exact same state (no second raw-transform read). STRUCTURE → glyph, RELATIONSHIPS → card,
// COMPONENTS/ARTIFACTS → detail.
export type SemanticZoomBand = "glyph" | "card" | "detail";

export const GLYPH_MAX_ZOOM = ORBIT_MAX_ZOOM;
export const CARD_MAX_ZOOM = GROUND_MAX_ZOOM;

export function legacyBand(band: SemanticBand): SemanticZoomBand {
  if (band === "structure") return "glyph";
  if (band === "relationships") return "card";
  return "detail";
}

// Pure quantizer kept for the boundary-agreement tests: the raw (no-hysteresis) reading mapped to the
// legacy words. The live hook below reads the shared, hysteresis-aware provider band instead.
export function bandForZoom(zoom: number): SemanticZoomBand {
  return legacyBand(rawBandForZoom(zoom));
}

// Live legacy band from the shared SemanticBandProvider. Must be called under a mounted provider (inside
// <ReactFlow>).
export function useSemanticZoom(): SemanticZoomBand {
  return legacyBand(useSemanticBand());
}
