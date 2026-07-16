import { describe, expect, it } from "vitest";
import { normalizeDirectionTarget, targetWork, toggleTargetTeammate } from "./directionTarget";

describe("directionTarget", () => {
  it("normalizes an empty target back to whole-firm scope", () => {
    expect(normalizeDirectionTarget({ betId: null, workRef: null, teammateRefs: [] })).toBeNull();
  });

  it("never retains work without its containing bet", () => {
    expect(normalizeDirectionTarget({ workRef: "work-1", teammateRefs: [] })).toBeNull();
  });

  it("can add explicit teammates without losing exact work scope", () => {
    const work = targetWork("bet-1", "work-1");
    expect(toggleTargetTeammate(toggleTargetTeammate(work, "yara"), "reed")).toEqual({
      betId: "bet-1",
      workRef: "work-1",
      teammateRefs: ["yara", "reed"],
    });
  });
});
