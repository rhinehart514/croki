// The strategist read → the operation plan (GTM-MACHINE.md Area 4).
//
// This is the READ that turns a scanned product into a ranked list of GO-TO-MARKET MOTIONS — a plain
// card each ("mint a listing page per city from your own sale records", "add a share link to every
// sale page", "get cited when someone asks ChatGPT 'estate sales near me'"), spanning motion kinds,
// with at least one CODE-NATIVE motion derived from the product's real data model and cited to a real
// file:line. It is INTERPRETATION on top of cited truth, exactly like the product model — the planner
// strategizes freely; a claimed citation that does not exist is demoted to a labeled bet by the host.
//
// It is deliberately NOT a persisted domain object. There is no plan store, no idea-store schema bump,
// no required pre-run object (that was a cage — GTM-MACHINE.md §"Staying out of the cage" #4). The plan
// REGENERATES on demand and after a fresh scan; the founder's cuts/reorders/promotions live in the
// EXISTING taste ledger (feedback-ledger.mjs recordIdeaDecisions), the same place gate decisions live,
// and the next read replays them. Picking a motion to run drops into the existing compose_and_run door
// — this file never composes, runs, or gates.
//
// The runtime is injectable, like the other rented readers (composition, product model, eval):
//   - a fake planner in tests,
//   - createClaudeMotionPlanner() live on the founder's subscription,
//   - an honest blank default (blankPlan) that REFUSES rather than fabricates a motion list.

import { runClaudeQuery, parseAgentItems, parseAgentReasoning } from "./agent-bridge.mjs";

// The planning doctrine, passed to the motion planner. Its prompt IS the gtm-ideate-channels doctrine
// (~/.claude/agents/gtm-ideate-channels.md — no predefined shape, derived-vs-speculative labeling), so
// editing that markdown edits how the machine imagines a product's go-to-market. We inline a compact
// restatement here so the host has a self-contained default even when the agent file is unread; the
// live planner reads the same rules from the repo cwd. The one hard addition beyond ideate-channels:
// the plan MUST span motion kinds and MUST include at least one code-native motion derived from the
// product's real data model with a real citation — the "the read produces the plan" eval (Area 4 #4).
export const MOTION_PLAN_PROMPT = `You are producing the OPERATION PLAN for ONE product: a ranked list of go-to-market MOTIONS the machine could run toward the founder's goals. This is INTERPRETATION layered on cited code facts — strategize freely; it is NOT a claim about what the code provably does.

You may Read and Grep the repository. You are given the product's full interpretive model (its things, relationships, user goals, states, information architecture, workflows, interactions, transitions), its grounded scan reality (win event, attribution, stack, blind spots — each cited to file:line), the live capability inventory (the connected MCP tools and reusable agents the machine can actually wire), the founder's taste, and the founder's prior edits to earlier plans.

The one rule that matters: NO PREDEFINED SHAPE. Do not assume outbound. Do not collapse the plan into a funnel. Read what the product really is and let it tell you its real go-to-market mechanics. A motion can be:
- an outbound motion (find people, reach them),
- programmatic content minted from the product's OWN data model (a page per record, per city, per category — thousands of real pages the founder already holds the data for),
- an in-product growth loop (a share link, a referral, an invite, a public artifact that pulls the next user),
- a pull/inbound harvest (who is already engaging but stalled),
- an AI-visibility motion (get cited when someone asks an assistant a near-me / category question),
- a partnership,
- a CODE-NATIVE motion: a change to the founder's real product — a share loop wired in, a page generator cut from the data model, an attribution event added so a motion becomes measurable,
- or something none of these names cover.

All are equally available; none is privileged. The moment you default to a funnel you have failed.

HARD REQUIREMENTS for a passing plan:
- At least SIX motions spanning at least FOUR distinct kinds. Kind is free text you derive from the motion itself (e.g. "programmatic-pages", "in-product-loop", "ai-visibility", "outbound", "partnership", "code-change") — never a fixed enum.
- At least ONE code-native motion derived from the product's REAL data model, carrying a real file:line citation to the record/route/data it builds on.
- Where a motion wires a connected MCP capability, reference it by its real ref (serverId/toolName) in the rationale or evidence.

Provenance is load-bearing on EVERY motion. Mark a motion "derived" ONLY when you are claiming the code already supports it, and then cite REAL file:line evidence. Mark a genuine bet "speculative" with empty evidence — speculative motions are first-class; most good go-to-market ideas are bets the code doesn't yet prove. NEVER invent a file, a line, or a capability to dress a bet as fact: the host DEMOTES any "derived" motion with no real citation back to "speculative", so a fake citation only loses you credit and rank.

Replay the founder's prior plan edits: a motion the founder CUT before should not return in the same shape; a motion the founder PROMOTED should rank higher. Their edits are your taste signal.

Return ONLY a JSON array. Each item:
{
  "kind": "the motion kind you derived (free text)",
  "title": "short plain-language name a founder reads",
  "objective": "what this motion is for, in one plain sentence",
  "rationale": "why THIS product, THIS motion — grounded in the real model/data where derived",
  "origin": "derived" | "speculative",
  "confidence": "high" | "medium" | "low",
  "codeNative": true | false,
  "evidence": [ { "label": "...", "file": "path", "line": 0, "text": "the cited line" } ],
  "capabilityRefs": [ "serverId/toolName" ]
}
Return [] only if you genuinely cannot ground or responsibly bet on a single motion — an honest empty answer beats a fabricated plan.`;

// The kinds a normalized motion carries. `origin` and `codeNative` are the only two host-controlled
// facts; everything else is the planner's free content. `kind` is an OPEN STRING — never validated
// against a list (that would be the closed motion enum the anti-cage guard forbids).
const ORIGIN = new Set(["derived", "speculative"]);
const CONFIDENCE = new Set(["high", "medium", "low"]);

// Coerce one evidence entry, mirroring product-model-store.evidenceArray: a citation only counts as
// real evidence when it actually names a file. An empty {} is not proof.
function evidenceArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      label: String(item.label || "").trim(),
      file: String(item.file || "").trim(),
      line: Number.isFinite(item.line) ? item.line : (Number.parseInt(item.line, 10) || 0),
      text: String(item.text || "").trim(),
    }))
    .filter((item) => item.file);
}

// The pollution guard, motion by motion — the SAME one-directional valve product-model-store applies
// (its lines 77-81): a motion claiming "derived" with zero real citations is demoted to "speculative"
// so an interpretive bet can never launder itself back as a cited fact. This is the citation rule from
// AGENTS.md applied at the plan boundary. A demoted motion also drops its codeNative-DERIVED claim:
// a code-native motion with no real citation is a bet, not a proven data-model move.
function normalizeProvenance(rawOrigin, evidence) {
  let origin = ORIGIN.has(rawOrigin) ? rawOrigin : (evidence.length ? "derived" : "speculative");
  if (origin === "derived" && evidence.length === 0) origin = "speculative";
  return origin;
}

function normalizeMotion(raw, index) {
  if (!raw || typeof raw !== "object") return null;
  // A motion is identified by its title; a titleless bag is dropped rather than shown as a blank card.
  const title = String(raw.title || raw.label || raw.name || "").trim();
  if (!title) return null;
  const evidence = evidenceArray(raw.evidence);
  const origin = normalizeProvenance(raw.origin, evidence);
  // codeNative is only credited as a DERIVED claim when the motion kept its citation. A code-native
  // bet is fine (a share loop the code doesn't yet have) — it just rides as speculative like any bet.
  const codeNative = raw.codeNative === true;
  const capabilityRefs = Array.isArray(raw.capabilityRefs)
    ? raw.capabilityRefs.map((r) => String(r || "").trim()).filter(Boolean)
    : [];
  return {
    id: `motion-${index}`,
    kind: String(raw.kind || raw.type || "").trim() || "motion", // open string, never validated
    title,
    objective: String(raw.objective || "").trim(),
    rationale: String(raw.rationale || "").trim(),
    origin,
    confidence: CONFIDENCE.has(raw.confidence) ? raw.confidence : (origin === "derived" ? "medium" : "low"),
    codeNative,
    // Whether the host DEMOTED a claimed derivation — surfaced so the founder sees the bet was labeled,
    // not silently swallowed (mirrors the product-model demotion being visible on inspection).
    demoted: raw.origin === "derived" && origin === "speculative",
    evidence,
    capabilityRefs,
  };
}

// Rank the normalized motions into the order the founder reads them. Deterministic, pure — the planner
// proposes, the host orders by a stable, honest key so a "derived, high-confidence, cited, code-native"
// motion outranks a bare speculative bet. This is NOT a policy that obeys a motion enum (there is none):
// it orders by provenance + confidence + citation weight, all open. Founder promotions (replayed into
// the prompt) already tilt the planner; this is the final tie-stable sort the host owns.
const CONF_RANK = { high: 3, medium: 2, low: 1 };
function motionScore(m) {
  let score = 0;
  if (m.origin === "derived") score += 4;
  score += CONF_RANK[m.confidence] ?? 1;
  score += Math.min(m.evidence.length, 3); // cited motions rank above uncited ones, capped
  if (m.codeNative && m.origin === "derived") score += 2; // the eval-critical class, when real
  return score;
}

export function rankMotions(motions = []) {
  return [...motions]
    .map((m, i) => ({ m, i }))
    .sort((a, b) => motionScore(b.m) - motionScore(a.m) || a.i - b.i)
    .map(({ m }, rank) => ({ ...m, orderRank: rank }));
}

// The plan-quality summary the eval reads: does the plan span kinds, and does it carry a real
// code-native derived motion? Pure over the normalized+ranked motions — never seeded, honest on empty.
export function planSpan(motions = []) {
  const kinds = new Set(motions.map((m) => m.kind).filter(Boolean));
  const derivedCodeNative = motions.filter((m) => m.codeNative && m.origin === "derived" && m.evidence.length);
  const capabilityWired = motions.some((m) => m.capabilityRefs.length);
  return {
    motionCount: motions.length,
    kindCount: kinds.size,
    kinds: [...kinds],
    derivedCodeNativeCount: derivedCodeNative.length,
    hasDerivedCodeNative: derivedCodeNative.length > 0,
    capabilityWired,
  };
}

// Turn whatever the planner returned into a clean, ranked plan with the host's pollution guard applied.
// Pure and total: junk in yields an empty plan, never a throw. This is the host boundary the fake
// planner in tests and the live planner both flow through — one place the citation valve lives.
export function toPlan(items, meta = {}) {
  const raw = Array.isArray(items) ? items : [];
  const motions = rankMotions(raw.map(normalizeMotion).filter(Boolean));
  return {
    motions,
    span: planSpan(motions),
    reasoning: typeof meta.reasoning === "string" ? meta.reasoning : "",
    generatedAt: meta.generatedAt || new Date().toISOString(),
    // The scan the plan was read against, so the founder-facing staleness flag ("your plan is older than
    // your last scan") is computed at read time by comparing this to the workspace's scannedAt. Null when
    // there was no scanned workspace — an ungrounded plan says so rather than implying a scan.
    scannedAt: meta.scannedAt || null,
  };
}

// Honest blank default: with no planner runtime wired, REFUSE — return an empty plan rather than
// fabricate a motion list. Refusing-rather-than-faking is the same discipline as blankGenerate and the
// blank composer.
export const blankPlan = async () => ({ ok: true, plan: toPlan([]), meta: { blank: true } });

// Live planner: reads the repo on the founder's subscription and returns the ranked plan. It calls
// runClaudeQuery directly (read-only Read/Glob/Grep tools at the repo cwd) and parses a JSON ARRAY with
// parseAgentItems — the gtm-ideate-channels doctrine returns an array of items, so this is the array
// path (mirroring how the ideate channels agent is consumed), NOT parseAgentObject. OAuth-first, no
// key, no send path — this NEVER composes, runs, or gates.
export function createClaudeMotionPlanner({ cwd = process.cwd(), model, maxTurns = 30, onText } = {}) {
  return async function plan({ productModel, grounding, capabilities, taste, priorEdits, goal, scannedAt } = {}) {
    const contextBlock = [
      goal ? `\nThe founder's stated goal:\n${String(goal)}` : "",
      productModel ? `\nThe product's full interpretive model (things, relationships, user goals, states, IA, workflows, interactions, transitions):\n${JSON.stringify(productModel, null, 2)}` : "",
      grounding ? `\nThe product's grounded scan reality (cited code facts — win event, attribution, stack, blind spots):\n${JSON.stringify(grounding, null, 2)}` : "",
      capabilities ? `\nLive capabilities you can wire (reference by exact ref):\n- Connected MCP tools (ref = "serverId/toolName"): ${JSON.stringify((capabilities.tools ?? []).map((t) => ({ ref: `${t.serverId}/${t.toolName}`, lane: t.lane })))}\n- Reusable agents: ${JSON.stringify((capabilities.agents ?? []).map((a) => a.ref))}` : "",
      taste ? `\nFounder taste (compose the plan to fit what they've approved/rejected — do not re-ask what this settles):\n${taste}` : "",
      priorEdits ? `\nThe founder's prior plan edits (replay these — a cut motion should not return in the same shape; a promoted one ranks higher):\n${priorEdits}` : "",
    ].filter(Boolean).join("\n");
    const prompt = `${MOTION_PLAN_PROMPT}${contextBlock}`;
    const { text, error } = await runClaudeQuery({ prompt, cwd, model, maxTurns, onText });
    if (error) {
      return { ok: false, plan: toPlan([], { scannedAt }), meta: { error: error.message, errorKind: error.kind, retriable: error.retriable } };
    }
    const items = parseAgentItems(text);
    const reasoning = parseAgentReasoning(text);
    return { ok: true, plan: toPlan(items, { reasoning, scannedAt }), meta: { parsed: items.length > 0 } };
  };
}
