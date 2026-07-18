import { describe, expect, it } from "vitest";
import type { Node } from "@xyflow/react";
import type { FirmArchitectureProjection, FirmLens } from "@/types";
import { projectAtlas } from "@/components/atlas/AtlasProjection";
import { resolveTerritories } from "./canvasTerritory";
import { canvasReservedWidth } from "./canvasSeedLayout";
import { arrangeLens, LENS_SEQUENCE, type LensId } from "./lensArrangement";

// A scene with BOTH territories populated, two bets under different decision pressure, a wall, and a
// returned outcome — enough for every arrangement's contract. Built through the real projectAtlas so the
// node ids/kinds/territory-chain are exactly what the surface renders.
function fixture(): { projection: FirmArchitectureProjection; lens: FirmLens } {
  const elements: FirmArchitectureProjection["elements"] = [
    { id: "loop", role: "product-loop", name: "Work becomes proof", steps: [{ id: "s", label: "Do work" }] },
    { id: "sys", role: "system", name: "Work record", does: "Preserves proof" },
    { id: "camp", role: "campaign", name: "First drops", primaryMotionId: "mot", motionIds: ["mot"], governingBetId: "bet-wall" },
    { id: "mot", role: "motion", name: "Graduate entry", systemIds: ["sys"], productRefs: ["loop"] },
  ];
  const document = {
    schemaVersion: 1, ventureId: "v", revision: 1,
    intent: { statement: "Builders find collaborators." },
    elements, connections: [], groups: [], evidenceAnnotations: [],
  };
  const projection: FirmArchitectureProjection = {
    ventureId: "v", document, revision: 1, elements, connections: [], groups: [], evidenceAnnotations: [],
    pressure: [],
    joins: {
      bets: [{ id: "bet-wall", betId: "bet-wall", campaignId: "camp" }],
      work: [{ id: "rel-1", workRef: "rel-1", betId: "bet-wall", campaignId: "camp", title: "Drop v1", exact: true }],
      wall: [{ id: "wall-1", workRef: "rel-1", betId: "bet-wall" }],
      outcomes: [{ id: "out-1", betId: "bet-fresh", join: { level: "exact", basis: "captured", causal: false } }],
    },
    omissions: { historicalRevisions: true, machinery: true, unassignedBets: 0 },
  };
  const baseBet = {
    ventureId: "v", forkedFrom: null, teammateRef: null, refs: [], evidence: [], joinKey: "k",
    createdAt: "2026-07-15T00:00:00Z", updatedAt: "2026-07-15T00:00:00Z", endedAt: null, endedBy: null,
    learning: null, stagedCount: 0, latestOutcome: null, workflow: [], machineryCounts: [], events: [],
  };
  const lens: FirmLens = {
    ventureId: "v", crew: [],
    bets: [
      // A bet at the wall — approaching-wall pressure, a product change (product territory via the chain).
      // The staged body is a diff, which is how the projection derives product-change (atlasSemanticProjection).
      { ...baseBet, id: "bet-wall", intent: "Ship the drop", staged: [{ id: "rel-1", title: "Drop v1", body: "diff --git a/x b/x\n@@ -1 +1 @@\n-a\n+b" }], position: "at-wall" },
      // A fresh bet with a returned outcome — settled pressure, a draft (gtm territory via the chain).
      { ...baseBet, id: "bet-fresh", intent: "Warm the list", staged: [{ id: "d-1", title: "Note", workKind: "draft" }], position: "live", latestOutcome: { id: "out-1" } },
    ] as unknown as FirmLens["bets"],
    outcomes: [{ type: "outcome", id: "out-1", betId: "bet-fresh", workRef: "rel-1", outcomeKind: "reply", from: "b", body: "reply", source: "captured", channel: "email", observedAt: "2026-07-15T00:00:00Z", joined: true }] as unknown as FirmLens["outcomes"],
    wallItems: [{ id: "wall-1", ventureId: "v", betId: "bet-wall", workRef: "rel-1", purpose: "release", blocksBet: true, effect: {}, parkedAt: "2026-07-15T00:00:00Z", decision: null }] as unknown as FirmLens["wallItems"],
    wall: { count: 1, oldestParkedAt: "2026-07-15T00:00:00Z" }, placement: { positions: {}, revision: 1 },
  };
  return { projection, lens };
}

function sceneNodes() {
  const { projection, lens } = fixture();
  const scene = projectAtlas(projection, lens);
  return { nodes: scene.nodes as unknown as Node[], projection, lens };
}

describe("arrangeLens — id-set identity is preserved per lens", () => {
  it("each lens returns a position for EXACTLY the input node id-set (no dupes, no drops)", () => {
    const { nodes, projection, lens } = sceneNodes();
    const inputIds = nodes.map((node) => node.id);
    const inputSet = new Set(inputIds);
    // A real scene must never carry a duplicate id in the first place.
    expect(inputIds.length).toBe(inputSet.size);
    const territory = resolveTerritories(nodes);
    for (const lensId of LENS_SEQUENCE as LensId[]) {
      const positions = arrangeLens(lensId, nodes, { territory, projection, lens });
      const outputIds = Object.keys(positions);
      // key-set === node id-set: same size, same members.
      expect(outputIds.length).toBe(inputIds.length);
      expect(new Set(outputIds)).toEqual(inputSet);
      // Every position is a finite pair.
      for (const id of outputIds) {
        expect(Number.isFinite(positions[id].x)).toBe(true);
        expect(Number.isFinite(positions[id].y)).toBe(true);
      }
    }
  });
});

describe("Execute (marquee) — sidedness and single pressure axis coexist", () => {
  it("puts product-rooted nodes left of the seam, gtm-rooted right, and the wall on the seam", () => {
    const { nodes, projection, lens } = sceneNodes();
    const territory = resolveTerritories(nodes);
    const positions = arrangeLens("execute", nodes, { territory, projection, lens });

    const rightEdge = (id: string) => positions[id].x + canvasReservedWidth(
      String((nodes.find((n) => n.id === id)!.data as { kind?: unknown }).kind ?? ""),
    );

    // The product bet's whole footprint sits left of the seam (right edge <= 0).
    expect(rightEdge("bet:bet-wall")).toBeLessThanOrEqual(0);
    // The gtm bet's left edge sits right of the seam (x >= 0).
    expect(positions["bet:bet-fresh"].x).toBeGreaterThanOrEqual(0);
    // The wall spans the seam: its centre is on x=0 (left = -width/2).
    const wallCentre = positions["atlas:wall"].x + canvasReservedWidth("wall") / 2;
    expect(Math.abs(wallCentre)).toBeLessThan(1);
    // The intent hub also pins on the seam (centred on x=0).
    const hubCentre = positions["atlas:intent"].x + canvasReservedWidth("intent") / 2;
    expect(Math.abs(hubCentre)).toBeLessThan(1);
  });

  it("places equal-pressure nodes at equal y across the seam", () => {
    // Two bets under the SAME pressure band must land on the same row line regardless of side. Force both
    // bets to approaching-wall by adding the fresh bet to the wall, then assert equal y.
    const { projection, lens } = fixture();
    const bumped: FirmLens = {
      ...lens,
      wallItems: [
        ...(lens.wallItems ?? []),
        { id: "wall-2", ventureId: "v", betId: "bet-fresh", workRef: "d-1", purpose: "release", blocksBet: true, effect: {}, parkedAt: "2026-07-15T00:00:00Z", decision: null },
      ] as unknown as FirmLens["wallItems"],
    };
    const scene = projectAtlas(projection, bumped);
    const nodes = scene.nodes as unknown as Node[];
    const territory = resolveTerritories(nodes);
    const positions = arrangeLens("execute", nodes, { territory, projection, lens: bumped });
    // Both bets now read approaching-wall → same row line y.
    expect(positions["bet:bet-wall"].y).toBe(positions["bet:bet-fresh"].y);
  });
});

describe("Learn — cause→evidence chains along outcome joins", () => {
  it("places a bet's outcome to the RIGHT of the bet (cause left, evidence right)", () => {
    const { nodes, projection, lens } = sceneNodes();
    const territory = resolveTerritories(nodes);
    const positions = arrangeLens("learn", nodes, { territory, projection, lens });
    // bet-fresh has the returned outcome out-1: the outcome sits right of its cause bet at the same row.
    if (positions["outcome:out-1"] && positions["bet:bet-fresh"]) {
      expect(positions["outcome:out-1"].x).toBeGreaterThan(positions["bet:bet-fresh"].x);
      expect(positions["outcome:out-1"].y).toBe(positions["bet:bet-fresh"].y);
    }
  });
});
