import { useSemanticBand } from "./semanticBandContext";
import { rawBandForZoom, type SemanticBand } from "./semanticBand";

// Card density tier (contract §3), now DERIVED from the one shared semantic band rather than a second
// raw-transform read — so the density a card renders and the altimeter word can never disagree at a
// boundary, and hysteresis applies once (in the provider) instead of per selector. editorial: title/glyph
// only; standard: + body/draft/footer; detailed: everything. STRUCTURE → editorial, RELATIONSHIPS →
// standard, COMPONENTS/ARTIFACTS → detailed.

export type AtlasDensity = "editorial" | "standard" | "detailed";

export function densityForBand(band: SemanticBand): AtlasDensity {
  if (band === "structure") return "editorial";
  if (band === "relationships") return "standard";
  return "detailed";
}

// Pure quantizer kept for tests: the raw (no-hysteresis) band → density. The live hook reads the shared
// provider band so density tracks the same hysteresis-settled state everything else does.
export function densityForZoom(zoom: number): AtlasDensity {
  return densityForBand(rawBandForZoom(zoom));
}

// Live density from the shared SemanticBandProvider. Must run under a mounted provider (inside <ReactFlow>).
export function useAtlasDensity(): AtlasDensity {
  return densityForBand(useSemanticBand());
}
