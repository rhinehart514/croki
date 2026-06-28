// Agentic-vs-pre-pack comparison harness (E1.5).
//
// The per-provider cutover (agent-bridge.mjs) is a mechanism; this is the INSTRUMENT that earns
// each flip. The cutover is supposed to happen one source at a time, "based on quality evidence" —
// and this is where that evidence is produced. Given ONE set of step inputs, it builds BOTH prompts
// — the proven pre-pack and the agentic one — through the same buildAgentPrompt the live run uses,
// and returns a structured comparison: what each contains, each manifest, the size/token delta, and
// which tools the agentic path offered. Pure and deterministic: the diff is computed from the two
// built prompts, no model is called. That is what makes it unit-testable (agentic-compare.test.mjs).
//
// Two layers, by design:
//   compareGroundingPaths(...)  — PURE. Builds both prompts and diffs their SHAPE. Unit-tested.
//   compareGroundingOutputs(...) — LIVE. The founder runs BOTH prompts on the subscription and
//                                  compares the model's actual OUTPUT. This is the real quality
//                                  signal; it needs a credential, so it is gated like live.test.mjs.
//
// The cutover decision is the founder's, made from compareGroundingOutputs evidence. This file
// produces the comparison; it never flips a provider itself.

import { buildAgentPrompt } from "./agent-bridge.mjs";

// A cheap, dependency-free token estimate. Real token counts come from the model's tokenizer; for a
// SHAPE comparison a stable char-based proxy (~4 chars/token, the usual English rule of thumb) is
// enough to surface "the agentic prompt is far smaller because it doesn't staple the whole block".
// Labeled `approxTokens` everywhere so it is never mistaken for an exact count.
export function approxTokens(text) {
  if (typeof text !== "string" || !text.length) return 0;
  return Math.ceil(text.length / 4);
}

// Summarize one built prompt into the comparable facts: its size, its manifest, and — for the
// agentic/partial paths — which retrieval tools it offered. Pulls the offered-tool names out of the
// built result OR its manifest, whichever is present, so it works across all three modes.
function summarizePrompt(built) {
  const offered = Array.isArray(built.retrievalTools)
    ? built.retrievalTools.map((t) => t.name)
    : Array.isArray(built.manifest?.offered)
      ? built.manifest.offered
      : [];
  const mode = built.manifest?.mode ?? "pre-pack";
  return {
    mode,
    chars: built.prompt.length,
    approxTokens: approxTokens(built.prompt),
    offeredTools: offered,
    offeredToolCount: offered.length,
    manifest: built.manifest,
    // The pre-pack manifest lists which providers actually contributed text — the surface the
    // agentic path replaces with tools. Null on the agentic path (nothing pre-packed).
    prePackedProviders: prePackedFrom(built.manifest),
  };
}

// Pull the contributing-provider names out of whichever manifest shape this build produced:
//   pre-pack:        { providers: [...] }
//   partial-agentic: { prePacked: { providers: [...] }, ... }
//   full agentic:    no providers list (everything is a tool) → []
function prePackedFrom(manifest) {
  const providers = Array.isArray(manifest?.providers)
    ? manifest.providers
    : Array.isArray(manifest?.prePacked?.providers)
      ? manifest.prePacked.providers
      : null;
  if (!providers) return [];
  return providers.filter((p) => p.contributed).map((p) => p.name);
}

// The PURE comparison (E1.5). Build the SAME inputs both ways and diff the shape. `agentic` is the
// cutover argument — pass `{ agenticRetrieval: true }` for the full flip, or
// `{ agenticProviders: ["market"] }` to compare a single-source cutover against the pre-pack. The
// pre-pack side always builds with no agentic config (today's proven default).
export function compareGroundingPaths(stepInput = {}, { agentic = { agenticRetrieval: true } } = {}) {
  const prePack = buildAgentPrompt({ ...stepInput });
  const agenticBuilt = buildAgentPrompt({ ...stepInput, ...agentic });

  const a = summarizePrompt(prePack);
  const b = summarizePrompt(agenticBuilt);

  // What moved from pre-packed text into a pulled tool: a provider that contributed in the pre-pack
  // and is now offered as a tool instead. The cutover's whole point, made explicit.
  const movedToTools = a.prePackedProviders.filter((name) => {
    // tool names are get_<source>; the pre-pack manifest uses the source name. Match by suffix.
    return b.offeredTools.some((tool) => tool === `get_${name}` || tool === `get_${name.replace(/-/g, "_")}`);
  });

  return {
    prePack: a,
    agentic: b,
    delta: {
      // Negative chars/tokens = the agentic prompt is SMALLER (it didn't staple the block). The
      // headline number the cutover is justified or questioned by.
      chars: b.chars - a.chars,
      approxTokens: b.approxTokens - a.approxTokens,
      offeredToolCount: b.offeredToolCount - a.offeredToolCount,
    },
    movedToTools,
    // A flat verdict the founder/UI can read without re-deriving: did the agentic path actually
    // shrink the prompt, and did it offer the tools it was supposed to?
    summary: {
      smaller: b.chars < a.chars,
      offersTools: b.offeredToolCount > 0,
      sameInputs: true,
    },
  };
}

// ── LIVE step (E1.5, founder-run) ────────────────────────────────────────────
// The PURE compare above proves the SHAPE differs; it cannot prove the agentic path produces AS
// GOOD an output, which is the only thing that earns a real cutover. That requires running both
// prompts on the founder's subscription and comparing what the model actually returns — a real
// spend, so it is gated exactly like brain/test/live.test.mjs (GTM_LIVE=1) and lives in
// brain/test/live-proofs.test.mjs. This function is the runnable core of that proof.
//
// invoker: a function ({ ref, prompt, items, context, config }) -> { ok, items, meta } — pass the
// live createClaudeAgentInvoker(). The cutover decision reads the two `items` arrays side by side:
// does the agentic run, which pulled its own grounding, return work as good as the pre-packed run?
export async function compareGroundingOutputs(stepInput = {}, { agentic = { agenticRetrieval: true }, invoker } = {}) {
  if (typeof invoker !== "function") {
    throw new Error("compareGroundingOutputs needs a live agent invoker — this is the founder-run, subscription-spending half of the comparison.");
  }
  const { ref, prompt, items, context } = stepInput;
  const [prePackRun, agenticRun] = await Promise.all([
    invoker({ ref, prompt, items, context, config: {} }),
    invoker({ ref, prompt, items, context, config: { ...agentic } }),
  ]);
  return {
    shape: compareGroundingPaths(stepInput, { agentic }),
    prePack: { ok: prePackRun.ok, items: prePackRun.items, meta: prePackRun.meta },
    agentic: { ok: agenticRun.ok, items: agenticRun.items, meta: agenticRun.meta },
    // The founder reads these two `items` arrays to decide whether the source is ready to cut over.
    // The harness deliberately does NOT auto-grade: the quality call is the founder's, like a gate.
  };
}
