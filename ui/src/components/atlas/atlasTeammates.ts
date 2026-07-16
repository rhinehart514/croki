import type { FirmArchitectureProjection, FirmBet, FirmLens } from "@/types";

function campaignBetIds(projection: FirmArchitectureProjection, architectureId: string) {
  const element = projection.elements.find((candidate) => candidate.id === architectureId);
  if (!element) return new Set<string>();
  const campaigns = element.role === "campaign"
    ? [element]
    : projection.elements.filter((candidate) => {
      if (candidate.role !== "campaign") return false;
      if (element.role === "motion") return candidate.primaryMotionId === element.id || candidate.motionIds?.includes(element.id);
      if (element.role === "system") {
        const motionIds = projection.elements.filter((motion) => motion.role === "motion" && motion.systemIds?.includes(element.id)).map((motion) => motion.id);
        return motionIds.some((id) => candidate.primaryMotionId === id || candidate.motionIds?.includes(id));
      }
      if (element.role === "product-loop") {
        const motionIds = projection.elements.filter((motion) => motion.role === "motion" && motion.productRefs?.includes(element.id)).map((motion) => motion.id);
        return motionIds.some((id) => candidate.primaryMotionId === id || candidate.motionIds?.includes(id));
      }
      return false;
    });
  return new Set(campaigns.flatMap((campaign) => [campaign.governingBetId, ...(campaign.supportingBetIds ?? [])]).filter((id): id is string => Boolean(id)));
}

export function relatedAtlasBets(projection: FirmArchitectureProjection, lens: FirmLens, nodeId: string) {
  if (nodeId.startsWith("bet:")) return lens.bets.filter((bet) => bet.id === nodeId.slice("bet:".length));
  const architectureId = nodeId.startsWith("architecture:") ? nodeId.slice("architecture:".length) : nodeId;
  const ids = campaignBetIds(projection, architectureId);
  return lens.bets.filter((bet) => ids.has(bet.id));
}

function refsFromBets(bets: FirmBet[]) {
  const refs = bets.flatMap((bet) => [
    bet.teammateRef,
    ...bet.staged.flatMap((work) => [...(work.ownerRefs ?? []), ...(work.contributorRefs ?? [])]),
  ]).filter((ref): ref is string => Boolean(ref));
  return [...new Set(refs)];
}

function nameFor(lens: FirmLens, ref: string) {
  return lens.configuration?.agents.find((agent) => agent.ref === ref)?.name
    ?? lens.crew.find((member) => member.ref === ref)?.soul?.name
    ?? ref.replaceAll("-", " ");
}

export function atlasTeammates(projection: FirmArchitectureProjection, lens: FirmLens, nodeId: string) {
  const related = relatedAtlasBets(projection, lens, nodeId);
  const refs = refsFromBets(related);
  const visibleRefs = refs.length ? refs : lens.crew.map((member) => member.ref);
  return visibleRefs.map((ref) => ({ ref, name: nameFor(lens, ref) }));
}
