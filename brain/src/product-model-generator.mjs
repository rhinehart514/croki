// The product-model generator — rented intelligence, not a hardcoded taxonomy.
//
// The product object model is INTERPRETATION, not truth. Deciding the product's things,
// relationships, user goals, and key states is exactly the kind of conceptual shape "grounding
// does not shape" forbids in the truth layer. So it is never written into scan.mjs or
// product-understanding.mjs — it is generated here, by an injectable generator, edited by the
// founder, and demoted by the host when a claimed citation does not exist.
//
// The runtime is injectable, like the other rented generators (composition, eval):
//   - a fake generator in tests,
//   - createProductModeler() over Codex or Claude Code on the founder's subscription,
//   - createClaudeProductModeler() as a compatibility wrapper,
//   - an honest blank default (blankGenerate) that refuses rather than fabricates.

import { runStructuredTask } from "./structured-task-runtime.mjs";
import { buildRunGrounding } from "./run-grounding.mjs";

// The modeling doctrine, passed to the product-model agent. Edit
// ~/.claude/agents/gtm-model-product.md to change how it interprets the product — the instruction
// is a markdown artifact, not host code (the same pattern every rented agent doctrine follows).
export const PRODUCT_MODEL_PROMPT = `You are building the interpretive PRODUCT MODEL for ONE specific product: its core objects (things), how they relate, what users are trying to do, and the key states a core object moves through. This is INTERPRETATION layered on top of cited code facts — it is NOT a claim about what the code provably does. It is the shape the truth deliberately lacks.

You are given the product's grounded reality (win event, attribution, stack, blind spots, each cited to file:line) and, when available, its buyer/market context. Read a few key repo files to confirm what the product really is, then interpret it into a small, legible model across FIVE layers of understanding.

The five layers:
- things[]: the core nouns of the product (entities, actors, artifacts, events). Each gets a short plain-English summary and a kind (entity / actor / artifact / event — free text, your call).
- relationships[]: how the things relate (creates, belongs to, triggers). Each names a from-thing, a to-thing, and a label.
- userGoals[]: what users are trying to accomplish — the jobs the product is hired for. Each names an actor, the goal/job, and the outcome they're really after.
- states[]: the key lifecycle states a core object moves through (draft, published, attributed). Each names the thing it belongs to.
- ia[]: the information architecture — how the product is organized into areas/sections (the sitemap). Each node has a name, an optional parentId (the name of its parent area, "" for a top-level area), and the things it surfaces.
- workflows[]: the main flows a user moves through to get a job done. Each names the flow, the actor, and an ORDERED list of steps (each step a short label).
- interactions[]: the interaction model as states/screens — the screens or modes the user moves between. Each has a name and a kind (screen / state / mode).
- transitions[]: the edges of the interaction model — what moves the user from one interaction state to another. Each names a from-state, a to-state, and the trigger (the action that causes it).

Provenance is load-bearing on EVERY element of EVERY layer. For ANY element you can ground in real code, mark it "derived" and cite the file:line in evidence. For a genuine interpretive guess with no code support, mark it "speculative" and leave evidence empty. NEVER invent a file, a line, or a citation to dress a guess as fact — the host will demote any "derived" element with no real citation back to "speculative", so a fake citation only loses you credit. Higher layers (IA, workflows, interaction) are often more interpretive — it is honest and expected for many of those to be "speculative".

Keep each layer small and legible: the handful that actually matter, not an exhaustive catalogue. Work efficiently — sample a few key files, then return.

Return ONLY a JSON object with this shape (the host stamps ids, versions, and timestamps):
{
  "things": [ { "name": "...", "kind": "...", "summary": "...", "provenance": "derived"|"speculative", "evidence": [ { "label": "...", "file": "path", "line": 0, "text": "the cited line" } ] } ],
  "relationships": [ { "from": "<thing name or id>", "to": "<thing name or id>", "label": "creates", "summary": "...", "provenance": "derived"|"speculative" } ],
  "userGoals": [ { "actor": "...", "goal": "...", "outcome": "...", "relatedThings": [], "provenance": "derived"|"speculative" } ],
  "states": [ { "thingId": "<thing name or id>", "name": "draft", "summary": "...", "provenance": "derived"|"speculative" } ],
  "ia": [ { "name": "...", "parentId": "<parent area name or \\"\\">", "summary": "...", "relatedThings": [], "provenance": "derived"|"speculative", "evidence": [] } ],
  "workflows": [ { "name": "...", "actor": "...", "summary": "...", "steps": [ { "label": "...", "summary": "..." } ], "provenance": "derived"|"speculative", "evidence": [] } ],
  "interactions": [ { "name": "...", "kind": "screen"|"state"|"mode", "summary": "...", "provenance": "derived"|"speculative", "evidence": [] } ],
  "transitions": [ { "from": "<interaction name>", "to": "<interaction name>", "trigger": "...", "summary": "...", "provenance": "derived"|"speculative" } ]
}
Return empty bags for any layer you genuinely cannot ground or responsibly interpret.`;

// Honest blank default: with no generator runtime wired, return an empty model rather than
// fabricate. Refusing-rather-than-faking is the same discipline as the context providers' null return.
export const blankGenerate = async () => ({
  ok: true,
  model: { things: [], relationships: [], userGoals: [], states: [], ia: [], workflows: [], interactions: [], transitions: [] },
  meta: { blank: true, provider: "blank", runtime: null, model: null },
});

const EMPTY_MODEL = { things: [], relationships: [], userGoals: [], states: [], ia: [], workflows: [], interactions: [], transitions: [] };

// Coerce whatever the agent returned into the full layer shape, dropping anything that is not an
// array so a malformed bag becomes empty rather than crashing the pollution guard downstream.
export function toModel(parsed) {
  if (!parsed || typeof parsed !== "object") return { ...EMPTY_MODEL };
  const bag = (key) => (Array.isArray(parsed[key]) ? parsed[key] : []);
  return {
    things: bag("things"),
    relationships: bag("relationships"),
    userGoals: bag("userGoals"),
    states: bag("states"),
    ia: bag("ia"),
    workflows: bag("workflows"),
    interactions: bag("interactions"),
    transitions: bag("transitions"),
  };
}

function providerForRuntime(runtime) {
  if (runtime === "codex") return "codex";
  if (runtime === "claude-code" || runtime === "anthropic") return "claude";
  return "blank";
}

// Provider-neutral live generator. The one-shot runtime owns selection and parsing; this module owns
// only the product-model prompt and its deterministic eight-bag normalization.
export function createProductModeler({ cwd = process.cwd(), model, runtime, maxTurns = 30, onText, runTask = runStructuredTask } = {}) {
  return async function generate({ grounding, market } = {}) {
    const contextBlock = [
      grounding ? `\nThe product's grounded reality (cited code facts — win event, attribution, stack, blind spots):\n${JSON.stringify(grounding, null, 2)}` : "",
      market ? `\nBuyer/market context:\n${JSON.stringify(market, null, 2)}` : "",
    ].filter(Boolean).join("\n");
    const prompt = `${PRODUCT_MODEL_PROMPT}${contextBlock}`;
    const result = await runTask({ task: "product-model", prompt, cwd, model, runtime, maxTurns, onText, output: "object", readOnly: true });
    const provider = providerForRuntime(result.runtime);
    if (!result.ok) {
      return { ok: false, model: { ...EMPTY_MODEL }, meta: { provider, runtime: result.runtime ?? null, model: result.model ?? model ?? null, error: result.error?.message, errorKind: result.error?.kind, retriable: result.error?.retriable === true } };
    }
    return { ok: true, model: toModel(result.value), meta: { parsed: true, provider, runtime: result.runtime, model: result.model ?? model ?? null } };
  };
}

// Assemble the one project-scoped draft every HTTP/background derive path uses. Callers supply the
// linked workspace report explicitly, so this helper cannot silently ground one product in another
// project's latest scan. It does not persist; the domain command remains the write boundary.
export async function generateProductModelForProject({ project, report = null, repo, model, runtime, market, runTask = runStructuredTask } = {}) {
  if (!project?.id) throw new Error("Product-model derivation needs a project.");
  const cwd = String(repo || project.sharedContext?.repository?.repo || process.cwd()).trim() || process.cwd();
  const grounding = buildRunGrounding(project, report);
  const groundingRef = project.sharedContext?.repository?.workspaceId ?? report?.scannedAt ?? null;
  const generate = createProductModeler({ cwd, model, runtime, runTask });
  const result = await generate({ grounding, market });
  return { ...result, grounding, groundingRef, repo: cwd };
}

// Public compatibility wrapper. Existing callers keep their name and Claude selection, while all
// parsing and safety now pass through the shared provider-neutral seam.
export function createClaudeProductModeler(options = {}) {
  return createProductModeler({ ...options, runtime: "claude-code" });
}
