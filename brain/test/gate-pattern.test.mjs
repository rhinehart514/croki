import { test } from "node:test";
import assert from "node:assert/strict";

import { classifyExceptions, applyPatternApproval, sampleForReview } from "../src/gate-pattern.mjs";

const batch = [
  { id: "a", draft: "Mike, your audit deadline is close — quick question.", confidence: 0.9 },
  { id: "b", draft: "Dana, congrats on the new sites.", confidence: 0.8 },
  { id: "c", draft: "Raj — noticed the FDA letter.", confidence: 0.3 }, // low confidence → exception
  { id: "d", message: "", needsReview: true }, // flagged + no body → exception
  { id: "e", draft: "Sam, saw your expansion.", confidence: 0.95 },
];

test("classifyExceptions flags low confidence, explicit review flags, and missing bodies", () => {
  const classified = classifyExceptions(batch);
  const byId = Object.fromEntries(classified.map((c) => [c.item.id, c]));
  assert.equal(byId.a.isException, false);
  assert.equal(byId.c.isException, true);
  assert.match(byId.c.reasons.join(" "), /low confidence/);
  assert.equal(byId.d.isException, true);
  assert.match(byId.d.reasons.join(" "), /flagged|no draft body/);
});

test("approving the pattern auto-approves clean items and holds only the exceptions", () => {
  const result = applyPatternApproval(batch, { decision: "approve" });
  // a, b, e approved on the pattern; c and d held for individual review.
  assert.equal(result.counts.approved, 3);
  assert.equal(result.counts.pending, 2);
  assert.equal(result.counts.exceptions, 2);
  assert.equal(result.pendingReview, true);
  const a = result.items.find((i) => i.id === "a");
  assert.equal(a.viaPattern, true);
  const c = result.items.find((i) => i.id === "c");
  assert.equal(c.approvalStatus, "pending");
});

test("rejecting the pattern holds the entire batch", () => {
  const result = applyPatternApproval(batch, { decision: "reject" });
  assert.equal(result.counts.approved, 0);
  assert.equal(result.counts.pending, batch.length);
});

test("a per-item decision overrides the pattern (approve an exception, reject a clean draft)", () => {
  const result = applyPatternApproval(batch, {
    decision: "approve",
    perItemDecisions: { c: { decision: "approve" }, a: { decision: "reject" } },
  });
  assert.equal(result.items.find((i) => i.id === "c").approvalStatus, "approved");
  assert.equal(result.items.find((i) => i.id === "a").approvalStatus, "rejected");
});

test("sampleForReview spreads across the batch and returns all when small", () => {
  assert.equal(sampleForReview(batch, 10).length, batch.length);
  const big = Array.from({ length: 100 }, (_, i) => ({ id: String(i) }));
  const sample = sampleForReview(big, 5);
  assert.equal(sample.length, 5);
  // Spread, not the first five.
  assert.deepEqual(sample.map((s) => s.index), [0, 20, 40, 60, 80]);
});
