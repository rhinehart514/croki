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

// Founder-facing words for an effort card. These are the *rendered copy* for the kicker (top of the
// card) and the footer state — ordinary language, never the internal decision-band tokens
// (near-intent / drifting / approaching-wall / settled) which stay as compatibility seams below.
// "drifting" — the audit's flagged badge — becomes the honest founder sentence.
export type EffortTone = "underway" | "needs" | "settled";

export function effortTone(band: AtlasDecisionBand): EffortTone {
  if (band === "approaching-wall") return "needs";
  if (band === "settled") return "settled";
  return "underway";
}

// The mono kicker at the top of the card, in founder words.
export function effortKicker(band: AtlasDecisionBand): string {
  switch (band) {
    case "approaching-wall":
      return "Needs your read";
    case "settled":
      return "Finished";
    case "drifting":
      // The audit's "DRIFTING" badge, retired into an honest sentence: work is moving but the
      // direction is not yet named. This is the founder-word replacement the contract §4 calls for.
      return "Underway";
    default:
      return "Underway";
  }
}

// The plain state word on the card footer (status dot + this label).
export function effortStateLabel(bet: FirmBet, band: AtlasDecisionBand): string {
  if (band === "approaching-wall") return "Blocked on your read";
  if (band === "settled") return "Complete";
  if (bet.staged.length) return "Draft ready";
  return "In progress";
}
