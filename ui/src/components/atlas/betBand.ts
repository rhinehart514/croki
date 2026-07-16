import type { FirmBet, FirmLens } from "@/types";
import type { AtlasDecisionBand } from "./atlasTypes";

// Pure classifier: how far along a bet's decision cycle it reads. This is a *rendering* input
// (it drives the effort card's band accent), not a placement input — the layout engine owns
// position. It survived the retirement of the orbit layout, which used to double it as a radius.
export function decisionBandForBet(bet: FirmBet, lens: FirmLens): AtlasDecisionBand {
  if (bet.position === "at-wall" || lens.wallItems?.some((item) => item.betId === bet.id && !item.decision)) return "approaching-wall";
  if (bet.position === "ended" || bet.latestOutcome || lens.outcomes?.some((outcome) => outcome.betId === bet.id)) return "settled";
  const meaningfulEvents = (bet.events ?? []).filter((event) => event.type !== "bet_forked");
  if (bet.staged.length || bet.evidence.length || meaningfulEvents.length) return "drifting";
  return "near-intent";
}

// The path label a bet rides. Retirement of the orbit layout dropped its sector grouping; the
// effort card now names the campaign/path the bet belongs to, or an honest "no path named".
export function motionLabelForBet(
  bet: FirmBet,
  campaignNameByBet: Map<string, string | null>,
): string {
  return campaignNameByBet.get(bet.id) ?? "No path named";
}
