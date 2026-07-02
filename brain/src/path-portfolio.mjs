// The GTM path portfolio — the strategic-bet pillar (GTM-ENGINE-REBUILD §4, Phase 2).
//
// Phase 1 built the two truth sides: the product scan (what the product provably IS, cited to
// file:line, adapted into ProductTruth) and market research (who the buyer is and where they gather,
// adapted into MarketObject). This turns those two sides into a FOCUSED PORTFOLIO of GTM paths — a
// decidable set a founder could act on in a day (a soft default of ~6-10 STRONG, DISTINCT bets, not
// one and not a dump of twenty look-alikes) — each grounded in named evidence, each ranked, each
// carrying its own MeasurementContract so it is measurable before it ever runs. The bets are
// deliberately SPREAD across different go-to-market angles (audience, offer, pricing, channel,
// message, partnership, content, motion — an OPEN palette, never a closed enum) so the set opens up
// the real option field instead of clustering on one shape.
//
// The two halves obey invariant §2.4 (deterministic code for everything but judgment):
//   - GENERATION is fuzzy judgment, so it is rented, but LEAN: one generate call + a SEPARATE, single
//     grade call — both with no tools and a low turn budget, reasoning over the pre-packed grounding
//     handed in as data rather than re-reading the repo turn after turn. The generator never grades
//     its own bets. It is a prompt, NOT the sequential fleet of tool-using agents the cross-cutting
//     notes rip out — that fleet is what made a portfolio take minutes; this returns in well under one.
//   - RANKING is deterministic code, never a model guessing a number (§4 Phase 2 guard). The seven
//     signals are computed here, in plain functions, by RESOLVING each path's `restsOn` references
//     back to the stored ProductTruth / MarketObject records and reading their real solidity,
//     confidence, source, and the attached contract's completeness. The model supplies the bet and
//     what it rests on; code scores it.
//
// The path bet is OPEN fields (§2.2) — the canonical buyer→…→conversionPath facets are a hint to the
// generator, never a schema that rejects a value. The anti-cage tests guard this.

import { runClaudeQuery, parseAgentItems, parseAgentObject } from "./agent-bridge.mjs";
import { gtmPathStore, measurementContractStore, productTruthStore, marketObjectStore } from "./gtm-store.mjs";
import { SOLIDITY_LADDER, solidityRank } from "./evidence.mjs";
import { defaultDistinct } from "./ideation.mjs";

// Generation runs LEAN, exactly like ideation (GTM-ENGINE-REBUILD §6): the two truth sides are packed
// into the prompt as DATA (deterministic code fetched them), so the model reasons over what it was
// handed rather than reading the repo. No tools, a turn budget just big enough to emit one JSON reply.
const LEAN_TOOLS = [];
const LEAN_TURNS = 2;

// The soft default portfolio size — a decidable set a founder acts on in a day, NOT a quota. It is a
// HINT in the prompt and a configurable option (targetCount), never a hard cap that rejects a path.
export const DEFAULT_PORTFOLIO_TARGET = 8;

// The canonical bet facets — a HINT to the generator of the shape of a full GTM bet, never a closed
// enum. A path may fill any subset and add a facet nobody named; the store accepts open bet fields.
export const PATH_BET_FACET_HINTS = [
  "buyer",
  "pain",
  "trigger",
  "offer",
  "channel",
  "message",
  "proof",
  "conversionPath",
];

// The go-to-market angles a focused portfolio spreads across — an OPEN palette the generator draws
// from so the bets differ in KIND, not just wording. This is a hint the prompt hands the model, never
// a closed enum: the model may name an angle nobody listed, and each path is tagged with whatever
// angle it took as a free-text label. (§2.2 open shapes.)
export const GTM_ANGLE_PALETTE = [
  "audience",
  "offer",
  "pricing",
  "channel",
  "message",
  "partnership",
  "content",
  "motion",
];

// ── The deterministic ranking layer (§4 Phase 2 guard: code over stored data) ─────────────────────
// The seven signals from §3, each a plain function of the STORED records a path rests on. No model
// call, no guessed number: the generator says what the bet is and cites the records it rests on;
// this reads those records' real solidity / confidence / source and the contract's completeness.

// Strength of one solidity label on 0..1: observed=1, researched=.75, inferred=.5, speculative=.25,
// an unknown (open) label = 0. Derived from the shared Evidence ladder — the single source of order.
function strength(solidity) {
  const len = SOLIDITY_LADDER.length; // 4 canonical rungs
  const rank = solidityRank(solidity); // 0 (observed) .. len (unknown)
  return Math.max(0, (len - rank) / len);
}

function mean(nums) {
  const finite = nums.filter((n) => Number.isFinite(n));
  return finite.length ? finite.reduce((a, b) => a + b, 0) / finite.length : 0;
}

function clamp01(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

// Resolve a path's `restsOn` refs (each { type, id }) back to the real stored records. A ref's type
// is advisory — we match by id against BOTH the product-truth map and the market-object map, so a
// path grounds on whatever record carries that id regardless of how the type was labelled.
function resolveRests(restsOn, truthById, marketById) {
  const truths = [];
  const markets = [];
  for (const ref of Array.isArray(restsOn) ? restsOn : []) {
    const id = ref && typeof ref === "object" ? ref.id : ref;
    if (!id) continue;
    if (truthById.has(id)) truths.push(truthById.get(id));
    else if (marketById.has(id)) markets.push(marketById.get(id));
  }
  return { truths, markets };
}

// The weights that combine the seven signals into one composite rank. Code constants, tuned so the
// two hard-evidence signals (is this grounded / is the product ready) lead, and the softer proxies
// (upside / founder fit) trail — the ranking leans on what is provable over what is hoped.
export const SIGNAL_WEIGHTS = {
  evidenceStrength: 0.22,
  productReadiness: 0.15,
  channelReachability: 0.15,
  measurementReadiness: 0.13,
  speedToTest: 0.13,
  upside: 0.12,
  founderFit: 0.1,
};

// The market facets that stand for "how big is the prize" — used only to derive the upside proxy.
const PRIZE_FACETS = new Set(["buyer", "offer", "valueProp"]);

// Compute the seven ranking signals for one path from the records it rests on and its contract.
// Every signal is a number on 0..1 derived from stored data:
//   evidenceStrength    — mean solidity strength over ALL records the path rests on.
//   productReadiness    — mean solidity strength over the ProductTruths it rests on (does the
//                         product already, provably, do what the bet needs).
//   channelReachability — the best-grounded channel MarketObject it rests on (can we reach them).
//   measurementReadiness— how complete the attached MeasurementContract is (can we measure it).
//   speedToTest         — reachable + ready + few moving parts = fast; derived, not guessed.
//   upside              — mean stored confidence of the prize facets (buyer/offer/valueProp), with
//                         evidence strength as the fallback when confidence was never recorded.
//   founderFit          — fraction of the market records it rests on that the founder stated
//                         themselves (a bet aligned with the founder's own read fits their taste).
export function computeRankingSignals({ path, truthById, marketById, contract } = {}) {
  const { truths, markets } = resolveRests(path?.restsOn, truthById ?? new Map(), marketById ?? new Map());

  const evidenceStrength = mean([...truths, ...markets].map((r) => strength(r.solidity)));
  const productReadiness = mean(truths.map((r) => strength(r.solidity)));

  const channelStrengths = markets.filter((m) => m.kind === "channel").map((m) => strength(m.solidity));
  const channelReachability = channelStrengths.length ? Math.max(...channelStrengths) : 0;

  const measurementReadiness = contractCompleteness(contract);

  const betCount = path?.bet && typeof path.bet === "object" ? Object.keys(path.bet).length : 0;
  const complexity = Math.min(betCount, 8) / 8; // more moving parts → a bit slower to test
  const speedToTest = clamp01(((channelReachability + productReadiness) / 2) * (1 - 0.4 * complexity));

  const prize = markets.filter((m) => PRIZE_FACETS.has(m.kind));
  const confs = prize.map((m) => Number(m.confidence)).filter((n) => Number.isFinite(n));
  const upside = confs.length ? mean(confs) : mean(prize.map((m) => strength(m.solidity)));

  const founderFit = markets.length
    ? markets.filter((m) => m.source === "founder-stated").length / markets.length
    : 0;

  const signals = {
    evidenceStrength: clamp01(evidenceStrength),
    productReadiness: clamp01(productReadiness),
    channelReachability: clamp01(channelReachability),
    measurementReadiness: clamp01(measurementReadiness),
    speedToTest: clamp01(speedToTest),
    upside: clamp01(upside),
    founderFit: clamp01(founderFit),
  };
  signals.composite = compositeRank(signals);
  return signals;
}

// How complete a MeasurementContract is, on 0..1: each of the four essentials it needs to make a run
// measurable (what outcomes to watch, where they come from, the key results join on, what success is)
// contributes an equal quarter. A contract missing all four scores 0 — honestly unmeasurable.
export function contractCompleteness(contract) {
  if (!contract || typeof contract !== "object") return 0;
  let score = 0;
  if (Array.isArray(contract.outcomeKinds) && contract.outcomeKinds.length) score += 0.25;
  if (Array.isArray(contract.sources) && contract.sources.length) score += 0.25;
  if (String(contract.joinKey ?? "").trim()) score += 0.25;
  if (String(contract.successCriteria ?? "").trim()) score += 0.25;
  return score;
}

// The weighted composite of the seven signals — the single number the portfolio ranks on. Pure code.
export function compositeRank(signals = {}) {
  let total = 0;
  for (const [key, weight] of Object.entries(SIGNAL_WEIGHTS)) {
    total += weight * clamp01(Number(signals[key]));
  }
  return clamp01(total);
}

// ── The rented generation layer (a lean prompt: generate + a SEPARATE grade) ──────────────────────

// The grounding a path generator reasons over: the two truth sides, each carrying its record id so
// the generator can cite exactly which records a bet rests on (that citation is what the code ranking
// later resolves). Pure projection over the stored records — no model call.
export function buildPathGrounding(productTruths = [], marketObjects = []) {
  return {
    productTruths: (Array.isArray(productTruths) ? productTruths : [])
      .filter((t) => t && t.id && t.statement)
      .map((t) => ({ id: t.id, statement: t.statement, solidity: t.solidity ?? null })),
    marketObjects: (Array.isArray(marketObjects) ? marketObjects : [])
      .filter((m) => m && m.id && m.kind && m.statement)
      .map((m) => ({
        id: m.id,
        kind: m.kind,
        statement: m.statement,
        solidity: m.solidity ?? null,
        confidence: m.confidence ?? null,
        source: m.source ?? null,
      })),
  };
}

// The angle-derivation doctrine (reused from ideation): the sides a portfolio should spread across
// come from THIS product's real buyer picture — segments, channels, triggers — not a house list.
export const PROPOSE_PATH_ANGLES_PROMPT = `You are choosing the ANGLES a set of GTM-path generators will take on ONE product, so the resulting portfolio spreads across genuinely different strategic bets instead of clustering on one. Derive the angles from THIS product's real buyer picture (below): different buyer segments, different now-triggers, different channels where these buyers already gather, different offers or wedges. Do not reuse a generic list; name the real strategic sides this product has. 5 to 8 angles so the portfolio is wide.

Return ONLY JSON: { "angles": [ { "angle": "short-name", "lens": "one sentence telling a generator which strategic side of this product to bet on" } ] }`;

// The generation doctrine. Each path is a full strategic bet, resting on named evidence (the record
// ids from the grounding), with its own measurement plan. TERSE by construction — a founder reads
// these fast, so a bet is one punchy line and its chain is short phrases, never paragraphs. The
// portfolio is FOCUSED and DIVERSE: a handful of strong bets deliberately spread across DIFFERENT
// go-to-market angles, never a pile of same-shaped variations.
export const GENERATE_PATHS_PROMPT = `You are a go-to-market strategist generating a FOCUSED, DECIDABLE portfolio of GTM PATHS for a real product — the kind of set a founder could pick from and act on in a single day. A GTM path is a complete strategic BET: which buyer, feeling which pain, at which trigger, offered what, reached through which channel, with which message, backed by which proof, along which conversion path. You GENERATE bets; you do NOT rank them — deterministic code scores them from the evidence each rests on.

Two hard rules on the SET:
1. FOCUSED, not a dump. Produce a small number of STRONG, distinct bets, not twenty look-alikes. Aim for a soft target of {TARGET} — more if you genuinely have that many distinct strong bets, fewer if you don't. Never pad to hit a number.
2. SPREAD across go-to-market angles. The bets must differ in KIND, not just wording. Draw each from a DIFFERENT angle — an open palette to reach into: audience (who you go after), offer (what you package), pricing (how you charge), channel (where you reach them), message (how you position), partnership (who you go through), content (what you publish), motion (how the sale moves). Use whichever fit, and name an angle not on this list if the product has one. Two bets on the same angle with a swapped word is a failure.

You are given the product's grounded truth (cited code facts) and its buyer picture (researched market objects), each record carrying an id. Every path MUST rest on named evidence: list the ids of the ProductTruth and MarketObject records the bet stands on in "restsOn" — a bet that rests on nothing cannot be ranked. Never invent traction, numbers, customers, or a record id that was not given to you.

Keep every field TIGHT. No paragraphs, no preamble, no restating the buyer picture back.

For each path return:
- "summary": ONE punchy line naming the bet — under ~15 words. Not a paragraph, not two sentences.
- "angle": one or two words for the go-to-market angle this bet takes (e.g. "audience", "pricing", "partnership", or your own).
- "bet": an object with any of these open facets that apply — buyer, pain, trigger, offer, channel, message, proof, conversionPath — plus any other facet real for this bet. Each value a SHORT phrase (a few words), never a sentence.
- "restsOn": array of the record ids (from the grounding) this bet stands on.
- "risk": the single strongest reason this bet might not pay — one short clause.
- "confidence": 0.0-1.0, your honest read of the bet.
- "measurementContract": how this bet would be measured BEFORE it runs — { "outcomeKinds": ["reply"|"meeting"|"signup"|"activation"|"purchase"|"retention"|"manual"|"<any real outcome>"], "sources": ["connected-account"|"product-event"|"founder-entered"|"<any>"], "joinKey": "what ties a result back to what was sent", "successCriteria": "what counts as this bet working — one short line" }.

Return ONLY JSON: { "paths": [ { "summary": "...", "angle": "...", "bet": {...}, "restsOn": [...], "risk": "...", "confidence": 0.0, "measurementContract": {...} } ] }`;

// The grade doctrine — a SEPARATE critic (never the generator), run ONCE over the whole batch (a
// single lean call, not one per path — that per-path fleet is what made grading slow). It does not
// re-rank (code does that); for each bet it judges COHERENCE and names its single weakest link, so
// the portfolio can flag a shaky bet honestly rather than presenting every generated bet as sound.
export const GRADE_PATH_PROMPT = `You are a SEPARATE critic reviewing an already-generated set of GTM paths (you did not write them). You do NOT score or rank them — deterministic code does that from their evidence. Your ONE job, per path: judge whether the bet is COHERENT (do the buyer, pain, trigger, offer, channel, message actually hang together into a real strategy?) and name its single weakest link in a few plain words.

The paths are given as a numbered list. Return a verdict for EVERY path, in the same order, each carrying the path's "index".

Return ONLY JSON: { "verdicts": [ { "index": 0, "coherent": true|false, "weakestLink": "a few plain words naming the shakiest part, or null if it is sound" } ] }`;

// Live angle proposer — derives the portfolio's strategic angles on the founder's subscription. Lean:
// no tools, low turn budget; it reasons over the handed-in grounding, it does not go research. Kept
// injectable for callers that want an explicit angle fan-out; the default live run skips it and lets
// ONE lean generate call spread across the palette itself, so a portfolio is two calls, not a fleet.
export function createClaudePathAngleProposer({ cwd = process.cwd(), model, maxTurns = LEAN_TURNS, onText } = {}) {
  return async function proposeAngles({ grounding } = {}) {
    const prompt = `${PROPOSE_PATH_ANGLES_PROMPT}\n\nThe product's buyer picture and grounded truth:\n${JSON.stringify(grounding ?? {}, null, 2)}`;
    const { text, error } = await runClaudeQuery({ prompt, cwd, model, maxTurns, onText, allowedTools: LEAN_TOOLS });
    if (error) return { angles: [] };
    const parsed = parseAgentObject(text);
    return { angles: Array.isArray(parsed?.angles) ? parsed.angles : [] };
  };
}

// Live path generator — returns { paths: [...] }. LEAN: no tools, low turn budget. With no angle
// assigned (the default), ONE call produces the whole focused set, spreading across the GTM-angle
// palette and self-tagging each path — no per-angle fleet. When a caller DOES assign an angle, it
// bets only on that side. Either way it composes from the handed-in grounding, never re-reads the repo.
export function createClaudePathGenerator({ cwd = process.cwd(), model, maxTurns = LEAN_TURNS, targetCount = DEFAULT_PORTFOLIO_TARGET, onText } = {}) {
  const basePrompt = GENERATE_PATHS_PROMPT.replace("{TARGET}", `about ${targetCount}`);
  return async function generate({ grounding, angle, lens } = {}) {
    const prompt = [
      basePrompt,
      angle
        ? `\nBet ONLY on this angle: ${angle}${lens ? ` — ${lens}` : ""}. Another pass covers the others, so give a couple of strong distinct bets on THIS side.`
        : `\nNo angle was assigned: produce the whole focused set yourself, spreading the bets across genuinely different go-to-market angles from the palette above.`,
      `\nThe product's grounded truth and buyer picture (cite these ids in restsOn):\n${JSON.stringify(grounding ?? {}, null, 2)}`,
    ]
      .filter(Boolean)
      .join("\n");
    const { text, error } = await runClaudeQuery({ prompt, cwd, model, maxTurns, onText, allowedTools: LEAN_TOOLS });
    if (error) return { paths: [] };
    const items = parseAgentItems(text);
    return { paths: Array.isArray(items) ? items : [] };
  };
}

// Live path grader — the SEPARATE critic, run ONCE over the whole batch. Lean, no tools. Returns
// { verdicts: [...] } aligned to the paths it was handed (by index), each a coherence read + weakest
// link. One call for the set, never one call per path.
export function createClaudePathGrader({ cwd = process.cwd(), model, maxTurns = LEAN_TURNS, onText } = {}) {
  return async function grade({ paths = [], grounding } = {}) {
    if (!Array.isArray(paths) || !paths.length) return { verdicts: [] };
    const list = paths.map((p, i) => ({ index: i, summary: p?.summary, bet: p?.bet, risk: p?.risk }));
    const prompt = [
      GRADE_PATH_PROMPT,
      `\nThe paths to review (grade every one, in order):\n${JSON.stringify(list, null, 2)}`,
      grounding ? `\nThe product context:\n${JSON.stringify(grounding, null, 2)}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    const { text, error } = await runClaudeQuery({ prompt, cwd, model, maxTurns, onText, allowedTools: LEAN_TOOLS });
    if (error) return { verdicts: [], graderAvailable: false };
    const parsed = parseAgentObject(text) ?? {};
    const raw = Array.isArray(parsed?.verdicts) ? parsed.verdicts : [];
    return { verdicts: raw, graderAvailable: true };
  };
}

// Honest blank defaults: with nothing wired, generate no paths and grade nothing rather than fake.
export const blankGeneratePaths = async () => ({ paths: [] });
export const blankGradePath = async () => ({ verdicts: [], graderAvailable: false });

// Normalize the angle list into an open [{ angle, lens }] shape — shape validated, vocabulary free.
function normalizeAngles(raw) {
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.angles) ? raw.angles : [];
  const out = [];
  for (const entry of list) {
    if (typeof entry === "string" && entry.trim()) {
      out.push({ angle: entry.trim(), lens: null });
      continue;
    }
    const angle = String(entry?.angle ?? "").trim();
    if (!angle) continue;
    out.push({ angle, lens: String(entry?.lens ?? "").trim() || null });
  }
  return out;
}

// Coerce one raw generated path into a clean candidate, or null. A path needs at least a summary; a
// bet, restsOn, a measurement-contract proposal, and the self-reported angle are carried through as
// given (open shapes — the angle is a free-text label, never validated against the palette).
function normalizeCandidate(raw) {
  if (!raw || typeof raw !== "object") return null;
  const summary = String(raw.summary ?? "").trim();
  if (!summary) return null;
  return {
    summary,
    angle: String(raw.angle ?? "").trim() || null,
    bet: raw.bet && typeof raw.bet === "object" ? raw.bet : {},
    restsOn: Array.isArray(raw.restsOn) ? raw.restsOn : [],
    risk: String(raw.risk ?? "").trim() || null,
    confidence: raw.confidence,
    measurementContract:
      raw.measurementContract && typeof raw.measurementContract === "object" ? raw.measurementContract : {},
  };
}

// Generate the portfolio: one unconstrained pass by default (the generator spreads across the palette
// and self-tags each path), or a fan-out over explicit angles when a caller assigned them. Each path
// is tagged with its angle — the lane's when one was assigned, else the path's own self-reported one.
async function generateWide({ generate, grounding, angles }) {
  const lanes = angles.length ? angles : [{ angle: null, lens: null }];
  const paths = [];
  for (const lane of lanes) {
    const out = await generate({ grounding, angle: lane.angle, lens: lane.lens });
    for (const raw of out?.paths ?? []) {
      const candidate = normalizeCandidate(raw);
      if (candidate) paths.push({ ...candidate, angle: lane.angle ?? candidate.angle ?? null });
    }
  }
  return paths;
}

// composePathPortfolio — the full Phase 2 run. Reads the two truth sides for a project (or takes them
// injected), builds grounding, derives the strategic angles, generates paths wide across them,
// measures distinctiveness (regenerating once if the batch huddles), grades each with a SEPARATE
// critic, then — for every candidate — persists its MeasurementContract, computes the seven ranking
// signals in CODE from the records it rests on plus that contract, persists the GTMPath, and returns
// the portfolio sorted by composite rank (strongest first).
//
// The generator and grader are different functions by construction: passing the same function for
// both is rejected loudly, exactly as ideation refuses a generator that grades its own output.
export async function composePathPortfolio({
  projectId = "default",
  productTruths = null,
  marketObjects = null,
  generate = blankGeneratePaths,
  grade = blankGradePath,
  proposeAngles = null,
  angles = null,
  distinct = defaultDistinct,
  maxRegen = 1,
  options = {},
} = {}) {
  if (typeof generate !== "function" || typeof grade !== "function") {
    throw new Error("composePathPortfolio needs a generate function and a grade function.");
  }
  if (generate === grade) {
    throw new Error("The path generator must not grade its own bets — the grader must be a separate critic.");
  }

  // The two truth sides: injected (tests) or read from the Phase 0 stores for this project.
  const truths = Array.isArray(productTruths)
    ? productTruths
    : productTruthStore.list({ ...options, projectId });
  const markets = Array.isArray(marketObjects)
    ? marketObjects
    : marketObjectStore.list({ ...options, projectId });

  const grounding = buildPathGrounding(truths, markets);
  const truthById = new Map(truths.filter((t) => t && t.id).map((t) => [t.id, t]));
  const marketById = new Map(markets.filter((m) => m && m.id).map((m) => [m.id, m]));

  // 0. The strategic angles: injected, derived by the proposer, or one unconstrained pass.
  let lanes = normalizeAngles(angles);
  if (!lanes.length && typeof proposeAngles === "function") {
    lanes = normalizeAngles(await proposeAngles({ grounding }));
  }

  // 1 + 2. Generate wide, measure distinctiveness, regenerate while HUDDLED (up to maxRegen).
  let candidates = await generateWide({ generate, grounding, angles: lanes });
  let distinctiveness = distinct(candidates.map((c) => c.summary));
  let regenerated = false;
  let regenCount = 0;
  while (distinctiveness.huddled && regenCount < maxRegen) {
    candidates = await generateWide({ generate, grounding, angles: lanes });
    distinctiveness = distinct(candidates.map((c) => c.summary));
    regenerated = true;
    regenCount += 1;
  }

  // 3. Grade the whole batch in ONE separate call (coherence + weakest link per path), then persist +
  //    rank each candidate. The grade is SEPARATE from generation (never the same function); the rank
  //    is deterministic code over the stored records the bet rests on plus its own contract. Verdicts
  //    come back aligned to the candidate order (by index) — a missing one defaults to sound.
  const gradeResult = await grade({ paths: candidates, grounding });
  const verdicts = Array.isArray(gradeResult?.verdicts) ? gradeResult.verdicts : [];
  const verdictAt = (i) => {
    const byIndex = verdicts.find((v) => Number(v?.index) === i);
    return byIndex ?? verdicts[i] ?? null;
  };

  // Regenerate REPLACES the portfolio: clear the project's prior paths so the map shows this focused
  // batch, not an accumulation of stale runs.
  for (const stale of gtmPathStore.list({ ...options, projectId })) {
    gtmPathStore.delete(stale.id, options);
  }

  const portfolio = [];
  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    const verdict = verdictAt(i);

    // Every path carries its OWN measurement contract, set before it could ever run (§4 Phase 2).
    const mcProposal = candidate.measurementContract ?? {};
    const path = gtmPathStore.create(
      {
        projectId,
        summary: candidate.summary,
        angle: candidate.angle,
        bet: candidate.bet,
        restsOn: candidate.restsOn,
        risk: candidate.risk,
        confidence: candidate.confidence,
        status: "proposed",
      },
      options,
    );
    const contract = measurementContractStore.create(
      {
        projectId,
        pathId: path.id,
        outcomeKinds: mcProposal.outcomeKinds,
        sources: mcProposal.sources,
        joinKey: mcProposal.joinKey,
        successCriteria: mcProposal.successCriteria,
        notes: mcProposal.notes,
      },
      options,
    );

    // Ranking runs AFTER the contract exists so measurementReadiness reads the real contract.
    const rankingSignals = computeRankingSignals({ path, truthById, marketById, contract });
    const ranked = gtmPathStore.save(
      { ...path, measurementContractId: contract.id, rankingSignals },
      options,
    );

    portfolio.push({
      path: ranked,
      contract,
      angle: candidate.angle,
      rankingSignals,
      coherent: verdict?.coherent !== false,
      weakestLink: verdict?.weakestLink ?? null,
    });
  }

  // 4. Sort strongest first by the code-computed composite rank.
  portfolio.sort((a, b) => (b.rankingSignals.composite ?? 0) - (a.rankingSignals.composite ?? 0));

  return {
    projectId,
    angles: lanes,
    portfolio,
    paths: portfolio.map((p) => p.path),
    distinctiveness,
    regenerated,
    regenCount,
    meta: {
      generated: candidates.length,
      truths: truths.length,
      markets: markets.length,
    },
  };
}
