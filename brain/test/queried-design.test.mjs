import { test } from "node:test";
import assert from "node:assert/strict";

import { queryDesign, houseStyleSeed, buildDesignState } from "../src/design-state-store.mjs";
import { createRetrievalTools, callRetrievalTool, listRetrievalTools } from "../src/context/retrieval-tools.mjs";

// A realistic design state with multiple dimensions and references.
function sampleDesignState() {
  return buildDesignState({
    projectId: "test-project",
    houseStyle: "Warm Calm",
    feeling: "calm, warm, settled",
    dimensions: {
      visual: { principle: "Warm tinted grounds, pills, rounded corners, one accent color.", grounded: true },
      ia: { principle: "One center per surface; labels that predict their contents.", grounded: true },
      components: { principle: "Pill buttons, hairline-bordered cards, soft focus states.", grounded: true },
      motion: { principle: "Ease-out 180ms, no spring-bounce, motion that settles not performs.", grounded: true },
      copy: { principle: "Calm, plain, human — one confident line.", grounded: false },
    },
    references: [
      { source: "mobbin", label: "Komoot", dimensions: ["visual"], proves: "warm cream ground, full-bleed hero card" },
      { source: "mobbin", label: "ElevenLabs", dimensions: ["components", "ia"], proves: "restrained dashboard, hairline borders, black primary button" },
      { source: "url", label: "Cofounder", url: "https://cofounder.co/", dimensions: ["visual", "motion"], proves: "warm light ground, rounded cards, animated hero" },
    ],
  });
}

// ─── queryDesign — direct unit tests ─────────────────────────────────────────

test("queryDesign with no args falls back to full render (backward-compatible)", () => {
  const state = sampleDesignState();
  const result = queryDesign(state);
  assert.ok(result, "should return a result");
  assert.equal(result.meta.mode, "full");
  assert.match(result.text, /DESIGN STATE/);
  // Full render includes all dimensions.
  assert.match(result.text, /Visual/);
  assert.match(result.text, /Motion/);
  assert.match(result.text, /Components/);
  assert.equal(result.meta.dimensions, 5);
});

test("queryDesign with a question returns only the matching slice", () => {
  const state = sampleDesignState();
  const result = queryDesign(state, { question: "motion settle bounce" });
  assert.equal(result.meta.mode, "query");
  // Motion principle overlaps; visual/ia/copy should score lower or not at all.
  assert.match(result.text, /motion/i);
  // The Cofounder reference covers motion and should appear.
  assert.match(result.text, /Cofounder/);
});

test("queryDesign with dimension pin returns only that dimension's data", () => {
  const state = sampleDesignState();
  const result = queryDesign(state, { dimension: "components" });
  assert.equal(result.meta.mode, "query");
  assert.match(result.text, /Components/i);
  // Should include ElevenLabs (covers components) but not Cofounder (visual/motion only).
  assert.match(result.text, /ElevenLabs/);
  // Copy dimension (not matched) should not appear.
  assert.doesNotMatch(result.text, /Copy/);
});

test("queryDesign with both question and dimension narrows within the dimension", () => {
  const state = sampleDesignState();
  const result = queryDesign(state, { question: "button pill focus", dimension: "components" });
  assert.equal(result.meta.mode, "query");
  assert.match(result.text, /Pill buttons/i);
  assert.ok(result.meta.matchedDimensions >= 1);
});

test("queryDesign returns a no-match result when nothing overlaps, not null", () => {
  const state = sampleDesignState();
  const result = queryDesign(state, { question: "blockchain cryptocurrency airdrop nft" });
  assert.ok(result, "should return a result, not null");
  assert.equal(result.meta.mode, "no-match");
  assert.match(result.text, /No design state matches/);
  assert.match(result.text, /blockchain/);
});

test("queryDesign returns null on null input", () => {
  assert.equal(queryDesign(null), null);
  assert.equal(queryDesign(null, { question: "button" }), null);
});

test("queryDesign seed-default dimensions are labelled as such in the slice", () => {
  const state = sampleDesignState();
  // Copy dimension is not grounded (no references anchor it).
  const result = queryDesign(state, { dimension: "copy" });
  assert.match(result.text, /seed default/i);
});

// ─── get_design retrieval tool — queried path wired end-to-end ───────────────

test("get_design tool accepts a question and returns a relevant slice", () => {
  const state = sampleDesignState();
  const tools = createRetrievalTools({ designState: state });

  const result = callRetrievalTool(tools, "get_design", { question: "motion ease" });
  assert.equal(result.found, true);
  assert.match(result.text, /motion/i);
  assert.equal(result.meta.mode, "query");
});

test("get_design tool accepts a dimension pin", () => {
  const state = sampleDesignState();
  const tools = createRetrievalTools({ designState: state });

  const result = callRetrievalTool(tools, "get_design", { dimension: "visual" });
  assert.equal(result.found, true);
  assert.match(result.text, /Visual/i);
  assert.match(result.text, /Komoot/); // visual reference
  assert.equal(result.meta.mode, "query");
});

test("get_design tool with no args returns the full state (backward-compatible)", () => {
  const state = sampleDesignState();
  const tools = createRetrievalTools({ designState: state });

  const full = callRetrievalTool(tools, "get_design");
  assert.equal(full.found, true);
  // Full render includes house style header and all dimensions.
  assert.match(full.text, /DESIGN STATE/);
  assert.match(full.text, /Visual/);
  assert.match(full.text, /Motion/);
});

test("get_design with absent source returns an honest blank", () => {
  const tools = createRetrievalTools({});
  const result = callRetrievalTool(tools, "get_design");
  assert.equal(result.found, false);
  assert.equal(result.text, null);
  assert.match(result.note, /No design house style/i);
});

test("listRetrievalTools advertises question and dimension in get_design schema", () => {
  const catalog = listRetrievalTools();
  const design = catalog.find((t) => t.name === "get_design");
  assert.ok(design, "get_design must be in the catalog");
  assert.ok(design.inputSchema.properties.question, "get_design schema must include question");
  assert.ok(design.inputSchema.properties.dimension, "get_design schema must include dimension");
  assert.deepEqual(
    design.inputSchema.properties.dimension.enum,
    ["visual", "ia", "components", "motion", "copy"],
    "dimension enum must match DESIGN_DIMENSIONS"
  );
  // get_taste should still only have question (not dimension).
  const taste = catalog.find((t) => t.name === "get_taste");
  assert.ok(taste.inputSchema.properties.question, "get_taste must still advertise question");
  assert.ok(!taste.inputSchema.properties.dimension, "get_taste must NOT have a dimension property");
});

test("get_product still takes no args — the queryable tools do not contaminate the arg-free ones", () => {
  const catalog = listRetrievalTools();
  const product = catalog.find((t) => t.name === "get_product");
  assert.deepEqual(product.inputSchema.properties, {}, "get_product takes no args");
});
