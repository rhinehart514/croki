import { describe, expect, it } from "vitest";
import type { FirmArchitectureProjection, FirmLens } from "@/types";
import { atlasTeammates, relatedAtlasBets } from "./atlasTeammates";

function fixture(): { projection: FirmArchitectureProjection; lens: FirmLens } {
  const elements: FirmArchitectureProjection["elements"] = [
    { id: "proof", role: "system", name: "Work record", does: "Preserves proof" },
    { id: "graduate", role: "motion", name: "Graduate entry", actor: "Graduate", entry: "Project", value: "Proof", systemIds: ["proof"] },
    { id: "first-drops", role: "campaign", name: "First project drops", audience: "Graduates", objective: "Qualified demand", primaryMotionId: "graduate", motionIds: ["graduate"], governingBetId: "bet-1" },
  ];
  const document = { schemaVersion: 1, ventureId: "buffalo", revision: 1, intent: { statement: "Builders find collaborators through credible work." }, elements, connections: [], groups: [], evidenceAnnotations: [] };
  return {
    projection: {
      ventureId: "buffalo", document, revision: 1, elements, connections: [], groups: [], evidenceAnnotations: [], pressure: [],
      joins: { bets: [], work: [], wall: [], outcomes: [] },
    },
    lens: {
      ventureId: "buffalo",
      crew: [
        { ref: "sable", summonedAt: "2026-07-15T00:00:00Z", soul: { name: "Sable" } },
        { ref: "mara", summonedAt: "2026-07-15T00:00:00Z", soul: { name: "Mara" } },
      ],
      bets: [{
        id: "bet-1", ventureId: "buffalo", intent: "Project-first entry converts", forkedFrom: null, teammateRef: "sable", refs: [], evidence: [],
        staged: [{ id: "release-1", title: "Invitation", contributorRefs: ["mara"] }], joinKey: "one", createdAt: "2026-07-15T00:00:00Z", updatedAt: "2026-07-15T00:00:00Z",
        endedAt: null, endedBy: null, learning: null, position: "at-wall", stagedCount: 1, latestOutcome: null,
      }],
      wall: { count: 1, oldestParkedAt: "2026-07-15T00:00:00Z" }, placement: { positions: {}, revision: 1 },
    },
  };
}

describe("atlas teammate context", () => {
  it("traces a shared system and motion through their active campaign to the governing bet", () => {
    const { projection, lens } = fixture();
    expect(relatedAtlasBets(projection, lens, "architecture:proof").map((bet) => bet.id)).toEqual(["bet-1"]);
    expect(relatedAtlasBets(projection, lens, "architecture:graduate").map((bet) => bet.id)).toEqual(["bet-1"]);
  });

  it("shows the teammate and exact-work contributors behind an architecture selection", () => {
    const { projection, lens } = fixture();
    expect(atlasTeammates(projection, lens, "architecture:first-drops")).toEqual([
      { ref: "sable", name: "Sable" },
      { ref: "mara", name: "Mara" },
    ]);
  });
});
