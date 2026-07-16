import { describe, expect, it } from "vitest";
import type { FirmLens } from "@/types";
import { buildReturnBrief } from "./return-brief";

const lens: FirmLens = {
  ventureId: "v1",
  crew: [{ ref: "sable", summonedAt: "2026-07-14T09:00:00.000Z", soul: { name: "Sable" } }],
  bets: [{
    id: "b1", ventureId: "v1", intent: "Invite operations leads", forkedFrom: null, teammateRef: "sable",
    refs: [], evidence: [], staged: [{ id: "a1" }], joinKey: "j1", createdAt: "2026-07-14T09:00:00.000Z",
    updatedAt: "2026-07-14T11:00:00.000Z", endedAt: null, endedBy: null, learning: null,
    position: "at-wall", stagedCount: 1, latestOutcome: null, configurationRevision: 2,
    events: [{ type: "artifact", detail: "A reply draft became durable.", at: "2026-07-14T11:00:00.000Z" }],
  }],
  outcomes: [{
    type: "outcome", id: "o1", betId: "b1", outcomeKind: "reply", from: "Buyer", body: "Tell me more",
    source: "gmail", channel: "email", observedAt: "2026-07-14T12:00:00.000Z", joined: true,
    providerEventId: "provider-1",
  }, {
    type: "outcome", id: "o2", betId: null, outcomeKind: "signal", from: null, body: "An unjoined signal",
    source: "manual", channel: null, observedAt: "2026-07-14T12:30:00.000Z", joined: false,
  }],
  wallItems: [{
    id: "w1", ventureId: "v1", betId: "b1", purpose: "release", blocksBet: true,
    effect: { to: "buyer@example.com" }, parkedAt: "2026-07-14T11:30:00.000Z", decision: null,
  }],
  wall: { count: 1, oldestParkedAt: "2026-07-14T11:30:00.000Z" },
  placement: { positions: {}, revision: 0 },
};

describe("return briefing projection", () => {
  it("prioritizes joined market truth and keeps held releases in founder attention", () => {
    const result = buildReturnBrief(lens, [], "2026-07-14T10:00:00.000Z");
    expect(result.projection?.records.map((record) => record.group)).toEqual([
      "needs-you", "market-spoke", "kept-moving",
    ]);
    expect(result.projection?.records.find((record) => record.group === "market-spoke")?.id).toBe("outcome:o1");
    expect(result.projection?.omittedCount).toBe(1);
    expect(result.projection?.omission).toMatch(/1 more durable record is available/i);
    const heldRelease = result.projection?.records.find((record) => record.id === "wall:w1");
    expect(heldRelease?.truth).toMatch(/waiting for your review/);
    expect(heldRelease?.whyNow).toMatch(/^Held safely\./);
    expect(heldRelease?.persistent).toBe(true);
    expect(result.reviewedThrough).toBe("2026-07-14T12:30:00.000Z");
  });

  it("never hides unresolved wall work behind the presentation cursor", () => {
    const result = buildReturnBrief(lens, [], "2026-07-15T00:00:00.000Z");
    expect(result.projection?.records).toHaveLength(1);
    expect(result.projection?.records[0].id).toBe("wall:w1");
    expect(result.projection?.reviewableCount).toBe(0);
  });

  it("keeps every unresolved wall item in the briefing", () => {
    const result = buildReturnBrief({
      ...lens,
      wallItems: [
        ...(lens.wallItems ?? []),
        {
          id: "w2", ventureId: "v1", betId: "b1", purpose: "answer", blocksBet: true,
          effect: { question: "Which promise can we make?" }, parkedAt: "2026-07-14T11:45:00.000Z", decision: null,
        },
      ],
    }, [], "2026-07-15T00:00:00.000Z");

    expect(result.projection?.records.map((record) => record.id)).toEqual(["wall:w2", "wall:w1"]);
    expect(result.projection?.omittedCount).toBe(0);
  });
});
