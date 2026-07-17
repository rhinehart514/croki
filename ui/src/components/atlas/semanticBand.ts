import type { AtlasAltitude } from "./atlasTypes";
import { ORBIT_MAX_ZOOM, GROUND_MAX_ZOOM } from "./useAtlasCamera";

// ONE shared semantic-zoom band (Slice 2 / Law 4). Four bands, each a *different* representation that
// answers a different question — never the same card scaled:
//   STRUCTURE     (<= 0.78)      glyph: kicker + title + reserved epistemic corner. The map read.
//   RELATIONSHIPS (0.78 – 1.1)   + statement, decision band, facepile, edge join-strength.
//   COMPONENTS    (1.1 – ~1.6)   + work/outcome chips, group frames, at-wall/contested one band early.
//   ARTIFACTS     (>= ~1.6)      + full provenance line, evidence basis, exact line-diff affordance.
//
// The two low cutpoints ARE the load-bearing altimeter seams (ORBIT_MAX_ZOOM / GROUND_MAX_ZOOM), so the
// band the cards render and the word the altimeter reads can never disagree. lensScene's competing
// 0.55/1.05 pair is retired (surface-conflicts-never-blend).
export type SemanticBand = "structure" | "relationships" | "components" | "artifacts";

// The COMPONENTS→ARTIFACTS seam. The spec's "~1.6" readability floor: 320px on-screen for the mid-size
// archetype (see nodeDimensions.ts, which derives the per-archetype ARTIFACTS threshold from its own
// width so a small chip never shows tiny text). This constant is the *shared* fallback boundary the band
// state uses; per-archetype thresholds refine it upward for narrower nodes.
export const COMPONENTS_MAX_ZOOM = 1.6;

// Hysteresis dead-band. A band only flips once zoom clears the boundary by this margin in the direction
// of travel, so a hover right on a cutpoint (or a fast wheel that overshoots and settles) never strobes
// between two anatomies. Applied symmetrically around every cutpoint.
export const BAND_HYSTERESIS = 0.06;

const BAND_ORDER: SemanticBand[] = ["structure", "relationships", "components", "artifacts"];

// Ascending cutpoints between adjacent bands: [structure|relationships, relationships|components,
// components|artifacts]. The pure step function below turns (zoom, previousBand) into the next band by
// only crossing a cutpoint once zoom clears it by BAND_HYSTERESIS in the travel direction.
const CUTPOINTS = [ORBIT_MAX_ZOOM, GROUND_MAX_ZOOM, COMPONENTS_MAX_ZOOM] as const;

// The band a raw zoom sits in with NO hysteresis — the cold-start / boundary-agreement answer. Lower
// bound is inclusive-below: zoom <= cutpoint stays in the lower band (matches the shipped
// altitudeForZoom <=0.78 venture, <1.1 architecture split). This is what the altimeter agreement tests
// pin at every cutpoint approached from both sides once hysteresis is factored in.
export function rawBandForZoom(zoom: number): SemanticBand {
  if (zoom <= CUTPOINTS[0]) return "structure";
  if (zoom < CUTPOINTS[1]) return "relationships";
  if (zoom < CUTPOINTS[2]) return "components";
  return "artifacts";
}

// PURE step function with a ±BAND_HYSTERESIS dead-band. Given the live zoom and the band the founder is
// currently in, return the band to show. Inside the dead-band around any boundary the previous band is
// held; only a decisive crossing flips it. Never stateful on the node — the previous band is threaded in
// explicitly so the SemanticBandProvider owns the one piece of memory.
export function bandForZoom(zoom: number, previousBand?: SemanticBand): SemanticBand {
  if (!previousBand) return rawBandForZoom(zoom);
  const prev = BAND_ORDER.indexOf(previousBand);
  const raw = BAND_ORDER.indexOf(rawBandForZoom(zoom));
  if (raw === prev) return previousBand;
  // Moving up a band requires clearing the *upper* edge of the current band by the dead-band; moving
  // down requires clearing the *lower* edge by the dead-band. Otherwise hold.
  if (raw > prev) {
    const boundary = CUTPOINTS[prev]; // upper boundary of the current band
    return zoom >= boundary + BAND_HYSTERESIS ? BAND_ORDER[prev + 1] : previousBand;
  }
  const boundary = CUTPOINTS[prev - 1]; // lower boundary of the current band
  return zoom <= boundary - BAND_HYSTERESIS ? BAND_ORDER[prev - 1] : previousBand;
}

// The altimeter word is a LOOKUP from the band, never a second read of raw transform. Two ground-level
// bands (COMPONENTS, ARTIFACTS) both read as the "detail" altitude for the legacy container CSS that
// keys off data-atlas-altitude; the altimeter itself shows all four bands via BAND_LABEL below.
export function altitudeForBand(band: SemanticBand): AtlasAltitude {
  if (band === "structure") return "venture";
  if (band === "relationships") return "architecture";
  return "detail";
}

// The founder-facing altitude word per band — the altimeter's only source of its label.
export const BAND_LABEL: Record<SemanticBand, string> = {
  structure: "Orbit",
  relationships: "Ground",
  components: "Inside",
  artifacts: "Artifacts",
};

export const BAND_SEQUENCE = BAND_ORDER;
