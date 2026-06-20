// Gate node — venture doctrine: no send happens without founder approval.
// Execution pauses here. The graph runner returns pendingGates so the UI can
// surface the review queue. The founder approves/edits/rejects each item.
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

export async function run(node, upstream) {
  if (upstream.length === 0) {
    return {
      ok: true,
      items: [],
      pendingReview: false,
      meta: { awaitingReview: 0, note: "No items require review." },
    };
  }
  if (node.runtime?.approved) {
    return {
      ok: true,
      items: upstream.map((item) => ({
        ...item,
        gated: true,
        approved: true,
        approvalStatus: "approved",
      })),
      pendingReview: false,
      meta: { approved: upstream.length },
    };
  }
  // support both old (stage, upstream) and new (node, upstream) call signatures
  const items = upstream.map((item) => ({
    ...item,
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
