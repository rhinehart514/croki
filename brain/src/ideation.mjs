// Ideation — generate wide from distinct angles, measure that the batch is actually distinct, then let
// a SEPARATE bar cut the weak ones. The generator never grades its own ideas.
//
// This is the engine behind the /ideate skill, brought into the host: several generators each come at a
// goal from a different angle (the anchors below), distinct.mjs measures in code whether the batch is
// genuinely spread or just clustered at the average (HUDDLED → regenerate wider), and then — and only
// then — a separate critic (the bar from idea-bar.mjs) grades the survivors. The generator and the bar
// are different injected functions by construction; composeIdeas refuses to run if they are the same
// function, because a model that grades its own output drifts back to its own safe defaults.
//
// Injectable like composition.mjs and eval.mjs: a fake generator in tests, createClaudeIdeaGenerator()
// live on the subscription, an honest blank default that generates nothing.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runClaudeQuery, parseAgentObject } from "./agent-bridge.mjs";
import { blankIdeaBar } from "./idea-bar.mjs";

// The angle each generator takes — the product-level anchors from ~/.claude/skills/ideate/SKILL.md. The
// spread comes from these different angles, not a self-reported quota. (June 2026 snapshot; the skill
// re-challenges this list against live research before a real run.)
export const ANGLE_ANCHORS = [
  { angle: "scarcity-first", lens: "start from what is genuinely scarce — attention, trust, a credential, a slot — and build the idea around owning that scarcity." },
  { angle: "private-signal-first", lens: "start from a signal only this product can see, that no competitor has access to, and build the idea around acting on it first." },
  { angle: "asset-first", lens: "start from an asset the founder already holds — a live product, data, distribution, a relationship — and compound it." },
  { angle: "second-order-first", lens: "start from the second-order effect — what happens after the obvious win — and design for the consequence everyone else misses." },
  { angle: "machine-customer-first", lens: "start from the agent as the customer — what an AI buyer, not a human, would need to choose and use this — and build for that." },
];

// The generation doctrine, handed to one angle's generator agent.
export const GENERATE_PROMPT = `You are ONE idea generator working a single angle on a go-to-market goal, grounded in a real product. You GENERATE ideas; you do NOT grade them — a separate critic does that.

Take ONLY your assigned angle. Produce 2 to 4 concrete ideas that fit the live edge and push past the average from that angle. Each idea is one or two plain sentences naming the move and why it bites — not a category, a real move. Never invent traction, numbers, customers, or quotes.

Return ONLY JSON: { "ideas": [ "idea one ...", "idea two ..." ] }`;

// Live generator: reads the repo on the founder's subscription for one angle, returns { ideas: [...] }.
export function createClaudeIdeaGenerator({ cwd = process.cwd(), model, maxTurns = 12, onText } = {}) {
  return async function generate({ goal, grounding, angle, lens, taste } = {}) {
    const prompt = [
      GENERATE_PROMPT,
      `\nYour angle: ${angle} — ${lens || ""}`,
      `\nGoal:\n${goal || ""}`,
      taste ? `\nFounder taste (what past gate decisions favor):\n${JSON.stringify(taste, null, 2)}` : "",
      `\nProduct grounding:\n${JSON.stringify(grounding ?? {}, null, 2)}`,
    ].filter(Boolean).join("\n");
    const { text, error } = await runClaudeQuery({ prompt, cwd, model, maxTurns, onText });
    if (error) return { ideas: [] };
    const parsed = parseAgentObject(text);
    const ideas = Array.isArray(parsed?.ideas) ? parsed.ideas : [];
    return { ideas: ideas.filter((s) => typeof s === "string" && s.trim()).map((s) => s.trim()) };
  };
}

// Honest blank default: with no generator wired, generate nothing rather than fake ideas.
const blankGenerate = async () => ({ ideas: [] });

// The distinctiveness oracle — the same bin/distinct.mjs the skill runs. Configurable so a machine
// without the ideate skill, or a test, can point elsewhere; resilient when absent.
export function distinctPath() {
  return process.env.IDEATE_DISTINCT_PATH
    || path.join(os.homedir(), ".claude", "skills", "ideate", "bin", "distinct.mjs");
}

// Run distinct.mjs over the batch's pitches. Returns the measured score and whether the batch is HUDDLED
// (verbatim repetition → regenerate). Resilient: an absent binary reports available=false, never huddled,
// so a missing oracle does not force endless regeneration.
export function defaultDistinct(pitches = []) {
  const bin = distinctPath();
  if (!fs.existsSync(bin)) return { available: false, batch_distinctiveness: null, verdict: null, huddled: false };
  const proc = spawnSync(process.execPath, [bin, JSON.stringify(pitches)], { encoding: "utf8" });
  if (proc.status !== 0 || !proc.stdout) return { available: false, batch_distinctiveness: null, verdict: null, huddled: false };
  try {
    const out = JSON.parse(proc.stdout);
    return {
      available: true,
      batch_distinctiveness: out.batch_distinctiveness ?? null,
      verdict: out.verdict ?? null,
      huddled: /HUDDLED/i.test(out.verdict || ""),
    };
  } catch {
    return { available: false, batch_distinctiveness: null, verdict: null, huddled: false };
  }
}

// Generate one idea per angle, tagging each idea with the angle that produced it.
async function generateWide({ generate, goal, grounding, taste, anchors }) {
  const ideas = [];
  for (const anchor of anchors) {
    const out = await generate({ goal, grounding, taste, angle: anchor.angle, lens: anchor.lens });
    for (const pitch of out?.ideas ?? []) {
      if (typeof pitch === "string" && pitch.trim()) ideas.push({ angle: anchor.angle, pitch: pitch.trim() });
    }
  }
  return ideas;
}

// composeIdeas — the full run. Generate wide across the anchors, measure distinctiveness and regenerate
// on HUDDLED, then grade survivors with a SEPARATE critic (the bar). Returns the graded ideas, the
// survivors, and the run's distinctiveness evidence.
//
// The generator and the bar are different functions by construction. Passing the same function for both
// is rejected loudly: the generator must never grade its own ideas.
export async function composeIdeas({
  goal,
  grounding = null,
  bar = blankIdeaBar,
  taste = null,
  generate = blankGenerate,
  distinct = defaultDistinct,
  anchors = ANGLE_ANCHORS,
  maxRegen = 1,
} = {}) {
  if (typeof generate !== "function" || typeof bar !== "function") {
    throw new Error("composeIdeas needs a generate function and a bar function.");
  }
  if (generate === bar) {
    throw new Error("The generator must not grade its own ideas — the bar must be a separate critic.");
  }
  if (!String(goal || "").trim()) throw new Error("composeIdeas needs a goal.");

  // 1 + 2. Generate wide, measure distinctiveness, regenerate while HUDDLED (up to maxRegen).
  let ideas = await generateWide({ generate, goal, grounding, taste, anchors });
  let distinctiveness = distinct(ideas.map((i) => i.pitch));
  let regenerated = false;
  let regenCount = 0;
  while (distinctiveness.huddled && regenCount < maxRegen) {
    ideas = await generateWide({ generate, goal, grounding, taste, anchors });
    distinctiveness = distinct(ideas.map((i) => i.pitch));
    regenerated = true;
    regenCount += 1;
  }

  // 3. Grade every idea with the SEPARATE bar. The generator stays out of this pass entirely.
  const graded = [];
  for (const idea of ideas) {
    const verdict = await bar({ idea: idea.pitch, goal, grounding });
    graded.push({
      angle: idea.angle,
      pitch: idea.pitch,
      barScore: verdict?.barScore ?? null,
      axes: verdict?.axes ?? null,
      verdict: verdict?.killed ? "killed" : "survived",
      killed: verdict?.killed === true,
    });
  }

  const survivors = graded.filter((g) => !g.killed);
  return {
    goal,
    ideas: graded,
    survivors,
    killed: graded.filter((g) => g.killed),
    distinctiveness,
    regenerated,
    regenCount,
  };
}
