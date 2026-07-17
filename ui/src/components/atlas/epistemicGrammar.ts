import type { EpistemicState } from "./deriveEpistemicState";

// The presentation table for the eight epistemic states (Drover Law 11). Each state is distinguished by
// FOUR redundant non-colour channels so a greyscale screenshot reads all eight without hue:
//   - label      the founder-facing word
//   - iconId     the corner glyph shape (rendered by EpistemicToken as inline SVG)
//   - nodeShape  the node-shape treatment class stamped on the card (border/outline geometry, not colour)
//   - corner     the fixed corner slot is ALWAYS the top-right — position is constant, only the fill
//                grows; an unfilled slot is the hollow "nothing establishes this" placeholder.
// The colour tone is advisory only and never load-bearing: it rations --proven (returned reality) and
// --gap (founder consequence) exactly as the laws allow; every distinction survives without it.

export type EpistemicChannelTone = "proven" | "founder" | "read" | "contested" | "stale" | "historical" | "unsupported" | "repository";

export type EpistemicPresentation = {
  state: EpistemicState;
  label: string;
  iconId: EpistemicIconId;
  nodeShape: string;
  tone: EpistemicChannelTone;
  // A one-line basis phrase shown at COMPONENTS/ARTIFACTS density — plain founder words, never jargon.
  basisLine: string;
  // True for the two states that are literally the absence of an establishing claim: the slot renders as
  // a hollow outline (a provenance-absent object reads Drover's read; an unsupported claim shows a
  // visibly hollow slot).
  hollow: boolean;
};

export type EpistemicIconId =
  | "person"
  | "bracket"
  | "bar-chart"
  | "dashed-eye"
  | "opposed-arrows"
  | "clock"
  | "open-circle"
  | "archive-box";

export const EPISTEMIC_PRESENTATION: Record<EpistemicState, EpistemicPresentation> = {
  contested: {
    state: "contested",
    label: "Contested",
    iconId: "opposed-arrows",
    nodeShape: "epi-shape-contested",
    tone: "contested",
    basisLine: "Evidence pulls both ways — a claim is in dispute.",
    hollow: false,
  },
  stale: {
    state: "stale",
    label: "Stale",
    iconId: "clock",
    nodeShape: "epi-shape-stale",
    tone: "stale",
    basisLine: "The source behind this has gone stale.",
    hollow: false,
  },
  unsupported: {
    state: "unsupported",
    label: "Unsupported",
    iconId: "open-circle",
    nodeShape: "epi-shape-unsupported",
    tone: "unsupported",
    basisLine: "Nothing yet reaches product truth or evidence.",
    hollow: true,
  },
  historical: {
    state: "historical",
    label: "Historical",
    iconId: "archive-box",
    nodeShape: "epi-shape-historical",
    tone: "historical",
    basisLine: "Ended — kept as history, no longer live.",
    hollow: false,
  },
  measured: {
    state: "measured",
    label: "Measured",
    iconId: "bar-chart",
    nodeShape: "epi-shape-measured",
    tone: "proven",
    basisLine: "Reality returned and joined to this.",
    hollow: false,
  },
  "repository-backed": {
    state: "repository-backed",
    label: "Repository-backed",
    iconId: "bracket",
    nodeShape: "epi-shape-repository",
    tone: "repository",
    basisLine: "Grounded in a cited repository fact.",
    hollow: false,
  },
  "founder-established": {
    state: "founder-established",
    label: "Founder-established",
    iconId: "person",
    nodeShape: "epi-shape-founder",
    tone: "founder",
    basisLine: "You established this.",
    hollow: false,
  },
  "drovers-read": {
    state: "drovers-read",
    label: "Drover’s read",
    iconId: "dashed-eye",
    nodeShape: "epi-shape-read",
    tone: "read",
    basisLine: "Drover’s current read — nothing establishes it yet.",
    hollow: true,
  },
};

export function epistemicPresentation(state: EpistemicState): EpistemicPresentation {
  return EPISTEMIC_PRESENTATION[state];
}

// ── Edge treatments (Law 10) ──────────────────────────────────────────────────────────────────────
// Join truth carried on the edge LINE, never a clean solid arrow for an inference. An unsupported
// relationship gets NO drawn line at all (proximity + both cards' hollow slots). Join strength is a
// discrete four-rung shape ladder, never a gradient/opacity.

export type EpistemicEdgeTreatment =
  | "exact-receipt"
  | "contextual"
  | "founder-applied"
  | "inferred"
  | "unattributed"
  | "stale"
  | "unsupported";

export type EpistemicEdgePresentation = {
  treatment: EpistemicEdgeTreatment;
  // The edge className the canvas edge component keys off for its line/glyph treatment.
  className: string;
  // Discrete four-rung join-strength ladder (never a gradient): 3 = exact, 2 = contextual/founder,
  // 1 = inferred, 0 = unattributed/unsupported. The rung IS the shape density, not opacity.
  rung: 0 | 1 | 2 | 3;
  // The glyph the edge carries at its midpoint; null when the edge draws no line (unsupported).
  glyph: "receipt" | "half-receipt" | "person" | "hollow" | "joined-not-caused" | "clock-notch" | null;
  // The disclosure tag shown at ARTIFACTS density; null when none.
  tag: string | null;
  draws: boolean;
};

export const EPISTEMIC_EDGE_PRESENTATION: Record<EpistemicEdgeTreatment, EpistemicEdgePresentation> = {
  "exact-receipt": { treatment: "exact-receipt", className: "epi-edge-exact", rung: 3, glyph: "receipt", tag: null, draws: true },
  contextual: { treatment: "contextual", className: "epi-edge-contextual", rung: 2, glyph: "half-receipt", tag: null, draws: true },
  "founder-applied": { treatment: "founder-applied", className: "epi-edge-founder", rung: 2, glyph: "person", tag: null, draws: true },
  inferred: { treatment: "inferred", className: "epi-edge-inferred", rung: 1, glyph: "hollow", tag: "unconfirmed", draws: true },
  unattributed: { treatment: "unattributed", className: "epi-edge-unattributed", rung: 0, glyph: "joined-not-caused", tag: "joined, not caused", draws: true },
  stale: { treatment: "stale", className: "epi-edge-stale", rung: 1, glyph: "clock-notch", tag: null, draws: true },
  unsupported: { treatment: "unsupported", className: "epi-edge-unsupported", rung: 0, glyph: null, tag: null, draws: false },
};

// Map a join's basis (+ causal / stale signal) to its edge treatment. Mirrors the node basis normaliser.
export function edgeTreatmentForBasis(
  basis: string | null | undefined,
  options: { causalFalse?: boolean; stale?: boolean; unsupported?: boolean } = {},
): EpistemicEdgeTreatment {
  if (options.unsupported) return "unsupported";
  if (options.stale) return "stale";
  const value = String(basis ?? "").trim();
  if (value === "exact") return "exact-receipt";
  if (value === "contextual") return "contextual";
  if (value === "founder-applied") return "founder-applied";
  if (value === "inferred") return "inferred";
  if (value === "unattributed" || options.causalFalse) return "unattributed";
  // Unknown/absent basis with no causal signal reads as an inference, never a clean receipt.
  return "inferred";
}
