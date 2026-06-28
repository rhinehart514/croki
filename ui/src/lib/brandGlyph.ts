// Resolve an external MCP server id to its real brand logo. An `mcp` node calls a real service
// (Notion, Gmail, Slack, Salesforce…); the card shows that service's actual logo so a glance tells
// you what it talks to. Logos come from `simple-icons` (the canonical brand-SVG set) resolved by the
// server id, so any service the founder connects is covered without enumerating them here — an
// unknown id resolves to null and the renderer falls back to a neutral plug.
import * as simpleIcons from "simple-icons";

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

export function brandGlyph(serverId: string | undefined | null): BrandIcon | null {
  if (!serverId) return null;
  const slug = slugFor(serverId);
  if (!slug) return null;
  const key = `si${slug.charAt(0).toUpperCase()}${slug.slice(1)}`;
  const icon = (simpleIcons as unknown as Record<string, BrandIcon>)[key];
  return icon ?? null;
}
