import { describe, expect, it } from "vitest";
import { betAnchorKey, crewAnchorKey, fallbackPositions, focusNeighborhoodKeys } from "./lensLayout";
import type { FirmBet, FirmCrewMember } from "@/types";

function makeCrew(ref: string): FirmCrewMember {
  return { ref, summonedAt: "2026-07-01T00:00:00.000Z", soul: { name: ref } };
}

function makeBet(overrides: Partial<FirmBet> & Pick<FirmBet, "id" | "intent">): FirmBet {
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
    position: "live",
    stagedCount: 0,
    latestOutcome: null,
    ...overrides,
  };
}

describe("crewAnchorKey / betAnchorKey", () => {
  it("produces stable, distinguishable anchor keys", () => {
    expect(crewAnchorKey("outreach-writer")).toBe("crew:outreach-writer");
    expect(betAnchorKey("bet-1")).toBe("bet:bet-1");
    expect(crewAnchorKey("x")).not.toBe(betAnchorKey("x"));
  });
});

describe("fallbackPositions", () => {
  it("places each teammate in its own column and each bet in its teammate's own column band", () => {
    const crew = [makeCrew("writer"), makeCrew("closer")];
    const bets = [
      makeBet({ id: "b1", intent: "cold outbound", teammateRef: "writer" }),
      makeBet({ id: "b2", intent: "close the deal", teammateRef: "closer" }),
    ];
    const positions = fallbackPositions(crew, bets);
    // Crew columns are ordered left to right...
    expect(positions[crewAnchorKey("writer")].x).toBeLessThan(positions[crewAnchorKey("closer")].x);
    // ...and each bet lands in the same relative column as its own teammate.
    expect(positions[betAnchorKey("b1")].x).toBeLessThan(positions[betAnchorKey("b2")].x);
    expect(positions[betAnchorKey("b1")].y).toBeGreaterThan(positions[crewAnchorKey("writer")].y);
  });

  it("stacks a fork lineage vertically beneath its root, deeper forks further down", () => {
    const crew = [makeCrew("writer")];
    const root = makeBet({ id: "root", intent: "cold outbound", teammateRef: "writer" });
    const child = makeBet({ id: "child", intent: "warmer subject", teammateRef: "writer", forkedFrom: "root" });
    const grandchild = makeBet({ id: "grandchild", intent: "even warmer", teammateRef: "writer", forkedFrom: "child" });
    const positions = fallbackPositions(crew, [root, child, grandchild]);
    expect(positions[betAnchorKey("root")].y).toBeLessThan(positions[betAnchorKey("child")].y);
    expect(positions[betAnchorKey("child")].y).toBeLessThan(positions[betAnchorKey("grandchild")].y);
    // The whole lineage stays in one column (same x as its teammate).
    const x = positions[crewAnchorKey("writer")].x;
    expect(positions[betAnchorKey("root")].x).toBe(x);
    expect(positions[betAnchorKey("child")].x).toBe(x);
    expect(positions[betAnchorKey("grandchild")].x).toBe(x);
  });

  it("gives an unattributed bet (no teammateRef) its own trailing column rather than colliding with crew", () => {
    const crew = [makeCrew("writer")];
    const bets = [makeBet({ id: "orphan", intent: "a bet nobody claimed", teammateRef: null })];
    const positions = fallbackPositions(crew, bets);
    expect(positions[betAnchorKey("orphan")].x).toBeGreaterThan(positions[crewAnchorKey("writer")].x);
  });

  it("never throws on an empty venture", () => {
    expect(fallbackPositions([], [])).toEqual({});
  });
});

describe("focusNeighborhoodKeys", () => {
  it("frames only the focused bet's existing lineage and participant anchors", () => {
    const bets = [
      makeBet({ id: "root", intent: "root", teammateRef: "writer" }),
      makeBet({ id: "focus", intent: "focus", teammateRef: "writer", forkedFrom: "root" }),
      makeBet({ id: "child", intent: "child", teammateRef: "closer", forkedFrom: "focus" }),
      makeBet({ id: "unrelated", intent: "unrelated", teammateRef: "closer" }),
    ];

    expect(focusNeighborhoodKeys(bets, "focus")).toEqual([
      "bet:focus",
      "crew:writer",
      "bet:root",
      "bet:child",
    ]);
    expect(focusNeighborhoodKeys(bets, "missing")).toEqual([]);
  });
});
