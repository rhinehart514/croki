import type { GTMItem } from "@/types";

// Stable per-item key for founder decisions. Mirrors draftKey() in
// brain/src/memory.mjs so the UI and backend agree on which decision maps to
// which draft across runs.
export function itemKey(item: GTMItem, fallbackIndex?: number): string {
  const it = item as Record<string, unknown>;
  // gtmActionId first — the gate stamps it on every reviewable item, so it is the key both the UI
  // and brain draftKey() always share. founder_* fields cover agent-drafted items with no email/url.
  const candidate =
    (it.email as string) ||
    (it.linkedinUrl as string) ||
    (it.url as string) ||
    (it.name as string) ||
    (it.id as string) ||
    (it.founder_github_or_url as string) ||
    (it.founder_name as string) ||
    (it.gtmActionId as string);
  return candidate || (fallbackIndex != null ? `item-${fallbackIndex}` : "item");
}
