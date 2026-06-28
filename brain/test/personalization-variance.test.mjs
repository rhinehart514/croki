import { test } from "node:test";
import assert from "node:assert/strict";

import { assessVariance } from "../src/personalization-variance.mjs";

test("flags a templated batch — one letter sent many times", () => {
  const drafts = [
    "Hi there, I wanted to reach out about our amazing product that delivers 10x ROI for your team.",
    "Hi there, I wanted to reach out about our amazing product that delivers 10x ROI for your team.",
    "Hi there, I wanted to reach out about our amazing product that delivers 10x ROI for your business.",
  ];
  const result = assessVariance(drafts);
  assert.equal(result.templated, true);
  assert.ok(result.meanSimilarity >= 0.6, `expected high similarity, got ${result.meanSimilarity}`);
  assert.ok(result.sharedOpenings >= 2);
});

test("passes a genuinely varied batch anchored on distinct triggers", () => {
  const drafts = [
    "Mike — saw your Buffalo warehouse just passed its third audit. Curious how you handled the rodent logs.",
    "Dana, your bakery expansion to two new sites is wild. Does per-location pest monitoring slow you down?",
    "Hey Raj, noticed the FDA letter your distributor got last month. Are your sites covered for surprise checks?",
  ];
  const result = assessVariance(drafts);
  assert.equal(result.templated, false);
  assert.ok(result.meanSimilarity < 0.6, `expected low similarity, got ${result.meanSimilarity}`);
  assert.equal(result.sharedOpenings, 0);
});

test("needs at least two drafts to judge", () => {
  assert.equal(assessVariance([]).note, "No drafts to assess.");
  assert.equal(assessVariance(["only one"]).templated, false);
});

test("accepts result objects, not just raw strings", () => {
  const result = assessVariance([
    { draft: "Mike, your audit deadline is close — quick question about your logs." },
    { text: "Dana, congrats on the new bakery sites — how do you track pests across them?" },
  ]);
  assert.equal(result.count, 2);
  assert.equal(result.templated, false);
});
