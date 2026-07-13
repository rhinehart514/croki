import type { WovenCanvasAnchor } from "@/types";

// A first product read should answer in claims, not mirror scanner frequency. Repeated analytics tokens
// are useful evidence, but repetition is not importance. Keep one copy of each claim and prefer sentences
// that carry enough context for a founder to understand without opening the source receipt.
export function prioritizedProductTruths(
  anchors: WovenCanvasAnchor[] | null | undefined,
  limit = 3,
): WovenCanvasAnchor[] {
  const unique = new Map<string, WovenCanvasAnchor>();
  for (const anchor of anchors ?? []) {
    if (anchor.kind !== "product-truth") continue;
    const normalized = anchor.label.trim().toLocaleLowerCase().replace(/[`'".,:;()[\]{}]/g, "").replace(/\s+/g, " ");
    if (normalized && !unique.has(normalized)) unique.set(normalized, anchor);
  }
  return [...unique.values()]
    .sort((a, b) => truthScore(b.label) - truthScore(a.label) || a.ref.id.localeCompare(b.ref.id))
    .slice(0, Math.max(0, limit));
}

function truthScore(label: string): number {
  const text = label.trim();
  const words = text.split(/\s+/).filter(Boolean).length;
  const contextual = words >= 4 ? 100 : words >= 2 ? 35 : 0;
  const identifierOnly = /^[A-Za-z0-9_.:/-]+$/.test(text) ? 25 : 0;
  return contextual + Math.min(text.length, 90) - identifierOnly;
}
