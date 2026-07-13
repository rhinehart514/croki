// The GTM path ranking layer — deterministic scoring of strategic bets.
//
// A GTM path is a strategic bet grounded in named evidence: it rests on stored ProductTruth and
// MarketObject records, and carries a MeasurementContract so it is measurable. This module is the
// RANKING half — deterministic code, never a model guessing a number: the seven signals are computed
// in plain functions by resolving each path's `restsOn` references back to the stored records and
// reading their real solidity, confidence, and source, plus the attached contract's completeness.
//
// (The portfolio-composition entrypoint that once generated and graded whole path sets was removed —
// that machinery was a cage the founder gate never needed. What survives here is the scoring the live
// graph-intelligence layer reuses: contractCompleteness and compositeRank.)

import { SOLIDITY_LADDER, solidityRank } from "./evidence.mjs";
import { DEFAULT_SIGNAL_WEIGHTS } from "./signal-weights-store.mjs";

// ── The deterministic ranking layer (§4 Phase 2 guard: code over stored data) ─────────────────────
// The seven signals from §3, each a plain function of the STORED records a path rests on. No model
// call, no guessed number: the generator says what the bet is and cites the records it rests on;
// this reads those records' real solidity / confidence / source and the contract's completeness.

// Strength of one solidity label on 0..1: observed=1, researched=.75, inferred=.5, speculative=.25,
// an unknown (open) label = 0. Derived from the shared Evidence ladder — the single source of order.
export function rankingStrength(solidity) {
  const len = SOLIDITY_LADDER.length; // 4 canonical rungs
  const rank = solidityRank(solidity); // 0 (observed) .. len (unknown)
  return Math.max(0, (len - rank) / len);
}

export function mean(nums) {
  const finite = nums.filter((n) => Number.isFinite(n));
  return finite.length ? finite.reduce((a, b) => a + b, 0) / finite.length : 0;
}

export function clamp01(value) {
  const n = Number(value);
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

// The weights that combine the seven signals into one composite rank. The VALUES are now a
// founder-tunable table (signal-weights-store) rather than a frozen constant — HOW the signals trade
// off is a strategic judgment that belongs to the taste layer, while the weighted-sum ARITHMETIC
// (compositeRank) stays deterministic code. This export is the seed-default table (the exact numbers
// ranking has always used): the two hard-evidence signals lead and the softer proxies trail, so out
// of the box behavior is identical. A gate promote / keep / kill can later persist a tuned table.
export const SIGNAL_WEIGHTS = DEFAULT_SIGNAL_WEIGHTS;

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
export function computeRankingSignals({ path, truthById, marketById, contract, weights } = {}) {
  const { truths, markets } = resolveRests(path?.restsOn, truthById ?? new Map(), marketById ?? new Map());

  const evidenceStrength = mean([...truths, ...markets].map((r) => rankingStrength(r.solidity)));
  const productReadiness = mean(truths.map((r) => rankingStrength(r.solidity)));

  const channelStrengths = markets.filter((m) => m.kind === "channel").map((m) => rankingStrength(m.solidity));
  const channelReachability = channelStrengths.length ? Math.max(...channelStrengths) : 0;

  const measurementReadiness = contractCompleteness(contract);

  const betCount = path?.bet && typeof path.bet === "object" ? Object.keys(path.bet).length : 0;
  const complexity = Math.min(betCount, 8) / 8; // more moving parts → a bit slower to test
  const prize = markets.filter((m) => PRIZE_FACETS.has(m.kind));
  const confs = prize.map((m) => Number(m.confidence)).filter((n) => Number.isFinite(n));
  const upside = confs.length ? mean(confs) : mean(prize.map((m) => rankingStrength(m.solidity)));

  const founderFit = markets.length
    ? markets.filter((m) => m.source === "founder-stated").length / markets.length
    : 0;

  return composeRankingSignals({
    evidenceStrength, productReadiness, channelReachability, measurementReadiness,
    complexity, upside, founderFit,
  }, weights);
}

export function composeRankingSignals(input = {}, weights) {
  const signals = {
    evidenceStrength: clamp01(input.evidenceStrength),
    productReadiness: clamp01(input.productReadiness),
    channelReachability: clamp01(input.channelReachability),
    measurementReadiness: clamp01(input.measurementReadiness),
    speedToTest: clamp01(((input.channelReachability + input.productReadiness) / 2) * (1 - 0.4 * input.complexity)),
    upside: clamp01(input.upside),
    founderFit: clamp01(input.founderFit),
  };
  signals.composite = compositeRank(signals, weights);
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

// The weighted composite of the seven signals — the single number the portfolio ranks on. Pure code:
// the arithmetic is deterministic and stays here; only the weight VALUES are injectable (defaulting
// to the seed table) so a founder-tuned table can shift the ranking without touching this math.
export function compositeRank(signals = {}, weights = SIGNAL_WEIGHTS) {
  let total = 0;
  for (const [key, weight] of Object.entries(weights ?? SIGNAL_WEIGHTS)) {
    total += Number(weight) * clamp01(Number(signals[key]));
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
