import type { XYPosition } from "@xyflow/react";
import type { FirmArchitectureProjection } from "@/types";

const COLUMNS = {
  intent: 40,
  product: 400,
  system: 900,
  motion: 1220,
  campaign: 1600,
  bet: 1980,
  work: 2340,
  wall: 2680,
  outcome: 3040,
} as const;

const ACTIVE_Y = 300;
const OTHER_MOTION_Y = [80, 530, -140, 750];

export type AtlasGeneratedLayout = {
  positions: Map<string, XYPosition>;
  activeCampaignId: string | null;
  activeMotionId: string | null;
  activeY: number;
  betPosition: (campaignId: string | null, index: number) => XYPosition;
  workPosition: (campaignId: string | null, index: number) => XYPosition;
  outcomePosition: (campaignId: string | null, index: number) => XYPosition;
  wallPosition: XYPosition;
};

function activeCampaign(projection: FirmArchitectureProjection) {
  return projection.elements.find((element) => element.role === "campaign" && !element.bounds?.endsAt)
    ?? projection.elements.find((element) => element.role === "campaign")
    ?? null;
}

function motionRows(projection: FirmArchitectureProjection, primaryMotionId: string | null) {
  const motions = projection.elements.filter((element) => element.role === "motion");
  const primary = motions.find((motion) => motion.id === primaryMotionId) ?? null;
  const others = motions.filter((motion) => motion.id !== primary?.id);
  const positions = new Map<string, number>();
  if (primary) positions.set(primary.id, ACTIVE_Y);
  others.forEach((motion, index) => positions.set(motion.id, OTHER_MOTION_Y[index] ?? ACTIVE_Y + (index + 2) * 220));
  if (!primary) motions.forEach((motion, index) => positions.set(motion.id, 90 + index * 225));
  return positions;
}

export function generateAtlasLayout(projection: FirmArchitectureProjection): AtlasGeneratedLayout {
  const positions = new Map<string, XYPosition>();
  const campaign = activeCampaign(projection);
  const primaryMotionId = campaign?.primaryMotionId ?? campaign?.motionIds?.[0] ?? null;
  const motionY = motionRows(projection, primaryMotionId);
  const activeY = primaryMotionId ? motionY.get(primaryMotionId) ?? ACTIVE_Y : ACTIVE_Y;

  positions.set("intent", { x: COLUMNS.intent, y: 250 });
  projection.elements.filter((element) => element.role === "product-loop").forEach((element, index) => {
    positions.set(element.id, { x: COLUMNS.product, y: 205 + index * 280 });
  });
  projection.elements.filter((element) => element.role === "system").forEach((element, index) => {
    positions.set(element.id, { x: COLUMNS.system, y: 80 + index * 240 });
  });
  projection.elements.filter((element) => element.role === "motion").forEach((element) => {
    positions.set(element.id, { x: COLUMNS.motion, y: motionY.get(element.id) ?? ACTIVE_Y });
  });
  projection.elements.filter((element) => element.role === "campaign").forEach((element, index) => {
    const y = motionY.get(element.primaryMotionId ?? element.motionIds?.[0] ?? "") ?? activeY + index * 170;
    positions.set(element.id, { x: COLUMNS.campaign, y: y + 6 });
  });
  projection.elements.filter((element) => element.role === "concept").forEach((element, index) => {
    positions.set(element.id, { x: COLUMNS.product + (index % 3) * 215, y: 610 + Math.floor(index / 3) * 130 });
  });

  const campaignY = (campaignId: string | null) => campaignId ? positions.get(campaignId)?.y ?? activeY : activeY;
  return {
    positions,
    activeCampaignId: campaign?.id ?? null,
    activeMotionId: primaryMotionId,
    activeY,
    betPosition: (campaignId, index) => ({ x: COLUMNS.bet, y: campaignY(campaignId) + index * 170 }),
    workPosition: (campaignId, index) => ({ x: COLUMNS.work, y: campaignY(campaignId) - 70 + index * 155 }),
    outcomePosition: (_campaignId, index) => ({ x: COLUMNS.outcome + index * 330, y: activeY + index * 180 }),
    wallPosition: { x: COLUMNS.wall, y: activeY + 8 },
  };
}
