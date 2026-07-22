import type { ProductGtmNodeRole } from "./productGtmProjection";

// Founder-facing presentation vocabulary for the Product/GTM canvas: the mapping from compatibility semantic
// types to the words and node roles a founder reads. Kept separate from projection assembly so the projection
// stays a graph builder and this stays the single place the canvas' language is defined.
const DISPLAY_TYPE: Record<string, string> = {
  direction: "Current direction",
  page: "Page",
  "working-theory": "Provisional read",
  signal: "Market reality",
  campaign: "Market test",
  channel: "Route to market",
  pipeline: "Product / GTM path",
  open: "Evidence gap",
  capability: "Product capability",
  feature: "Product feature",
  experience: "Product experience",
  motion: "Motion",
  audience: "Audience",
  offer: "Offer",
  release: "Product release",
  evidence: "Evidence",
};

export function productGtmTypeLabel(type: string) {
  return DISPLAY_TYPE[type.toLowerCase()] ?? type.replaceAll("-", " ");
}

export function relationshipLabel(label: string) {
  const concise: Record<string, string> = {
    "delivers value through": "delivers value",
    "must return evidence to": "returns evidence",
    "creates the opportunity for": "creates opportunity",
    "supplies the first builders for": "supplies builders",
  };
  return concise[label.toLowerCase()] ?? label;
}

export function semanticRole(type: string, provisional: boolean): ProductGtmNodeRole {
  const normalized = type.toLowerCase();
  // A page reads cleanly at rest even though the model keeps it provisional and source-bearing: the
  // "correct anything" framing lives one click deep in its expansion, not as at-rest texture.
  if (normalized === "page") return "page";
  if (provisional) return "provisional";
  if (normalized === "direction") return "direction";
  if (normalized === "feature") return "feature";
  if (["capability", "experience", "product", "release"].includes(normalized)) return "product";
  if (["pipeline", "motion", "mechanism"].includes(normalized)) return "path";
  if (["signal", "audience"].includes(normalized)) return "market-signal";
  if (normalized === "channel") return "route";
  if (normalized === "campaign") return "market-test";
  if (normalized === "open") return "evidence-gap";
  if (normalized === "evidence") return "evidence";
  return "product";
}
