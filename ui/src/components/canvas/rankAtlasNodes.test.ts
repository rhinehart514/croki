import { describe, expect, it } from "vitest";
import { rankAtlasNodes } from "./rankAtlasNodes";
import type { AtlasNode } from "@/components/atlas/atlasTypes";

const NOW = Date.parse("2026-07-17T00:00:00.000Z");

// Minimal atlas node carrying only the facets the ranker reads. Cast through unknown so the fixture stays
// small (the ranker never touches the rest of AtlasNodeData).
function node(id: string, data: Record<string, unknown>): AtlasNode {
  return { id, position: { x: 0, y: 0 }, data: { kind: "bet", title: id, ...data } } as unknown as AtlasNode;
}

describe("rankAtlasNodes (SPEC C, pure surfacing ranker)", () => {
  const plain = node("bet:plain", {});
  const atWall = node("bet:wall", { atWall: true });
  const contested = node("bet:contested", { epistemic: "contested" });
  const recent = node("bet:recent", { bet: { id: "r", events: [{ type: "x", at: "2026-07-16T00:00:00.000Z" }] } });
  const stale = node("bet:stale", { bet: { id: "s", events: [{ type: "x", at: "2020-01-01T00:00:00.000Z" }] } });
  const founderPlaced = node("bet:placed", {});
  const nodes = [plain, atWall, contested, recent, stale, founderPlaced];

  it("at the structure map read, surfaces at-wall, contested, recently-changed AND founder-placed", () => {
    const ranked = rankAtlasNodes({
      nodes,
      placementPositions: { "bet:placed": { x: 100, y: 100 } },
      band: "structure",
      now: NOW,
    });
    const byId = new Map(ranked.map((entry) => [entry.id, entry]));
    expect(byId.get("bet:wall")).toMatchObject({ surfaced: true, reason: "at-wall" });
    expect(byId.get("bet:contested")).toMatchObject({ surfaced: true, reason: "contested" });
    expect(byId.get("bet:recent")).toMatchObject({ surfaced: true, reason: "recently-changed" });
    expect(byId.get("bet:placed")).toMatchObject({ surfaced: true, reason: "founder-placed" });
    // An ordinary, quiet, long-untouched node falls to the collapse-eligible tail at the map read.
    expect(byId.get("bet:plain")).toMatchObject({ surfaced: false, reason: null });
    expect(byId.get("bet:stale")).toMatchObject({ surfaced: false, reason: null });
  });

  // The invariant the spec names: a node with a stored founder placement is NEVER collapsed, at any band.
  it("INVARIANT: a founder-placed node is surfaced at every band", () => {
    for (const band of ["structure", "relationships", "components", "artifacts"] as const) {
      const ranked = rankAtlasNodes({
        nodes: [founderPlaced, plain],
        placementPositions: { "bet:placed": { x: 1, y: 1 } },
        band,
        now: NOW,
      });
      const placed = ranked.find((entry) => entry.id === "bet:placed");
      expect(placed?.surfaced, `founder-placed surfaced at ${band}`).toBe(true);
    }
  });

  it("at-wall and contested surface one band early (earnsAt = relationships)", () => {
    const ranked = rankAtlasNodes({ nodes: [atWall, contested], placementPositions: {}, band: "structure", now: NOW });
    expect(ranked.every((entry) => entry.earnsAt === "relationships")).toBe(true);
  });

  it("below the map read, every node is surfaced (collapse only at structure)", () => {
    const ranked = rankAtlasNodes({ nodes, placementPositions: {}, band: "relationships", now: NOW });
    expect(ranked.every((entry) => entry.surfaced)).toBe(true);
  });
});
