import { describe, expect, it } from "vitest";
import type { Direction } from "@/components/now/directionModel";
import { directionFocus } from "./workspaceFocus";

function direction(primaryBetId: string | null, betIds = primaryBetId ? [primaryBetId] : []): Direction {
  return {
    id: primaryBetId ? "direction-1" : "outcome-1", sentence: "Founder work", createdAt: null,
    updatedAt: null, betIds, primaryBetId,
    waitingWallItemIds: [], activeDriveIds: [], outcomeIds: [], proofCount: 0, approaches: 0,
    state: "changed", needsYou: false, understanding: "Ready", attribution: null,
  };
}

describe("workspace focus", () => {
  it("keeps a standalone direction addressable without inventing an execution target", () => {
    expect(directionFocus(direction(null))).toEqual({ directionId: "outcome-1", target: null });
  });

  it("binds a bet-backed direction to its execution target in the same value", () => {
    expect(directionFocus(direction("bet-1"))).toEqual({
      directionId: "direction-1",
      target: { betId: "bet-1", workRef: null, teammateRefs: [] },
    });
  });

  it("does not silently choose one attempt when a direction has several approaches", () => {
    expect(directionFocus(direction("bet-1", ["bet-1", "bet-2"]))).toEqual({
      directionId: "direction-1",
      target: null,
    });
  });
});
