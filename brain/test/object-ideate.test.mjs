import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { ideateObjectCandidates, resolveObjectType, createClaudeObjectIdeaGenerator } from "../src/ideation.mjs";

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

  it("streams plain reasoning deltas, then parses candidates from the prose-plus-fenced-JSON reply", async () => {
    const deltas = [];
    // A fake subscription call standing in for runClaudeQuery: it streams the model's narration through
    // onText delta by delta (what the founder watches), then returns the full prose + fenced JSON reply.
    const fakeRunQuery = async ({ prompt, onText }) => {
      // The object-ideate generator uses the narrate-first prompt, not the JSON-only GENERATE_PROMPT.
      assert.match(prompt, /watching you work/i);
      const proseDeltas = ["I'll start with who already buys, ", "then who sits one step adjacent.\n"];
      for (const chunk of proseDeltas) onText(chunk);
      const reply = proseDeltas.join("")
        + "```json\n"
        + JSON.stringify({ ideas: [{ pitch: "Chase adjacent RevOps leads who already own the budget.", what: "an audience to chase", upside: "Warm and fast.", risk: "Small segment." }] })
        + "\n```";
      onText("```json …```"); // the fence + JSON also stream; the frontend cuts at the fence
      return { text: reply };
    };

    const generate = createClaudeObjectIdeaGenerator({ onText: (d) => deltas.push(d), runQuery: fakeRunQuery });
    const candidates = await ideateObjectCandidates({ target: "new buyers", generate });

    // Reasoning streamed as plain-prose deltas — the founder watches Claude think before ideas land.
    assert.ok(deltas.length >= 2, "reasoning deltas streamed through onText");
    assert.equal(deltas.slice(0, 2).join(""), "I'll start with who already buys, then who sits one step adjacent.\n");
    // Candidates are still parsed from the fenced JSON at the end of the same reply.
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].statement, "Chase adjacent RevOps leads who already own the budget.");
    assert.equal(candidates[0].type, "buyer");
    assert.equal(candidates[0].rationale, "Warm and fast.");
  });

  it("resolves plain targets to real palette object types", () => {
    assert.equal(resolveObjectType("new offers"), "offer");
    assert.equal(resolveObjectType("new channels to reach them"), "channel");
    assert.equal(resolveObjectType("new angles"), "message");
    assert.equal(resolveObjectType("more buyers"), "buyer");
    assert.equal(resolveObjectType("something totally freeform"), null);
  });
});
