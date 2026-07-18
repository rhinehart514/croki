// rankAtlasNodes — PURE surfacing ranker for the dense-map rank-and-reveal (SPEC C / Exp Law 4, the ~100-node
// wall). At the STRUCTURE band a venture with a hundred directions is unreadable if every card renders equal;
// this ranker decides which nodes STAY surfaced and which fall to the collapsed tail. It reads only signals
// the projection/lens already carry — zero backend work — and NEVER removes a node (SPEC C keeps the full
// array reachable; this only assigns a surfacing priority the collapser consumes).
//
// A node is surfaced when ANY of these holds (the invariant this module's test guards):
//   • at-wall            — the founder must read it (betBand `approaching-wall` / node.data.atWall). Surfaces
//                          ONE BAND EARLY.
//   • contested          — its claim is in dispute (deriveEpistemicState → "contested"). Surfaces ONE BAND
//                          EARLY.
//   • recently-changed   — it moved lately (bet.events within the recency window).
//   • founder-placed     — the founder dragged it to a stored placement. FOUNDER INTENT = SURFACED (Law 6):
//                          a node the founder positioned by hand is NEVER collapsed, at any band.
// Everything else is tail — eligible for collapse into a cluster glyph.

import type { AtlasNode } from "@/components/atlas/atlasTypes";
import type { EpistemicState } from "@/components/atlas/deriveEpistemicState";
import type { SemanticBand } from "@/components/atlas/semanticBand";

export type SurfaceReason = "at-wall" | "contested" | "recently-changed" | "founder-placed" | "band";

export type RankedNode = {
  id: string;
  // True when the node should render surfaced at the given band; false when it is tail (collapse-eligible).
  surfaced: boolean;
  // Why it surfaced (or "band" — an ordinary node the band is high enough to show), for the reveal logic and
  // the founder-facing receipt. Null when it is tail.
  reason: SurfaceReason | null;
  // The band at which this node earns its place: signals that surface one band early lower this to the band
  // BELOW structure, so at-wall/contested show before an ordinary node would.
  earnsAt: SemanticBand;
};

// The recency window for "recently-changed". A bet whose newest event is within this window reads as active
// and stays surfaced so the founder sees where work is moving. Passed-in `now` keeps this pure.
const RECENT_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

// Band ordering, MAP READ first (structure — the most zoomed-out, where collapse happens) to most detailed
// (artifacts). "Surface one band early" means: earn a place at the band one step MORE detailed than the map
// read — i.e. relationships — so an at-wall/contested node is already surfaced by the time the founder
// reaches structure. Mirrors semanticBand's BAND_SEQUENCE.
const BAND_ORDER: SemanticBand[] = ["structure", "relationships", "components", "artifacts"];

// The band one step MORE detailed than the given band (the band a signal "one band early" earns its place
// at). At the most-detailed band it stays put.
function moreDetailedThan(band: SemanticBand): SemanticBand {
  const index = BAND_ORDER.indexOf(band);
  return index >= 0 && index < BAND_ORDER.length - 1 ? BAND_ORDER[index + 1] : band;
}

// Read the atlas node's kind + facets. Kept tolerant so a plain projected node also satisfies it.
type NodeFacets = {
  atWall: boolean;
  epistemic: EpistemicState | null;
  latestEventAt: number | null;
  betId: string | null;
};

function facetsFor(node: AtlasNode): NodeFacets {
  const data = node.data;
  const atWall = data.atWall === true || data.decisionBand === "approaching-wall";
  const epistemic = (data.epistemic ?? null) as EpistemicState | null;
  const events = data.bet?.events ?? [];
  let latestEventAt: number | null = null;
  for (const event of events) {
    const at = typeof event.at === "string" ? Date.parse(event.at) : NaN;
    if (!Number.isNaN(at) && (latestEventAt === null || at > latestEventAt)) latestEventAt = at;
  }
  const betId = typeof data.bet?.id === "string" ? data.bet.id : null;
  return { atWall, epistemic, latestEventAt, betId };
}

export type RankInput = {
  nodes: AtlasNode[];
  // The stored founder placements — any id present here was dragged by the founder and is surfaced always.
  placementPositions: Record<string, { x: number; y: number }>;
  // The current band, so ordinary nodes surface at structure and signal nodes surface one band early.
  band: SemanticBand;
  // Injected clock for recency, so the ranker stays pure and its test is deterministic.
  now: number;
};

// Rank every node into surfaced / tail for the current band. PURE: derives from the passed signals only.
export function rankAtlasNodes({ nodes, placementPositions, band, now }: RankInput): RankedNode[] {
  // Collapse only applies at the map read (structure). At any more-detailed band everything is surfaced;
  // the ranker still reports per-node reasons so the reveal logic can step a signal node up early.
  const atMapRead = band === "structure";

  return nodes.map((node) => {
    // Only a DIRECTION (a bet) is ever collapse-eligible — the tail SPEC C folds is "quiet directions", and a
    // glyph reads "N more … directions". The machine's structural frame — the intent hub, crew, territory,
    // architecture, theory, outcomes — is never a direction and is ALWAYS surfaced, so a sparse venture keeps
    // every titled card of its readable machine and the intent hub is never folded behind a glyph.
    if (node.data.kind !== "bet") return { id: node.id, surfaced: true, reason: "band", earnsAt: "structure" };

    const facets = facetsFor(node);
    const founderPlaced = Object.prototype.hasOwnProperty.call(placementPositions, node.id);
    const contested = facets.epistemic === "contested";
    const recentlyChanged = facets.latestEventAt !== null && now - facets.latestEventAt <= RECENT_MS;

    // Founder intent wins outright: a hand-placed node is surfaced at every band and is never tail.
    if (founderPlaced) return { id: node.id, surfaced: true, reason: "founder-placed", earnsAt: "structure" };

    // At-wall / contested surface ONE BAND EARLY — they earn their place at the relationships band (one step
    // more detailed than the map read) and stay surfaced at structure too.
    if (facets.atWall) return { id: node.id, surfaced: true, reason: "at-wall", earnsAt: moreDetailedThan("structure") };
    if (contested) return { id: node.id, surfaced: true, reason: "contested", earnsAt: moreDetailedThan("structure") };

    // Recently-changed surfaces at the structure map read (not early, but never collapsed while active).
    if (recentlyChanged) return { id: node.id, surfaced: true, reason: "recently-changed", earnsAt: "structure" };

    // Everything else: surfaced at any more-detailed band (all detail shown when zoomed in); tail ONLY at the
    // structure map read, eligible for collapse.
    if (!atMapRead) return { id: node.id, surfaced: true, reason: "band", earnsAt: band };
    return { id: node.id, surfaced: false, reason: null, earnsAt: "structure" };
  });
}
