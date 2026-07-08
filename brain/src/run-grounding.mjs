// Product grounding for a run, so an agent step (especially a self-sourcing discovery entry) knows
// WHAT product it serves and WHO its ICP is — without it, a discovery agent has nothing to find. The
// headline carries the product description + positioning + ICP so the product provider conveys who
// to look for. Shared by every run path (the direct/streaming graph-run endpoints).
//
// `report` (optional) is the real scan report (workspace.report). When present, the grounding stops
// reporting a hardcoded BLIND win event and instead reflects what the scan actually proved: the win
// event with its cited emission, whether attribution is captured, the stack, and the top gaps with
// their file:line citations. Absent a report the grounding stays honestly blind — a run with no
// scanned workspace is ungrounded and says so, rather than inventing product facts.
export function buildRunGrounding(project, report = null) {
  const sc = project?.sharedContext ?? {};
  const repo = sc.repository ?? {};
  const icpDesc = sc.icp?.description || sc.icp?.buyer || sc.icp?.summary || "";
  const posDesc = sc.positioning?.promise || sc.positioning?.category || sc.positioning?.summary || "";
  // The plain-words product description. NOTE: report.headline is the scan's TRACKING-GAP verdict
  // ("attribution captured but missing from project_created"), NOT a product description — so it must
  // never seed the product headline. The real product picture comes from the scan's productContext
  // (README prose / manifest description), then the founder's shared-context repository headline.
  const pc = report?.productContext ?? null;
  const productDescription =
    pc?.readme || pc?.pkg?.description || repo.headline || sc.product?.description || "";
  const base = {
    productName: project?.name || sc.product?.name || pc?.pkg?.name || "product",
    headline: [productDescription, posDesc, icpDesc ? `Ideal customer: ${icpDesc}` : ""]
      .filter(Boolean).join(" — ") || project?.name || "",
    // The founder's own domain/keywords + sample-data shape, so a discovery agent can go read them.
    productContext: pc
      ? { keywords: pc.pkg?.keywords ?? [], sampleDataFiles: pc.sampleDataFiles ?? [] }
      : null,
  };
  if (!report) {
    // No scanned workspace — stay honestly blind rather than implying proven attribution.
    return {
      ...base,
      winEvent: repo.outcome ? { name: repo.outcome } : null,
      evidenceState: "blind",
      evidence: [],
    };
  }
  // Real scan report: reflect what the code actually proved, with the cited evidence the gate renders.
  const win = report.winEvent ?? null;
  // "blind" only when attribution truly isn't captured for the win event; otherwise the scan proved it.
  const carried = Array.isArray(win?.attributionProperties) ? win.attributionProperties : [];
  const evidenceState = carried.length > 0 ? "proven" : "blind";
  // The cited lines the model can point a claim at: win-event emissions, then the gap citations.
  const evidence = [
    ...(Array.isArray(win?.citations) ? win.citations : []),
    ...(Array.isArray(report.gaps)
      ? report.gaps.flatMap((g) => (Array.isArray(g?.citations) ? g.citations : []))
      : []),
  ].filter(Boolean);
  return {
    ...base,
    stack: Array.isArray(report.stack) ? report.stack : [],
    winEvent: win ? { name: win.name, found: win.found ?? false, attributionProperties: carried } : (repo.outcome ? { name: repo.outcome } : null),
    // The scanned gaps become named blind spots the reading agent can act on (each with its citation).
    blindSpots: Array.isArray(report.gaps)
      ? report.gaps.filter((g) => g && g.title).map((g) => ({ title: g.title, summary: g.summary ?? null }))
      : [],
    funnel: report.funnel ?? null,
    evidenceState,
    evidence,
  };
}
