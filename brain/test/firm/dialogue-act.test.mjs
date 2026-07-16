// dialogue-act.test.mjs — review is dialogue, not buttons (build contract §4A.2). A founder reply is
// classified into one intent. Deterministic lexical intents resolve without a model; ambiguous replies
// fall through to steer (safe: becomes context, closes nothing — invariant §5.9).

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyDialogueAct } from "../../src/firm/dialogue-act.mjs";

describe("classifyDialogueAct — deterministic lexical intents", () => {
  it("reads a clear close without a model", async () => {
    let modelCalls = 0;
    const result = await classifyDialogueAct(
      { message: "that's done, close it" },
      { classify: async () => { modelCalls += 1; return null; } },
    );
    assert.equal(result.act, "close");
    assert.equal(result.usedModel, false);
    assert.equal(modelCalls, 0);
  });

  it("reads a standing approval as approve-standing (the grant-minting intent)", async () => {
    const result = await classifyDialogueAct({ message: "you can send these yourself from now on" }, {});
    assert.equal(result.act, "approve-standing");
    assert.equal(result.usedModel, false);
  });

  it("reads a one-off approval as approve, not approve-standing", async () => {
    const result = await classifyDialogueAct({ message: "looks good, send it" }, {});
    assert.equal(result.act, "approve");
  });

  it("reads a new-direction phrase", async () => {
    const result = await classifyDialogueAct({ message: "forget this, new idea: try referrals instead" }, {});
    assert.equal(result.act, "new-direction");
  });
});

describe("classifyDialogueAct — the fuzzy path and the safe default", () => {
  it("an ambiguous reply becomes steer context and closes nothing, with the whole message as steer text", async () => {
    const result = await classifyDialogueAct(
      { message: "tighten the opening, it's too salesy" },
      { classify: async () => null },
    );
    assert.equal(result.act, "steer");
    assert.equal(result.steerText, "tighten the opening, it's too salesy");
    assert.equal(result.usedModel, false);
  });

  it("uses the injected model only when the lexical pass is unsure, and carries extracted steer text", async () => {
    const result = await classifyDialogueAct(
      { message: "make the tone warmer overall", effortSummary: { intent: "cold outreach" } },
      { classify: async () => ({ act: "steer", steerText: "warmer tone" }) },
    );
    assert.equal(result.act, "steer");
    assert.equal(result.steerText, "warmer tone");
    assert.equal(result.usedModel, true);
  });

  it("a throwing model falls through to steer, never crashing review", async () => {
    const result = await classifyDialogueAct(
      { message: "hmm not sure about this" },
      { classify: async () => { throw new Error("model down"); } },
    );
    assert.equal(result.act, "steer");
  });

  it("an empty message is a no-op steer", async () => {
    const result = await classifyDialogueAct({ message: "   " }, {});
    assert.equal(result.act, "steer");
    assert.equal(result.steerText, null);
  });
});
