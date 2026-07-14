import { describe, expect, it } from "vitest";
import { buildLensOutline } from "./lensOutline";
import type { FirmBet, FirmCrewMember } from "@/types";

function makeCrew(ref: string): FirmCrewMember {
  return { ref, summonedAt: "2026-07-01T00:00:00.000Z", soul: { name: ref } };
}

function makeBet(overrides: Partial<FirmBet> & Pick<FirmBet, "id" | "intent" | "position">): FirmBet {
  return {
    ventureId: "v1",
    forkedFrom: null,
    teammateRef: null,
    refs: [],
    evidence: [],
    staged: [],
    joinKey: `join-${overrides.id}`,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    endedAt: null,
    endedBy: null,
    learning: null,
    stagedCount: 0,
    latestOutcome: null,
    ...overrides,
  };
}

describe("buildLensOutline", () => {
  it("groups crew first, then bets by position: Crew, Live, At the wall, Ended", () => {
    const crew = [makeCrew("writer")];
    const bets = [
      makeBet({ id: "ended", intent: "cold list, too cold", position: "ended" }),
      makeBet({ id: "wall", intent: "ship pricing page", position: "at-wall" }),
      makeBet({ id: "live", intent: "warmer subject", position: "live" }),
    ];
    const rows = buildLensOutline(crew, bets);
    expect(rows.map((r) => r.group)).toEqual(["Crew", "Live", "At the wall", "Ended"]);
  });

  it("uses the teammate's soul name when present, falling back to its ref", () => {
    const namedCrew: FirmCrewMember = { ref: "outreach-writer", summonedAt: "now", soul: { name: "Sable" } };
    const unnamedCrew: FirmCrewMember = { ref: "closer-2", summonedAt: "now", soul: null };
    const rows = buildLensOutline([namedCrew, unnamedCrew], []);
    expect(rows.find((r) => r.label === "Sable")).toBeTruthy();
    expect(rows.find((r) => r.label === "closer-2")).toBeTruthy();
  });

  it("summarizes staged/outcome/fork activity in a bet's detail line", () => {
    const bet = makeBet({
      id: "b1", intent: "landing page v2", position: "live", stagedCount: 2, forkedFrom: "root",
      latestOutcome: { type: "outcome", id: "v1", outcomeKind: "reply", from: null, body: "hi", source: null, channel: null, observedAt: "now", joined: true },
    });
    const rows = buildLensOutline([], [bet]);
    expect(rows[0].detail).toBe("2 staged · market returned · forked");
  });

  it("gives a bet with no activity yet an honest empty detail", () => {
    const bet = makeBet({ id: "b1", intent: "a fresh bet", position: "live" });
    const rows = buildLensOutline([], [bet]);
    expect(rows[0].detail).toBe("No activity yet");
  });
});
