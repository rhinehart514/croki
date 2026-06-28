import { test } from "node:test";
import assert from "node:assert/strict";

import { queryTaste } from "../src/memory.mjs";
import { createRetrievalTools, callRetrievalTool, listRetrievalTools } from "../src/context/retrieval-tools.mjs";

const PROFILE = {
  approved: [
    "Loved your work on the rodent dashboard — quick question about audit prep",
    "Saw your team expanded to three new commercial food sites",
  ],
  rejected: [
    "Hi there! I wanted to reach out about our amazing product",
    "Unlock 10x ROI with our solution today",
  ],
  edits: [{ from: "Dear Sir/Madam, I am writing to introduce", to: "Hey Mike, noticed your audit deadline is close" }],
  counts: { approved: 2, rejected: 2, edits: 1 },
};

test("queryTaste returns a relevant slice, not the whole history", () => {
  const result = queryTaste(PROFILE, { question: "audit deadline tone" });
  assert.equal(result.meta.mode, "query");
  // The audit-related approval and the audit edit surface; the unrelated 'food sites' approval does not.
  assert.match(result.text, /audit prep/);
  assert.match(result.text, /audit deadline/);
  assert.doesNotMatch(result.text, /three new commercial food sites/);
});

test("queryTaste with no question falls back to the full render (backward-compatible)", () => {
  const result = queryTaste(PROFILE, {});
  assert.equal(result.meta.mode, "full");
  assert.match(result.text, /three new commercial food sites/);
});

test("queryTaste reports an honest no-match when nothing (and no edits) apply", () => {
  const noEdits = { ...PROFILE, edits: [], counts: { ...PROFILE.counts, edits: 0 } };
  const result = queryTaste(noEdits, { question: "blockchain cryptocurrency airdrop" });
  assert.equal(result.meta.mode, "no-match");
  assert.match(result.text, /No prior taste decisions match/);
});

test("the get_taste tool accepts a question and advertises it in its schema", () => {
  const tools = createRetrievalTools({ __memory: PROFILE });

  const sliced = callRetrievalTool(tools, "get_taste", { question: "audit" });
  assert.equal(sliced.found, true);
  assert.match(sliced.text, /audit/);
  assert.equal(sliced.meta.mode, "query");

  const full = callRetrievalTool(tools, "get_taste");
  assert.equal(full.found, true);
  assert.match(full.text, /food sites/);

  // Only the queryable tool exposes a `question` arg; plain get_* tools stay arg-free.
  const catalog = listRetrievalTools();
  const taste = catalog.find((t) => t.name === "get_taste");
  const product = catalog.find((t) => t.name === "get_product");
  assert.ok(taste.inputSchema.properties.question, "get_taste must advertise question");
  assert.deepEqual(product.inputSchema.properties, {}, "get_product takes no args");
});
