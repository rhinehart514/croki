import { test } from "node:test";
import assert from "node:assert/strict";

import { detectToolCreationSuggestions } from "../src/feedback-ledger.mjs";

test("a recurring failure pattern emits a tool-creation suggestion", () => {
  const signals = [
    { type: "RunFailure", summary: 'Failed to enrich "Acme Corp" — no scorer available' },
    { type: "RunFailure", summary: 'Failed to enrich "Globex Inc" — no scorer available' },
    { type: "RunFailure", summary: 'Failed to enrich "Initech 42" — no scorer available' },
    { type: "FounderApproval", summary: "Approved Mike outreach" }, // not a failure -> ignored
  ];
  const suggestions = detectToolCreationSuggestions(signals, { threshold: 3 });
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].count, 3);
  assert.match(suggestions[0].reason, /missing capability/);
  assert.ok(suggestions[0].signature.includes("enrich"));
});

test("distinct failures don't collapse into one suggestion", () => {
  const signals = [
    { type: "RunFailure", summary: "Failed to enrich the company record" },
    { type: "RunFailure", summary: "Failed to enrich the company record" },
    { type: "RunFailure", summary: "Failed to score the lead" },
  ];
  // enrich appears twice, score once -> nothing reaches threshold 3
  assert.equal(detectToolCreationSuggestions(signals, { threshold: 3 }).length, 0);
  // at threshold 2 only the enrich pattern qualifies
  const two = detectToolCreationSuggestions(signals, { threshold: 2 });
  assert.equal(two.length, 1);
  assert.ok(two[0].signature.includes("enrich"));
});

test("only RunFailure signals are considered", () => {
  const signals = [
    { type: "FounderRejection", summary: "Rejected the draft" },
    { type: "FounderRejection", summary: "Rejected the draft" },
    { type: "FounderRejection", summary: "Rejected the draft" },
  ];
  assert.equal(detectToolCreationSuggestions(signals, { threshold: 3 }).length, 0);
});

test("invalid input throws", () => {
  assert.throws(() => detectToolCreationSuggestions("nope"));
  assert.throws(() => detectToolCreationSuggestions([], { threshold: 0 }));
});
