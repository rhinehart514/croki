// lensOutline.ts — the lens's keyboard/outline data: one row per teammate and per bet, grouped the
// way the lens groups them: crew first, then bets by position.

import type { FirmBet, FirmCrewMember } from "@/types";
import { betAnchorKey, crewAnchorKey, type LensAnchorKey } from "@/lib/lensLayout";

export type LensOutlineRow = {
  anchorKey: LensAnchorKey;
  label: string;
  detail: string;
  group: "Crew" | "Live" | "At the wall" | "Ended";
};

const GROUP_PRIORITY: LensOutlineRow["group"][] = ["Crew", "Live", "At the wall", "Ended"];

function betGroup(bet: FirmBet): LensOutlineRow["group"] {
  if (bet.position === "at-wall") return "At the wall";
  if (bet.position === "ended") return "Ended";
  return "Live";
}

function betDetail(bet: FirmBet): string {
  const parts: string[] = [];
  if (bet.stagedCount > 0) parts.push(`${bet.stagedCount} staged`);
  if (bet.latestOutcome) parts.push("market returned");
  if (bet.forkedFrom) parts.push("forked");
  return parts.join(" · ") || "No activity yet";
}

export function buildLensOutline(crew: FirmCrewMember[], bets: FirmBet[]): LensOutlineRow[] {
  const rows: LensOutlineRow[] = crew.map((member) => ({
    anchorKey: crewAnchorKey(member.ref),
    label: (member.soul?.name && typeof member.soul.name === "string" ? member.soul.name : member.ref),
    detail: "On the crew",
    group: "Crew",
  }));
  for (const bet of bets) {
    rows.push({
      anchorKey: betAnchorKey(bet.id),
      label: bet.intent,
      detail: betDetail(bet),
      group: betGroup(bet),
    });
  }
  return rows.sort((a, b) => GROUP_PRIORITY.indexOf(a.group) - GROUP_PRIORITY.indexOf(b.group));
}
