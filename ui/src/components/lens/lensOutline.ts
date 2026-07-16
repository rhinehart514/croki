// lensOutline.ts — the lens's keyboard/outline data: one row per teammate and per bet, grouped the
// way the lens groups them: crew first, then bets by position.

import type { FirmBet, FirmConfiguration, FirmCrewMember } from "@/types";
import { betAnchorKey, crewAnchorKey, type LensAnchorKey } from "@/lib/lensLayout";
import { configuredParticipantName } from "@/components/firm/teammateDisplay";
import type { WorkyardCard } from "./workyardProjection";

export type LensOutlineRow = {
  id: string;
  anchorKey: LensAnchorKey;
  betId?: string;
  workRef?: string;
  depth: 0 | 1;
  label: string;
  detail: string;
  group: "Crew" | "Underway" | "Needs your hand" | "Ended";
};

const GROUP_PRIORITY: LensOutlineRow["group"][] = ["Crew", "Underway", "Needs your hand", "Ended"];

function betGroup(bet: FirmBet): LensOutlineRow["group"] {
  if (bet.position === "at-wall") return "Needs your hand";
  if (bet.position === "ended") return "Ended";
  return "Underway";
}

function betDetail(bet: FirmBet): string {
  const parts: string[] = [];
  if (bet.stagedCount > 0) parts.push(`${bet.stagedCount} prepared`);
  if (bet.latestOutcome) parts.push("market returned");
  if (bet.forkedFrom) parts.push("continued from earlier work");
  return parts.join(" · ") || "No activity yet";
}

export function buildLensOutline(
  crew: FirmCrewMember[],
  bets: FirmBet[],
  configuration?: FirmConfiguration,
  workByBet: ReadonlyMap<string, WorkyardCard[]> = new Map(),
): LensOutlineRow[] {
  const rows: LensOutlineRow[] = crew.map((member) => ({
    id: crewAnchorKey(member.ref),
    anchorKey: crewAnchorKey(member.ref),
    depth: 0,
    label: configuredParticipantName(configuration, member.ref, member, member.ref),
    detail: "On the crew",
    group: "Crew",
  }));
  for (const bet of bets) {
    rows.push({
      id: betAnchorKey(bet.id),
      anchorKey: betAnchorKey(bet.id),
      betId: bet.id,
      depth: 0,
      label: bet.intent,
      detail: betDetail(bet),
      group: betGroup(bet),
    });
    for (const card of workByBet.get(bet.id) ?? []) {
      if (!card.workRef) continue;
      const state = [card.wallItems.length ? "needs your hand" : null, card.outcomes.length ? "market returned" : null]
        .filter(Boolean)
        .join(" · ");
      rows.push({
        id: `work:${bet.id}:${card.workRef}`,
        anchorKey: betAnchorKey(bet.id),
        betId: bet.id,
        workRef: card.workRef,
        depth: 1,
        label: card.title,
        detail: state || "Exact work",
        group: betGroup(bet),
      });
    }
  }
  return rows.sort((a, b) => GROUP_PRIORITY.indexOf(a.group) - GROUP_PRIORITY.indexOf(b.group));
}
