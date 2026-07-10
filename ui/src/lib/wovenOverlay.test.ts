import { describe, it, expect } from "vitest";
import type { Node } from "@xyflow/react";
import { buildWovenOverlay, focusIsEffective } from "@/lib/wovenOverlay";
import type { ChannelLane } from "@/lib/channelLanes";
import type { WovenGraph, WovenObjectNode, WovenTie } from "@/types";

// Minimal woven graph builder — just enough shape for the overlay's placement + focus logic.
function objNode(over: Partial<WovenObjectNode> & { objectKey: string }): WovenObjectNode {
  return {
    id: `obj:${over.objectKey}`,
    objectKey: over.objectKey,
    kind: over.kind ?? "account",
    label: over.label ?? over.objectKey,
    bucket: over.bucket ?? "seen",
    motionCount: over.motionCount ?? 2,
    touchCount: over.touchCount ?? 2,
    draw: over.draw ?? true,
    provenance: over.provenance ?? { kind: "grounded", basis: "" },
    laneKeys: over.laneKeys ?? ["laneA", "laneB"],
    anchorMeanX: over.anchorMeanX ?? null,
  };
}
function tie(over: Partial<WovenTie> & { channelId: string; objectKey: string }): WovenTie {
  return {
    id: `tie:${over.channelId}:${over.objectKey}`,
    channelId: over.channelId,
    objectKey: over.objectKey,
    verb: over.verb ?? "touched",
    runId: over.runId ?? null,
    anchorStepId: over.anchorStepId ?? "stepA",
    anchorX: over.anchorX ?? null,
    drawn: over.drawn ?? true,
  };
}
function wovenGraph(objectNodes: WovenObjectNode[], ties: WovenTie[]): WovenGraph {
  return {
    projectId: "p",
    objectNodes,
    ties,
    kindClusters: [],
    laneKinds: {},
    collapsedByLane: {},
    stats: {
      objectCount: objectNodes.length, drawnObjectCount: objectNodes.filter((o) => o.draw).length,
      collapsedObjectCount: 0, tieCount: ties.length, drawnTieCount: ties.filter((t) => t.drawn).length, kindCount: 0,
    },
  };
}
function lane(over: Partial<ChannelLane> = {}): ChannelLane {
  return { offsetY: over.offsetY ?? 0, height: over.height ?? 200, centerX: over.centerX ?? 300, centerY: over.centerY ?? 100 };
}

describe("focusIsEffective", () => {
  const woven = wovenGraph([objNode({ objectKey: "erie", laneKeys: ["laneA", "laneB"] })], []);

  it("is false for a lane focus that matches no current lane (the stale/ghost focus)", () => {
    expect(focusIsEffective({ kind: "lane", channelId: "laneGONE" }, woven)).toBe(false);
  });
  it("is true for a lane focus that lights a real lane", () => {
    expect(focusIsEffective({ kind: "lane", channelId: "laneA" }, woven)).toBe(true);
  });
  it("is false for null focus or absent woven", () => {
    expect(focusIsEffective(null, woven)).toBe(false);
    expect(focusIsEffective({ kind: "lane", channelId: "laneA" }, null)).toBe(false);
  });
});

describe("buildWovenOverlay — ghost-field collapse", () => {
  it("does not dim any chip when the focus matches nothing (empty-match focus = no focus)", () => {
    const objs = [
      objNode({ objectKey: "erie", laneKeys: ["laneA", "laneB"] }),
      objNode({ objectKey: "monroe", laneKeys: ["laneA"] , motionCount: 2 }),
    ];
    const woven = wovenGraph(objs, [
      tie({ channelId: "laneA", objectKey: "erie" }),
      tie({ channelId: "laneB", objectKey: "erie" }),
    ]);
    const lanes = new Map<string, ChannelLane>([["laneA", lane({ offsetY: 0 })], ["laneB", lane({ offsetY: 220 })]]);
    const mergedNodes: Node[] = [
      { id: "laneA::stepA", position: { x: 100, y: 40 }, data: {} },
      { id: "laneB::stepA", position: { x: 100, y: 260 }, data: {} },
    ];
    const { nodes } = buildWovenOverlay({
      woven, lanes, mergedNodes, axis: "objects", zoom: 1,
      // A parked lane the project reopened with that no longer exists in this weave.
      focus: { kind: "lane", channelId: "laneGONE" },
    });
    const chips = nodes.filter((n) => n.type === "objectChip");
    expect(chips.length).toBeGreaterThan(0);
    // With an empty-match focus collapsed to null, no chip carries a dim focus state.
    expect(chips.every((c) => (c.data as { focus?: string }).focus === undefined)).toBe(true);
  });
});

describe("buildWovenOverlay — occlusion guard", () => {
  // 2D non-occlusion: a chip may share a card's X as long as it sits in the vertical gutter BETWEEN lanes and
  // doesn't overlap that card's box. It must never overlap a card in BOTH x and y.
  const STEP_W = 220, STEP_H = 60, OBJ_CHIP_W = 176, CHIP_H = 56;
  const occludes = (cx: number, cy: number, m: Node): boolean =>
    cx < m.position.x + STEP_W && cx + OBJ_CHIP_W > m.position.x &&
    cy < m.position.y + STEP_H && cy + CHIP_H > m.position.y;

  it("keeps a chip clear of every card box (2D), snapping off a card that shares its row", () => {
    const objs = [objNode({ objectKey: "erie", laneKeys: ["laneA", "laneB"] })];
    const woven = wovenGraph(objs, [
      tie({ channelId: "laneA", objectKey: "erie", anchorStepId: "src" }),
      tie({ channelId: "laneB", objectKey: "erie", anchorStepId: "src" }),
    ]);
    const lanes = new Map<string, ChannelLane>([["laneA", lane({ offsetY: 0 })], ["laneB", lane({ offsetY: 220 })]]);
    const mergedNodes: Node[] = [
      { id: "laneA::src", position: { x: 0, y: 40 }, data: {} },
      { id: "laneA::next", position: { x: 600, y: 40 }, data: {} },
      // A card placed at the single chip's Y row AND at the candidate X — the classic chip-over-card collision.
      { id: "laneB::mid", position: { x: 260, y: 190 }, data: {} },
    ];
    const { nodes } = buildWovenOverlay({ woven, lanes, mergedNodes, axis: "objects", zoom: 1, focus: null });
    const chip = nodes.find((n) => n.type === "objectChip")!;
    const { x, y } = chip.position;
    expect(mergedNodes.some((m) => occludes(x, y, m))).toBe(false);
    // Snapped to the nearest clear gutter inside the weave, not walked past the far-right card (x 600).
    expect(x).toBeLessThan(600);
  });

  it("keeps the tight candidate X when the chip sits in a clear inter-lane gutter (no needless shove)", () => {
    const objs = [objNode({ objectKey: "erie", laneKeys: ["laneA", "laneB"] })];
    const woven = wovenGraph(objs, [
      tie({ channelId: "laneA", objectKey: "erie", anchorStepId: "src" }),
      tie({ channelId: "laneB", objectKey: "erie", anchorStepId: "src" }),
    ]);
    const lanes = new Map<string, ChannelLane>([["laneA", lane({ offsetY: 0 })], ["laneB", lane({ offsetY: 400 })]]);
    // Cards sit only in the two lane rows (y 40 and y 440); the chip's mean-Y lands in the wide gutter between
    // them, so even a card sharing its X does not overlap it — the chip should NOT be shoved off to the right.
    const mergedNodes: Node[] = [
      { id: "laneA::src", position: { x: 0, y: 40 }, data: {} },
      { id: "laneA::next", position: { x: 600, y: 40 }, data: {} },
      { id: "laneB::mid", position: { x: 260, y: 440 }, data: {} },
    ];
    const { nodes } = buildWovenOverlay({ woven, lanes, mergedNodes, axis: "objects", zoom: 1, focus: null });
    const chip = nodes.find((n) => n.type === "objectChip")!;
    const { x, y } = chip.position;
    expect(mergedNodes.some((m) => occludes(x, y, m))).toBe(false);
    // It kept a tight X near the anchor gutter (~248), not walked to the far edge.
    expect(x).toBeLessThan(500);
  });
});
