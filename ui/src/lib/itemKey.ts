import type { GTMItem } from "@/types";

// Stable per-item key for founder decisions. Mirrors draftKey() in
// brain/src/memory.mjs so the UI and backend agree on which decision maps to
// which draft across runs.
export function itemKey(item: GTMItem, fallbackIndex?: number): string {
  const it = item as Record<string, unknown>;
  const candidate =
    (it.email as string) ||
    (it.linkedinUrl as string) ||
    (it.url as string) ||
    (it.name as string) ||
    (it.id as string);
  return candidate || (fallbackIndex != null ? `item-${fallbackIndex}` : "item");
}
