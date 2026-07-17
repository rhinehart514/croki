import { describe, expect, it } from "vitest";
import type { FirmBet, FirmLens } from "@/types";
import type { FirmActiveDrive, WallQueueItemView } from "@/api";
import type { Direction } from "./directionModel";
import { projectDirection } from "./projectDirection";
import { buildRepresentations, getRepresentation } from "./representations";

const DIFF = ["diff --git a/x.ts b/x.ts", "@@ -1 +1 @@", "-a", "+b"].join("\n");
const NO_DRIVES: FirmActiveDrive[] = [];

function bet(partial: Partial<FirmBet> & Pick<FirmBet, "id" | "intent">): FirmBet {
  return {
    ventureId: "v1", forkedFrom: null, teammateRef: "t1", refs: [], evidence: [], staged: [],
    joinKey: `j-${partial.id}`, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
    endedAt: null, endedBy: null, learning: null, position: "live", stagedCount: 0, latestOutcome: null,
    ...partial,
  } as FirmBet;
}

function lens(bets: FirmBet[], extra: Partial<FirmLens> = {}): FirmLens {
  return { ventureId: "v1", crew: [], bets, outcomes: [], wallItems: [], wall: { count: 0, oldestParkedAt: null }, placement: { positions: {}, revision: 0 }, ...extra } as FirmLens;
}

function direction(partial: Partial<Direction> & Pick<Direction, "id" | "betIds">): Direction {
  return {
    sentence: "Do the thing", createdAt: null, updatedAt: null, primaryBetId: partial.betIds[0] ?? null,
    waitingWallItemIds: [], activeDriveIds: [], outcomeIds: [], proofCount: 0,
    approaches: partial.betIds.length, state: "changed", needsYou: false, understanding: "…", attribution: null,
    ...partial,
  };
}

function project(bets: FirmBet[], dir: Direction, drives = NO_DRIVES, wall: WallQueueItemView[] = []) {
  return projectDirection("v1", dir, lens(bets, { wallItems: wall }), wall, drives, null);
}

describe("projectDirection", () => {
  it("splits a staged diff into exactChanges and staged markdown into previews", () => {
    const b = bet({ id: "b1", intent: "root", staged: [{ content: DIFF }, { title: "Draft", content: "## Heading\n\nBody copy." }] });
    const ctx = project([b], direction({ id: "f1", betIds: ["b1"] }));
    expect(ctx.exactChanges).toHaveLength(1);
    expect(ctx.exactChanges[0].diff).toBe(DIFF);
    expect(ctx.previews).toHaveLength(1);
    expect(ctx.previews[0].artifact.artifact.kind).toBe("markdown");
  });

  it("enumerates fork siblings as member bets for approach comparison", () => {
    const bets = [bet({ id: "b1", intent: "root" }), bet({ id: "b2", intent: "another", forkedFrom: "b1" })];
    const ctx = project(bets, direction({ id: "f1", betIds: ["b1", "b2"] }));
    expect(ctx.memberBets.map((entry) => entry.id).sort()).toEqual(["b1", "b2"]);
  });
});

describe("buildRepresentations", () => {
  it("offers ONLY the result body when nothing else has backing truth — no machinery peer view", () => {
    const ctx = project([bet({ id: "b1", intent: "root" })], direction({ id: "f1", betIds: ["b1"] }));
    const ids = buildRepresentations(ctx).map((r) => r.id);
    // The default result is always present; "Who's working" is NOT a peer view; nothing else is invented.
    expect(ids).toEqual(["result"]);
    expect(ids).not.toContain("agent-collaboration");
  });

  it("offers exact-change only when a staged diff exists", () => {
    const withDiff = project([bet({ id: "b1", intent: "root", staged: [{ content: DIFF }] })], direction({ id: "f1", betIds: ["b1"] }));
    expect(buildRepresentations(withDiff).map((r) => r.id)).toContain("exact-change");
    const withoutDiff = project([bet({ id: "b1", intent: "root" })], direction({ id: "f1", betIds: ["b1"] }));
    expect(buildRepresentations(withoutDiff).map((r) => r.id)).not.toContain("exact-change");
  });

  it("offers approach-comparison only while more than one approach is genuinely active", () => {
    const single = project([bet({ id: "b1", intent: "root" })], direction({ id: "f1", betIds: ["b1"] }));
    expect(buildRepresentations(single).map((r) => r.id)).not.toContain("approach-comparison");

    const twoActive = project(
      [bet({ id: "b1", intent: "root" }), bet({ id: "b2", intent: "sibling", forkedFrom: "b1" })],
      direction({ id: "f1", betIds: ["b1", "b2"] }),
    );
    expect(buildRepresentations(twoActive).map((r) => r.id)).toContain("approach-comparison");

    // A second attempt that has ended is history, not an active approach — no comparison view.
    const oneEnded = project(
      [bet({ id: "b1", intent: "root" }), bet({ id: "b2", intent: "sibling", forkedFrom: "b1", endedAt: "2026-01-02T00:00:00Z" })],
      direction({ id: "f1", betIds: ["b1", "b2"] }),
    );
    expect(buildRepresentations(oneEnded).map((r) => r.id)).not.toContain("approach-comparison");
  });
});

describe("getRepresentation", () => {
  it("falls back to result (the first entry) for an unknown or removed id", () => {
    const ctx = project([bet({ id: "b1", intent: "root" })], direction({ id: "f1", betIds: ["b1"] }));
    const list = buildRepresentations(ctx);
    expect(getRepresentation(list, "missing-id").id).toBe("result");
    expect(getRepresentation(list, null).id).toBe("result");
    expect(getRepresentation(list, "result").id).toBe("result");
  });
});
