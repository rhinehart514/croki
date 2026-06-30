import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { composeIdeas, ANGLE_ANCHORS } from "../src/ideation.mjs";

// A fake generator: one idea per angle, tagged so we can see every anchor fired.
function countingGenerator() {
  const calls = [];
  const generate = async ({ angle }) => {
    calls.push(angle);
    return { ideas: [`idea from ${angle}`] };
  };
  generate.calls = calls;
  return generate;
}

// A fake bar (separate critic): kills any pitch containing "weak", survives the rest.
function fakeBar() {
  const graded = [];
  const bar = async ({ idea }) => {
    graded.push(idea);
    const killed = /weak/.test(idea);
    return { barScore: killed ? null : 6.5, verdict: killed ? "killed" : "survived", killed, axes: { showable: 7 } };
  };
  bar.graded = graded;
  return bar;
}

describe("ideation — composeIdeas", () => {
  it("generates one idea per anchor, then a SEPARATE bar grades each", async () => {
    const generate = countingGenerator();
    const bar = fakeBar();
    const out = await composeIdeas({ goal: "land 5 pilots", generate, bar, distinct: () => ({ huddled: false }) });

    // Every anchor was used as a generation angle.
    assert.deepEqual(generate.calls.sort(), ANGLE_ANCHORS.map((a) => a.angle).sort());
    // The bar (not the generator) graded every produced idea.
    assert.equal(bar.graded.length, ANGLE_ANCHORS.length);
    assert.equal(out.ideas.length, ANGLE_ANCHORS.length);
    assert.equal(out.survivors.length, ANGLE_ANCHORS.length);
    assert.equal(out.regenerated, false);
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

    const out = await composeIdeas({ goal: "x", generate, bar, distinct, maxRegen: 1 });

    assert.equal(out.regenerated, true);
    assert.equal(out.regenCount, 1);
    // Generated twice: once per anchor, then a full second pass after HUDDLED.
    assert.equal(generate.calls.length, ANGLE_ANCHORS.length * 2);
  });

  it("stops regenerating at maxRegen even if still huddled", async () => {
    const generate = countingGenerator();
    const bar = fakeBar();
    const out = await composeIdeas({ goal: "x", generate, bar, distinct: () => ({ huddled: true }), maxRegen: 2 });
    assert.equal(out.regenCount, 2);
    // initial pass + 2 regenerations = 3 full passes.
    assert.equal(generate.calls.length, ANGLE_ANCHORS.length * 3);
  });

  it("separates survivors from killed by the bar's verdict", async () => {
    const generate = async ({ angle }) => ({ ideas: angle === "asset-first" ? ["a weak idea"] : [`strong ${angle}`] });
    const bar = fakeBar();
    const out = await composeIdeas({ goal: "x", generate, bar, distinct: () => ({ huddled: false }) });
    assert.equal(out.killed.length, 1);
    assert.equal(out.killed[0].angle, "asset-first");
    assert.equal(out.survivors.length, ANGLE_ANCHORS.length - 1);
  });

  it("requires a goal", async () => {
    await assert.rejects(composeIdeas({ generate: async () => ({ ideas: [] }), bar: async () => ({}) }), /needs a goal/);
  });

  it("blank default generates nothing", async () => {
    const out = await composeIdeas({ goal: "x", bar: async () => ({ killed: false }), distinct: () => ({ huddled: false }) });
    assert.equal(out.ideas.length, 0);
    assert.equal(out.survivors.length, 0);
  });
});
