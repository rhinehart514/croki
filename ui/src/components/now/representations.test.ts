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
  it("always offers overview and gates the others on real truth", () => {
    const ctx = project([bet({ id: "b1", intent: "root" })], direction({ id: "f1", betIds: ["b1"] }));
    const ids = buildRepresentations(ctx).map((r) => r.id);
    // overview always; agent-collaboration honest at rest with one member bet; no diff/preview/siblings.
    expect(ids).toContain("overview");
    expect(ids).toContain("agent-collaboration");
    expect(ids).not.toContain("exact-change");
    expect(ids).not.toContain("working-result");
    expect(ids).not.toContain("approach-comparison");
  });

  it("offers exact-change only when a staged diff exists", () => {
    const withDiff = project([bet({ id: "b1", intent: "root", staged: [{ content: DIFF }] })], direction({ id: "f1", betIds: ["b1"] }));
    expect(buildRepresentations(withDiff).map((r) => r.id)).toContain("exact-change");
    const withoutDiff = project([bet({ id: "b1", intent: "root" })], direction({ id: "f1", betIds: ["b1"] }));
    expect(buildRepresentations(withoutDiff).map((r) => r.id)).not.toContain("exact-change");
  });

  it("offers approach-comparison only with more than one member bet", () => {
    const single = project([bet({ id: "b1", intent: "root" })], direction({ id: "f1", betIds: ["b1"] }));
    expect(buildRepresentations(single).map((r) => r.id)).not.toContain("approach-comparison");
    const forked = project(
      [bet({ id: "b1", intent: "root" }), bet({ id: "b2", intent: "sibling", forkedFrom: "b1" })],
      direction({ id: "f1", betIds: ["b1", "b2"] }),
    );
    expect(buildRepresentations(forked).map((r) => r.id)).toContain("approach-comparison");
  });

  it("offers agent-collaboration when a live drive exists", () => {
    const drive: FirmActiveDrive = { id: "d1", ventureId: "v1", teammateRef: "t1", betId: "b1", runtime: "codex", startedAt: "2026-01-01T00:00:00Z", abortSupported: true, abortRequestedAt: null };
    const ctx = project([bet({ id: "b1", intent: "root" })], direction({ id: "f1", betIds: ["b1"], activeDriveIds: ["d1"] }), [drive]);
    expect(ctx.drives).toHaveLength(1);
    expect(buildRepresentations(ctx).map((r) => r.id)).toContain("agent-collaboration");
  });
});

describe("getRepresentation", () => {
  it("falls back to overview (the first entry) for an unknown or removed id", () => {
    const ctx = project([bet({ id: "b1", intent: "root" })], direction({ id: "f1", betIds: ["b1"] }));
    const list = buildRepresentations(ctx);
    expect(getRepresentation(list, "missing-id").id).toBe("overview");
    expect(getRepresentation(list, null).id).toBe("overview");
    expect(getRepresentation(list, "overview").id).toBe("overview");
  });
});
