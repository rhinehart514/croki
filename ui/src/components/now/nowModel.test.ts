import { describe, expect, it } from "vitest";
import { buildNowSections, needsYouCount } from "./nowModel";
import type { ReturnBriefRecord } from "@/components/firm/returnBriefProjection";
import type { FirmActiveDrive } from "@/api";
import type { FirmBet } from "@/types";

function record(partial: Partial<ReturnBriefRecord> & Pick<ReturnBriefRecord, "id" | "group" | "truth" | "target">): ReturnBriefRecord {
  return { actionLabel: "Review", ...partial } as ReturnBriefRecord;
}

function drive(partial: Partial<FirmActiveDrive> & Pick<FirmActiveDrive, "id">): FirmActiveDrive {
  return {
    ventureId: "v1", teammateRef: "t1", betId: null, runtime: "claude-code",
    startedAt: "2026-01-01T00:00:00Z", abortSupported: true, abortRequestedAt: null,
    ...partial,
  };
}

function bet(id: string, intent: string): FirmBet {
  return { id, intent } as FirmBet;
}

describe("buildNowSections", () => {
  it("orders sections needs-you, moving, market, changed and drops empties", () => {
    const sections = buildNowSections({
      records: [
        record({ id: "c1", group: "kept-moving", truth: "Prepared outreach", target: { kind: "bet", betId: "b9" } }),
        record({ id: "w1", group: "needs-you", truth: "Approve the send", target: { kind: "wall" } }),
        record({ id: "m1", group: "market-spoke", truth: "A reply came back", target: { kind: "wall" } }),
      ],
      activeDrives: [drive({ id: "d1", betId: "b1" })],
      bets: [bet("b1", "Find the first 20 customers")],
    });
    expect(sections.map((s) => s.key)).toEqual(["needs-you", "moving", "market", "changed"]);
    expect(sections[1].rows[0].title).toBe("Find the first 20 customers");
    expect(sections[1].rows[0].stateLabel).toBe("Working");
  });

  it("does not double-count a drive whose bet is already at the wall", () => {
    const sections = buildNowSections({
      records: [record({ id: "w1", group: "needs-you", truth: "Approve", target: { kind: "bet", betId: "b1" } })],
      activeDrives: [drive({ id: "d1", betId: "b1" })],
      bets: [bet("b1", "Ship onboarding")],
    });
    expect(sections.find((s) => s.key === "moving")).toBeUndefined();
    expect(needsYouCount(sections)).toBe(1);
  });

  it("folds architecture-shift into what-changed", () => {
    const sections = buildNowSections({
      records: [record({ id: "a1", group: "architecture-shift", truth: "Claim challenged", target: { kind: "architecture", architectureId: "x", architectureRevision: 2 } })],
      activeDrives: [],
      bets: [],
    });
    expect(sections).toHaveLength(1);
    expect(sections[0].key).toBe("changed");
  });

  it("returns nothing when the venture is quiet", () => {
    expect(buildNowSections({ records: [], activeDrives: [], bets: [] })).toEqual([]);
  });
});
