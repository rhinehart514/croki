// lensLayout.ts — the lens's fallback layout: where crew and bets sit BEFORE the founder has ever
// dragged anything. This is a simple deterministic grid, because the lens owns placement memory and
// nothing else (FIRM-SPEC.md "The one lens"): the founder's own drags are the real layout; this only
// gives the canvas somewhere honest to start.
//
// Crew sit in one row along the top (their working position). Each bet sits beneath the teammate that
// forked it, offset down its own fork lineage depth so a chain of forks reads as a vertical thread —
// the "lineage thread to forkedFrom" the task names — without computing a real longest-path rank.

import type { FirmBet, FirmCrewMember } from "@/types";

const CREW_GAP_X = 180;
const CREW_Y = 0;
const BET_GAP_X = 240;
const BET_ROW_Y = 160;
const BET_GAP_Y = 130;

export type LensAnchorKey = `crew:${string}` | `bet:${string}`;

export function crewAnchorKey(ref: string): LensAnchorKey {
  return `crew:${ref}`;
}
export function betAnchorKey(id: string): LensAnchorKey {
  return `bet:${id}`;
}

function forkDepth(bet: FirmBet, byId: Map<string, FirmBet>): number {
  let depth = 0;
  let current: FirmBet | undefined = bet;
  const seen = new Set<string>();
  while (current?.forkedFrom && !seen.has(current.id)) {
    seen.add(current.id);
    const parent = byId.get(current.forkedFrom);
    if (!parent) break;
    depth += 1;
    current = parent;
  }
  return depth;
}

// Groups bets by their root teammate, so each teammate's whole lineage occupies its own column band —
// forks land in the same band as their root, one row per fork depth.
export function fallbackPositions(crew: FirmCrewMember[], bets: FirmBet[]): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {};
  const byId = new Map(bets.map((bet) => [bet.id, bet]));

  crew.forEach((member, index) => {
    positions[crewAnchorKey(member.ref)] = { x: index * CREW_GAP_X, y: CREW_Y };
  });

  const teammateRefs = crew.map((member) => member.ref);
  const columnForTeammate = new Map(teammateRefs.map((ref, index) => [ref, index]));
  const rowsUsedInColumn = new Map<number, number>();

  for (const bet of bets) {
    const column = bet.teammateRef && columnForTeammate.has(bet.teammateRef)
      ? columnForTeammate.get(bet.teammateRef)!
      : teammateRefs.length; // unattributed bets get their own trailing column
    const depth = forkDepth(bet, byId);
    const row = Math.max(depth, rowsUsedInColumn.get(column) ?? 0);
    rowsUsedInColumn.set(column, row + 1);
    positions[betAnchorKey(bet.id)] = { x: column * BET_GAP_X, y: BET_ROW_Y + row * BET_GAP_Y };
  }

  return positions;
}
