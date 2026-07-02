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
  assert.match(byId.d.reasons.join(" "), /flagged|nothing to review/);
});

// Regression: composition is free-form, so a staged item may carry its content under ANY field
// names — a scheduled X post as { post_text, offer, scheduled_for }, not an outreach draft. The
// pattern must recognize that content (not flag it "nothing to review"), and an approved pattern
// must clear it, or every non-outreach pipeline dead-ends at the wall.
test("a non-outreach-shaped item (post_text) counts as reviewable and clears an approved pattern", () => {
  const posts = [
    { id: "p1", post_text: "Shipped the Drover morning queue today — one place to clear every venture's calls.", offer: "50% off for the first ten", scheduled_for: "2026-07-02T09:00:00Z", confidence: 0.9 },
    { id: "p2", confidence: 0.9 }, // truly nothing to read (only run bookkeeping) → exception
  ];
  const classified = classifyExceptions(posts);
  const byId = Object.fromEntries(classified.map((c) => [c.item.id, c]));
  assert.equal(byId.p1.isException, false, "a post with real text is not an exception");
  assert.equal(byId.p2.isException, true);
  assert.match(byId.p2.reasons.join(" "), /nothing to review/);

  const result = applyPatternApproval(posts, { decision: "approve" });
  const p1 = result.items.find((i) => i.id === "p1");
  assert.equal(p1.approvalStatus, "approved");
  assert.equal(p1.viaPattern, true);
  const p2 = result.items.find((i) => i.id === "p2");
  assert.equal(p2.approvalStatus, "pending", "the empty item still waits for the founder");
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
