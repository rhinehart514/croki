// The market-research capability — the buyer-side truth pillar (GTM-ENGINE-REBUILD §4, Phase 1).
//
// The product scan reads the codebase: what the product IS, cited to file:line. This reads the
// OUTSIDE, almost none of which lives in code — who the buyer is, the pain they feel, the job they
// hire a tool for, the now-trigger, today's workaround, the value prop, the offer, the channels
// where they actually are, the message that lands, the proof they need, and the path to conversion.
//
// Intelligence is RENTED, not hosted, exactly like the product-model generator. An injectable
// generator — a research agent reached through an OPEN step (WebSearch/WebFetch/Read on the
// founder's own subscription, NOT a new hardwired Node connector) — returns candidate buyer-side
// records. The host then normalizes each into the Phase 0 MarketObject (gtm-store.marketObjectStore),
// where evidence discipline is enforced in CODE: a claim with no sourced evidence is structurally
// demoted to speculative, never presented as fact. Persisting, override-merging, and projecting the
// records back into a run's market context are all deterministic — no model call where a function does.
//
// The research doctrine lives in ~/.claude/agents/gtm-research-market.md (editable markdown, not
// host code — the same pattern every rented agent follows). This module owns only: that prompt, the
// honest-blank default, the live generator, and the deterministic persist / override / projection code.

import { runClaudeQuery, parseAgentItems } from "./agent-bridge.mjs";
import { marketObjectStore } from "./gtm-store.mjs";

// The canonical buyer-side kinds. This is a HINT to the research agent of the picture worth
// filling, never a closed enum: the store accepts any kind string, and the agent may return a kind
// not on this list (a novel workaround, a proof type nobody named). It exists so a run knows which
// facets are still blank, not to reject a value. (§2.2 open shapes — guarded by anti-cage.test.mjs.)
export const MARKET_OBJECT_KIND_HINTS = [
  "buyer",
  "pain",
  "job",
  "trigger",
  "workaround",
  "valueProp",
  "offer",
  "channel",
  "message",
  "proof",
  "conversionPath",
];

// The research doctrine, passed to the market-research agent. Edit
// ~/.claude/agents/gtm-research-market.md to change how it researches — the instruction is a
// markdown artifact, not host code.
export const MARKET_RESEARCH_PROMPT = `You are the MARKET RESEARCHER for ONE specific product. Your job is to build the BUYER-SIDE picture the product's own codebase cannot contain: who the buyer really is, the pain they feel, the job they hire a product for, what makes NOW the moment (the trigger), what they do today instead (the workaround), the value proposition, the offer, the channels where these buyers actually gather, the message that lands, the proof they need before they trust it, and the path from stranger to customer.

You are given the product's grounded reality (from a read-only code scan — what it provably does, cited to file:line) and, when available, the founder's own stated inputs (their ICP, positioning, offer). Treat the founder's stated inputs as claims to VERIFY and enrich with outside evidence, not as settled fact.

EVIDENCE DISCIPLINE IS THE ENTIRE POINT. Never invent buyer behavior, customers, traction, or research findings. For every record:
- Do REAL research. Use WebSearch and WebFetch to find real, current sources — competitor pages, category reports, community/forum threads where these buyers actually talk, pricing pages, review sites. Read the product's own repo docs (Read/Glob/Grep) for what the founder already knows.
- Attach the real source (a URL, or a cited repo file:line for a founder-known fact) to each piece of evidence. A claim with a real source is "researched" (found externally) or "observed" (a directly seen fact, e.g. the founder's own price in their repo).
- If you reason a conclusion FROM other evidence without a direct source for the conclusion itself, mark it "inferred" and still cite what you reasoned from.
- If you genuinely cannot find a source, you MAY still record the record as a HYPOTHESIS — set solidity "speculative", leave evidence empty, and put the question that would settle it in openQuestions. NEVER dress a guess as a fact; NEVER fabricate a URL or a citation. The host demotes any record with no sourced evidence to speculative regardless of the label you claim, so a fake source only costs you credibility.

Cover the full picture (buyer, pain, job, trigger, workaround, valueProp, offer, channel, message, proof, conversionPath), and add any other kind that is real for this product. It is honest and expected that some records are solid (sourced) and others speculative (a flagged hypothesis) — label each truthfully. Prefer a few well-sourced records per kind over a long list of guesses.

Return ONLY a JSON array (the host stamps ids, timestamps, and recomputes effective solidity):
[
  {
    "kind": "buyer" | "pain" | "job" | "trigger" | "workaround" | "valueProp" | "offer" | "channel" | "message" | "proof" | "conversionPath" | "<any real kind>",
    "statement": "one plain-English sentence stating the fact or hypothesis",
    "evidence": [ { "claim": "what this source supports", "source": "https://... or repo/path.ts:line", "solidity": "observed" | "researched" | "inferred", "notes": "optional" } ],
    "solidity": "observed" | "researched" | "inferred" | "speculative",
    "confidence": 0.0-1.0,
    "source": "short origin label, e.g. 'web-research' or 'founder-repo'",
    "openQuestions": [ "what would raise this record's solidity" ]
  }
]
Return an empty array only if you truly found nothing to say.`;

// Honest blank default: with no generator runtime wired, return an empty set rather than fabricate.
// Refusing-rather-than-faking is the same discipline as the context providers' null return.
export const blankGenerate = async () => ({ ok: true, objects: [], meta: { blank: true } });

// Coerce whatever the agent returned into a clean candidate array: keep only objects that carry a
// kind AND a statement (the two fields the store requires), drop the rest so a malformed element
// becomes nothing rather than crashing the persist loop.
function toCandidates(parsed) {
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (o) => o && typeof o === "object" && String(o.kind ?? "").trim() && String(o.statement ?? "").trim(),
  );
}

// Live generator: researches the buyer side on the founder's subscription and returns the candidate
// records. Reached through an OPEN research step — WebSearch/WebFetch for outside truth plus
// Read/Glob/Grep for founder-known facts in the repo — never a hardwired connector. Parses a JSON
// ARRAY with parseAgentItems (mirroring the item-list agents), NOT the single-object path the
// product modeler uses. OAuth-first, read-only tools, no send path.
export function createClaudeMarketResearcher({ cwd = process.cwd(), model, maxTurns = 30, onText } = {}) {
  return async function generate({ grounding, founderInputs } = {}) {
    const contextBlock = [
      grounding
        ? `\nThe product's grounded reality (cited code facts — win event, attribution, stack, blind spots):\n${JSON.stringify(grounding, null, 2)}`
        : "",
      founderInputs
        ? `\nThe founder's own stated inputs (ICP / positioning / offer — VERIFY and enrich these, do not take them as settled):\n${JSON.stringify(founderInputs, null, 2)}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
    const prompt = `${MARKET_RESEARCH_PROMPT}${contextBlock}`;
    const { text, error } = await runClaudeQuery({
      prompt,
      cwd,
      model,
      maxTurns,
      onText,
      allowedTools: ["WebSearch", "WebFetch", "Read", "Glob", "Grep"],
    });
    if (error) {
      return {
        ok: false,
        objects: [],
        meta: { error: error.message, errorKind: error.kind, retriable: error.retriable },
      };
    }
    return { ok: true, objects: toCandidates(parseAgentItems(text)), meta: { parsed: true } };
  };
}

// ── Founder-typed inputs as an OVERRIDE layer ────────────────────────────────────────────────────
// Researched evidence is primary; the founder's own stated inputs ride alongside it as a labelled
// override layer (Phase 1 spec). This is pure code: it maps the founder's shared-context market side
// (icp / positioning / offer) into MarketObject-shaped records tagged source "founder-stated". A
// founder stating their own price is a directly-observed fact about their business; a founder
// stating who their buyer is is their hypothesis (inferred) until research confirms it — so each
// mapped field carries an honest default solidity, and the shared Evidence contract still governs.

function text(value) {
  const s = String(value ?? "").trim();
  return s || null;
}

// One founder-stated record. `source: "founder-stated"` IS a real source (the founder asserting a
// fact about their own business), so the Evidence contract honors the declared solidity rather than
// demoting to speculative — the founder is a legitimate source for their own offer and positioning.
function founderRecord(kind, statement, solidity, { projectId } = {}) {
  const stmt = text(statement);
  if (!stmt) return null;
  return {
    projectId: projectId ?? null,
    kind,
    statement: stmt,
    source: "founder-stated",
    solidity,
    evidence: [{ claim: stmt, source: "founder-stated", solidity }],
    openQuestions: solidity === "observed" ? [] : ["Does outside research confirm this founder assumption?"],
  };
}

export function founderOverrideObjects(founderInputs, { projectId } = {}) {
  if (!founderInputs || typeof founderInputs !== "object") return [];
  const out = [];
  const push = (rec) => {
    if (rec) out.push(rec);
  };

  // Who the founder thinks the buyer is — a hypothesis until research confirms it.
  const buyer = founderInputs.buyer ?? founderInputs.icp?.query ?? founderInputs.icp?.description;
  push(founderRecord("buyer", buyer, "inferred", { projectId }));

  // The now-trigger, if the founder stated one — their read of it, inferred.
  push(founderRecord("trigger", founderInputs.trigger ?? founderInputs.icp?.trigger, "inferred", { projectId }));

  // Channels the founder believes their buyers are in — inferred until confirmed against where the
  // buyers actually gather.
  const channels = Array.isArray(founderInputs.channels) ? founderInputs.channels : [];
  for (const ch of channels) push(founderRecord("channel", ch, "inferred", { projectId }));

  // Positioning — the founder's category/promise. Their framing, inferred. (The kind carries the
  // label, so the statement stays clean — no "Category:" prefix baked in, or the provider double-labels.)
  const pos = founderInputs.positioning ?? {};
  if (pos.category) push(founderRecord("valueProp", pos.category, "inferred", { projectId }));
  if (pos.promise) push(founderRecord("message", pos.promise, "inferred", { projectId }));
  if (pos.problem) push(founderRecord("pain", pos.problem, "inferred", { projectId }));

  // The offer — price/terms the founder has SET. This is observed reality of their own business.
  const offer = founderInputs.offer ?? {};
  const offerParts = [offer.price, offer.unit, offer.terms].map(text).filter(Boolean);
  if (offerParts.length) push(founderRecord("offer", offerParts.join(" · "), "observed", { projectId }));

  return out;
}

// ── The ritual: run market research and persist the set ──────────────────────────────────────────
// The founder invokes this like scanning the repo. Deterministic host code around the rented
// generator: call it, persist every researched candidate (primary) and every founder-stated
// override into the Phase 0 MarketObject store — where evidence discipline is enforced — and return
// the full persisted set. A candidate the store rejects (no kind/statement) is skipped, never faked.
export async function runMarketResearch({
  generator = blankGenerate,
  projectId = "default",
  grounding = null,
  founderInputs = null,
  options = {},
} = {}) {
  const { ok, objects: candidates = [], meta = {} } = await generator({ grounding, founderInputs, projectId });

  const persisted = [];
  let skipped = 0;
  const persist = (input) => {
    try {
      persisted.push(marketObjectStore.create({ ...input, projectId }, options));
    } catch {
      skipped += 1; // a candidate missing a required field is dropped, never invented into shape
    }
  };

  // Researched candidates are primary.
  for (const candidate of candidates) persist(candidate);
  // Founder-typed inputs are the override layer — persisted alongside, tagged founder-stated.
  for (const override of founderOverrideObjects(founderInputs, { projectId })) persist(override);

  return {
    ok: ok !== false,
    objects: persisted,
    meta: { ...meta, researched: candidates.length, overrides: persisted.length - candidates.length + skipped, skipped },
  };
}

// ── Shared-context market side: project stored MarketObjects into a run's market context ──────────
// The run-time `market` context object (read by createMarketProvider) is a PROJECTION over the
// stored MarketObjects, not a second hand-typed shape. Deterministic: group the objects by kind,
// let a founder-stated record override a researched one for the flat single-value fields (buyer,
// trigger, positioning, offer), and carry the full labelled list so the provider can render each
// record with its honest solidity. An empty set projects to null — an honest blank, not a stub.

function firstByKind(objects, kind, { preferFounder = true } = {}) {
  const matches = objects.filter((o) => o && o.kind === kind);
  if (!matches.length) return null;
  if (preferFounder) {
    const founder = matches.find((o) => o.source === "founder-stated");
    if (founder) return founder;
  }
  return matches[0];
}

export function buildMarketContext(objects = []) {
  const list = Array.isArray(objects) ? objects.filter((o) => o && o.kind && o.statement) : [];
  if (!list.length) return null;

  const buyer = firstByKind(list, "buyer");
  const trigger = firstByKind(list, "trigger");
  const offer = firstByKind(list, "offer");
  const valueProp = firstByKind(list, "valueProp");
  const message = firstByKind(list, "message");
  const channels = list.filter((o) => o.kind === "channel").map((o) => o.statement);

  return {
    // Flat single-value fields the legacy provider already renders (founder override wins).
    buyer: buyer ? buyer.statement : null,
    trigger: trigger ? trigger.statement : null,
    offer: offer ? offer.statement : null,
    positioning: {
      category: valueProp ? valueProp.statement : null,
      promise: message ? message.statement : null,
    },
    channels,
    // The full labelled record set — every object with its kind and honest solidity, so the provider
    // can show what is researched vs. a flagged hypothesis rather than flattening the distinction.
    objects: list.map((o) => ({
      kind: o.kind,
      statement: o.statement,
      solidity: o.solidity,
      confidence: o.confidence ?? null,
      source: o.source ?? null,
    })),
  };
}

// The founder's shared-context market side, extracted into the founderInputs shape this module
// consumes. Pure read: pulls the founder-typed ICP / positioning / offer off a project's
// sharedContext (project-store's emptySharedContext shape) so the research ritual and the override
// layer both start from what the founder already stated. Returns null when nothing is stated.
export function founderInputsFromSharedContext(sharedContext) {
  if (!sharedContext || typeof sharedContext !== "object") return null;
  const icp = sharedContext.icp ?? {};
  const positioning = sharedContext.positioning ?? {};
  const offer = sharedContext.offer ?? {};
  const inputs = {
    buyer: text(icp.query) || text(icp.description) || null,
    trigger: text(icp.trigger) || null,
    channels: Array.isArray(icp.keywords) ? icp.keywords.filter(Boolean) : [],
    positioning: {
      category: text(positioning.category),
      promise: text(positioning.promise),
      problem: text(positioning.problem),
    },
    offer: {
      price: text(offer.price),
      unit: text(offer.unit),
      terms: text(offer.terms),
    },
  };
  const hasAny =
    inputs.buyer ||
    inputs.trigger ||
    inputs.channels.length ||
    Object.values(inputs.positioning).some(Boolean) ||
    Object.values(inputs.offer).some(Boolean);
  return hasAny ? inputs : null;
}
