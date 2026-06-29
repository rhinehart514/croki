// Resolve an external MCP server id to its real brand logo. An `mcp` node calls a real service
// (Notion, Gmail, Slack, Salesforce…); the card shows that service's actual logo so a glance tells
// you what it talks to. Logos come from `simple-icons` (the canonical brand-SVG set) resolved by the
// server id, so any service the founder connects is covered without enumerating them here — an
// unknown id resolves to null and the renderer falls back to a neutral plug.
//
// `simple-icons` ships every brand SVG (~5.5MB) and can't be tree-shaken, because brandGlyph resolves
// the icon by a runtime-built key, not a static import. So the whole dataset is loaded LAZILY on its
// own chunk the first time a brand glyph is needed: the dataset is dynamically imported and cached,
// and `useBrandGlyph` re-renders the caller once it lands. Until then a glyph resolves to null and the
// renderer shows its neutral-plug fallback — the same fallback an unrecognized service already gets.
import { useEffect, useState } from "react";

export type BrandIcon = { title: string; slug: string; hex: string; path: string };

// Server ids that don't map 1:1 to the brand's simple-icons slug.
const SLUG_ALIASES: Record<string, string> = {
  drive: "googledrive",
  googledrive: "googledrive",
  gdrive: "googledrive",
  gcal: "googlecalendar",
  googlecalendar: "googlecalendar",
  sheets: "googlesheets",
  googlesheets: "googlesheets",
  sfdc: "salesforce",
};

function slugFor(serverId: string): string {
  // A server ref can arrive as "notion", "google-drive", "claude_ai_Gmail", "buffalo-projects-mcp".
  // Strip a "claude_ai_" prefix and a trailing "-mcp", take the most brand-like token, lowercase it.
  const cleaned = serverId
    .toLowerCase()
    .replace(/^claude[_-]?ai[_-]?/, "")
    .replace(/[-_]mcp$/, "")
    .replace(/^mcp[-_]/, "");
  const token = cleaned.split(/[/_-]/).filter(Boolean).pop() ?? cleaned;
  return SLUG_ALIASES[token] ?? token.replace(/[^a-z0-9]/g, "");
}

// The dataset, once loaded. Null until the lazy chunk resolves.
let iconSet: Record<string, BrandIcon> | null = null;
let loadPromise: Promise<Record<string, BrandIcon>> | null = null;
// Components that asked for a glyph before the dataset arrived — re-rendered once it does.
const waiters = new Set<() => void>();

function loadIconSet(): Promise<Record<string, BrandIcon>> {
  if (iconSet) return Promise.resolve(iconSet);
  if (!loadPromise) {
    loadPromise = import("simple-icons").then((mod) => {
      iconSet = mod as unknown as Record<string, BrandIcon>;
      for (const notify of waiters) notify();
      waiters.clear();
      return iconSet;
    });
  }
  return loadPromise;
}

// Synchronous resolve against the loaded cache. Returns null until the dataset lands (the caller's
// neutral-plug fallback covers that window) — and null for a genuinely unrecognized service.
export function brandGlyph(serverId: string | undefined | null): BrandIcon | null {
  if (!serverId || !iconSet) return null;
  const slug = slugFor(serverId);
  if (!slug) return null;
  const key = `si${slug.charAt(0).toUpperCase()}${slug.slice(1)}`;
  return iconSet[key] ?? null;
}

// React-aware resolver: triggers the lazy load and re-renders the caller when the dataset is ready,
// so a brand glyph blooms in the moment its chunk arrives instead of staying a plug forever.
export function useBrandGlyph(serverId: string | undefined | null): BrandIcon | null {
  const [, force] = useState(0);
  useEffect(() => {
    if (!serverId || iconSet) return;
    let live = true;
    const notify = () => { if (live) force((n) => n + 1); };
    waiters.add(notify);
    void loadIconSet();
    return () => { live = false; waiters.delete(notify); };
  }, [serverId]);
  return brandGlyph(serverId);
}
