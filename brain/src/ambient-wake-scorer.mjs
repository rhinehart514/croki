// The AMBIENT WAKE SCORER — the rented, model-backed judgment behind the input router's wakeScorer seam.
//
// The input router (input-router.mjs) is a PURE, deterministic classifier: it matches a captured signal
// against existing channels by code, and for anything that fits no channel it asks ONE fuzzy question —
// "does this signal warrant waking a standing brief so the machine drafts a next step for it?" That is a
// judgment call, not arithmetic, so per the harness it is RENTED: an injectable scorer, whose honest blank
// default REFUSES (no wake). This file is the live scorer the always-on drain wires into that seam.
//
// It is a rented agent behind an OPEN step, not new host domain logic: the host owns the decision SHAPE
// ({ warrant, brief, reason }); the model owns only the fuzzy call. The model runs read-only on the
// founder's subscription (agent-bridge.runClaudeQuerySync), synchronously — because the router scores
// synchronously — and is invoked ONLY when the router reaches a candidate signal (no channel fit). An idle
// tick with an empty inbox never builds a scorer verdict, so it makes zero model calls.
//
// THE WALL IS UNTOUCHED. A warranted verdict only NAMES a standing brief; the wake it triggers composes
// and runs to the founder gate exactly as a goal drive does, and the model here is handed no tool at all —
// it returns a JSON verdict the caller parses. It can never send, run, or approve anything.
//
// Honest-refusal on every failure path: a missing CLI, a non-JSON reply, a malformed verdict, or a blank
// brief all resolve to { warrant: false } (no wake), so a scorer that can't reach a clean judgment never
// invents one — it degrades to exactly today's blank behavior.

import { runClaudeQuerySync } from "./agent-bridge.mjs";

// Pull the wake verdict JSON out of the model's reply — fenced, inline, or the whole message. Returns
// null when there is no parseable object, so the caller refuses to wake rather than guess.
function parseVerdict(text) {
  if (typeof text !== "string" || !text.trim()) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [];
  if (fenced) candidates.push(fenced[1].trim());
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) candidates.push(text.slice(start, end + 1));
  candidates.push(text.trim());
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

// Coerce a parsed verdict into the strict, host-owned shape. `warrant` is a hard boolean (anything but a
// literal true is false); `brief` is the standing brief a warranted wake runs (required for a wake — a
// warrant with no brief becomes a refusal, mirroring the router's own guard); `reason` is a short label.
function coerceVerdict(parsed) {
  if (!parsed || typeof parsed !== "object") return { warrant: false };
  const warrant = parsed.warrant === true;
  const brief = typeof parsed.brief === "string" ? parsed.brief.trim() : "";
  const reason = typeof parsed.reason === "string" ? parsed.reason.trim() : "";
  if (!warrant || !brief) return { warrant: false, reason: reason || undefined };
  return { warrant: true, brief, reason: reason || undefined };
}

// Build the scorer prompt. It carries ONLY the signal's safe framing (kind / source / a compact payload)
// and the names of the project's existing channels, so the model can judge whether this is genuinely new,
// wake-worthy work or noise. It asks for a single JSON verdict and nothing else. The register is plain
// founder language (the standing brief is what the machine will actually run), no GTM jargon.
export function buildWakeScorerPrompt(signal = {}, { channels = [] } = {}) {
  const kind = String(signal.kind ?? "").trim();
  const source = String(signal.source ?? "").trim();
  let payload = "";
  try {
    payload = JSON.stringify(signal.payload ?? {}, null, 2).slice(0, 2000);
  } catch {
    payload = "";
  }
  const channelNames = (Array.isArray(channels) ? channels : [])
    .map((c) => String(c?.name || c?.kind || c?.id || "").trim())
    .filter(Boolean);
  return [
    "You are the always-on wake scorer for a founder's go-to-market machine.",
    "A world signal just arrived that did NOT match any of the founder's existing go-to-market motions.",
    "Your ONE job: decide whether this signal is worth waking the machine to draft a next step for it, OR whether it is noise to set aside. You do not send, run, or approve anything — you only judge.",
    channelNames.length
      ? `The founder's existing motions (already handle their own intake): ${channelNames.join(", ")}.`
      : "The founder has no existing motions yet.",
    `Signal kind: ${kind || "(none)"}`,
    `Signal source: ${source || "(none)"}`,
    payload ? `Signal details (JSON):\n${payload}` : "Signal has no extra details.",
    "Wake ONLY when the signal names a real, specific piece of go-to-market work a founder would want a draft for — a reply to answer, a new signup to welcome, a competitor move to respond to. Do NOT wake for noise, automated notifications, or anything vague.",
    "If you wake, write the standing brief as ONE plain sentence telling the machine exactly what to draft, in everyday words — no jargon, no code.",
    'Return ONLY a JSON object and nothing else, shaped { "warrant": boolean, "brief": string, "reason": string }. When not waking, return { "warrant": false, "reason": "<why it is noise>" } with an empty or omitted brief.',
  ].filter(Boolean).join("\n\n");
}

// The live scorer: a SYNCHRONOUS function matching the router's wakeScorer seam
// (signal, { channels }) → { warrant, brief?, reason? }. It runs the rented model read-only on the
// founder's subscription and parses the verdict. `runSync` is injectable so tests supply a fake model.
// Every failure path returns { warrant: false } (no wake) — an honest refusal, never a blind wake.
export function createAmbientWakeScorer({ cwd = process.cwd(), model, runSync = runClaudeQuerySync } = {}) {
  return function score(signal = {}, context = {}) {
    let text;
    try {
      text = runSync({ prompt: buildWakeScorerPrompt(signal, context), cwd, model });
    } catch {
      return { warrant: false };
    }
    if (typeof text !== "string" || !text.trim()) return { warrant: false };
    return coerceVerdict(parseVerdict(text));
  };
}
