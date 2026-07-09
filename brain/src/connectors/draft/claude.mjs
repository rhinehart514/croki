import { Anthropic } from "@anthropic-ai/sdk";
import { renderDraftMemory } from "../../memory.mjs";

export const meta = {
  id: "claude",
  name: "Claude",
  type: "draft",
  description: "Claude-powered personalized outreach drafting.",
  envKey: "ANTHROPIC_API_KEY",
};

const DEFAULT_PROMPT = `Write a short, warm, personalized cold outreach message.

Sender: {senderName}
Product: {productContext}
Prospect: {prospectName}
What I know about them: {prospectSummary}
Their site: {prospectUrl}

Rules:
- Under 100 words
- Open with something specific to them — not a compliment, something real
- One clear reason they would care
- Sign as {senderName}
- No subject line, no em-dashes, no bullet points, no corporate speak
- Plain and human

Return only the message body.`;

function fillPrompt(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? "");
}

// A drafting model, asked to personalize with data it doesn't have, will sometimes leave a raw merge
// token behind — "Hi [first name]," or "how [company] handles X". Those blanks reach the founder gate and
// read as broken. sanitizeDraft is the last deterministic pass before a draft is staged: fill the token
// from the known prospect object when we actually have the value, and — critically — when we DON'T, delete
// the token and repair the surrounding text so the founder never sees a bracket. It never invents a name;
// a missing value becomes a natural phrasing ("Hi there,"), not a fabricated one.
//
// Matches [ ... ], { ... }, and {{ ... }} single-line placeholders (the shapes a model actually emits).
const PLACEHOLDER_RE = /\{\{\s*[^{}\n]*?\s*\}\}|\{\s*[^{}\n]*?\s*\}|\[\s*[^\]\n]*?\s*\]/g;

// A sentinel (U+0000) that cannot occur in model prose. Each un-fillable placeholder becomes this marker
// so the repair pass can find exactly where a token was dropped and heal the surrounding punctuation and
// spacing — something a bare "" replace can't do without leaving "Hi ," or a double space behind.
const DROP = String.fromCharCode(0);

function firstNameOf(prospect) {
  const name = typeof prospect?.name === "string" ? prospect.name.trim() : "";
  if (!name) return "";
  // A prospect "name" is often a page title or URL (from Exa), not a person. Only treat it as a first
  // name when it looks like a plain human name — otherwise leave the greeting generic rather than paste a
  // URL or headline into "Hi ___,".
  if (/https?:|\/|@|\.[a-z]{2,}(\/|$)/i.test(name)) return "";
  const words = name.split(/\s+/);
  if (words.length > 4) return "";
  return words[0];
}

function companyOf(prospect) {
  return typeof prospect?.company === "string" ? prospect.company.trim() : "";
}

// Classify a placeholder's inner text and return the real value from the prospect, or "" when we don't
// have it. Never invents a value.
function resolvePlaceholder(inner, prospect) {
  const key = inner.toLowerCase().replace(/[_-]+/g, " ").trim();
  if (/\b(first name|firstname|name|first|contact|prospect|recipient)\b/.test(key)) return firstNameOf(prospect);
  if (/\b(company|org|organization|business|team|startup|brand)\b/.test(key)) return companyOf(prospect);
  return "";
}

export function sanitizeDraft(draft, prospect) {
  if (typeof draft !== "string" || !draft) return draft;
  // Pass 1 — fill what we know; mark what we don't with the DROP sentinel.
  let out = draft.replace(PLACEHOLDER_RE, (match) => {
    const inner = match.replace(/^[[{]+|[\]}]+$/g, "").trim();
    if (!inner) return DROP;
    return resolvePlaceholder(inner, prospect) || DROP;
  });
  if (!out.includes(DROP)) return out;
  // Pass 2 — heal the seams. A dropped name in a greeting becomes "there"; every other dropped token is
  // removed along with the whitespace/punctuation it stranded, so no bracket and no ragged gap survives.
  out = out
    // "Hi \0," / "Hello \0!" / "Dear \0" → "Hi there" (greeting slot with no known name)
    .replace(new RegExp(`\\b(hi|hello|hey|dear)\\b[ \\t]*${DROP}`, "gi"), (_, greet) =>
      `${greet.charAt(0).toUpperCase()}${greet.slice(1).toLowerCase()} there`)
    // any remaining dropped token: delete it plus the space it stranded so words don't collide
    .replace(new RegExp(`[ \\t]*${DROP}[ \\t]*`, "g"), " ")
    // tidy: no space before punctuation, collapse doubled spaces, trim trailing spaces at line ends
    .replace(/[ \t]+([,.!?;:])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
  return out;
}

export async function run(stage, upstream, context) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set — add it to your environment and restart.");
  }

  // Loop memory: founder decisions from prior runs, injected by the runner.
  const memory = context?.__memory ?? null;
  const memoryMeta = {
    approved: memory?.approved?.length ?? 0,
    rejected: memory?.rejected?.length ?? 0,
    edits: memory?.edits?.length ?? 0,
  };
  const memoryBlock = renderDraftMemory(memory);

  const prospects = upstream.filter((i) => i.type === "prospect");
  if (prospects.length === 0) return { ok: true, items: [], meta: { count: 0, memory: memoryMeta } };

  const client = new Anthropic();
  const senderName = stage.config.senderName || context?.senderName || "Jacob";
  const product = context?.product;
  const productContext = stage.config.productContext
    || product?.description
    || product?.name
    || context?.productContext
    || "Drover";
  const promptTemplate = stage.agentPrompt || DEFAULT_PROMPT;
  // Founder-facing draft copy: taste + intelligence matter most, so the default is Opus (never Haiku,
  // which the project + global AGENTS.md ban). A founder can still override via stage.config.model.
  const model = stage.config.model || "claude-opus-4-8";

  const drafted = await Promise.all(
    prospects.map(async (p) => {
      try {
        const filledPrompt = fillPrompt(promptTemplate, {
          senderName,
          productContext,
          prospectName: p.name,
          prospectSummary: p.summary?.slice(0, 300) || "limited public info",
          prospectUrl: p.url || "unknown",
        }) + memoryBlock;
        const message = await client.messages.create({
          model,
          max_tokens: 350,
          messages: [{ role: "user", content: filledPrompt }],
        });
        const raw = message.content[0]?.type === "text" ? message.content[0].text.trim() : "";
        // Never let a raw merge token reach the gate — fill from the prospect or fall back gracefully.
        const draft = sanitizeDraft(raw, p);
        return { ...p, draft };
      } catch {
        return { ...p, draft: null };
      }
    })
  );

  return { ok: true, items: drafted, meta: { count: drafted.length, memory: memoryMeta } };
}
