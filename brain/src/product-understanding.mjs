import path from "node:path";

// Grounding is the truth layer: it reports what the codebase IS — cited, reproducible
// reality — and nothing about what GTM it implies. There is deliberately no signal
// taxonomy and no channel recommendation here. Deciding what is GTM-relevant, and what
// channels a product should run, is ideation's job (rented intelligence), never a fixed
// pattern list baked into the host. A taxonomy in the truth layer is a cage: it pre-shapes
// the product into whatever categories we happened to hardcode. See docs/GOAL.md.

function dedupeCitations(citations) {
  const seen = new Set();
  const out = [];
  for (const citation of citations) {
    if (!citation || !citation.file) continue;
    const key = `${citation.file}:${citation.line}:${citation.label ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(citation);
  }
  return out;
}

// Assemble grounding from the deterministic scan report only. Pure function, no walk,
// no regex taxonomy — every field traces to a reproducible scan citation.
export function buildProductUnderstanding(report) {
  const repo = path.resolve(report.repo);
  const evidence = dedupeCitations([
    ...(report.analytics?.citations ?? []),
    ...(report.attribution?.citations ?? []),
    ...(report.winEvent?.citations ?? []),
  ]);
  return {
    generatedAt: new Date().toISOString(),
    productName: path.basename(repo),
    repository: repo,
    winEvent: report.winEvent,
    headline: report.headline,
    stack: report.stack ?? [],
    filesScanned: report.filesScanned,
    evidenceState: report.winEvent?.found ? "proven" : "blind",
    evidence,
    blindSpots: (report.gaps ?? []).map((gap) => ({
      id: gap.id,
      title: gap.title,
      summary: gap.summary,
      status: gap.status,
      evidence: gap.citations ?? [],
    })),
  };
}
