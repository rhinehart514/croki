// Pattern + exception gating (E4.1 / E4.2).
//
// At volume the per-item gate becomes a rubber stamp — nobody honestly reviews 500 drafts, so they
// approve-all and the wall is gone. Instead the founder approves a PATTERN (the recipe) after
// reading a representative SAMPLE, and only the items that DEVIATE — the exceptions — are kicked
// back for individual review. That is how "vibe up to the gate, never past it" survives 500 sends.
//
// Pure and deterministic (ENGINEERING.md: code answers when it can). These functions decide fates;
// they never send. The gate connector wires them in behind an explicit pattern decision, so the
// proven per-item path is untouched.

import { itemReviewText } from "./memory.mjs";

// Open content: composition is free-form, so a staged item may carry its work under ANY field
// names (a post as { post_text }, a page as { headline }…), not just the outreach draft aliases.
// The pattern can vouch for anything the founder could actually read at the gate.
function hasReviewableContent(item) {
  return itemReviewText(item) !== "";
}

// An item is an exception when the founder genuinely needs to look at it individually: the model
// was unsure, it was explicitly flagged, or it carries nothing the pattern can vouch for.
export function classifyExceptions(items = [], { confidenceThreshold = 0.5 } = {}) {
  return (Array.isArray(items) ? items : []).map((item, index) => {
    const reasons = [];
    const confidence = typeof item?.confidence === "number" ? item.confidence : null;
    if (confidence !== null && confidence < confidenceThreshold) reasons.push(`low confidence (${confidence})`);
    if (item?.needsReview === true || item?.exception === true) reasons.push("flagged for review");
    if (!hasReviewableContent(item)) reasons.push("nothing to review");
    return { index, item, isException: reasons.length > 0, reasons };
  });
}

// Decide each item's fate given a pattern decision and the classified batch.
//  - pattern approved: non-exceptions are approved ON THE PATTERN; exceptions stay pending unless
//    they carry their own per-item decision.
//  - pattern rejected: nothing is approved; the whole batch returns to the founder.
// A per-item decision always overrides the pattern, so the founder can reject a specific draft the
// pattern would have approved, or approve a specific exception.
export function applyPatternApproval(
  items,
  { decision = "approve", confidenceThreshold, perItemDecisions = {} } = {},
  keyOf = (item, index) => item?.id ?? item?.gtmActionId ?? String(index),
) {
  const classified = classifyExceptions(items, confidenceThreshold != null ? { confidenceThreshold } : {});
  const patternApproved = decision === "approve";

  const decided = classified.map(({ item, isException, reasons, index }) => {
    const key = keyOf(item, index);
    const explicit = perItemDecisions[key];
    if (explicit && (explicit.decision === "approve" || explicit.decision === "reject")) {
      const approved = explicit.decision === "approve";
      return { ...item, approvalStatus: approved ? "approved" : "rejected", approved, viaPattern: false, isException, reasons };
    }
    if (!patternApproved) {
      return { ...item, approvalStatus: "pending", approved: false, viaPattern: false, isException, reasons };
    }
    if (isException) {
      return { ...item, approvalStatus: "pending", approved: false, viaPattern: false, isException: true, reasons };
    }
    return { ...item, approvalStatus: "approved", approved: true, viaPattern: true, isException: false, reasons: [] };
  });

  const counts = {
    total: decided.length,
    approved: decided.filter((r) => r.approvalStatus === "approved").length,
    pending: decided.filter((r) => r.approvalStatus === "pending").length,
    rejected: decided.filter((r) => r.approvalStatus === "rejected").length,
    exceptions: classified.filter((c) => c.isException).length,
  };
  return { items: decided, counts, pendingReview: counts.pending > 0 };
}

// Pick a representative sample for the founder to read before approving the pattern. Spread evenly
// across the batch (not the first N) so the sample is not biased toward one slice of the imports.
export function sampleForReview(items = [], size = 5) {
  const arr = Array.isArray(items) ? items : [];
  if (arr.length <= size) return arr.map((item, index) => ({ index, item }));
  const step = arr.length / size;
  const picks = [];
  for (let k = 0; k < size; k += 1) {
    const index = Math.floor(k * step);
    picks.push({ index, item: arr[index] });
  }
  return picks;
}
