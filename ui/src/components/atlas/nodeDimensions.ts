import type { SemanticBand } from "./semanticBand";
import { COMPONENTS_MAX_ZOOM } from "./semanticBand";

// Fixed dimensions per (archetype × band). NO live measurement: the seed layout reserves each node's
// LARGEST band footprint so a band swap never reflows or collides, and onlyRenderVisibleElements never
// sees a measurement flash. Every band of an archetype grows monotonically (a later band is never
// narrower than an earlier one) so "reserve the largest" == "reserve the ARTIFACTS footprint".
//
// The per-archetype ARTIFACTS zoom threshold is DERIVED from this table, not hand-tuned: a node only
// reveals its densest artifact anatomy once its own width renders at the ~320px on-screen readability
// floor (width × zoom >= 320). A 180px chip therefore waits until it is genuinely large enough to carry
// provenance text, while a 420px hub crosses into ARTIFACTS earlier — so tiny text is never the tell.

export type NodeArchetype = "intent" | "bet" | "crew" | "capability" | "architecture" | "wall" | "group";

type BandDims = { width: number; height: number };

// width × height per band. STRUCTURE is the glyph footprint; each denser band reserves more room. The
// hub (intent) is the widest; work/outcome/crew/capability chips are the narrow ones.
const TABLE: Record<NodeArchetype, Record<SemanticBand, BandDims>> = {
  intent:       { structure: { width: 300, height: 150 }, relationships: { width: 360, height: 190 }, components: { width: 400, height: 230 }, artifacts: { width: 440, height: 280 } },
  bet:          { structure: { width: 220, height: 120 }, relationships: { width: 260, height: 170 }, components: { width: 300, height: 220 }, artifacts: { width: 340, height: 280 } },
  crew:         { structure: { width: 150, height: 120 }, relationships: { width: 180, height: 150 }, components: { width: 210, height: 180 }, artifacts: { width: 240, height: 220 } },
  capability:   { structure: { width: 160, height: 100 }, relationships: { width: 190, height: 130 }, components: { width: 220, height: 160 }, artifacts: { width: 250, height: 200 } },
  architecture: { structure: { width: 200, height: 120 }, relationships: { width: 240, height: 160 }, components: { width: 280, height: 210 }, artifacts: { width: 320, height: 270 } },
  wall:         { structure: { width: 220, height: 130 }, relationships: { width: 260, height: 170 }, components: { width: 300, height: 210 }, artifacts: { width: 320, height: 250 } },
  group:        { structure: { width: 360, height: 260 }, relationships: { width: 360, height: 260 }, components: { width: 380, height: 300 }, artifacts: { width: 380, height: 300 } },
};

// The on-screen width a node must reach before its artifact text is legible rather than tiny.
export const ARTIFACT_READABILITY_PX = 320;

export function nodeDimensions(archetype: NodeArchetype, band: SemanticBand): BandDims {
  return TABLE[archetype][band];
}

// The largest footprint the seed reserves for an archetype (its ARTIFACTS band, which is the widest by
// construction). Used so layout leaves room for the densest anatomy the node will ever swap to.
export function reservedFootprint(archetype: NodeArchetype): BandDims {
  return TABLE[archetype].artifacts;
}

// Per-archetype ARTIFACTS zoom threshold, derived from the artifact-band width and the readability floor.
// Clamped at the shared COMPONENTS_MAX_ZOOM seam so a wide hub can detail *at* the band boundary but never
// before it (bands stay a clean tier), while a narrow chip pushes its own threshold up until it is large
// enough on screen. Reveal ARTIFACTS anatomy only once the band is ARTIFACTS AND this pixel floor clears.
export function artifactZoomThreshold(archetype: NodeArchetype): number {
  const { width } = TABLE[archetype].artifacts;
  return Math.max(COMPONENTS_MAX_ZOOM, ARTIFACT_READABILITY_PX / width);
}

// Whether a node should render its ARTIFACTS anatomy at the given live zoom: the shared band is ARTIFACTS
// AND the node's own width clears the readability floor. Keeps a small chip in COMPONENTS anatomy (no
// tiny artifact text) even while the big hub has crossed into full provenance.
export function showsArtifacts(archetype: NodeArchetype, band: SemanticBand, zoom: number): boolean {
  return band === "artifacts" && zoom * TABLE[archetype].artifacts.width >= ARTIFACT_READABILITY_PX;
}
