import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { ideateObjectCandidates, resolveObjectType } from "../src/ideation.mjs";

// A stub generator standing in for the live createClaudeIdeaGenerator — same { ideas: [...] } shape,
// so the test is offline and deterministic while exercising the real mapping path.
function stubGenerator(ideas) {
  const seen = {};
  const generate = async ({ goal, grounding }) => {
    seen.goal = goal;
    seen.grounding = grounding;
    return { ideas };
  };
  generate.seen = seen;
  return generate;
}

describe("object ideation — ideateObjectCandidates", () => {
  it("maps a grounded generator's ideas to decidable candidate objects, framing the goal from the source card", async () => {
    const generate = stubGenerator([
      { pitch: "Reach solo RevOps leads who own their own tooling budget.", what: "an audience to chase", upside: "They decide fast.", risk: "Small segment." },
      { pitch: "A 30-day paid pilot priced under their discretionary limit.", what: "an offer they can expense", upside: "Removes procurement.", risk: "Discount pressure." },
    ]);
    const candidates = await ideateObjectCandidates({
      target: "new buyers",
      source: { id: "obj-1", type: "offer", statement: "Self-serve pilot for RevOps teams." },
      grounding: { product: "grounding" },
      generate,
    });

    assert.equal(candidates.length, 2);
    // The goal was framed from BOTH the plain target and the selected card's statement.
    assert.match(generate.seen.goal, /new buyers/);
    assert.match(generate.seen.goal, /Self-serve pilot for RevOps teams/);
    // The real product grounding was handed to the generator.
    assert.deepEqual(generate.seen.grounding, { product: "grounding" });

    for (const c of candidates) {
      assert.ok(c.id, "each candidate carries an id");
      assert.ok(c.statement && c.statement.length > 0, "each candidate is a founder-language statement");
      assert.ok(typeof c.type === "string" || c.type === null, "each candidate names an object type or null");
    }
    // "an audience to chase" resolves to buyer; the target ("new buyers") also implies buyer.
    assert.equal(candidates[0].type, "buyer");
    // "an offer they can expense" resolves to offer even though the target is buyers.
    assert.equal(candidates[1].type, "offer");
    assert.equal(candidates[0].statement, "Reach solo RevOps leads who own their own tooling budget.");
    assert.equal(candidates[0].rationale, "They decide fast.");
  });

  it("caps the candidate count and ignores empty ideas", async () => {
    const generate = stubGenerator([
      { pitch: "One." }, { pitch: "Two." }, { pitch: "Three." }, { pitch: "" }, { pitch: "Four." }, { pitch: "Five." }, { pitch: "Six." },
    ]);
    const candidates = await ideateObjectCandidates({ target: "new angles", generate, max: 5 });
    assert.equal(candidates.length, 5);
    // A free target with no source still frames a goal and resolves a type.
    assert.equal(candidates[0].type, "message");
  });

  it("refuses without a target or a generator", async () => {
    await assert.rejects(() => ideateObjectCandidates({ target: "   ", generate: async () => ({ ideas: [] }) }));
    await assert.rejects(() => ideateObjectCandidates({ target: "new buyers", generate: null }));
  });

  it("resolves plain targets to real palette object types", () => {
    assert.equal(resolveObjectType("new offers"), "offer");
    assert.equal(resolveObjectType("new channels to reach them"), "channel");
    assert.equal(resolveObjectType("new angles"), "message");
    assert.equal(resolveObjectType("more buyers"), "buyer");
    assert.equal(resolveObjectType("something totally freeform"), null);
  });
});
