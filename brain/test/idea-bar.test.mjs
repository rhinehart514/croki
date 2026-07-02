import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  createIdeaBar,
  blankIdeaBar,
  normalizeBarAxes,
  withUniversalFloors,
  buildBarScorePrompt,
  UNIVERSAL_FLOORS,
} from "../src/idea-bar.mjs";
import { gradePath } from "../src/eval.mjs";

// A proposer that derives an offer-shaped bar — the axes come from the goal, not a house rubric.
function offerBarProposer() {
  return async ({ goal }) => ({
    ok: true,
    axes: [
      { key: "moves_buyers", question: `Would this offer actually move a buyer on: ${goal}?`, weight: 2, killBelow: 4 },
      { key: "credible", question: "Is the offer believable coming from this product?", weight: 1 },
    ],
  });
}

describe("idea-bar — the separate critic, derived per goal", () => {
  it("blank bar grades nothing and kills nothing (honest no-op)", async () => {
    const out = await blankIdeaBar({ idea: "some idea", goal: "land a pilot" });
    assert.equal(out.barScore, null);
    assert.equal(out.killed, false);
    assert.equal(out.verdict, "survived");
    assert.equal(out.ungraded, true);
    // Even blank, the bar it would have used is the universal floors — never a fake goal rubric.
    assert.deepEqual(out.bar.map((a) => a.key), UNIVERSAL_FLOORS.map((a) => a.key));
  });

  it("derives the bar from the goal and scores against THOSE axes (no fixed vocabulary)", async () => {
    let scoredAgainst = null;
    const score = async ({ barAxes }) => {
      scoredAgainst = barAxes.map((a) => a.key);
      return { ok: true, axes: { moves_buyers: 8, credible: 7, moves_the_goal: 8, concrete_move: 9 }, take: "The discount is real and easy to say yes to." };
    };
    const grade = ({ axes, weights, gates }) => {
      // The grader receives the DERIVED axes and weights, plus the universal floors.
      assert.ok("moves_buyers" in axes && "credible" in axes);
      assert.equal(weights.moves_buyers, 2);
      assert.deepEqual(gates, {});
      return { overall: 7.6, verdict: "Strong", state: "GRADED", graderAvailable: true };
    };
    const bar = createIdeaBar({ proposeBar: offerBarProposer(), score, grade });
    const out = await bar({ idea: "50% off for the first 10", goal: "run a 50%-off X post" });
    assert.equal(out.killed, false);
    assert.equal(out.barScore, 7.6);
    assert.equal(out.take, "The discount is real and easy to say yes to.");
    // The critic was asked about the goal-derived axes AND the universal floors.
    assert.ok(scoredAgainst.includes("moves_buyers"));
    assert.ok(scoredAgainst.includes("moves_the_goal"));
  });

  it("a per-goal kill-floor fires as a gate and the kill carries a plain-line reason", async () => {
    const score = async () => ({ ok: true, axes: { moves_buyers: 2, credible: 7, moves_the_goal: 6, concrete_move: 7 } });
    const grade = ({ gates }) => {
      assert.equal(gates.moves_buyers, "kill");
      return { overall: null, verdict: "Dead", state: "KILLED", graderAvailable: true };
    };
    const bar = createIdeaBar({ proposeBar: offerBarProposer(), score, grade });
    const out = await bar({ idea: "a coupon nobody wants", goal: "run a 50%-off X post" });
    assert.equal(out.killed, true);
    assert.equal(out.verdict, "killed");
    assert.ok(out.killReason, "a kill always carries a reason the founder can read");
    assert.match(out.killReason, /buyer/i);
    assert.doesNotMatch(out.killReason, /\d\.\d/, "the reason is plain words, not a score");
  });

  it("universal floors always ride along and cannot be dropped by the derived bar", () => {
    const derived = normalizeBarAxes({ axes: [
      { key: "moves_the_goal", question: "sharper wording", weight: 3 }, // collides with a universal floor
      { key: "reach", question: "Does it reach anyone?", weight: 1 },
    ] });
    const merged = withUniversalFloors(derived);
    const goalFloor = merged.find((a) => a.key === "moves_the_goal");
    assert.ok(goalFloor.killBelow != null, "the colliding universal floor keeps its kill-floor");
    assert.ok(merged.some((a) => a.key === "concrete_move"), "the other universal floor is added");
    assert.ok(merged.some((a) => a.key === "reach"), "the derived axis stays");
  });

  it("normalizeBarAxes validates SHAPE, never vocabulary — any goal-derived axis is legal", () => {
    const axes = normalizeBarAxes({ axes: [
      { key: "Earns A Reply!", question: "Would the person it lands on answer?", weight: 99, killBelow: 44 },
      { key: "", question: "dropped: no key" },
      { key: "no_question" },
      "not an object",
    ] });
    assert.equal(axes.length, 1);
    assert.equal(axes[0].key, "earns_a_reply");
    assert.equal(axes[0].weight, 3, "weight clamped to range");
    assert.equal(axes[0].killBelow, 10, "floor clamped to range");
  });

  it("drops out-of-bar score keys and clamps scores to range", async () => {
    const seen = {};
    const score = async () => ({ ok: true, axes: { moves_buyers: 99, bogus: 5, credible: -3 } });
    const grade = ({ axes }) => { Object.assign(seen, axes); return { overall: 5, verdict: "Viable", graderAvailable: true }; };
    const bar = createIdeaBar({ proposeBar: offerBarProposer(), score, grade });
    await bar({ idea: "idea", goal: "g" });
    assert.equal(seen.moves_buyers, 10);
    assert.equal(seen.credible, 0);
    assert.equal("bogus" in seen, false);
  });

  it("a failed scorer survives ungraded rather than dying on a missing critic", async () => {
    const bar = createIdeaBar({ proposeBar: offerBarProposer(), score: async () => ({ ok: false, error: "no critic" }) });
    const out = await bar({ idea: "idea", goal: "g" });
    assert.equal(out.killed, false);
    assert.equal(out.ungraded, true);
  });

  it("a failed proposer falls back to ONLY the universal floors — it never invents a goal rubric", async () => {
    let scoredAgainst = null;
    const score = async ({ barAxes }) => {
      scoredAgainst = barAxes.map((a) => a.key);
      return { ok: true, axes: { moves_the_goal: 8, concrete_move: 8 } };
    };
    const grade = () => ({ overall: 6, verdict: "Viable", state: "GRADED", graderAvailable: true });
    const bar = createIdeaBar({ proposeBar: async () => ({ ok: false, error: "down" }), score, grade });
    const out = await bar({ idea: "idea", goal: "g" });
    assert.deepEqual(scoredAgainst, UNIVERSAL_FLOORS.map((a) => a.key));
    assert.equal(out.killed, false);
  });

  it("the score prompt names the derived axes and asks for one plain-sentence take", () => {
    const prompt = buildBarScorePrompt(withUniversalFloors(normalizeBarAxes({ axes: [
      { key: "moves_buyers", question: "Would this offer move a buyer?", weight: 2, killBelow: 4 },
    ] })));
    assert.match(prompt, /moves_buyers/);
    assert.match(prompt, /Would this offer move a buyer\?/);
    assert.match(prompt, /"take"/);
  });

  // Integration with the REAL shared grade.mjs: a per-goal kill-floor expressed as a gate must KILL in
  // code, proving the bar reuses the same self-enforcing binary the eval rig uses (skipped when absent).
  it("kills via the real crucible grade.mjs gate when present", async (t) => {
    if (!fs.existsSync(gradePath())) return t.skip("crucible grade.mjs not installed");
    const bar = createIdeaBar({
      proposeBar: offerBarProposer(),
      score: async () => ({ ok: true, axes: { moves_buyers: 1, credible: 8, moves_the_goal: 7, concrete_move: 7 } }),
    });
    const out = await bar({ idea: "an offer no buyer would take", goal: "run a 50%-off X post" });
    assert.equal(out.killed, true);
    assert.equal(out.graderAvailable, true);
  });
});
