// The bar an idea has to clear — DERIVED from the founder's stated goal, run by a SEPARATE critic.
//
// An idea generator left to grade its own output drifts back to its own defaults: it scores its safe,
// average idea high. So scoring is split off here, exactly as eval.mjs splits run-grading off from
// composition. The bar itself is NOT a house rubric: the grading axes and kill-floors are proposed per
// goal (an offer idea is judged on whether the offer moves buyers, a content idea on whether it reaches
// anyone), and only floors that are honestly universal for ANY go-to-market idea stay fixed. Scores are
// then run through the SAME crucible/bin/grade.mjs binary the eval rig uses: a per-goal kill-floor is
// expressed as a grade.mjs gate, so a kill is dead, not a low number.
//
// Injectable like eval.mjs: fake proposer/scorer in tests, createClaudeIdeaBar() live on the
// subscription, and an honest blank default (blankIdeaBar) that grades nothing rather than faking a bar.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { runClaudeQuery, parseAgentObject } from "./agent-bridge.mjs";
import { gradePath } from "./eval.mjs";

// Grading an idea is fuzzy judgment over the idea, the goal, and the grounding it is handed — not a
// research task. So the live bar (proposer + scorer) runs lean like the generator: no tools, low turn
// budget, one JSON reply. The deterministic kill is grade.mjs; the model only scores (GTM-ENGINE-REBUILD §6).
const LEAN_TOOLS = [];
const LEAN_TURNS = 2;

// The ONLY fixed floors — honestly universal for any go-to-market idea, whatever the goal. An idea that
// would not actually move the stated goal, or is not a concrete doable move, is dead for every goal.
// Everything else about the bar is derived per goal; do not grow this list into a house rubric.
export const UNIVERSAL_FLOORS = [
  { key: "moves_the_goal", question: "Taken at face value, would doing this actually move the founder's stated goal?", weight: 2, killBelow: 4 },
  { key: "concrete_move", question: "Is this a specific move someone could start this week — not a category, a theme, or a restatement of the goal?", weight: 1, killBelow: 4 },
];

// The bar-proposal doctrine: derive the axes from THIS goal, never reuse a house rubric.
export const PROPOSE_BAR_PROMPT = `You are proposing the BAR a batch of go-to-market ideas must clear for ONE founder goal, grounded in a real product. The bar is DERIVED from the goal itself — an offer idea is judged on whether the offer actually moves buyers, a content idea on whether it reaches anyone real, an outreach idea on whether the person it lands on would respond. Do not reuse a generic rubric; name what winning at THIS goal requires.

Propose 3 to 6 grading axes. For each axis give:
- "key": a short snake_case name.
- "question": the plain question the axis asks of an idea.
- "weight": how heavily it counts, 0.5 to 3.
- "killBelow": OPTIONAL, 0 to 10 — a floor below which an idea is dead for this goal. Use it only for a genuine deal-breaker, not for everything.

Return ONLY JSON: { "axes": [ { "key": "...", "question": "...", "weight": 1.5, "killBelow": 4 } ] }`;

// Normalize a proposed bar into an open list of axes. The shape is validated (key, question, numeric
// weight/floor in range); the VOCABULARY is not — any axis the goal needs is legal. No closed enum.
export function normalizeBarAxes(proposed) {
  const list = Array.isArray(proposed?.axes) ? proposed.axes : [];
  const seen = new Set();
  const axes = [];
  for (const raw of list) {
    const key = String(raw?.key || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    const question = String(raw?.question || "").trim();
    if (!key || !question || seen.has(key)) continue;
    seen.add(key);
    axes.push({
      key,
      question,
      weight: Number.isFinite(raw?.weight) ? Math.max(0.25, Math.min(3, raw.weight)) : 1,
      killBelow: Number.isFinite(raw?.killBelow) ? Math.max(0, Math.min(10, raw.killBelow)) : null,
    });
  }
  return axes;
}

// The derived bar plus the universal floors (deduped by key, derived wins on a collision so a goal can
// sharpen a universal question but never delete its floor).
export function withUniversalFloors(derivedAxes = []) {
  const keys = new Set(derivedAxes.map((axis) => axis.key));
  const merged = [...derivedAxes];
  for (const floor of UNIVERSAL_FLOORS) {
    if (keys.has(floor.key)) {
      const derived = merged.find((axis) => axis.key === floor.key);
      if (derived.killBelow == null) derived.killBelow = floor.killBelow;
    } else {
      merged.push({ ...floor });
    }
  }
  return merged;
}

// Live proposer: derives the bar for one goal on the founder's subscription. Lean — no tools, low turn
// budget: it reasons over the goal and the handed-in grounding, it does not research.
export function createClaudeBarProposer({ cwd = process.cwd(), model, maxTurns = LEAN_TURNS, onText } = {}) {
  return async function proposeBar({ goal, grounding } = {}) {
    const prompt = [
      PROPOSE_BAR_PROMPT,
      `\nGoal:\n${goal || ""}`,
      `\nProduct grounding:\n${JSON.stringify(grounding ?? {}, null, 2)}`,
    ].join("\n");
    const { text, error } = await runClaudeQuery({ prompt, cwd, model, maxTurns, onText, allowedTools: LEAN_TOOLS });
    if (error) return { ok: false, error: error.message, axes: null };
    const parsed = parseAgentObject(text);
    if (!parsed || !Array.isArray(parsed.axes)) return { ok: false, error: "Bar proposer did not return { axes: [...] }.", axes: null };
    return { ok: true, axes: parsed.axes };
  };
}

// The scoring doctrine for one idea against one derived bar. The critic scores; it does not generate —
// the separation is the whole point.
export function buildBarScorePrompt(barAxes = []) {
  const lines = barAxes.map((axis) =>
    `- "${axis.key}": ${axis.question}${axis.killBelow != null ? ` (below ${axis.killBelow} this is a KILL)` : ""}`);
  const keys = barAxes.map((axis) => `"${axis.key}": 0`).join(", ");
  return `You are the BAR for ONE go-to-market idea: a separate critic that scores an idea you did NOT generate. Score honestly — a near-dead axis is a kill, not a number to average away.

You are given the idea (its pitch), the goal it serves, and the product grounding. This bar was derived from that goal; score each axis 0..10 against the question it asks:
${lines.join("\n")}

Also give "take": ONE plain sentence a founder can read cold — the strongest reason this idea works for the goal, or the one thing that sinks it. No scores, no jargon.

Return ONLY JSON: { "axes": { ${keys} }, "take": "..." }`;
}

// Live scorer: scores one idea against the derived bar on the founder's subscription, returns
// { ok, axes, take }. Lean — no tools, low turn budget: the idea, goal, and grounding are handed in,
// so it scores what it was given rather than reading the repo.
export function createClaudeBarScorer({ cwd = process.cwd(), model, maxTurns = LEAN_TURNS, onText } = {}) {
  return async function score({ idea, goal, grounding, barAxes = [] } = {}) {
    const prompt = [
      buildBarScorePrompt(barAxes),
      `\nIdea (pitch):\n${typeof idea === "string" ? idea : idea?.pitch || ""}`,
      `\nGoal:\n${goal || ""}`,
      `\nProduct grounding:\n${JSON.stringify(grounding ?? {}, null, 2)}`,
    ].join("\n");
    const { text, error } = await runClaudeQuery({ prompt, cwd, model, maxTurns, onText, allowedTools: LEAN_TOOLS });
    if (error) return { ok: false, error: error.message };
    const parsed = parseAgentObject(text);
    if (!parsed || !parsed.axes || typeof parsed.axes !== "object") {
      return { ok: false, error: "Bar scorer did not return { axes }." };
    }
    return { ok: true, axes: parsed.axes, take: typeof parsed.take === "string" ? parsed.take.trim() : null };
  };
}

// Honest blank defaults: with nothing wired, propose nothing and score nothing rather than fake a bar.
const blankPropose = async () => ({ ok: false, error: "blank", axes: null });
const blankScore = async () => ({ ok: false, error: "blank", axes: null });

// Keep only the axes the derived bar names and coerce them to numbers in range; drop the rest. The
// vocabulary is the goal's own bar, not a fixed enum.
function clampScores(rawAxes, barAxes) {
  const axes = {};
  for (const axis of barAxes) {
    const v = rawAxes?.[axis.key];
    if (Number.isFinite(v)) axes[axis.key] = Math.max(0, Math.min(10, v));
  }
  return Object.keys(axes).length ? axes : null;
}

// Default grader: shell out to the one shared grade.mjs binary, exactly as eval.mjs does. A per-goal
// kill-floor arrives as a grade.mjs gate ("kill"), so the kill fires in code. Resilient when the binary
// is absent — returns graderAvailable=false rather than throwing.
function defaultGrade({ axes, weights, gates }) {
  const bin = gradePath();
  if (!fs.existsSync(bin)) return { overall: null, verdict: null, graderAvailable: false };
  const proc = spawnSync(process.execPath, [bin, JSON.stringify({ axes, weights, gates })], { encoding: "utf8" });
  if (proc.status !== 0 || !proc.stdout) return { overall: null, verdict: null, graderAvailable: false };
  try {
    const out = JSON.parse(proc.stdout);
    // grade.mjs returns state "KILLED" with verdict "Dead" when a gate kills.
    return {
      overall: out.overall ?? null,
      verdict: out.verdict ?? null,
      state: out.state ?? null,
      graderAvailable: true,
    };
  } catch {
    return { overall: null, verdict: null, graderAvailable: false };
  }
}

// Build a bar: a critic that derives the bar for the goal ONCE (memoized per goal), then, per idea,
// scores the derived axes (fuzzy, the model) and grades them (deterministic, grade.mjs) into
// { barScore, verdict, killed, killReason, take, axes, bar }. Every half is injectable.
//
// A killed idea always carries `killReason` — one plain line a founder can read — because a cut the
// founder cannot inspect is a silent cull, and the founder may revive what the bar got wrong.
export function createIdeaBar({ proposeBar = blankPropose, score = blankScore, grade = defaultGrade } = {}) {
  let memo = null; // { goal, barAxes } — the derived bar is per goal, not per idea.
  return async function bar({ idea, goal, grounding } = {}) {
    if (!memo || memo.goal !== goal) {
      const proposed = await proposeBar({ goal, grounding });
      const derived = proposed?.ok === false ? [] : normalizeBarAxes(proposed);
      // With no derived axes (blank/failed proposer) the bar is ONLY the universal floors — honest:
      // it still refuses to invent goal-specific judgment it doesn't have.
      memo = { goal, barAxes: withUniversalFloors(derived) };
    }
    const barAxes = memo.barAxes;
    const scored = await score({ idea, goal, grounding, barAxes });
    const axes = scored?.ok ? clampScores(scored.axes, barAxes) : null;
    const take = typeof scored?.take === "string" && scored.take.trim() ? scored.take.trim() : null;
    if (!axes) {
      // Nothing to grade. The blank/failed path does NOT kill — it can't tell, so it doesn't pretend
      // to. The idea survives ungraded rather than dying on a missing critic.
      return { barScore: null, verdict: "survived", killed: false, killReason: null, take, axes: null, bar: barAxes, graderAvailable: false, ungraded: true };
    }
    const weights = Object.fromEntries(barAxes.map((axis) => [axis.key, axis.weight]));
    const floored = barAxes.filter((axis) => axis.killBelow != null && axes[axis.key] != null && axes[axis.key] < axis.killBelow);
    const gates = Object.fromEntries(floored.map((axis) => [axis.key, "kill"]));
    const graded = grade({ axes, weights, gates });
    const killed = graded?.state === "KILLED" || graded?.verdict === "Dead";
    const killReason = killed
      ? (take || (floored.length ? `Didn't clear: ${floored.map((axis) => axis.question).join(" ")}` : "Fell short of the bar for this goal."))
      : null;
    return {
      barScore: graded?.overall ?? null,
      verdict: killed ? "killed" : "survived",
      killed,
      killReason,
      take,
      axes,
      bar: barAxes,
      graderAvailable: graded?.graderAvailable !== false,
    };
  };
}

// The live bar: a Claude proposer + critic on the subscription, grading against the real grade.mjs.
export function createClaudeIdeaBar(opts = {}) {
  return createIdeaBar({ proposeBar: createClaudeBarProposer(opts), score: createClaudeBarScorer(opts) });
}

// The honest blank bar: proposes nothing beyond the universal floors, grades nothing, kills nothing.
export const blankIdeaBar = createIdeaBar({ proposeBar: blankPropose, score: blankScore });
