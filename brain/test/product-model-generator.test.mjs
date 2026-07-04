import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { blankGenerate, toModel, PRODUCT_MODEL_PROMPT } from "../src/product-model-generator.mjs";

const LAYERS = ["things", "relationships", "userGoals", "states", "ia", "workflows", "interactions", "transitions"];

describe("product-model blankGenerate", () => {
  it("never fabricates — returns an ok, fully-shaped empty model marked blank", async () => {
    const result = await blankGenerate({ grounding: { anything: true }, market: { buyer: "x" } });
    assert.equal(result.ok, true);
    assert.equal(result.meta.blank, true);
    for (const layer of LAYERS) {
      assert.deepEqual(result.model[layer], [], `${layer} is an empty bag`);
    }
  });
});

describe("product-model toModel coercion", () => {
  it("returns a full empty model when the parse produced null or a non-object", () => {
    for (const bad of [null, undefined, "text", 5, true]) {
      const model = toModel(bad);
      for (const layer of LAYERS) {
        assert.deepEqual(model[layer], [], `${layer} empty for input ${String(bad)}`);
      }
    }
  });

  it("keeps array bags as-is and drops non-array bags to empty so the pollution guard never crashes", () => {
    const model = toModel({
      things: [{ name: "Vouch" }],
      relationships: "not an array",
      userGoals: { actor: "founder" },
      states: null,
      ia: [{ name: "Home" }],
      workflows: 7,
      interactions: [{ name: "Editor", kind: "screen" }],
      transitions: undefined,
    });
    assert.deepEqual(model.things, [{ name: "Vouch" }], "valid array bag preserved");
    assert.deepEqual(model.ia, [{ name: "Home" }]);
    assert.deepEqual(model.interactions, [{ name: "Editor", kind: "screen" }]);
    assert.deepEqual(model.relationships, [], "string bag coerced to empty");
    assert.deepEqual(model.userGoals, [], "object bag coerced to empty");
    assert.deepEqual(model.states, [], "null bag coerced to empty");
    assert.deepEqual(model.workflows, [], "number bag coerced to empty");
    assert.deepEqual(model.transitions, []);
  });

  it("returns exactly the eight known layers, ignoring any extra keys the agent invented", () => {
    const model = toModel({ things: [], madeUpLayer: [{ x: 1 }], notes: "hi" });
    assert.deepEqual(Object.keys(model).sort(), [...LAYERS].sort(), "only the known layers survive");
    assert.equal(model.madeUpLayer, undefined);
  });

  it("the modeling doctrine tells the agent the model is interpretation, not proven truth", () => {
    assert.match(PRODUCT_MODEL_PROMPT, /INTERPRETATION/);
    assert.match(PRODUCT_MODEL_PROMPT, /derived|speculative/);
  });
});
