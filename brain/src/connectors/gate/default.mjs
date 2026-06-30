// Gate node — venture doctrine: no send happens without founder approval.
// Execution pauses here. The graph runner returns pendingGates so the UI can
// surface the review queue. The founder approves/edits/rejects each item.
//
// The per-item decisions captured here are the loop's real learning signal:
// they are stamped onto items, recorded in the run ledger, and read back into
// the next run by memory.mjs. See brain/src/memory.mjs.
import { draftKey } from "../../memory.mjs";
import { applyPatternApproval } from "../../gate-pattern.mjs";
import crypto from "node:crypto";

export const meta = {
  id: "default",
  name: "Founder review",
  category: "gate",
  // keep legacy field for backward compat
  type: "gate",
  description: "Pauses execution for founder approval. Items can be edited inline before approval.",
  envKey: null,
  approvalRequired: ["continue"],
};

function actionId(node, item, index, context) {
  if (item.gtmActionId) return item.gtmActionId;
  const originRunId = context?.__run?.originRunId || "untracked-run";
  const identity = draftKey(item) || item.draft || item.message || String(index);
  const digest = crypto
    .createHash("sha256")
    .update(`${originRunId}:${node.id}:${identity}`)
    .digest("hex")
    .slice(0, 24);
  return `gtm-${digest}`;
}

export async function run(node, upstream, context) {
  if (upstream.length === 0) {
    return {
      ok: true,
      items: [],
      pendingReview: false,
      meta: { awaitingReview: 0, note: "No items require review." },
    };
  }
  // Pattern + exception gating (E4.1/E4.2): auto-approve the clean items and hold ONLY the exceptions
  // (low confidence, flagged, no body) for individual review. This is how the wall survives 500 sends
  // without becoming a stamp. There are two sources of a pattern decision, in priority order:
  //   1. node.runtime.pattern — an explicit per-run founder pattern decision (the founder read a
  //      sample and blessed THIS run's batch).
  //   2. The channel's STANDING autonomy pattern — a channel the founder promoted up the ladder
  //      ("trusted"/"autonomous") carries a blessed pattern on its gate config (stamped by
  //      project-store's promoteChannel). That promotion is itself an explicit, revocable founder
  //      approval, applied as a standing rule, so auto-apply it here.
  // A draft channel has neither and falls through to today's per-item hold-everything path below.
  const runtimePattern = node.runtime?.pattern;
  const autonomy = node.config?.autonomy ?? null;
  const blessed = node.config?.blessedPattern;
  const standingPattern =
    (autonomy === "trusted" || autonomy === "autonomous") && blessed && typeof blessed === "object"
      ? blessed
      : null;
  const pattern =
    runtimePattern && typeof runtimePattern === "object"
    && (runtimePattern.decision === "approve" || runtimePattern.decision === "reject")
      ? runtimePattern
      : standingPattern;
  if (pattern && typeof pattern === "object" && (pattern.decision === "approve" || pattern.decision === "reject")) {
    const applied = applyPatternApproval(
      upstream,
      { decision: pattern.decision, confidenceThreshold: pattern.confidenceThreshold, perItemDecisions: node.runtime?.decisions ?? {} },
      (item, index) => draftKey(item) || actionId(node, item, index, context),
    );
    const items = applied.items.map((item, index) => ({
      ...item,
      gtmActionId: item.gtmActionId ?? actionId(node, item, index, context),
      gated: true,
    }));
    return {
      ok: true,
      items,
      pendingReview: applied.pendingReview,
      meta: {
        mode: pattern === standingPattern ? "autonomy" : "pattern",
        autonomy,
        ...applied.counts,
        awaitingReview: applied.counts.pending,
      },
    };
  }

  // Per-item founder decisions (approve / reject / edit) — the real learning
  // signal. Keyed by draftKey(item). Undecided items stay pending.
  const decisions = node.runtime?.decisions;
  if (decisions && typeof decisions === "object") {
    let pending = 0;
    const items = upstream.map((item, index) => {
      const gtmActionId = actionId(node, item, index, context);
      const d = decisions[draftKey(item)];
      if (!d || (d.decision !== "approve" && d.decision !== "reject")) {
        pending += 1;
        return { ...item, gtmActionId, gated: true, approved: false, approvalStatus: "pending" };
      }
      if (d.decision === "reject") {
        return { ...item, gtmActionId, gated: true, approved: false, approvalStatus: "rejected" };
      }
      const edited = typeof d.editedDraft === "string" && d.editedDraft.trim();
      return {
        ...item,
        gtmActionId,
        gated: true,
        approved: true,
        approvalStatus: "approved",
        // The original lives in draft (legacy) or draft_note (agent drafter) — capture whichever as
        // the "before" and write the founder's rewrite to both so the edit banks as a before/after pair.
        ...(edited ? { editedFrom: item.draft ?? item.draft_note ?? null, draft: d.editedDraft, draft_note: d.editedDraft } : {}),
      };
    });
    return {
      ok: true,
      items,
      pendingReview: pending > 0,
      meta: {
        approved: items.filter((i) => i.approvalStatus === "approved").length,
        rejected: items.filter((i) => i.approvalStatus === "rejected").length,
        awaitingReview: pending,
      },
    };
  }

  if (node.runtime?.approved) {
    return {
      ok: true,
      items: upstream.map((item, index) => ({
        ...item,
        gtmActionId: actionId(node, item, index, context),
        gated: true,
        approved: true,
        approvalStatus: "approved",
      })),
      pendingReview: false,
      meta: { approved: upstream.length },
    };
  }
  // support both old (stage, upstream) and new (node, upstream) call signatures
  const items = upstream.map((item, index) => ({
    ...item,
    gtmActionId: actionId(node, item, index, context),
    gated: true,
    approved: false,
    approvalStatus: "pending",
  }));
  return {
    ok: true,
    items,
    pendingReview: true,
    meta: { awaitingReview: items.length },
  };
}
