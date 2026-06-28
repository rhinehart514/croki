import { test } from "node:test";
import assert from "node:assert/strict";

import {
  createRetrievalTools,
  listRetrievalTools,
  callRetrievalTool,
} from "../src/context/retrieval-tools.mjs";
import { createProductProvider, createMarketProvider } from "../src/context/providers.mjs";

const EXPECTED_TOOLS = [
  "get_product",
  "get_product_model",
  "get_market",
  "get_run_state",
  "get_taste",
  "get_design",
  "get_signal",
];

test("listRetrievalTools advertises the full surface with name, description, and schema", () => {
  const catalog = listRetrievalTools();
  assert.deepEqual(catalog.map((t) => t.name), EXPECTED_TOOLS);
  for (const tool of catalog) {
    assert.ok(tool.description && tool.description.length > 20, `${tool.name} needs a real description`);
    assert.equal(tool.inputSchema.type, "object");
  }
});

test("a present source is pulled live and renders identically to its provider (one source of truth)", () => {
  const grounding = {
    productName: "RodentRadar",
    headline: "Remote rodent monitoring for commercial food sites",
    stack: ["node", "react"],
    winEvent: { name: "project_created" },
    evidenceState: "proven",
  };
  const market = { buyer: "Independent pest-control operators", trigger: "audit season" };

  const tools = createRetrievalTools({ grounding, market });

  const product = callRetrievalTool(tools, "get_product");
  assert.equal(product.found, true);
  // The tool must not re-summarize differently than the pre-pack would — same text.
  assert.equal(product.text, createProductProvider(grounding).contribute("").text);

  const buyer = callRetrievalTool(tools, "get_market");
  assert.equal(buyer.found, true);
  assert.equal(buyer.text, createMarketProvider(market).contribute("").text);
});

test("an absent source returns an honest blank, never fabricated text", () => {
  const tools = createRetrievalTools({ grounding: { productName: "RodentRadar" } });
  const signal = callRetrievalTool(tools, "get_signal");
  assert.equal(signal.found, false);
  assert.equal(signal.text, null);
  assert.match(signal.note, /No external signal/i);
});

test("with no context at all, every tool reports blank rather than inventing a layer", () => {
  const tools = createRetrievalTools({});
  assert.equal(tools.length, EXPECTED_TOOLS.length);
  for (const tool of tools) {
    const result = tool.call();
    assert.equal(result.found, false, `${tool.name} should be blank with no source`);
    assert.equal(result.text, null);
  }
});

test("callRetrievalTool dispatches by name and handles an unknown tool without throwing", () => {
  const tools = createRetrievalTools({ market: { buyer: "PCOs" } });
  assert.equal(callRetrievalTool(tools, "get_market").found, true);

  const missing = callRetrievalTool(tools, "get_everything");
  assert.equal(missing.found, false);
  assert.match(missing.note, /Unknown retrieval tool/i);
  // The error names the real options so a confused agent can recover.
  assert.match(missing.note, /get_product/);
});
