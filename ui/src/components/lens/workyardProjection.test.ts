import { describe, expect, it } from "vitest";
import type { FirmBet, FirmLens } from "@/types";
import { projectBetWork } from "./workyardProjection";

const bet: FirmBet = {
  id: "bet-1", ventureId: "v1", intent: "Earn a real buyer signal", forkedFrom: null, teammateRef: "yara",
  configurationRevision: 4, refs: [], evidence: [{ id: "evidence-1", claim: "Buyer named the pain" }],
  staged: [{
    id: "offer-1", title: "Paid pilot offer", content: "A concrete paid pilot",
    ownerRefs: ["yara"], contributorRefs: ["reed"], configurationRevision: 4,
    stagedAt: "2026-07-14T10:00:00.000Z", updatedAt: "2026-07-14T10:10:00.000Z",
  }],
  joinKey: "join-1", createdAt: "2026-07-14T09:00:00.000Z", updatedAt: "2026-07-14T10:10:00.000Z",
  endedAt: null, endedBy: null, learning: null, position: "at-wall", stagedCount: 1,
  latestOutcome: null,
};

function lens(): FirmLens {
  return {
    ventureId: "v1", crew: [], bets: [bet], wall: { count: 3, oldestParkedAt: "2026-07-14T10:11:00.000Z" },
    placement: { positions: {}, revision: 0 },
    wallItems: [
      { id: "wall-1", ventureId: "v1", betId: bet.id, workRef: "offer-1", purpose: "release", blocksBet: true, effect: { body: "Send this offer" }, parkedAt: "2026-07-14T10:11:00.000Z", decision: null },
      { id: "wall-2", ventureId: "v1", betId: bet.id, workRef: "wall-2", purpose: "answer", blocksBet: true, effect: { question: "Which buyer?" }, parkedAt: "2026-07-14T10:12:00.000Z", decision: null },
      { id: "wall-3", ventureId: "v1", betId: bet.id, workRef: "offer-1", purpose: "review-outcome", blocksBet: false, effect: { body: "Review this return" }, parkedAt: "2026-07-14T11:01:00.000Z", decision: null },
    ],
    outcomes: [{
      type: "outcome", id: "outcome-1", betId: bet.id, workRef: "offer-1", outcomeKind: "reply",
      from: "buyer@acme.com", body: "Yes, send the terms.", source: "gmail", channel: "email",
      observedAt: "2026-07-14T11:00:00.000Z", joined: true,
    }],
  };
}

describe("projectBetWork", () => {
  it("joins owner, contributors, wall act, and returned reality onto one exact workpiece", () => {
    const cards = projectBetWork(lens(), bet);
    const offer = cards.find((card) => card.workRef === "offer-1");
    expect(offer).toMatchObject({
      title: "Paid pilot offer",
      ownerRefs: ["yara"],
      contributorRefs: ["reed"],
      wallItems: [{ id: "wall-1" }, { id: "wall-3" }],
    });
    expect(offer?.outcomes.map((outcome) => outcome.id)).toEqual(["outcome-1"]);
  });

  it("keeps an outward act with no staged origin as its own targetable workpiece", () => {
    const cards = projectBetWork(lens(), bet);
    expect(cards.find((card) => card.workRef === "wall-2")).toMatchObject({
      title: "A question for you",
      source: "wall",
      wallItems: [{ id: "wall-2" }],
    });
  });

  it("keeps readable evidence without inventing a required presentation kind", () => {
    const cards = projectBetWork(lens(), bet);
    expect(cards.find((card) => card.workRef === "evidence-1")).toMatchObject({
      title: "Buyer named the pain",
      source: "evidence",
      presentation: "prose",
    });
  });

  it("keeps an exact repository path visible on cited evidence", () => {
    const cited = { ...bet, evidence: [{ id: "source-1", path: "src/handoff.ts", claim: "The handoff is real", excerpt: "prepareWeeklyHandoff()" }] };
    expect(projectBetWork({ ...lens(), bets: [cited] }, cited).find((card) => card.workRef === "source-1")).toMatchObject({
      title: "src/handoff.ts",
      body: "prepareWeeklyHandoff()",
      source: "evidence",
    });
  });

  it("uses an artifact's own heading and first substantive line instead of a generic work label", () => {
    const untitled = {
      ...bet,
      staged: [{
        id: "sequence-1",
        content: "## Build Sequence — Minimum Path to a Real Signal\n\n### Before any code\nCan a human find three genuine buyer signals per day before tooling exists?\n\n- Validate manually first.",
        stagedAt: "2026-07-14T12:00:00.000Z",
      }],
      evidence: [],
    };

    expect(projectBetWork({ ...lens(), bets: [untitled] }, untitled).find((card) => card.workRef === "sequence-1")).toMatchObject({
      title: "Build Sequence — Minimum Path to a Real Signal",
      preview: "Can a human find three genuine buyer signals per day before tooling exists?",
      source: "staged",
      workRef: "sequence-1",
    });
  });

  it("prefers honest nested content metadata and does not manufacture a preview for opaque records", () => {
    const structured = {
      ...bet,
      staged: [{ id: "message-1", content: { subject: "A precise invitation", body: "Would Tuesday work for a short buyer interview?" } }, {
        id: "opaque-1", content: { count: 3, matched: true },
      }],
      evidence: [],
    };
    const cards = projectBetWork({ ...lens(), bets: [structured] }, structured);

    expect(cards.find((card) => card.workRef === "message-1")).toMatchObject({
      title: "A precise invitation",
      preview: "Would Tuesday work for a short buyer interview?",
    });
    expect(cards.find((card) => card.workRef === "opaque-1")?.preview).toBeNull();
  });
});
