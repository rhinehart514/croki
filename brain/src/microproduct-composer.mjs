// The microproduct producer — the missing leg that emits a deployable artifact (E3.3).
//
// A go-to-market output is not always a message. Sometimes the strongest play is a working thing
// cut from the real product: a scoped demo, a landing page that states exactly what the product
// does, a calculator, a one-off tool. The artifact execute connector (connectors/execute/artifact.mjs)
// already STAGES such an artifact behind the founder gate and never deploys it. What was missing is
// the thing that PRODUCES it. This module is that producer.
//
// It mirrors composition.mjs exactly:
//   - a doctrine prompt (MICROPRODUCT_PROMPT) — the editable instruction lives in
//     ~/.claude/agents/gtm-compose-microproduct.md, this constant is the in-code menu;
//   - an injectable producer (a fake in tests, createClaudeMicroproductProducer() live on the
//     subscription, an honest blank default that produces nothing rather than fabricating an artifact);
//   - a host orchestration (produceMicroproduct) that takes a goal + the scan's grounded truth and
//     returns { artifactSpec, artifactFiles:[{path,contents}] } — normalized and validated.
//
// THE WALL. This module produces FILES AS DATA. It never deploys, publishes, pushes, or writes to
// disk. The live producer runs a read-only subagent (createClaudeMicroproductInvoker in
// agent-bridge.mjs) with read-only tools only and a stripped API key. The produced artifact is handed
// to the artifact execute connector, which stages it (`deployed:false`) behind the founder gate. A
// microproduct deploys ONLY after an explicit founder gate approval (the same authorize-gate-release
// wall as a send) — never from composition and never from a run. There is no deploy path in this file.

import { createClaudeMicroproductInvoker } from "./agent-bridge.mjs";

// The producer doctrine — the in-code mirror of ~/.claude/agents/gtm-compose-microproduct.md. Edit
// the markdown artifact to change how microproducts are built; this constant keeps the prompt
// self-contained so a producer can run without reading the file.
export const MICROPRODUCT_PROMPT = `You are building a small, static MICROPRODUCT as a go-to-market play — a demo, a landing page, a calculator, or a one-off tool cut from the founder's REAL product. You may Read and Grep the repository.

You are given the goal and the scan grounding: the read-only file:line truth about what the product ACTUALLY does (its win event, funnel, stack, real mechanics). Build the artifact that fits the goal.

Critical rules:

- GROUNDED IN REAL TRUTH. Every product CLAIM the artifact makes must come from the grounding or be a clear placeholder. Do NOT invent a feature, a metric, a testimonial, a customer, or a screenshot. If the grounding does not prove it, the artifact does not assert it. The go-to-market framing around the truth — headline, angle, positioning, call to action — is yours to design and runs free; only the product claims are leashed to the scan.
- THE WALL (non-negotiable). You PRODUCE the files. You never deploy, publish, push, or go live, and you never write a script whose purpose is to auto-deploy. The artifact is staged locally and held behind the founder gate; it deploys ONLY after an explicit founder approval — "vibe up to the gate, never past it."
- BUILD STATIC AND SELF-CONTAINED. Prefer a single self-contained index.html (inline CSS/JS, no build step) that opens in a browser as-is. Add a README.md. Add a package.json only if the artifact genuinely needs one. Keep it scoped to one job done well.

Return ONLY a JSON object:
{
  "artifactSpec": { "name": "...", "kind": "landing | demo | calculator | tool", "summary": "one plain sentence", "entry": "index.html", "groundedClaims": ["each product claim with the scan fact it rests on"] },
  "artifactFiles": [ { "path": "index.html", "contents": "...full file text..." }, { "path": "README.md", "contents": "...full file text..." } ]
}
Every file's full text goes in "contents" as a string — you return the artifact as data, not by writing to disk.`;

// Honest blank default: with no producer wired, produce nothing rather than fabricate an artifact
// (the same discipline as composition.mjs's blank compose). Live production is
// createClaudeMicroproductProducer.
const blankProduce = async () => ({ ok: false, error: "blank" });

// Normalize the model's artifact into the staged shape the artifact execute connector reads:
// { artifactSpec, artifactFiles:[{path,contents}] }. The model owns the design; the host drops
// malformed files (no path or no string body — never half-staged) and de-dupes paths so the staged
// artifact is coherent. A file's contents is always a string; the spec is passed through as-is.
export function normalizeMicroproduct(result) {
  const rawSpec = result?.artifactSpec ?? result?.spec ?? null;
  const artifactSpec = rawSpec && typeof rawSpec === "object" ? rawSpec : null;
  const rawFiles = Array.isArray(result?.artifactFiles)
    ? result.artifactFiles
    : (Array.isArray(result?.files) ? result.files : []);
  const seen = new Set();
  const artifactFiles = [];
  for (const entry of rawFiles) {
    if (!entry || typeof entry !== "object") continue;
    const filePath = typeof entry.path === "string" ? entry.path.trim() : "";
    const contents = typeof entry.contents === "string"
      ? entry.contents
      : (typeof entry.content === "string" ? entry.content : null);
    if (!filePath || contents == null) continue;
    if (seen.has(filePath)) continue;
    seen.add(filePath);
    artifactFiles.push({ path: filePath, contents });
  }
  return { artifactSpec, artifactFiles };
}

// Build the producer prompt from the doctrine, the goal, and the scan grounding. The grounding is
// folded in under an explicit key so the model reads it as the product's cited truth (claims to
// honor), never as something to invent.
function buildProducerPrompt({ goal, grounding }) {
  return [
    MICROPRODUCT_PROMPT,
    `\nGoal:\n${goal || ""}`,
    `\nScan grounding — the product's cited truth (honor these claims, do not invent product facts):\n${JSON.stringify(grounding ?? {}, null, 2)}`,
  ].join("\n");
}

// Live producer: builds the prompt and runs a read-only subagent on the founder's subscription
// (createClaudeMicroproductInvoker) that returns the artifact as data. Read-only and no-key by
// construction — it never deploys, publishes, or writes to disk. The host (produceMicroproduct)
// normalizes and validates. `invoke` is injectable so tests can supply a fake subscription.
export function createClaudeMicroproductProducer({ cwd = process.cwd(), model, maxTurns = 24, onText, invoke } = {}) {
  const produceArtifact = invoke || createClaudeMicroproductInvoker({ cwd, model, maxTurns, onText });
  return async function produce({ goal, grounding }) {
    const prompt = buildProducerPrompt({ goal, grounding });
    const result = await produceArtifact({ prompt });
    if (!result || result.ok === false) {
      return { ok: false, error: result?.error || "Microproduct producer returned no result." };
    }
    return { ok: true, artifactSpec: result.artifactSpec ?? null, artifactFiles: result.artifactFiles ?? [] };
  };
}

// The host orchestration: take a goal + scan grounding, run the injected producer, normalize and
// validate the artifact, and return { artifactSpec, artifactFiles }. Throws an honest error on the
// blank default (no subscription) or when the producer returns no usable files — never a silent
// empty artifact. This is the producer entry point a run path or an operator tool calls; the
// returned shape drops straight onto a run item the artifact execute connector stages behind the gate.
export async function produceMicroproduct(input = {}, options = {}) {
  const produce = options.produce || blankProduce;
  const result = await produce({ goal: input.goal, grounding: input.grounding ?? null });
  if (result?.ok === false) {
    throw new Error(result.error === "blank"
      ? "Microproduct production is model-driven and needs a live Claude subscription. Sign in and try again."
      : `Microproduct production failed: ${result.error}`);
  }
  const { artifactSpec, artifactFiles } = normalizeMicroproduct(result);
  if (artifactFiles.length === 0) {
    throw new Error("Microproduct producer returned no usable files.");
  }
  return { artifactSpec, artifactFiles };
}
