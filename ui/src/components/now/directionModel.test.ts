import { describe, expect, it } from "vitest";
import { buildDirections, buildDirectionSections } from "./directionModel";
import type { FirmBet, FirmConversationMessage, FirmLens, FirmOutcome } from "@/types";
import type { FirmActiveDrive, WallQueueItemView } from "@/api";

function bet(partial: Partial<FirmBet> & Pick<FirmBet, "id" | "intent">): FirmBet {
  return {
    ventureId: "v1", forkedFrom: null, teammateRef: "t1", refs: [], evidence: [], staged: [],
    joinKey: `j-${partial.id}`, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
    endedAt: null, endedBy: null, learning: null, position: "live", stagedCount: 0, latestOutcome: null,
    ...partial,
  } as FirmBet;
}

function founder(id: string, content: string, betId: string | null = null): FirmConversationMessage {
  return { id, ventureId: "v1", role: "founder", content, teammateRef: null, betId, createdAt: `2026-01-01T0${id.length}:00:00Z` } as FirmConversationMessage;
}

function handoff(id: string, openedBetIds: string[]): FirmConversationMessage {
  return {
    id, ventureId: "v1", role: "system", kind: "handoff", content: "landed", teammateRef: "t1", betId: null,
    createdAt: `2026-01-01T0${id.length}:30:00Z`, changes: { openedBetIds, stagedBetIds: [], wallBetIds: [] },
  } as FirmConversationMessage;
}

function lens(bets: FirmBet[], extra: Partial<FirmLens> = {}): FirmLens {
  return { ventureId: "v1", crew: [], bets, outcomes: [], wallItems: [], wall: { count: 0, oldestParkedAt: null }, placement: { positions: {}, revision: 0 }, ...extra } as FirmLens;
}

const NO_DRIVES: FirmActiveDrive[] = [];

describe("buildDirections", () => {
  it("folds a founder sentence and the bets its handoff opened into one direction", () => {
    const directions = buildDirections({
      lens: lens([bet({ id: "b1", intent: "internal phrasing" }), bet({ id: "b2", intent: "another" })]),
      messages: [founder("f1", "Find out why signups stalled and fix what you can"), handoff("h1", ["b1", "b2"])],
      activeDrives: NO_DRIVES,
    });
    expect(directions).toHaveLength(1);
    expect(directions[0].sentence).toBe("Find out why signups stalled and fix what you can");
    expect(directions[0].betIds.sort()).toEqual(["b1", "b2"]);
    expect(directions[0].approaches).toBe(2);
  });

  it("closes fork lineage into the same direction even if the handoff named only the parent", () => {
    const directions = buildDirections({
      lens: lens([bet({ id: "b1", intent: "root" }), bet({ id: "b2", intent: "try another approach", forkedFrom: "b1" })]),
      messages: [founder("f1", "Reach roofing companies"), handoff("h1", ["b1"])],
      activeDrives: NO_DRIVES,
    });
    expect(directions).toHaveLength(1);
    expect(directions[0].betIds.sort()).toEqual(["b1", "b2"]);
  });

  it("gives a bet with no conversation link its own honest direction, not a forced one", () => {
    const directions = buildDirections({
      lens: lens([bet({ id: "orphan", intent: "Prepare a revised campaign" })]),
      messages: [],
      activeDrives: NO_DRIVES,
    });
    expect(directions).toHaveLength(1);
    expect(directions[0].sentence).toBe("Prepare a revised campaign");
    expect(directions[0].id).toBe("bet:orphan");
  });

  it("surfaces a waiting decision as needs-you regardless of ongoing work", () => {
    const wallItem = { id: "w1", ventureId: "v1", betId: "b1", purpose: "release", blocksBet: false, effect: { kind: "message", to: "ops@acme.com" }, parkedAt: "2026-01-02T00:00:00Z", decision: null } as WallQueueItemView;
    const directions = buildDirections({
      lens: lens([bet({ id: "b1", intent: "outreach" })], { wallItems: [wallItem] }),
      messages: [founder("f1", "Contact these buyers"), handoff("h1", ["b1"])],
      activeDrives: [{ id: "d1", ventureId: "v1", teammateRef: "t1", betId: "b1", runtime: "codex", startedAt: "2026-01-02T00:00:00Z", abortSupported: true, abortRequestedAt: null }],
    });
    expect(directions[0].state).toBe("needs-you");
    expect(directions[0].needsYou).toBe(true);
  });

  it("promotes a fresh market return above active work, then relaxes once reviewed", () => {
    const outcome = { id: "o1", type: "outcome", betId: "b1", outcomeKind: "reply", from: "a buyer", body: "Interested — send details.", source: "gmail", channel: "email", observedAt: "2026-01-05T00:00:00Z", joined: true } as FirmOutcome;
    const args = {
      lens: lens([bet({ id: "b1", intent: "outreach" })], { outcomes: [outcome] }),
      messages: [founder("f1", "Reach roofing companies"), handoff("h1", ["b1"])],
      activeDrives: [{ id: "d1", ventureId: "v1", teammateRef: "t1", betId: "b1", runtime: "codex", startedAt: "2026-01-05T00:00:00Z", abortSupported: true, abortRequestedAt: null }],
    };
    expect(buildDirections(args, "2026-01-04T00:00:00Z")[0].state).toBe("from-market"); // fresh reply promotes
    expect(buildDirections(args, "2026-01-06T00:00:00Z")[0].state).toBe("working");     // reviewed → back to working
  });

  it("sections order needs-you, market, working, changed and drop empties", () => {
    const sections = buildDirectionSections([
      { id: "d1", sentence: "a", state: "working", updatedAt: "2026-01-03T00:00:00Z" } as never,
      { id: "d2", sentence: "b", state: "needs-you", updatedAt: "2026-01-02T00:00:00Z" } as never,
    ], null);
    expect(sections.map((s) => s.key)).toEqual(["needs-you", "working"]);
  });
});
