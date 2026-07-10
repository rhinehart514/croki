import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  blankGenerate,
  createClaudeProductModeler,
  createProductModeler,
  generateProductModelForProject,
  toModel,
  PRODUCT_MODEL_PROMPT,
} from "../src/product-model-generator.mjs";

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

describe("provider-neutral product model factory", () => {
  it("normalizes Codex and Claude results to the same product model while recording the honest provider", async () => {
    const value = { things: [{ name: "Sale" }], relationships: [], userGoals: [], states: [], ia: [], workflows: [], interactions: [], transitions: [] };
    const make = (runtime) => createProductModeler({
      runTask: async (request) => ({ ok: true, value, runtime, model: runtime === "codex" ? "gpt-test" : "claude-test" }),
    });
    const codex = await make("codex")({ grounding: { product: "x" } });
    const claude = await make("claude-code")({ grounding: { product: "x" } });
    assert.deepEqual(codex.model, claude.model);
    assert.equal(codex.meta.provider, "codex");
    assert.equal(claude.meta.provider, "claude");
  });

  it("degrades provider errors to an empty shaped model without losing safe metadata", async () => {
    const generate = createProductModeler({
      runTask: async () => ({ ok: false, value: null, runtime: "codex", model: "gpt-test", error: { kind: "limit", message: "Usage limit reached.", retriable: true } }),
    });
    const result = await generate({});
    assert.equal(result.ok, false);
    assert.equal(result.meta.provider, "codex");
    assert.equal(result.meta.errorKind, "limit");
    for (const layer of LAYERS) assert.deepEqual(result.model[layer], []);
  });

  it("keeps createClaudeProductModeler as a compatibility wrapper over the shared seam", async () => {
    let request;
    const generate = createClaudeProductModeler({
      runTask: async (value) => { request = value; return { ok: true, value: {}, runtime: "claude-code", model: null }; },
    });
    await generate({});
    assert.equal(request.runtime, "claude-code");
    assert.equal(request.readOnly, true);
    assert.equal(request.output, "object");
  });

  it("builds the draft from the active project's supplied scan and requested runtime", async () => {
    let request;
    const project = {
      id: "project-b",
      name: "Product B",
      sharedContext: { repository: { workspaceId: "workspace-b", repo: "/repo/b", outcome: "signup_completed" } },
    };
    const report = {
      scannedAt: "2026-07-10T12:00:00.000Z",
      productContext: { pkg: { name: "product-b", description: "The B product" } },
      stack: ["node"],
      winEvent: {
        name: "signup_completed",
        found: true,
        attributionProperties: ["source"],
        citations: [{ file: "src/b.ts", line: 9, label: "B signup" }],
      },
      gaps: [],
    };
    const result = await generateProductModelForProject({
      project,
      report,
      model: "gpt-test",
      runtime: "codex",
      runTask: async (value) => {
        request = value;
        return { ok: true, value: { things: [{ name: "Signup" }] }, runtime: "codex", model: "gpt-test" };
      },
    });

    assert.equal(request.runtime, "codex");
    assert.equal(request.model, "gpt-test");
    assert.match(request.prompt, /signup_completed/);
    assert.match(request.prompt, /src\/b\.ts/);
    assert.equal(result.groundingRef, "workspace-b");
    assert.equal(result.grounding.productName, "Product B");
    assert.deepEqual(result.model.things, [{ name: "Signup" }]);
  });
});
