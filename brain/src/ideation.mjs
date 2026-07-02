// Ideation — generate wide from distinct angles, measure that the batch is actually distinct, then let
// a SEPARATE bar cut the weak ones. The generator never grades its own ideas.
//
// This is the engine behind the /ideate skill, brought into the host: several generators each come at a
// goal from a different angle, distinct.mjs measures in code whether the batch is genuinely spread or
// just clustered at the average (HUDDLED → regenerate wider), and then — and only then — a separate
// critic (the bar from idea-bar.mjs) grades every idea. The generator and the bar are different injected
// functions by construction; composeIdeas refuses to run if they are the same function, because a model
// that grades its own output drifts back to its own safe defaults.
//
// The ANGLES are not a house list. They are chosen fresh per goal — derived by the model from the goal
// and the product (an offer goal gets angles about who it tempts and what it costs; a content goal gets
// angles about who already gathers where) — so no permanent category ever shapes every run. With no
// angle source at all, one unconstrained pass runs and the generator picks its own distinct sides.
//
// Injectable like composition.mjs and eval.mjs: a fake generator in tests, createClaudeIdeaGenerator()
// live on the subscription, an honest blank default that generates nothing.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runClaudeQuery, parseAgentObject } from "./agent-bridge.mjs";
import { blankIdeaBar } from "./idea-bar.mjs";

// Ideation is a PROMPT, not a fleet of tool-using agents (GTM-ENGINE-REBUILD §6). Generating and
// grading ideas is fuzzy judgment worked off grounding that is ALREADY handed in (the product summary
// and the founder's taste are pre-packed into each prompt as data — deterministic code fetched them,
// not a model tool call). So these calls run lean: no tools, and a turn budget just big enough to emit
// one JSON reply. The SDK's read tools are reserved for steps that genuinely research; a generate/grade
// pass does not, and a repo-reading 12-turn agent per idea was the machinery this phase removes.
const LEAN_TOOLS = [];
const LEAN_TURNS = 2;

// The angle-derivation doctrine: the sides come from THIS goal, never from a recycled list.
export const PROPOSE_ANGLES_PROMPT = `You are choosing the ANGLES a set of idea generators will take on ONE go-to-market goal, grounded in a real product. Derive the angles from THIS goal — the genuinely different real sides someone could come at it from. An offer goal splits into sides like who the offer tempts, what makes it credible, where it gets seen; a channel goal into who already gathers there and what earns their attention; an outreach goal into who to reach and what they'd actually answer. Do not reuse a house list of categories; name the sides this goal really has. 3 to 6 angles.

Return ONLY JSON: { "angles": [ { "angle": "short-name", "lens": "one sentence telling a generator how to come at the goal from this side" } ] }`;

// Live angle proposer: derives the angles for one goal on the founder's subscription. Lean — no tools,
// low turn budget: it reasons over the goal and the handed-in grounding, it does not go research.
export function createClaudeAngleProposer({ cwd = process.cwd(), model, maxTurns = LEAN_TURNS, onText } = {}) {
  return async function proposeAngles({ goal, grounding } = {}) {
    const prompt = [
      PROPOSE_ANGLES_PROMPT,
      `\nGoal:\n${goal || ""}`,
      `\nProduct grounding:\n${JSON.stringify(grounding ?? {}, null, 2)}`,
    ].join("\n");
    const { text, error } = await runClaudeQuery({ prompt, cwd, model, maxTurns, onText, allowedTools: LEAN_TOOLS });
    if (error) return { angles: [] };
    const parsed = parseAgentObject(text);
    return { angles: Array.isArray(parsed?.angles) ? parsed.angles : [] };
  };
}

// Normalize any angle source into an open [{ angle, lens }] list — shape validated, vocabulary free.
export function normalizeAngles(raw) {
  const list = Array.isArray(raw) ? raw : (Array.isArray(raw?.angles) ? raw.angles : []);
  const angles = [];
  for (const entry of list) {
    if (typeof entry === "string" && entry.trim()) {
      angles.push({ angle: entry.trim(), lens: null });
      continue;
    }
    const angle = String(entry?.angle || "").trim();
    if (!angle) continue;
    angles.push({ angle, lens: String(entry?.lens || "").trim() || null });
  }
  return angles;
}

// The generation doctrine, handed to one generator. Each idea comes back as a decidable object — the
// move itself, what kind of move it is (the generator's own words, not a category), and the honest
// for/against a founder needs to judge it.
export const GENERATE_PROMPT = `You are ONE idea generator working a go-to-market goal, grounded in a real product. You GENERATE ideas; you do NOT grade them — a separate critic does that.

Produce 2 to 4 concrete ideas that fit the live edge and push past the average. Each idea is a real move, not a category. Never invent traction, numbers, customers, or quotes.

For each idea return:
- "pitch": one or two plain sentences naming the move and why it bites.
- "what": in a few of your own words, what kind of move it is (an offer, a post, an audience to chase, a partnership, a pricing change, ...).
- "upside": the single strongest reason it could work for THIS goal.
- "risk": the single strongest reason it might not.

Return ONLY JSON: { "ideas": [ { "pitch": "...", "what": "...", "upside": "...", "risk": "..." } ] }`;

// Coerce one raw generated idea (object or plain string) into the open idea shape, or null.
function normalizeIdea(raw) {
  if (typeof raw === "string") {
    const pitch = raw.trim();
    return pitch ? { pitch, what: null, upside: null, risk: null } : null;
  }
  const pitch = String(raw?.pitch || raw?.idea || "").trim();
  if (!pitch) return null;
  return {
    pitch,
    what: String(raw?.what || "").trim() || null,
    upside: String(raw?.upside || "").trim() || null,
    risk: String(raw?.risk || "").trim() || null,
  };
}

// Live generator: works ONE angle on the founder's subscription, returns { ideas: [...] }. Lean — no
// tools, low turn budget: the product grounding and the founder's taste are handed in below, so it
// generates from what it was given rather than reading the repo turn after turn.
export function createClaudeIdeaGenerator({ cwd = process.cwd(), model, maxTurns = LEAN_TURNS, onText } = {}) {
  return async function generate({ goal, grounding, angle, lens, taste } = {}) {
    const prompt = [
      GENERATE_PROMPT,
      angle
        ? `\nYour angle: ${angle}${lens ? ` — ${lens}` : ""}\nTake ONLY this angle; other generators cover the other sides of the goal.`
        : `\nNo angle was assigned: pick genuinely different sides of THIS goal yourself and spread your ideas across them.`,
      `\nGoal:\n${goal || ""}`,
      taste ? `\nFounder taste (what past gate decisions favor):\n${JSON.stringify(taste, null, 2)}` : "",
      `\nProduct grounding:\n${JSON.stringify(grounding ?? {}, null, 2)}`,
    ].filter(Boolean).join("\n");
    const { text, error } = await runClaudeQuery({ prompt, cwd, model, maxTurns, onText, allowedTools: LEAN_TOOLS });
    if (error) return { ideas: [] };
    const parsed = parseAgentObject(text);
    const ideas = Array.isArray(parsed?.ideas) ? parsed.ideas : [];
    return { ideas: ideas.map(normalizeIdea).filter(Boolean) };
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

// Generate ideas across the goal's angles (or one unconstrained pass when there are none), tagging each
// idea with the angle that produced it.
async function generateWide({ generate, goal, grounding, taste, angles }) {
  const lanes = angles.length ? angles : [{ angle: null, lens: null }];
  const ideas = [];
  for (const lane of lanes) {
    const out = await generate({ goal, grounding, taste, angle: lane.angle, lens: lane.lens });
    for (const raw of out?.ideas ?? []) {
      const idea = normalizeIdea(raw);
      if (idea) ideas.push({ angle: lane.angle, ...idea });
    }
  }
  return ideas;
}

// composeIdeas — the full run. Derive the goal's angles (or take injected ones), generate wide across
// them, measure distinctiveness and regenerate on HUDDLED, then grade EVERY idea with a SEPARATE critic
// (the bar). Returns all graded ideas — survivors AND killed, each kill carrying its plain-line reason
// so the cut is inspectable and revivable — plus the run's distinctiveness evidence.
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
  angles = null,
  proposeAngles = null,
  maxRegen = 1,
} = {}) {
  if (typeof generate !== "function" || typeof bar !== "function") {
    throw new Error("composeIdeas needs a generate function and a bar function.");
  }
  if (generate === bar) {
    throw new Error("The generator must not grade its own ideas — the bar must be a separate critic.");
  }
  if (!String(goal || "").trim()) throw new Error("composeIdeas needs a goal.");

  // 0. The angles for THIS goal: injected explicitly, derived by the proposer, or — with neither —
  //    one unconstrained pass where the generator spreads across sides it picks itself.
  let lanes = normalizeAngles(angles);
  if (!lanes.length && typeof proposeAngles === "function") {
    lanes = normalizeAngles(await proposeAngles({ goal, grounding, taste }));
  }

  // 1 + 2. Generate wide, measure distinctiveness, regenerate while HUDDLED (up to maxRegen).
  let ideas = await generateWide({ generate, goal, grounding, taste, angles: lanes });
  let distinctiveness = distinct(ideas.map((i) => i.pitch));
  let regenerated = false;
  let regenCount = 0;
  while (distinctiveness.huddled && regenCount < maxRegen) {
    ideas = await generateWide({ generate, goal, grounding, taste, angles: lanes });
    distinctiveness = distinct(ideas.map((i) => i.pitch));
    regenerated = true;
    regenCount += 1;
  }

  // 3. Grade every idea with the SEPARATE bar. The generator stays out of this pass entirely.
  const graded = [];
  for (const idea of ideas) {
    const verdict = await bar({ idea: idea.pitch, goal, grounding });
    const killed = verdict?.killed === true;
    graded.push({
      angle: idea.angle,
      pitch: idea.pitch,
      what: idea.what ?? null,
      upside: idea.upside ?? null,
      risk: idea.risk ?? null,
      barScore: verdict?.barScore ?? null,
      axes: verdict?.axes ?? null,
      take: verdict?.take ?? null,
      killReason: killed ? (verdict?.killReason ?? null) : null,
      verdict: killed ? "killed" : "survived",
      killed,
    });
  }

  const survivors = graded.filter((g) => !g.killed);
  return {
    goal,
    angles: lanes,
    ideas: graded,
    survivors,
    killed: graded.filter((g) => g.killed),
    distinctiveness,
    regenerated,
    regenCount,
  };
}
