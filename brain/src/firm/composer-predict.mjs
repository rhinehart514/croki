// Intent options for the composer — a founder-side direction assist, not a router between the founder and
// the SDK model.
//
// The founder deliberately asks (a composer button) for candidate directions. Croki reads the venture's
// real product truth and its live WorkIndex and returns a few DISTINCT candidate intents — the different
// things the founder might actually be trying to do — as short, clickable options. Clicking one loads it
// into the composer as a full, editable direction; the actual turn still goes to the chosen Claude/Codex
// model unchanged. This never reshapes, gates, or intercepts the agent turn — it only sharpens the
// founder's own input before they commit it.
//
// Because the founder summons this deliberately, the ~call latency is acceptable, but every grounding read
// is still fail-open: a missing venture, blind repo, or absent key yields an empty option set, never an
// error the founder feels.

import { openVenture } from "./venture-store.mjs";
import { readRepositoryTruth } from "./truth.mjs";
import { buildWorkIndex } from "./work-index.mjs";
import { runClaudeQuery } from "../model-query.mjs";

// A small, fast model keeps the summon cheap; options are throwaway, so this must not borrow the
// reasoning-heavy teammate model. The call goes through the same subscription-authenticated path the app
// uses for real model work (runClaudeQuery / claude-agent-sdk), not a raw API key — the desktop Brain is
// signed in with Claude Code, not ANTHROPIC_API_KEY.
const FAST_MODEL = "claude-haiku-4-5-20251001";
const MAX_OPTIONS = 3;
const MAX_LABEL = 64;
const MAX_DIRECTION = 240;

export async function suggestDirections({ ventureId, draft = "", mode = "auto", threadRef = null } = {}, deps = {}) {
  const seed = String(draft ?? "");
  const model = deps.model ?? defaultModel;
  const assemble = deps.assembleContext ?? assemblePredictionContext;
  const context = assemble(ventureId, { draft: seed, mode });
  let raw;
  try {
    raw = await model({ draft: seed, mode, context, threadRef, ventureId });
  } catch {
    return { options: [] };
  }
  return { options: sanitizeOptions(raw) };
}

// Compact, fail-open grounding: the product's own name/description (cited repo truth) plus the founder
// intents of the most relevant open Threads, sliced by the draft as a query. Every read is guarded so a
// summon never depends on a healthy venture.
export function assemblePredictionContext(ventureId, { draft = "", mode = "auto" } = {}) {
  return { product: safeProduct(ventureId), work: safeWork(ventureId, draft), mode };
}

function safeProduct(ventureId) {
  try {
    const venture = openVenture(ventureId);
    if (!venture?.repository) return null;
    const truth = readRepositoryTruth(venture.repository);
    return {
      name: truth.manifest?.name ?? venture.name ?? null,
      description: truth.manifest?.description ?? null,
    };
  } catch {
    return null;
  }
}

function safeWork(ventureId, draft) {
  try {
    const index = buildWorkIndex(ventureId, { query: draft });
    const openThreads = (index.items ?? [])
      .slice(0, 4)
      .map((item) => item.founderIntent)
      .filter((intent) => typeof intent === "string" && intent.trim());
    return openThreads.length ? { openThreads } : null;
  } catch {
    return null;
  }
}

async function defaultModel({ draft, mode, context, ventureId }) {
  const cwd = safeCwd(ventureId);
  const { text, error } = await runClaudeQuery({
    prompt: buildIntentPrompt(draft, mode, context),
    model: FAST_MODEL,
    maxTurns: 1,
    allowedTools: [],
    ...(cwd ? { cwd } : {}),
  });
  if (error) return "";
  return String(text ?? "").trim();
}

function safeCwd(ventureId) {
  try {
    return openVenture(ventureId)?.repository ?? null;
  } catch {
    return null;
  }
}

const MODE_INTENT = {
  work: "The founder is directing coding work — the intents should move toward concrete builds or changes to the product.",
  "product-gtm": "The founder is using Canvas context — suggest concrete coding or product-understanding tasks that the selected model can pursue in this Thread.",
  conversation: "The founder is working in a software project — the intents should be concrete, actionable coding or repository directions.",
  auto: "The founder is working in a software project — the intents should be concrete, actionable coding or repository directions.",
};

function buildIntentPrompt(draft, mode, context) {
  const seed = draft.trim();
  const lines = [
    "You read a founder's draft inside Croki, a coding environment for direct Claude and Codex work.",
    MODE_INTENT[mode] ?? MODE_INTENT.auto,
    "",
    "Infer the DISTINCT things the founder might actually be trying to do — their candidate intents — from",
    "what they have typed and their project's real state. These are different intents, not rephrasings of the",
    "same one. Ground each in repository truth and open work below; prefer a task that references something",
    "real about this project over generic advice.",
    "",
    `Return ONLY a JSON array of at most ${MAX_OPTIONS} objects, each {"label": a short intent name of at most six words, "direction": a full first-person direction the founder could send as-is}.`,
    "No prose, no markdown, no code fences — JSON only.",
  ];
  const product = context?.product;
  if (product?.name || product?.description) {
    lines.push("", `Product truth: ${[product.name, product.description].filter(Boolean).join(" — ")}`);
  }
  const openThreads = context?.work?.openThreads;
  if (openThreads?.length) {
    lines.push("", "Open work in this project:", ...openThreads.map((intent) => `- ${intent}`));
  }
  lines.push("", "The founder has typed so far:", seed || "(nothing yet — read intent from the project state)", "", "JSON:");
  return lines.join("\n");
}

// The model is told to return a bare JSON array of {label, direction}, but a small fast model drifts: it
// may wrap the array in prose or a code fence, omit a field, or run labels long. Normalize to exactly the
// clickable options the composer renders. Accepts either the raw model string or an already-parsed array.
export function sanitizeOptions(raw) {
  const parsed = Array.isArray(raw) ? raw : parseJsonArray(raw);
  if (!Array.isArray(parsed)) return [];
  const options = [];
  const seen = new Set();
  for (const entry of parsed) {
    const direction = clip(entry?.direction ?? entry?.text ?? entry?.label, MAX_DIRECTION);
    if (!direction) continue;
    const label = clip(entry?.label ?? direction, MAX_LABEL) || direction;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    options.push({ label, direction });
    if (options.length >= MAX_OPTIONS) break;
  }
  return options;
}

function parseJsonArray(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function clip(value, max) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > max ? text.slice(0, max).trimEnd() : text;
}
