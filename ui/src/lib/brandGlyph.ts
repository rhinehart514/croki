// Resolve an external MCP server id to its real brand logo. An `mcp` node calls a real service
// (Notion, Gmail, GitHub, HubSpot…); the card shows that service's actual logo so a glance tells
// you what it talks to. Logos come from `simple-icons` (the canonical brand-SVG set).
//
// Why a curated map instead of the whole set: `simple-icons` ships ~3,400 brand SVGs (~5.5MB). The
// previous version resolved an icon by a RUNTIME-built key against a dynamic `import("simple-icons")`,
// which forced the entire barrel into one chunk — it can't be tree-shaken, so the moment any brand
// glyph rendered, all 5.5MB downloaded. Instead we import BY NAME the specific brands the app can
// surface (below). Named static imports ARE tree-shaken, so the bundle carries only these few KB.
//
// Coverage is an explicit, extensible list, not "every brand that exists". This is a deliberate
// trade: universal resolution cost 5.5MB and was already only partial anyway — many well-known
// services (Salesforce, Slack, LinkedIn, Twilio…) are trademark-excluded from `simple-icons` and
// already fell back to the neutral plug. Any service not in this map resolves to null and the
// renderer shows that same neutral plug — no regression for the unlisted, and TO ADD A BRAND you
// import its `si<Name>` export and drop it into the `ICONS` array below (one line).
import {
  // Google workspace + cloud
  siGmail, siGoogledrive, siGooglecalendar, siGooglesheets, siGoogledocs,
  siGoogleforms, siGoogleads, siGoogleanalytics, siGooglemeet, siGooglebigquery,
  siGooglecloud, siGooglechrome, siGoogleplay, siLooker,
  // CRM / GTM / marketing / scheduling
  siHubspot, siZapier, siMake, siN8n, siMailchimp, siBrevo, siBuffer,
  siTypeform, siCalendly, siIntercom, siZendesk,
  // Productivity / project management / docs
  siNotion, siLinear, siAsana, siJira, siTrello, siClickup, siConfluence,
  siMiro, siLoom, siAirtable,
  // Dev / data / infra
  siGithub, siGitlab, siStripe, siPostgresql, siMongodb, siSnowflake,
  siSupabase, siVercel, siNetlify, siCloudflare, siRetool, siAirbyte,
  siMixpanel, siPosthog,
  // Comms / social
  siDiscord, siTelegram, siWhatsapp, siX, siZoom,
  // Design / sites / commerce / finance
  siFigma, siFramer, siWebflow, siWordpress, siWix, siDropbox, siBox,
  siShopify, siQuickbooks, siXero,
  // AI
  siAnthropic, siClaude, siPerplexity,
} from "simple-icons";

type BrandIcon = { title: string; slug: string; hex: string; path: string };

// The curated brand set. Keyed by each icon's own canonical `simple-icons` slug (e.g. "googledrive",
// "github"), which is exactly what `slugFor` normalizes a server id down to — so lookup is a direct
// map hit. To add a brand: import its `si<Name>` export above and add it to this array.
const ICON_LIST = [
  siGmail, siGoogledrive, siGooglecalendar, siGooglesheets, siGoogledocs,
  siGoogleforms, siGoogleads, siGoogleanalytics, siGooglemeet, siGooglebigquery,
  siGooglecloud, siGooglechrome, siGoogleplay, siLooker,
  siHubspot, siZapier, siMake, siN8n, siMailchimp, siBrevo, siBuffer,
  siTypeform, siCalendly, siIntercom, siZendesk,
  siNotion, siLinear, siAsana, siJira, siTrello, siClickup, siConfluence,
  siMiro, siLoom, siAirtable,
  siGithub, siGitlab, siStripe, siPostgresql, siMongodb, siSnowflake,
  siSupabase, siVercel, siNetlify, siCloudflare, siRetool, siAirbyte,
  siMixpanel, siPosthog,
  siDiscord, siTelegram, siWhatsapp, siX, siZoom,
  siFigma, siFramer, siWebflow, siWordpress, siWix, siDropbox, siBox,
  siShopify, siQuickbooks, siXero,
  siAnthropic, siClaude, siPerplexity,
];

const BRAND_ICONS: Record<string, BrandIcon> = {};
for (const ic of ICON_LIST) {
  BRAND_ICONS[ic.slug] = { title: ic.title, slug: ic.slug, hex: ic.hex, path: ic.path };
}

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

// Synchronous resolve against the curated map. Returns null for a service not in the map — the
// caller's neutral-plug fallback covers that, the same as for a genuinely unrecognized service.
function brandGlyph(serverId: string | undefined | null): BrandIcon | null {
  if (!serverId) return null;
  const slug = slugFor(serverId);
  if (!slug) return null;
  return BRAND_ICONS[slug] ?? null;
}

// React-facing resolver, kept for API compatibility with the previous lazy-loading version. The
// curated map is bundled statically now, so resolution is synchronous — no chunk to wait on, no
// re-render to trigger. Callers keep calling this unconditionally as a hook.
export function useBrandGlyph(serverId: string | undefined | null): BrandIcon | null {
  return brandGlyph(serverId);
}
