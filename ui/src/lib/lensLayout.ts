// lensLayout.ts — the lens's fallback layout: where crew and bets sit BEFORE the founder has ever
// dragged anything. This is a simple deterministic grid, because the lens owns placement memory and
// nothing else (FIRM-SPEC.md "The one lens"): the founder's own drags are the real layout; this only
// gives the canvas somewhere honest to start.
//
// Crew sit in one row along the top (their working position). Each bet sits beneath the teammate that
// forked it, offset down its own fork lineage depth so a chain of forks reads as a vertical thread —
// the "lineage thread to forkedFrom" the task names — without computing a real longest-path rank.

import type { FirmBet, FirmCrewMember } from "@/types";

// Territories need real room for several durable workpieces. The broad view can zoom out; overlap at
// reading distance is the more damaging failure, so the fallback starts as a loose archipelago.
const COLUMN_GAP_X = 620;
const CREW_Y = 0;
const BET_ROW_Y = 160;
const BET_GAP_Y = 560;

export type LensAnchorKey = `crew:${string}` | `bet:${string}`;
export type CapabilityAnchorKey = `capability:${string}`;
export type CanvasAnchorKey = LensAnchorKey | CapabilityAnchorKey;

export function crewAnchorKey(ref: string): LensAnchorKey {
  return `crew:${ref}`;
}
export function betAnchorKey(id: string): LensAnchorKey {
  return `bet:${id}`;
}
export function capabilityAnchorKey(id: string): CapabilityAnchorKey {
  return `capability:${id}`;
}

// A focus scene is a temporary reading arrangement, not placement. This helper names only the
// durable anchors that already exist so automatic and requested focus framing can gather the bet
// family without ever writing a machine-authored layout into the venture.
export function focusNeighborhoodKeys(bets: FirmBet[], focusedBetId: string): LensAnchorKey[] {
  const focused = bets.find((bet) => bet.id === focusedBetId);
  if (!focused) return [];
  const related = new Set<LensAnchorKey>([betAnchorKey(focused.id)]);
  if (focused.teammateRef) related.add(crewAnchorKey(focused.teammateRef));
  if (focused.forkedFrom && bets.some((bet) => bet.id === focused.forkedFrom)) {
    related.add(betAnchorKey(focused.forkedFrom));
  }
  for (const bet of bets) {
    if (bet.forkedFrom === focused.id) related.add(betAnchorKey(bet.id));
  }
  return [...related];
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
    positions[crewAnchorKey(member.ref)] = { x: index * COLUMN_GAP_X, y: CREW_Y };
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
    positions[betAnchorKey(bet.id)] = { x: column * COLUMN_GAP_X, y: BET_ROW_Y + row * BET_GAP_Y };
  }

  return positions;
}
