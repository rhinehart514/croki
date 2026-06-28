// One source of truth for "an agent is a person, not a kebab ref." Every surface that shows an
// agent — the profile sheet, the canvas node, the library row, the team rail — derives its name,
// monogram, and function family from HERE, so the reframe can never drift between surfaces.
//
// This is a deterministic transform (no model call at render time): a role like "Prospect Researcher"
// is read off the ref + job by keyword. The raw ref survives only as demoted detail. When the foundry
// later persists a model-given name on the AgentInstance, this becomes the fallback for agents born
// before that — humanizing the ref instead of guessing a role.

export type AgentFamily =
  | "research" | "qualify" | "write"
  | "content" | "community" | "growth"
  | "general";

export type AgentPersona = {
  role: string;        // the human role name shown everywhere — "Prospect Researcher"
  family: AgentFamily;  // the function family — drives the one tint, by meaning
  monogram: string;     // two letters for the round identity mark — "PR"
};

// Ordered specific → general; first match wins. Tests run against `${ref} ${job}` lowercased so a
// vague ref still lands by what the job says it does.
// Ordered specific → general; first match wins. The set spans EVERY go-to-market motion, not just
// outbound — a content, community, lifecycle, partnerships, or paid agent reads as its own role
// instead of being forced into an SDR name. Non-outbound, motion-spanning roles are tested FIRST so
// a "content draft" agent lands "Content Strategist", never the generic "Outreach Writer" below it.
const RULES: { test: RegExp; role: string; family: AgentFamily }[] = [
  // Content / SEO / inbound
  { test: /content|\bseo\b|blog|article|editorial|\bwriting\b.*(rank|search)/, role: "Content Strategist", family: "content" },
  { test: /\bpublish|distribut|syndicat/, role: "Distribution Planner", family: "content" },
  // Product-led / lifecycle / activation
  { test: /lifecycle|activation|\bactivate|onboard|retention|\bpql\b|in[\s-]?product|nudge/, role: "Lifecycle Engineer", family: "growth" },
  { test: /instrument|segment|\bcohort/, role: "Growth Instrumenter", family: "growth" },
  // Community / advocacy / devrel ("event" is left out on purpose — it collides with win/domain "event")
  { test: /communit|discord|ambassador|advocate|devrel|developer[\s-]?relation|meetup|webinar/, role: "Community Lead", family: "community" },
  // Partnerships / ecosystem / integrations ("channel" left out — too generic in GTM copy)
  { test: /partner|ecosystem|integration|alliance/, role: "Partnerships Lead", family: "qualify" },
  // Paid / ads / campaigns
  { test: /\bpaid\b|\bads?\b|campaign|advertis|retarget/, role: "Paid Acquisition", family: "growth" },
  // Referral / invites ("loop" left out — it's everywhere in this product's GTM-loop language)
  { test: /referral|\binvite|viral/, role: "Referral Designer", family: "community" },
  // Outbound (kept last among the specifics — the original SDR family)
  { test: /first[\s-]?contact/, role: "First-Contact Writer", family: "write" },
  { test: /vouch/, role: "Vouch Writer", family: "write" },
  { test: /enrich/, role: "Enrichment Scout", family: "research" },
  { test: /call[\s-]?order/, role: "Call-Order Planner", family: "qualify" },
  // "trigger" alone is left out — a prospecting job that mentions a "now-trigger" must still read as a
  // Prospect Researcher, not collapse into Qualification Analyst. Trigger-scoring agents still match on
  // their "scoring"/"qualif" wording.
  { test: /qualif|scoring|\bscore\b|trigger[\s-]?scor|\brank/, role: "Qualification Analyst", family: "qualify" },
  { test: /signal|github|inbound|stargazer/, role: "Signal Scout", family: "research" },
  { test: /buyer[\s-]?research|prospect|\bfind\b|\bresearch/, role: "Prospect Researcher", family: "research" },
  { test: /outreach|discovery.*draft|drafting|\bdraft\b|\bemail|message|first[\s-]?touch/, role: "Outreach Writer", family: "write" },
];

// Strip the gtm- prefix, the -agent suffix, and any -<name>-voice tail, then Title Case — the honest
// fallback when no rule matches, so even an unknown agent reads as words, never a kebab id.
function humanizeRef(ref: string): string {
  const cleaned = ref
    .replace(/^gtm-/, "")
    .replace(/-agent$/, "")
    .replace(/-[a-z]+-voice$/, "")
    .replace(/-/g, " ")
    .trim();
  return cleaned.replace(/\b\w/g, (c) => c.toUpperCase()) || ref;
}

function monogramOf(role: string): string {
  const words = role.split(/[\s-]+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return role.slice(0, 2).toUpperCase();
}

export function agentPersona(ref: string, job?: string): AgentPersona {
  const haystack = `${ref} ${job ?? ""}`.toLowerCase();
  const match = RULES.find((r) => r.test.test(haystack));
  const role = match ? match.role : humanizeRef(ref);
  const family: AgentFamily = match ? match.family : "general";
  return { role, family, monogram: monogramOf(role) };
}

// Family → the one tint, by meaning. Soft, low-chroma backgrounds in the existing status-soft register
// (not new loud accents) so a team scans by function without breaking the product's monochrome calm.
// Strip to all-neutral by pointing every family at "general" if the founder wants it fully monochrome.
export const FAMILY_TINT: Record<AgentFamily, { fg: string; bg: string }> = {
  research:  { fg: "#3f6212", bg: "#f7fee7" },
  qualify:   { fg: "#1d4ed8", bg: "#eff6ff" },
  write:     { fg: "#7e22ce", bg: "#faf5ff" },
  // New-motion families. Hues chosen to stay clear of the two reserved semantics — amber belongs to
  // the gate, red to danger — so a family tint never reads as a status.
  content:   { fg: "#0e7490", bg: "#ecfeff" }, // teal
  community: { fg: "#be185d", bg: "#fdf2f8" }, // pink (distinct from danger red)
  growth:    { fg: "#4f46e5", bg: "#eef2ff" }, // indigo (distinct from gate amber)
  general:   { fg: "var(--muted)", bg: "var(--surface-2)" },
};
