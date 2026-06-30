// The bar an idea has to clear — the microproduct floor, run by a SEPARATE critic.
//
// An idea generator left to grade its own output drifts back to its own defaults: it scores its safe,
// average idea high. So scoring is split off here, exactly as eval.mjs splits run-grading off from
// composition. This module scores an idea on the feature-design-is-marketing axes — showable,
// demo_is_core, loop_able — plus the strategy core (edge, differentiation, distinctiveness), then runs
// the SAME crucible/bin/grade.mjs binary the eval rig uses to turn those axes into a verdict. The
// showable/demo_is_core axes are hard floor-gates inside grade.mjs: below 4 the idea is KILLED, not
// merely low. A kill is dead.
//
// Injectable like eval.mjs: a fake scorer in tests, createClaudeIdeaBar() live on the subscription, and
// an honest blank default (blankIdeaBar) that grades nothing rather than faking a floor.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { runClaudeQuery, parseAgentObject } from "./agent-bridge.mjs";
import { gradePath } from "./eval.mjs";

// The microproduct bar. loop_able is the heavy weight (it ranks which feature wins); showable and
// demo_is_core are the floor-gates grade.mjs kills below; the strategy axes keep an idea from being a
// shareable demo of nothing. Same axis vocabulary grade.mjs already understands.
export const IDEA_BAR_WEIGHTS = {
  loop_able: 2.0,
  showable: 1.5,
  demo_is_core: 1.0,
  edge: 2.0,
  differentiation: 2.0,
  distinctiveness: 1.5,
};

// The scoring doctrine, handed to the critic agent. It scores; it does not generate — the separation is
// the whole point.
export const BAR_PROMPT = `You are the BAR for ONE go-to-market idea: a separate critic that scores an idea you did NOT generate. Score honestly — a near-dead axis is a kill, not a number to average away.

You are given the idea (its pitch), the goal it serves, and the product grounding.

Score each axis 0..10. The feature-design-is-marketing axes are the microproduct floor:
- "showable": the idea's value lands in a <30s screen recording with NO narration. Below 4 this is a KILL.
- "demo_is_core": that clip shows the product's REAL core value, not bolted-on demo-bait. Below 4 this is a KILL.
- "loop_able": using or watching it pulls the next user in — the viral-loop strength.
And the strategy core:
- "edge": it sits at the live edge of what's now possible, not last year's idea.
- "differentiation": it is not the generic answer every competitor would also give.
- "distinctiveness": it is genuinely distinct, not a paraphrase of the obvious.

Return ONLY JSON: { "axes": { "showable": 0, "demo_is_core": 0, "loop_able": 0, "edge": 0, "differentiation": 0, "distinctiveness": 0 } }`;

// Live scorer: reads the repo on the founder's subscription, returns { ok, axes }.
export function createClaudeBarScorer({ cwd = process.cwd(), model, maxTurns = 12, onText } = {}) {
  return async function score({ idea, goal, grounding } = {}) {
    const prompt = [
      BAR_PROMPT,
      `\nIdea (pitch):\n${typeof idea === "string" ? idea : idea?.pitch || ""}`,
      `\nGoal:\n${goal || ""}`,
      `\nProduct grounding:\n${JSON.stringify(grounding ?? {}, null, 2)}`,
    ].join("\n");
    const { text, error } = await runClaudeQuery({ prompt, cwd, model, maxTurns, onText });
    if (error) return { ok: false, error: error.message };
    const parsed = parseAgentObject(text);
    if (!parsed || !parsed.axes || typeof parsed.axes !== "object") {
      return { ok: false, error: "Bar scorer did not return { axes }." };
    }
    return { ok: true, axes: parsed.axes };
  };
}

// Honest blank default: with no scorer wired, score nothing rather than fake a floor.
const blankScore = async () => ({ ok: false, error: "blank", axes: null });

// Keep only the axes grade.mjs understands and coerce them to numbers in range; drop the rest. Mirrors
// eval.mjs's normalizeChecks discipline.
function normalizeAxes(rawAxes) {
  const axes = {};
  for (const key of Object.keys(IDEA_BAR_WEIGHTS)) {
    const v = rawAxes?.[key];
    if (Number.isFinite(v)) axes[key] = Math.max(0, Math.min(10, v));
  }
  return Object.keys(axes).length ? axes : null;
}

// Default grader: shell out to the one shared grade.mjs binary, exactly as eval.mjs does. Resilient when
// the binary is absent — returns graderAvailable=false rather than throwing.
function defaultGrade({ axes, weights }) {
  const bin = gradePath();
  if (!fs.existsSync(bin)) return { overall: null, verdict: null, graderAvailable: false };
  const proc = spawnSync(process.execPath, [bin, JSON.stringify({ axes, weights })], { encoding: "utf8" });
  if (proc.status !== 0 || !proc.stdout) return { overall: null, verdict: null, graderAvailable: false };
  try {
    const out = JSON.parse(proc.stdout);
    // grade.mjs returns state "KILLED" with verdict "Dead" when a floor-gate axis is below the floor.
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

// Build a bar: a critic that, given an idea, scores its axes (fuzzy, the model) then grades them
// (deterministic, grade.mjs) into { barScore, verdict, killed, axes }. Both halves are injectable.
export function createIdeaBar({ score = blankScore, grade = defaultGrade } = {}) {
  return async function bar({ idea, goal, grounding } = {}) {
    const scored = await score({ idea, goal, grounding });
    const axes = scored?.ok ? normalizeAxes(scored.axes) : null;
    if (!axes) {
      // Nothing to grade. The blank/failed path does NOT kill — it can't tell, so it doesn't pretend
      // to. The idea survives ungraded rather than dying on a missing critic.
      return { barScore: null, verdict: "survived", killed: false, axes: null, graderAvailable: false, ungraded: true };
    }
    const graded = grade({ axes, weights: IDEA_BAR_WEIGHTS });
    const killed = graded?.state === "KILLED" || graded?.verdict === "Dead";
    return {
      barScore: graded?.overall ?? null,
      verdict: killed ? "killed" : "survived",
      killed,
      axes,
      graderAvailable: graded?.graderAvailable !== false,
    };
  };
}

// The live bar: a Claude critic on the subscription, scoring against the real grade.mjs.
export function createClaudeIdeaBar(opts = {}) {
  return createIdeaBar({ score: createClaudeBarScorer(opts) });
}

// The honest blank bar: grades nothing, kills nothing.
export const blankIdeaBar = createIdeaBar({ score: blankScore });
