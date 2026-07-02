import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { composeIdeas, normalizeAngles, GENERATE_PROMPT, PROPOSE_ANGLES_PROMPT } from "../src/ideation.mjs";

// Angles a proposer might derive for one specific goal — test data, never a house list in the engine.
const GOAL_ANGLES = [
  { angle: "who-it-tempts", lens: "start from the buyer the offer tempts most." },
  { angle: "where-its-seen", lens: "start from where the post actually gets seen." },
  { angle: "what-it-costs", lens: "start from what the discount really costs." },
];

// A fake generator: one idea per angle, tagged so we can see every angle fired.
function countingGenerator() {
  const calls = [];
  const generate = async ({ angle }) => {
    calls.push(angle);
    return { ideas: [`idea from ${angle ?? "an open pass"}`] };
  };
  generate.calls = calls;
  return generate;
}

// A fake bar (separate critic): kills any pitch containing "weak", survives the rest, and hands back
// the plain-line reason a kill carries.
function fakeBar() {
  const graded = [];
  const bar = async ({ idea }) => {
    graded.push(idea);
    const killed = /weak/.test(idea);
    return {
      barScore: killed ? null : 6.5,
      verdict: killed ? "killed" : "survived",
      killed,
      killReason: killed ? "It would not move anyone to act." : null,
      take: killed ? "It would not move anyone to act." : "A real move with a clear next step.",
      axes: { moves_the_goal: 7 },
    };
  };
  bar.graded = graded;
  return bar;
}

describe("ideation — composeIdeas", () => {
  it("generates one idea per DERIVED angle, then a SEPARATE bar grades each", async () => {
    const generate = countingGenerator();
    const bar = fakeBar();
    const proposeAngles = async ({ goal }) => {
      assert.equal(goal, "run a 50%-off X post");
      return { angles: GOAL_ANGLES };
    };
    const out = await composeIdeas({ goal: "run a 50%-off X post", generate, bar, proposeAngles, distinct: () => ({ huddled: false }) });

    // Every derived angle was used as a generation angle — no house anchors anywhere.
    assert.deepEqual(generate.calls.sort(), GOAL_ANGLES.map((a) => a.angle).sort());
    // The bar (not the generator) graded every produced idea.
    assert.equal(bar.graded.length, GOAL_ANGLES.length);
    assert.equal(out.ideas.length, GOAL_ANGLES.length);
    assert.equal(out.survivors.length, GOAL_ANGLES.length);
    assert.equal(out.regenerated, false);
    assert.deepEqual(out.angles.map((a) => a.angle), GOAL_ANGLES.map((a) => a.angle));
  });

  it("explicitly injected angles win over the proposer", async () => {
    const generate = countingGenerator();
    let proposerCalled = false;
    await composeIdeas({
      goal: "x",
      generate,
      bar: fakeBar(),
      angles: [{ angle: "only-this" }],
      proposeAngles: async () => { proposerCalled = true; return { angles: GOAL_ANGLES }; },
      distinct: () => ({ huddled: false }),
    });
    assert.deepEqual(generate.calls, ["only-this"]);
    assert.equal(proposerCalled, false);
  });

  it("with no angle source at all, ONE unconstrained pass runs (no house anchors)", async () => {
    const generate = countingGenerator();
    const out = await composeIdeas({ goal: "x", generate, bar: fakeBar(), distinct: () => ({ huddled: false }) });
    assert.deepEqual(generate.calls, [null]);
    assert.equal(out.ideas.length, 1);
  });

  it("carries the generator's decision texture (what/upside/risk) through grading", async () => {
    const generate = async () => ({ ideas: [{
      pitch: "Post the 50%-off code where the users already are.",
      what: "an offer",
      upside: "The discount is concrete and expiring.",
      risk: "The audience may be too small to notice.",
    }] });
    const out = await composeIdeas({ goal: "x", generate, bar: fakeBar(), distinct: () => ({ huddled: false }) });
    const idea = out.ideas[0];
    assert.equal(idea.what, "an offer");
    assert.equal(idea.upside, "The discount is concrete and expiring.");
    assert.equal(idea.risk, "The audience may be too small to notice.");
    assert.equal(idea.take, "A real move with a clear next step.");
    assert.equal(idea.killReason, null, "a survivor carries no kill reason");
  });

  it("a killed idea is RETAINED with its plain-line reason — never silently culled", async () => {
    const generate = async () => ({ ideas: ["a weak idea", "a strong idea"] });
    const out = await composeIdeas({ goal: "x", generate, bar: fakeBar(), distinct: () => ({ huddled: false }) });
    assert.equal(out.ideas.length, 2, "killed ideas stay in the graded batch");
    assert.equal(out.killed.length, 1);
    assert.equal(out.killed[0].killReason, "It would not move anyone to act.");
    assert.equal(out.survivors.length, 1);
  });

  it("rejects a generator that grades its own ideas (generator must NOT equal grader)", async () => {
    const same = async () => ({ ideas: [], killed: false });
    await assert.rejects(
      composeIdeas({ goal: "x", generate: same, bar: same }),
      /must not grade its own ideas/,
    );
  });

  it("regenerates wider when distinct.mjs reports the batch is HUDDLED", async () => {
    const generate = countingGenerator();
    const bar = fakeBar();
    // First measurement HUDDLED, second spread — the run must regenerate exactly once.
    let call = 0;
    const distinct = () => (++call === 1 ? { huddled: true, verdict: "HUDDLED — regenerate wider" } : { huddled: false });

    const out = await composeIdeas({ goal: "x", generate, bar, angles: GOAL_ANGLES, distinct, maxRegen: 1 });

    assert.equal(out.regenerated, true);
    assert.equal(out.regenCount, 1);
    // Generated twice: once per angle, then a full second pass after HUDDLED.
    assert.equal(generate.calls.length, GOAL_ANGLES.length * 2);
  });

  it("stops regenerating at maxRegen even if still huddled", async () => {
    const generate = countingGenerator();
    const bar = fakeBar();
    const out = await composeIdeas({ goal: "x", generate, bar, angles: GOAL_ANGLES, distinct: () => ({ huddled: true }), maxRegen: 2 });
    assert.equal(out.regenCount, 2);
    // initial pass + 2 regenerations = 3 full passes.
    assert.equal(generate.calls.length, GOAL_ANGLES.length * 3);
  });

  it("separates survivors from killed by the bar's verdict", async () => {
    const generate = async ({ angle }) => ({ ideas: angle === "what-it-costs" ? ["a weak idea"] : [`strong ${angle}`] });
    const bar = fakeBar();
    const out = await composeIdeas({ goal: "x", generate, bar, angles: GOAL_ANGLES, distinct: () => ({ huddled: false }) });
    assert.equal(out.killed.length, 1);
    assert.equal(out.killed[0].angle, "what-it-costs");
    assert.equal(out.survivors.length, GOAL_ANGLES.length - 1);
  });

  it("requires a goal", async () => {
    await assert.rejects(composeIdeas({ generate: async () => ({ ideas: [] }), bar: async () => ({}) }), /needs a goal/);
  });

  it("blank default generates nothing", async () => {
    const out = await composeIdeas({ goal: "x", bar: async () => ({ killed: false }), distinct: () => ({ huddled: false }) });
    assert.equal(out.ideas.length, 0);
    assert.equal(out.survivors.length, 0);
  });

  it("normalizeAngles accepts strings, objects, or a wrapped { angles } and validates shape only", () => {
    assert.deepEqual(normalizeAngles(["a-side", { angle: "b-side", lens: "look from b" }, { lens: "no name" }, ""]), [
      { angle: "a-side", lens: null },
      { angle: "b-side", lens: "look from b" },
    ]);
    assert.deepEqual(normalizeAngles({ angles: ["c-side"] }), [{ angle: "c-side", lens: null }]);
    assert.deepEqual(normalizeAngles(null), []);
  });

  it("no permanent house categories: the prompts derive angles from the goal, never name fixed lenses", () => {
    // The old frozen anchors — none may live in the doctrine prompts.
    for (const slug of ["scarcity-first", "private-signal-first", "asset-first", "second-order-first", "machine-customer-first"]) {
      assert.ok(!GENERATE_PROMPT.includes(slug), `GENERATE_PROMPT names the old fixed lens ${slug}`);
      assert.ok(!PROPOSE_ANGLES_PROMPT.includes(slug), `PROPOSE_ANGLES_PROMPT names the old fixed lens ${slug}`);
    }
    assert.match(PROPOSE_ANGLES_PROMPT, /Derive the angles from THIS goal/);
  });
});
