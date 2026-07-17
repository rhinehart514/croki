// Ordinary-language impact — the replacement for operating a spatial graph. For a direction's work,
// read the venture relationship projection and say, in sentences, what else this touches: other work on
// the same capability or campaign, a claim it contradicts, a shared dependency, a capability it still
// needs. The projection's pressure.detail strings are already founder-worded. No graph to navigate.
import type { FirmArchitectureProjection, FirmBet, FirmLens } from "@/types";

export type ImpactLine = { kind: "affects" | "contradiction" | "shared" | "missing"; text: string };

export function buildDirectionImpact(
  betIds: string[],
  lens: FirmLens,
  projection: FirmArchitectureProjection | null,
): ImpactLine[] {
  if (!projection || betIds.length === 0) return [];
  const own = new Set(betIds);
  const memberBets = lens.bets.filter((bet: FirmBet) => own.has(bet.id));

  const elementIds = new Set<string>();
  const campaignIds = new Set<string>();
  for (const bet of memberBets) {
    if (bet.architectureTarget?.id) elementIds.add(bet.architectureTarget.id);
    if (bet.campaignId) campaignIds.add(bet.campaignId);
  }
  if (elementIds.size === 0 && campaignIds.size === 0) return [];

  const elementName = (id: string) => projection.elements.find((element) => element.id === id)?.name ?? null;
  const lines: ImpactLine[] = [];
  const seen = new Set<string>();
  const add = (line: ImpactLine) => { if (!seen.has(line.text)) { seen.add(line.text); lines.push(line); } };

  // Other work touching the same element or campaign — the neighbours, named, not drawn.
  const joins = [...(projection.joins?.bets ?? []), ...(projection.joins?.work ?? [])];
  for (const join of joins) {
    if (join.betId && own.has(join.betId)) continue;
    const touches =
      (join.architectureId != null && elementIds.has(join.architectureId)) ||
      (join.campaignId != null && campaignIds.has(join.campaignId)) ||
      (join.campaignIds ?? []).some((id) => campaignIds.has(id));
    if (!touches) continue;
    const title = join.title?.trim();
    if (title) add({ kind: "affects", text: `Also affects ${title}.` });
  }

  // Contradictions, shared dependencies, and missing capabilities the founder should weigh.
  for (const pressure of projection.pressure ?? []) {
    const subject = pressure.subjectId ?? pressure.subjectRef?.replace(/^architecture:/, "") ?? null;
    if (!subject || !elementIds.has(subject)) continue;
    const detail = pressure.detail?.trim();
    if (pressure.reason === "founder-assertion-conflict" || pressure.reason === "challenged-claim") {
      add({ kind: "contradiction", text: detail ?? `A claim on ${elementName(subject) ?? "this"} is being challenged.` });
    } else if (pressure.reason === "shared-system-contention") {
      add({ kind: "shared", text: detail ?? "This shares a capability other work depends on." });
    } else if (pressure.reason === "missing-product-capability" || pressure.reason === "missing-evidence") {
      add({ kind: "missing", text: detail ?? "This needs a capability that isn't proven yet." });
    }
  }

  return lines.slice(0, 6);
}
