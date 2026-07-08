// Compose a teammate from a plain-language description — the "+ build a teammate with Claude" flow. The
// founder says what they need in a sentence; Claude drafts a real subagent definition (a name, a one-line
// job, and a system prompt). Draft only — this NEVER writes a file; the route persists on the founder's
// accept, so the gate stays the founder's. Intelligence is rented through runClaudeQuery, the same seam
// the pipeline composer uses.
import { runClaudeQuery } from "./agent-bridge.mjs";
import { isValidRef } from "./artifact-store.mjs";

// The founder-safe VOICE block, shared by all three prompts. It is authored to BE surfaceable: how the
// teammate SOUNDS and how it carries itself — NEVER a restatement of its operating instructions. The
// voice is the only part of a teammate a founder reads in the first person during a run, so it must be
// readable aloud and give nothing away about the systemPrompt.
const VOICE_FIELD_SPEC = `  "voice": {
    "register": "2-4 words for how it SOUNDS when it talks, e.g. 'crisp, wry, concrete'. How it TALKS, not what it does.",
    "stance": "ONE first-person sentence on how it approaches the work and why it cares — its stakes, in its own voice, e.g. 'I earn my spot on this crew by finding the detail everyone else skimmed past.'"
  }`;

const VOICE_RULE = `The "voice" is how the teammate SOUNDS and how it carries itself — a founder will read it aloud during a run. It must NEVER restate the systemPrompt or leak its operating instructions; write only register (how it talks) and a first-person stance (how it approaches the work and why it cares).`;

export const CREW_COMPOSE_PROMPT = `You are drafting ONE specialist teammate (a subagent) for a founder's go-to-market crew, from a plain-language description of what they need it to do.

Return ONLY a JSON object — no prose, no code fence — with exactly these fields:
{
  "ref": "kebab-case-slug",          // short unique id, e.g. "dental-practice-verifier"
  "name": "Human Role Name",         // 2-4 words, e.g. "Practice Verifier"
  "description": "One line: what it does for the founder and when they'd reach for it.",
  "systemPrompt": "Operating instructions in second person ('You are ...'). One to three short paragraphs: what it does, the inputs it expects, the taste and guardrails it holds, and the shape of what it returns.",
${VOICE_FIELD_SPEC}
}

Be grounded and specific to the founder's ask; no marketing language. Discovery/draft work only — the teammate never sends, publishes, or charges, and any outward action stops at the founder gate. The ref must match ^[a-z0-9][a-z0-9-]{0,60}$. ${VOICE_RULE}`;

// Refine an in-progress draft. The founder is shaping a teammate live; apply ONE change and keep the rest,
// so refinement reads as adjustment, not regeneration. Identity (ref) is held stable by the caller.
export const CREW_REVISE_PROMPT = `You are refining a teammate (a subagent) the founder is shaping. Apply their requested change and keep everything they did NOT ask to change.

Return ONLY a JSON object — no prose, no code fence — with exactly these fields: { "ref", "name", "description", "systemPrompt", "voice": { "register", "stance" } }. Keep the "ref" exactly as given. Same rules as before: grounded, plain, discovery/draft only, outward actions stop at the founder gate. ${VOICE_RULE}`;

// Fork an existing teammate into a NEW one — same shape, adapted by the founder's change.
export const CREW_FORK_PROMPT = `You are creating a NEW teammate (a subagent) by adapting an existing one the founder already trusts. Keep what makes it good; change it as the founder asks.

Return ONLY a JSON object — no prose, no code fence — with exactly these fields: { "ref", "name", "description", "systemPrompt", "voice": { "register", "stance" } }. Give it a NEW kebab-case ref (^[a-z0-9][a-z0-9-]{0,60}$). Same rules: grounded, plain, discovery/draft only, outward actions stop at the founder gate. ${VOICE_RULE}`;

function extractJson(text) {
  const raw = String(text ?? "");
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const slice = fenced ? fenced[1] : raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
  return JSON.parse(slice);
}

export function slugify(value, fallback = "teammate") {
  const s = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return s || fallback;
}

// Turn a draft spec into the raw agent markdown — the same frontmatter shape the artifact editor writes,
// so a Claude-built teammate is indistinguishable from a hand-authored one on disk.
export function draftToMarkdown(spec) {
  const name = String(spec.name || spec.ref || "Teammate").replace(/\s+/g, " ").trim();
  const description = String(spec.description || "").replace(/\s+/g, " ").trim();
  const body = String(spec.systemPrompt || "").trim() || `Describe what ${name} does, the inputs it expects, and what it returns.`;
  // Optional reduced toolset (an imported teammate carries its own read-only-filtered tools); the
  // default holds the conservative read-only set for a Claude-composed teammate.
  const tools = Array.isArray(spec.tools) && spec.tools.length
    ? spec.tools.map((t) => String(t).trim()).filter(Boolean).join(", ")
    : "Read, WebSearch, WebFetch";
  return `---\nname: ${name}\ndescription: ${description}\ntools: ${tools}\nmodel: sonnet\nprovider: claude\n---\n\n# ${name}\n\n${body}\n`;
}

// One composer, three moves: draft fresh from a sentence, REFINE an in-progress draft (keeping its ref so
// its face/identity holds), or FORK an existing teammate into a new one. Which move is picked by what the
// caller passes: `current` → refine, `base` → fork, else fresh.
export function createCrewComposer({ cwd = process.cwd(), model, maxTurns = 3, runQuery = runClaudeQuery } = {}) {
  return async function compose({ description, product, current, base, instruction } = {}) {
    const productLine = product ? `The founder's product: ${product}` : "";
    let prompt;
    if (current) {
      prompt = [
        CREW_REVISE_PROMPT,
        productLine,
        `Current teammate (keep "ref" exactly "${current.ref}"):`,
        JSON.stringify({ ref: current.ref, name: current.name, description: current.description, systemPrompt: current.systemPrompt, voice: current.voice }, null, 2),
        `The founder's change: ${instruction || description}`,
      ].filter(Boolean).join("\n\n");
    } else if (base) {
      prompt = [
        CREW_FORK_PROMPT,
        productLine,
        "Start from this existing teammate:",
        base.definition || JSON.stringify(base, null, 2),
        `Adapt it like this: ${instruction || description}`,
      ].filter(Boolean).join("\n\n");
    } else {
      prompt = [
        CREW_COMPOSE_PROMPT,
        productLine,
        `The founder needs a teammate that: ${description}`,
      ].filter(Boolean).join("\n\n");
    }
    // No repo tools — a focused generation grounded in the founder's words, so it stays fast.
    const { text, error } = await runQuery({ prompt, cwd, model, maxTurns, allowedTools: [] });
    if (error) throw new Error(error);
    let spec;
    try {
      spec = extractJson(text);
    } catch {
      throw new Error("Claude didn't return a usable teammate draft — try describing what you need a little differently.");
    }
    // Refine holds the same ref so the face never churns mid-shaping; fresh/fork mint one from the content.
    let ref = current?.ref || slugify(spec.ref || spec.name || description || instruction || "teammate");
    if (!isValidRef(ref)) ref = slugify(description || instruction || "teammate");
    const draft = {
      ref,
      name: String(spec.name || ref).trim(),
      description: String(spec.description || "").trim(),
      systemPrompt: String(spec.systemPrompt || "").trim(),
    };
    // A founder-safe voice seed rides ALONGSIDE the draft (never into the on-disk markdown / systemPrompt).
    // The route stamps it onto the soul on accept; a missing/empty voice is fine (deriveVoiceBrief falls
    // back deterministically). Kept as raw { register, stance } — the store normalizes on setVoice.
    const voice = spec.voice && typeof spec.voice === "object"
      ? { register: String(spec.voice.register || "").trim(), stance: String(spec.voice.stance || "").trim() }
      : null;
    return { ...draft, voice, markdown: draftToMarkdown(draft) };
  };
}
