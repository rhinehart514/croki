// Compose a teammate from a plain-language description — the "+ build a teammate with Claude" flow. The
// founder says what they need in a sentence; Claude drafts a real subagent definition (a name, a one-line
// job, and a system prompt). Draft only — this NEVER writes a file; the route persists on the founder's
// accept, so the gate stays the founder's. Intelligence is rented through runClaudeQuery, the same seam
// the pipeline composer uses.
import { runClaudeQuery } from "./agent-bridge.mjs";
import { isValidRef } from "./artifact-store.mjs";

export const CREW_COMPOSE_PROMPT = `You are drafting ONE specialist teammate (a subagent) for a founder's go-to-market crew, from a plain-language description of what they need it to do.

Return ONLY a JSON object — no prose, no code fence — with exactly these fields:
{
  "ref": "kebab-case-slug",          // short unique id, e.g. "dental-practice-verifier"
  "name": "Human Role Name",         // 2-4 words, e.g. "Practice Verifier"
  "description": "One line: what it does for the founder and when they'd reach for it.",
  "systemPrompt": "Operating instructions in second person ('You are ...'). One to three short paragraphs: what it does, the inputs it expects, the taste and guardrails it holds, and the shape of what it returns."
}

Be grounded and specific to the founder's ask; no marketing language. Discovery/draft work only — the teammate never sends, publishes, or charges, and any outward action stops at the founder gate. The ref must match ^[a-z0-9][a-z0-9-]{0,60}$.`;

// Refine an in-progress draft. The founder is shaping a teammate live; apply ONE change and keep the rest,
// so refinement reads as adjustment, not regeneration. Identity (ref) is held stable by the caller.
export const CREW_REVISE_PROMPT = `You are refining a teammate (a subagent) the founder is shaping. Apply their requested change and keep everything they did NOT ask to change.

Return ONLY a JSON object — no prose, no code fence — with exactly these fields: { "ref", "name", "description", "systemPrompt" }. Keep the "ref" exactly as given. Same rules as before: grounded, plain, discovery/draft only, outward actions stop at the founder gate.`;

// Fork an existing teammate into a NEW one — same shape, adapted by the founder's change.
export const CREW_FORK_PROMPT = `You are creating a NEW teammate (a subagent) by adapting an existing one the founder already trusts. Keep what makes it good; change it as the founder asks.

Return ONLY a JSON object — no prose, no code fence — with exactly these fields: { "ref", "name", "description", "systemPrompt" }. Give it a NEW kebab-case ref (^[a-z0-9][a-z0-9-]{0,60}$). Same rules: grounded, plain, discovery/draft only, outward actions stop at the founder gate.`;

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
  return `---\nname: ${name}\ndescription: ${description}\ntools: Read, WebSearch, WebFetch\nmodel: sonnet\nprovider: claude\n---\n\n# ${name}\n\n${body}\n`;
}

export function createCrewComposer({ cwd = process.cwd(), model, maxTurns = 3 } = {}) {
  return async function compose({ description, product }) {
    const prompt = [
      CREW_COMPOSE_PROMPT,
      product ? `The founder's product: ${product}` : "",
      `The founder needs a teammate that: ${description}`,
    ].filter(Boolean).join("\n\n");
    // No repo tools — this is a focused generation grounded in the founder's words, so it stays fast.
    const { text, error } = await runClaudeQuery({ prompt, cwd, model, maxTurns, allowedTools: [] });
    if (error) throw new Error(error);
    let spec;
    try {
      spec = extractJson(text);
    } catch {
      throw new Error("Claude didn't return a usable teammate draft — try describing what you need a little differently.");
    }
    let ref = slugify(spec.ref || spec.name || description);
    if (!isValidRef(ref)) ref = slugify(description);
    const draft = {
      ref,
      name: String(spec.name || ref).trim(),
      description: String(spec.description || "").trim(),
      systemPrompt: String(spec.systemPrompt || "").trim(),
    };
    return { ...draft, markdown: draftToMarkdown(draft) };
  };
}
