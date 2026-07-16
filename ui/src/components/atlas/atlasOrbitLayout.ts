import type { XYPosition } from "@xyflow/react";
import type { FirmArchitectureProjection, FirmBet, FirmLens } from "@/types";
import type { AtlasDecisionBand, AtlasOrbitSector } from "./atlasTypes";

export const ORBIT_CENTER = { x: 760, y: 440 };
export const ORBIT_FIELD_SIZE = { width: 1520, height: 880 };
export const ORBIT_WALL_X = 1192;

export const ORBIT_BET_CARD = {
  width: 180,
  height: 180,
  gap: 16,
} as const;

export const ORBIT_RADII: Record<AtlasDecisionBand, number> = {
  "near-intent": 280,
  drifting: 350,
  "approaching-wall": 445,
  settled: 400,
};

function campaignMotion(projection: FirmArchitectureProjection | null, betId: string) {
  if (!projection) return null;
  const joinedCampaignIds = (projection.joins?.bets ?? [])
    .filter((join) => join.betId === betId && join.campaignId)
    .map((join) => join.campaignId as string);
  const campaign = projection.elements.find((element) => element.role === "campaign" && (
    element.governingBetId === betId || element.supportingBetIds?.includes(betId) || joinedCampaignIds.includes(element.id)
  ));
  return campaign?.primaryMotionId ?? campaign?.motionIds?.[0] ?? null;
}

export function orbitCardsOverlap(a: XYPosition, b: XYPosition) {
  return Math.abs(a.x - b.x) < ORBIT_BET_CARD.width + ORBIT_BET_CARD.gap
    && Math.abs(a.y - b.y) < ORBIT_BET_CARD.height + ORBIT_BET_CARD.gap;
}

function polarPosition(angle: number, radius: number): XYPosition {
  const radians = angle * Math.PI / 180;
  return {
    x: ORBIT_CENTER.x + Math.cos(radians) * radius,
    y: ORBIT_CENTER.y + Math.sin(radians) * radius,
  };
}

function collisionFreePosition(
  preferredAngle: number,
  radius: number,
  sector: AtlasOrbitSector,
  occupied: XYPosition[],
) {
  const minAngle = sector.startAngle + 12;
  const maxAngle = sector.endAngle - 12;
  const angleOffsets = [0, -6, 6, -12, 12, -18, 18, -24, 24, -30, 30, -36, 36];
  const radiusOffsets = [0, -24, 24, -42, 42];

  for (const angleOffset of angleOffsets) {
    const angle = Math.min(maxAngle, Math.max(minAngle, preferredAngle + angleOffset));
    for (const radiusOffset of radiusOffsets) {
      const candidate = polarPosition(angle, radius + radiusOffset);
      if (!occupied.some((position) => orbitCardsOverlap(candidate, position))) return candidate;
    }
  }

  return polarPosition(preferredAngle, radius);
}

export function decisionBandForBet(bet: FirmBet, lens: FirmLens): AtlasDecisionBand {
  if (bet.position === "at-wall" || lens.wallItems?.some((item) => item.betId === bet.id && !item.decision)) return "approaching-wall";
  if (bet.position === "ended" || bet.latestOutcome || lens.outcomes?.some((outcome) => outcome.betId === bet.id)) return "settled";
  const meaningfulEvents = (bet.events ?? []).filter((event) => event.type !== "bet_forked");
  if (bet.staged.length || bet.evidence.length || meaningfulEvents.length) return "drifting";
  return "near-intent";
}

export function projectOrbitLayout(projection: FirmArchitectureProjection | null, lens: FirmLens) {
  const motions = projection?.elements.filter((element) => element.role === "motion") ?? [];
  const motionByBet = new Map(lens.bets.map((bet) => [bet.id, campaignMotion(projection, bet.id)]));
  const motionsWithBets = motions.filter((motion) => [...motionByBet.values()].includes(motion.id));
  const visibleMotions = motionsWithBets.length ? motionsWithBets : motions;
  const needsUngrouped = lens.bets.some((bet) => !motionByBet.get(bet.id));
  const entries = [
    ...visibleMotions.map((motion) => ({
      id: motion.id,
      label: motion.name,
      betCount: lens.bets.filter((bet) => motionByBet.get(bet.id) === motion.id).length,
    })),
    ...(needsUngrouped || !visibleMotions.length ? [{
      id: "ungrouped",
      label: "No path named",
      betCount: lens.bets.filter((bet) => !motionByBet.get(bet.id)).length,
    }] : []),
  ];
  const totalBets = entries.reduce((sum, entry) => sum + Math.max(1, entry.betCount), 0);
  let sectorCursor = -135;
  const sectors: AtlasOrbitSector[] = entries.map((entry) => {
    const startAngle = sectorCursor;
    sectorCursor += 360 * Math.max(1, entry.betCount) / Math.max(1, totalBets);
    return { id: entry.id, label: entry.label, startAngle, endAngle: sectorCursor };
  });
  const positions = new Map<string, XYPosition>();
  const bands = new Map<string, AtlasDecisionBand>();
  const labels = new Map<string, string>();
  const occupied: XYPosition[] = [];

  for (const sector of sectors) {
    const sectorBets = lens.bets.filter((bet) => (motionByBet.get(bet.id) ?? "ungrouped") === sector.id);
    sectorBets.forEach((bet, index) => {
      const band = decisionBandForBet(bet, lens);
      const sectorAngle = sector.endAngle - sector.startAngle;
      const spread = Math.max(10, sectorAngle - 32);
      const angle = sectorBets.length === 1
        ? (sector.startAngle + sector.endAngle) / 2
        : (sector.startAngle + sector.endAngle) / 2 - spread / 2 + (spread * index) / (sectorBets.length - 1);
      const radius = ORBIT_RADII[band];
      const position = collisionFreePosition(angle, radius, sector, occupied);
      positions.set(bet.id, position);
      occupied.push(position);
      bands.set(bet.id, band);
      labels.set(bet.id, sector.label);
    });
  }
  return { sectors, positions, bands, labels };
}
