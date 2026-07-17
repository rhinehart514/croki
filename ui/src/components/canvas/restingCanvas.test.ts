// Resting-canvas legibility — the diagram-of-duplicate-stickies fix. Shaped like the live venture: several
// UNTITLED staged artifacts, each opening with a distinct markdown heading, all attached to bets-only
// directions with no architecture. Proves (1) each card gets a distinct content-derived title (never a
// staged-… ID in founder copy), (2) a product change and a draft render as different kinds, and (3)
// territory inherits through the ownership chain so the two territories populate in a bets-only venture.
import { describe, expect, it } from "vitest";
import type { FirmLens } from "@/types";
import { projectAtlasSemanticLayer } from "@/components/atlas/atlasSemanticProjection";
import { resolveTerritories } from "./canvasTerritory";

const DIFF = ["diff --git a/pricing.ts b/pricing.ts", "@@ -1 +1 @@", "-const p = 9", "+const p = 12"].join("\n");

function lensWith(staged: Array<{ betId: string; id: string; content: string }>): FirmLens {
  const betIds = [...new Set(staged.map((s) => s.betId))];
  return {
    ventureId: "v1", crew: [],
    bets: betIds.map((betId) => ({
      id: betId, ventureId: "v1", intent: `Work ${betId}`, forkedFrom: null, teammateRef: null, refs: [], evidence: [],
      staged: staged.filter((s) => s.betId === betId).map((s) => ({ id: s.id, content: s.content })),
      joinKey: betId, createdAt: "2026-07-15T00:00:00Z", updatedAt: "2026-07-15T00:00:00Z", endedAt: null, endedBy: null,
      learning: null, position: "live", stagedCount: 1, latestOutcome: null,
    })),
    outcomes: [], wallItems: [], wall: { count: 0, oldestParkedAt: null }, placement: { positions: {}, revision: 0 },
  } as FirmLens;
}

describe("resting-canvas identity — distinct titles from content, never staged IDs", () => {
  it("derives a distinct title from each untitled artifact's first heading", () => {
    const lens = lensWith([
      { betId: "b1", id: "staged-aaaa", content: "## Raise the price to $12\n\nBecause margins are thin." },
      { betId: "b2", id: "staged-bbbb", content: "## Launch email to segment A\n\nHi there…" },
      { betId: "b3", id: "staged-cccc", content: "## Rewrite the landing headline" },
    ]);
    const { nodes } = projectAtlasSemanticLayer(null, lens);
    const workTitles = nodes.filter((n) => n.data.kind === "work").map((n) => n.data.title);
    expect(workTitles).toEqual([
      "Raise the price to $12",
      "Launch email to segment A",
      "Rewrite the landing headline",
    ]);
    // No founder-facing title ever leaks a staged-… ID.
    for (const title of workTitles) expect(title).not.toMatch(/staged-/);
  });

  it("differentiates a staged product change from a text draft by kind", () => {
    const lens = lensWith([
      { betId: "b1", id: "staged-diff", content: DIFF },
      { betId: "b2", id: "staged-text", content: "## Positioning draft\n\nWe help founders ship." },
    ]);
    const { nodes } = projectAtlasSemanticLayer(null, lens);
    const work = nodes.filter((n) => n.data.kind === "work");
    const byKind = Object.fromEntries(work.map((n) => [n.id, n.data.workKind]));
    expect(byKind["work:staged-diff"]).toBe("product-change");
    expect(byKind["work:staged-text"]).toBe("draft");
    // Distinct anatomies: the output words differ, so the cards do not read identically.
    const outputs = new Set(work.map((n) => n.data.outputLabel));
    expect(outputs.size).toBeGreaterThan(1);
  });
});

describe("resting-canvas territories — inheritance through the ownership chain", () => {
  it("populates BOTH territories in a bets-only venture (product change → product, draft → gtm)", () => {
    const lens = lensWith([
      { betId: "b1", id: "staged-diff", content: DIFF },
      { betId: "b2", id: "staged-text", content: "## Email to segment A\n\nHi…" },
    ]);
    const { nodes } = projectAtlasSemanticLayer(null, lens);
    // Emulate the projectAtlas node shape for bets (carry data.bet.id so the chain can resolve).
    const withBets = [
      ...lens.bets.map((bet) => ({ id: `bet:${bet.id}`, data: { kind: "bet", bet } })),
      ...nodes,
    ];
    const territories = resolveTerritories(withBets);
    expect(territories.get("work:staged-diff")).toBe("product");
    expect(territories.get("work:staged-text")).toBe("gtm");
    // The owning bets inherit their record's territory, so both territories are non-empty.
    expect(territories.get("bet:b1")).toBe("product");
    expect(territories.get("bet:b2")).toBe("gtm");
  });
});
