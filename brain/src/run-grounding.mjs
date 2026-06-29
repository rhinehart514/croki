// Product grounding for a run, so an agent step (especially a self-sourcing discovery entry) knows
// WHAT product it serves and WHO its ICP is — without it, a discovery agent has nothing to find. The
// headline carries the product description + positioning + ICP so the product provider conveys who
// to look for. Shared by every run path (the direct/streaming graph-run endpoints).
export function buildRunGrounding(project) {
  const sc = project?.sharedContext ?? {};
  const repo = sc.repository ?? {};
  const icpDesc = sc.icp?.description || sc.icp?.buyer || sc.icp?.summary || "";
  const posDesc = sc.positioning?.promise || sc.positioning?.category || sc.positioning?.summary || "";
  return {
    productName: project?.name || sc.product?.name || "product",
    headline: [repo.headline || sc.product?.description, posDesc, icpDesc ? `Ideal customer: ${icpDesc}` : ""]
      .filter(Boolean).join(" — ") || project?.name || "",
    winEvent: repo.outcome ? { name: repo.outcome } : null,
    evidenceState: "blind",
    evidence: [],
  };
}
