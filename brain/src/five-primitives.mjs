// The five-primitive projection — the founder-facing cockpit, derived READ-ONLY from the existing
// engine.
//
// The founder manages exactly five things (docs/harness/product-shape.md): Goal, Bet, Move, Run,
// Learning. Everything richer the engine holds — MarketObjects, GTMPaths, MeasurementContracts,
// Results, solidity ladders — stays internal and is TRANSLATED here into that plain vocabulary. This
// module never writes, never runs anything, never gates: it folds real stored state into the shape
// the cockpit renders.
//
// Honesty discipline (same rule board.mjs holds): a part with no real signal reports null or an empty
// list, never a fabricated number. bestMove returns null when there is not enough signal to propose a
// concrete next action rather than inventing one. Every count comes from a real stored record.
//
// The translation table it applies:
//   GTMPath                     → Bet
//   MarketObject evidence       → how sure we are (solidity: guessed / researched / observed / gated)
//   Result / run gate items     → What happened (latestRun)
//   Learning + taste memory     → Learning
//   the gtm-engineer-mind rules → the single Best Next Move + upgrades
//
// bestMove and the upgrades are a LIGHTWEIGHT, deterministic reading of the state through the
// gtm-engineer-mind principles (start from the money, sharpen the offer before the channel, act on
// signals, prefer loops). It is rule-based on purpose — the rich version is Claude composing a run;
// this is the always-available cockpit read that never fabricates.

import { loadProject, loadProjectRuns } from "./project-store.mjs";
import { getActiveSessionForProject, listOperatorSessions } from "./operator-store.mjs";
import { gtmPathStore, marketObjectStore, resultStore, learningStore } from "./gtm-store.mjs";
import { extractDecisions, buildDraftMemory } from "./memory.mjs";
import { solidityRank } from "./evidence.mjs";

// ── Solidity translation ─────────────────────────────────────────────────────────────────────────
// The internal ladder is observed > researched > inferred > speculative (evidence.mjs). The founder
// sees four words: gated (survived the founder gate), observed, researched, guessed (anything softer).
// A GTMPath the founder has taken through the gate reads "gated" — the strongest, because a human
// stood behind it — regardless of the underlying evidence label.
const GATED_STATUSES = new Set(["promoted", "won", "live", "gated", "validated"]);

function founderSolidity(internalSolidity, { gated = false } = {}) {
  if (gated) return "gated";
  const label = String(internalSolidity ?? "").trim().toLowerCase();
  if (label === "observed") return "observed";
  if (label === "researched") return "researched";
  return "guessed";
}

// How sure the founder should feel, in three words the cockpit renders as a chip.
function sureFromSolidity(founder) {
  if (founder === "gated" || founder === "observed") return "high";
  if (founder === "researched") return "medium";
  return "low";
}

function howSure(sure) {
  if (sure === "high") return "well-grounded";
  if (sure === "medium") return "researched";
  return "still a guess";
}

const SURE_RANK = { high: 0, medium: 1, low: 2 };

// ── Bets (GTMPath → Bet) ─────────────────────────────────────────────────────────────────────────
// The strongest solidity among the market objects a path rests on sets the path's solidity — a bet is
// only as sure as the evidence under it. A path with no sourced ground reads "guessed".
function pathSolidity(path, marketById) {
  const refs = Array.isArray(path.restsOn) ? path.restsOn : [];
  let strongest = null;
  for (const ref of refs) {
    const object = ref && ref.id ? marketById.get(ref.id) : null;
    const solidity = object?.solidity;
    if (!solidity) continue;
    if (strongest === null || solidityRank(solidity) < solidityRank(strongest)) strongest = solidity;
  }
  return strongest;
}

// The plain-words ground a bet rests on — who, when, and the offer, in the founder's register. Null
// when the path carries none of it, so the cockpit shows no empty line.
function betBasis(path) {
  const bet = path.bet && typeof path.bet === "object" ? path.bet : {};
  const parts = [];
  if (bet.buyer) parts.push(String(bet.buyer).trim());
  if (bet.trigger) parts.push(`showing ${String(bet.trigger).trim()}`);
  if (bet.offer) parts.push(`offered ${String(bet.offer).trim()}`);
  const joined = parts.filter(Boolean).join(" · ");
  if (joined) return joined;
  const angle = String(path.angle ?? "").trim();
  if (angle) return angle;
  const restsOn = Array.isArray(path.restsOn) ? path.restsOn.length : 0;
  return restsOn ? `Rests on ${restsOn} researched ${restsOn === 1 ? "fact" : "facts"}` : null;
}

function deriveBets(projectId, options) {
  const paths = gtmPathStore.list({ ...options, projectId });
  const market = marketObjectStore.list({ ...options, projectId });
  const marketById = new Map(market.map((object) => [object.id, object]));
  const bets = paths.map((path) => {
    const gated = GATED_STATUSES.has(String(path.status ?? "").trim().toLowerCase());
    const solidity = founderSolidity(pathSolidity(path, marketById), { gated });
    const sure = sureFromSolidity(solidity);
    return {
      statement: path.summary,
      solidity,
      sure,
      basis: betBasis(path),
      // Kept internal for ordering only; not part of the founder shape.
      _confidence: Number.isFinite(Number(path.confidence)) ? Number(path.confidence) : 0,
    };
  });
  bets.sort((a, b) => (SURE_RANK[a.sure] - SURE_RANK[b.sure]) || (b._confidence - a._confidence));
  return bets.map(({ _confidence, ...bet }) => bet);
}

// ── Goal ─────────────────────────────────────────────────────────────────────────────────────────
// The founder's current "what are you trying to make happen" — read off the live operator goal
// session, falling back to the most recent session that carried a goal. metric / target / timeframe
// are not separately stored, so they stay null (honest) rather than being parsed out of the sentence.
function deriveGoal(projectId, options) {
  let goalText = "";
  try {
    const session = getActiveSessionForProject(projectId, { ...options, kind: "goal" });
    goalText = String(session?.goal ?? "").trim();
  } catch {
    goalText = "";
  }
  if (!goalText) {
    const sessions = listOperatorSessions({ ...options, projectId });
    const withGoal = sessions.find((session) => String(session.goal ?? "").trim());
    goalText = String(withGoal?.goal ?? "").trim();
  }
  if (!goalText) return null;
  return { text: goalText, metric: null, target: null, timeframe: null };
}

// ── Latest run (run gate items + joined Results → What happened) ────────────────────────────────────
const REPLY_KINDS = new Set(["reply", "replies", "response", "responded", "answered"]);
const CALL_KINDS = new Set(["meeting", "meetings", "call", "calls", "booked", "demo", "demos"]);
const PAID_KINDS = new Set(["purchase", "paid", "payment", "deal", "pilot", "won", "deposit"]);

function bucketOutcomes(results) {
  let replies = null;
  let calls = null;
  let paid = null;
  for (const result of results) {
    const kind = String(result.outcomeKind ?? "").trim().toLowerCase();
    const value = Number(result.value);
    const step = Number.isFinite(value) && value > 0 ? value : 1;
    if (REPLY_KINDS.has(kind)) replies = (replies ?? 0) + step;
    else if (CALL_KINDS.has(kind)) calls = (calls ?? 0) + step;
    else if (PAID_KINDS.has(kind)) paid = (paid ?? 0) + step;
  }
  // Revenue is not tracked as a distinct dollar amount at this layer, so it stays honestly null rather
  // than reusing a count as if it were money.
  return { replies, calls, paid, revenue: null };
}

function latestRunNote({ sent, replies, calls, paid }) {
  const parts = [];
  if (sent != null) parts.push(`${sent} approved to go out`);
  if (replies != null) parts.push(`${replies} replied`);
  if (calls != null) parts.push(`${calls} booked a call`);
  if (paid != null) parts.push(`${paid} paid`);
  if (!parts.length) return null;
  return `${parts.join(", ")}.`;
}

function deriveLatestRun(projectId, options) {
  const runs = loadProjectRuns(projectId, options);
  if (!runs.length) return null;
  const newest = [...runs].sort((a, b) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? ""))).at(-1);
  const nodes = newest?.result?.nodes ?? {};
  let approved = 0;
  let executed = 0;
  const joinKeys = new Set();
  for (const node of Object.values(nodes)) {
    const items = Array.isArray(node?.items) ? node.items : [];
    if (node?.category === "gate") {
      for (const item of items) {
        if (item?.approvalStatus === "approved") approved += 1;
        if (item?.joinKey) joinKeys.add(item.joinKey);
      }
    } else if (node?.category === "execute") {
      executed += items.length;
      for (const item of items) if (item?.joinKey) joinKeys.add(item.joinKey);
    }
  }
  // What actually went out: items that moved through an execute step, else what the founder approved.
  const sent = executed > 0 ? executed : (approved > 0 ? approved : null);
  // Outcomes that join back to THIS run's items — never the whole project's outcomes attributed to one
  // run. Nothing joined ⇒ every outcome bucket stays null (honestly unmeasured).
  const results = resultStore.list({ ...options, projectId }).filter((result) => result.joinKey && joinKeys.has(result.joinKey));
  const buckets = bucketOutcomes(results);
  return {
    sent,
    replies: buckets.replies,
    calls: buckets.calls,
    paid: buckets.paid,
    revenue: buckets.revenue,
    note: latestRunNote({ sent, ...buckets }),
  };
}

// ── Learnings (Result learnings + taste memory → Learning) ─────────────────────────────────────────
function deriveLearnings(projectId, options) {
  const out = [];
  const learnings = learningStore.list({ ...options, projectId });
  for (const learning of learnings) {
    const message = String(learning.identifying?.message ?? "").trim();
    const kind = String(learning.structural?.result?.outcomeKind ?? "").trim();
    const statement = message || (kind ? `A run drew ${kind}` : "");
    if (!statement) continue;
    const joined = Boolean(learning.structural?.result?.joined);
    out.push({ statement, sure: joined ? "high" : "medium", action: null });
    if (out.length >= 6) break;
  }
  // What the founder's gate has taught — the taste memory over every run's approve / reject / edit.
  const decisions = extractDecisions(loadProjectRuns(projectId, options));
  const memory = buildDraftMemory(decisions);
  if (memory) {
    const acts = [
      decisions.approved.length ? `approved ${decisions.approved.length}` : "",
      decisions.rejected.length ? `rejected ${decisions.rejected.length}` : "",
      decisions.edits.length ? `edited ${decisions.edits.length}` : "",
    ].filter(Boolean);
    if (acts.length) {
      const decided = decisions.approved.length + decisions.rejected.length;
      out.push({
        statement: `Your gate is teaching a voice — you ${acts.join(", ")}.`,
        sure: decided >= 3 ? "medium" : "low",
        action: "Reuse the approved voice on the next batch.",
      });
    }
  }
  return out;
}

// ── Best Next Move + upgrades (the gtm-engineer-mind read over the state) ───────────────────────────
function deriveBestMove({ goal, bets }) {
  // Not enough signal to name a concrete next action — honest null, never a filler card.
  if (!goal && (!bets || !bets.length)) return null;

  const strongest = bets && bets.length ? bets[0] : null;
  if (strongest) {
    return {
      headline: `Take your strongest bet to real buyers: ${strongest.statement}`,
      why: `It is your best-grounded bet (${howSure(strongest.sure)}). Start from the money — put the offer in front of people already showing the reason to buy, not more activity.`,
      doToday: strongest.basis
        ? `Make the offer to a handful of ${strongest.basis} today and ask for the paid step.`
        : `Put this offer in front of 10–20 real buyers today and ask for the paid step.`,
      winIf: "Someone takes the paid step — a booked call with budget, a deposit, or a pilot.",
      killIf: "You reach 20 of the right buyers and none engage — the bet is wrong, not the channel.",
      upgrade: "If it lands, turn this one move into a repeatable weekly motion.",
    };
  }

  // A goal but no bet yet: the first move is to name the money and find the signal, not to draft outreach.
  return {
    headline: `Name the paid win and who is showing the trigger for: ${goal.text}`,
    why: "You have a goal but no bet yet. Before any outreach, name the single paid event that counts and find the people showing a live reason to buy now.",
    doToday: "Write down the one paid outcome that means success, then list 10 people showing that reason this week.",
    winIf: "You can name the paid event and 10 real people who fit it.",
    killIf: "You cannot find anyone showing the trigger — the segment is wrong, so pick another.",
    upgrade: "Turn that list into your first bet and make the offer.",
  };
}

function deriveUpgrades({ goal, bets, latestRun }, sharedContext) {
  const upgrades = [];
  const offer = sharedContext?.offer ?? {};
  const offerStated = [offer.price, offer.unit, offer.terms].some((value) => String(value ?? "").trim());
  if (!offerStated) upgrades.push("Sharpen your offer into a one-line promise before you scale reach.");
  if (bets && bets.length && bets.every((bet) => bet.solidity === "guessed")) {
    upgrades.push("Turn a guessed bet into a researched one — find one real fact that proves it.");
  }
  if (latestRun && latestRun.sent != null && latestRun.replies == null && latestRun.calls == null && latestRun.paid == null) {
    upgrades.push("Record what came back from your last send so the next move learns from it.");
  }
  if (!goal) upgrades.push("State what you are trying to make happen so every move points at it.");
  return upgrades.slice(0, 3);
}

// ── The cockpit ────────────────────────────────────────────────────────────────────────────────────
// One read that returns the whole five-primitive projection for a project. Pure over stored state;
// safe to call as often as the cockpit re-renders. Tests inject an isolated store via `options.root`.
export function deriveCockpitState(projectId = "default", options = {}) {
  const project = loadProject({ ...options, projectId });
  const goal = deriveGoal(projectId, options);
  const bets = deriveBets(projectId, options);
  const latestRun = deriveLatestRun(projectId, options);
  const learnings = deriveLearnings(projectId, options);
  const bestMove = deriveBestMove({ goal, bets });
  const upgrades = deriveUpgrades({ goal, bets, latestRun }, project.sharedContext ?? {});
  return { goal, bets, bestMove, latestRun, learnings, upgrades };
}

// ── Move proposals (up to three, framed by the harness) ─────────────────────────────────────────────
// The MoveProposal evidence field is the three-word market-evidence scale (guessed / researched /
// observed); a gated bet maps to "observed" here since the enum has no "gated" — a human already stood
// behind it, so it is at least as solid as observed.
function moveEvidence(solidity) {
  if (solidity === "gated" || solidity === "observed") return "observed";
  if (solidity === "researched") return "researched";
  return "guessed";
}

export function proposeMoves(projectId = "default", options = {}) {
  const bets = deriveBets(projectId, options).slice(0, 3);
  return bets.map((bet) => ({
    statement: bet.basis
      ? `Put your offer in front of ${bet.basis} and ask for the paid step.`
      : "Put your offer in front of the right buyers and ask for the paid step.",
    bet: bet.statement,
    evidence: moveEvidence(bet.solidity),
    risk: bet.basis
      ? `${howSure(bet.sure)} — if ${bet.basis} is not the real buyer, this move misses.`
      : `${howSure(bet.sure)} — the buyer is still a guess.`,
    action: bet.basis
      ? `Today: reach 10–20 ${bet.basis} with the offer.`
      : "Today: reach 10–20 real buyers with the offer.",
  }));
}
