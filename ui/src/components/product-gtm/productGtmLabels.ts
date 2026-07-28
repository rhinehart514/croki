import type { ProductGtmNodeRole } from "./productGtmProjection";
import type { MarketMovementIndex } from "@/types";

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
  pipeline: "Canvas path",
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

const NAME_LABEL_MAX = 40;
const TRAILING_CONNECTIVE = /\s+(?:the|a|an|to|of|in|into|for|and|or|with|is|are|that|this|its|their|your|our|on|at|by|as|from)$/i;

export function productGtmRestingLabel(rawName: string, rawDetail: string): { name: string; detail: string } {
  const full = rawName.trim();
  if (full.length <= NAME_LABEL_MAX) return { name: full || rawName, detail: rawDetail };
  const firstSentence = full.split(/(?<=[.?!])\s+/)[0]?.trim() ?? full;
  let label = firstSentence.length >= 12 && firstSentence.length <= NAME_LABEL_MAX ? firstSentence : full;
  if (label.length > NAME_LABEL_MAX) {
    let clamped = "";
    for (const word of label.split(/\s+/)) {
      const next = clamped ? `${clamped} ${word}` : word;
      if (next.length > NAME_LABEL_MAX) break;
      clamped = next;
    }
    label = clamped || label.slice(0, NAME_LABEL_MAX);
    const words = label.split(/\s+/);
    while (words.length > 2 && TRAILING_CONNECTIVE.test(words.slice(0, -1).join(" "))) words.pop();
    label = words.join(" ");
  }
  label = label.replace(/[\s.,;:–—-]+$/, "");
  while (TRAILING_CONNECTIVE.test(label)) label = label.replace(TRAILING_CONNECTIVE, "");
  label = label.trim();
  if (!label || label.length >= full.length) return { name: full, detail: rawDetail };
  const extra = rawDetail?.trim();
  return { name: label, detail: !extra ? full : extra.includes(full) ? rawDetail : `${full} — ${rawDetail}` };
}

export function productGtmOutwardActionName(action: MarketMovementIndex["actions"][number]) {
  const material = action.preparedMaterial && typeof action.preparedMaterial === "object" ? action.preparedMaterial : {};
  const nested = material.effect && typeof material.effect === "object" ? material.effect as Record<string, unknown> : material;
  const destination = String(nested.destination ?? nested.environment ?? "").trim();
  const kind = action.kind.replaceAll("-", " ");
  return destination ? `${kind} · ${destination}` : kind;
}
