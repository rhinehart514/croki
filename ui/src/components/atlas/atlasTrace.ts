import type { FirmArchitectureElement, FirmArchitectureProjection, FirmLens } from "@/types";

function architectureId(value: string | null | undefined) {
  return String(value ?? "").replace(/^architecture:/, "").split("#")[0];
}

function campaignBetIds(campaign: FirmArchitectureElement) {
  return [campaign.governingBetId, ...(campaign.supportingBetIds ?? [])].filter((id): id is string => Boolean(id));
}

export function projectAtlasTrace(
  projection: FirmArchitectureProjection,
  lens: FirmLens,
  origin: string,
) {
  const ids = new Set<string>([origin]);
  const elements = projection.elements;
  const campaigns = new Set<FirmArchitectureElement>();
  const motions = new Set<FirmArchitectureElement>();
  const bets = new Set<string>();
  const addArchitecture = (id: string | null | undefined) => {
    const value = architectureId(id);
    if (value) ids.add(`architecture:${value}`);
  };
  const addMotion = (motion: FirmArchitectureElement | undefined) => {
    if (!motion) return;
    motions.add(motion);
    addArchitecture(motion.id);
    motion.systemIds?.forEach(addArchitecture);
    motion.productRefs?.forEach(addArchitecture);
  };
  const addCampaign = (campaign: FirmArchitectureElement | undefined) => {
    if (!campaign) return;
    campaigns.add(campaign);
    addArchitecture(campaign.id);
    const motionIds = [campaign.primaryMotionId, ...(campaign.motionIds ?? [])];
    motionIds.forEach((id) => addMotion(elements.find((element) => element.role === "motion" && element.id === id)));
    campaignBetIds(campaign).forEach((id) => bets.add(id));
  };

  const rawId = origin.replace(/^(architecture|bet|work|outcome):/, "");
  if (origin.startsWith("architecture:")) {
    const element = elements.find((candidate) => candidate.id === rawId);
    if (element?.role === "campaign") addCampaign(element);
    else if (element?.role === "motion") {
      addMotion(element);
      elements.filter((candidate) => candidate.role === "campaign" && (candidate.primaryMotionId === element.id || candidate.motionIds?.includes(element.id))).forEach(addCampaign);
    } else if (element?.role === "system") {
      elements.filter((candidate) => candidate.role === "motion" && candidate.systemIds?.includes(element.id)).forEach(addMotion);
      elements.filter((candidate) => candidate.role === "campaign" && [...motions].some((motion) => candidate.primaryMotionId === motion.id || candidate.motionIds?.includes(motion.id))).forEach(addCampaign);
    } else if (element?.role === "product-loop") {
      elements.filter((candidate) => candidate.role === "motion" && candidate.productRefs?.some((ref) => architectureId(ref) === element.id)).forEach(addMotion);
      elements.filter((candidate) => candidate.role === "campaign" && [...motions].some((motion) => candidate.primaryMotionId === motion.id || candidate.motionIds?.includes(motion.id))).forEach(addCampaign);
    }
  } else if (origin.startsWith("bet:")) bets.add(rawId);
  else if (origin.startsWith("work:")) {
    const join = projection.joins.work.find((candidate) => candidate.workRef === rawId || candidate.id === rawId);
    if (join?.betId) bets.add(join.betId);
    const campaign = elements.find((element) => element.role === "campaign" && element.id === join?.campaignId);
    addCampaign(campaign);
  } else if (origin.startsWith("outcome:")) {
    const join = projection.joins.outcomes.find((candidate) => candidate.outcomeId === rawId || candidate.id === rawId);
    if (join?.betId) bets.add(join.betId);
    join?.motionIds?.forEach((id) => addMotion(elements.find((element) => element.id === id)));
    join?.campaignIds?.forEach((id) => addCampaign(elements.find((element) => element.id === id)));
  }

  if (bets.size) elements.filter((element) => element.role === "campaign" && campaignBetIds(element).some((id) => bets.has(id))).forEach(addCampaign);
  for (const betId of bets) {
    if (!lens.bets.some((bet) => bet.id === betId)) continue;
    ids.add(`bet:${betId}`);
    const work = projection.joins.work.filter((join) => join.betId === betId || (join.campaignId && [...campaigns].some((campaign) => campaign.id === join.campaignId)));
    work.forEach((join) => {
      const ref = String(join.workRef ?? join.id ?? "");
      if (ref) ids.add(`work:${ref}`);
      if (projection.joins.wall.some((wall) => wall.workRef === ref)) ids.add("atlas:wall");
    });
    projection.joins.outcomes.filter((join) => join.betId === betId).forEach((join) => {
      const outcomeId = join.outcomeId ?? join.id;
      if (outcomeId) ids.add(`outcome:${outcomeId}`);
    });
  }
  return ids;
}
