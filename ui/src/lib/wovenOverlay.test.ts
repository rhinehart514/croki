import { describe, it, expect } from "vitest";
import type { Node } from "@xyflow/react";
import { buildWovenOverlay, buildLoopBackLayer, focusIsEffective, anchorNodeId } from "@/lib/wovenOverlay";
import type { ChannelLane } from "@/lib/channelLanes";
import type { WovenGraph, WovenObjectNode, WovenTie, WovenCanvas, WovenCanvasOutcome } from "@/types";

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

// ── The loop-back layer (the experiment-machine's new primitive) ─────────────────────────────────────
// Outcomes and warm leads circle back to the FRONT of the pipeline that produced them. The stroke sources
// from the outcome anchor and targets the leftmost rendered step of its originating channel.
function outcome(over: Partial<WovenCanvasOutcome> & { id: string; channelId: string }): WovenCanvasOutcome {
  return {
    id: over.id,
    ref: over.ref ?? { type: "outcome", id: over.id },
    body: over.body ?? null,
    kind: over.kind ?? "observed-response",
    label: over.label ?? over.id,
    channelId: over.channelId,
  };
}
function canvasWith(outcomes: WovenCanvasOutcome[]): WovenCanvas {
  return {
    anchors: outcomes.map((o) => ({
      id: `anchor:outcome:${o.id}`,
      ref: o.ref,
      kind: "outcome",
      label: o.label,
      body: null,
      authority: { owner: "gtm-results", id: o.id, projectId: "p", updatedAt: null },
    })),
    relationships: [],
    outcomes,
    state: { kind: "ready", stale: false, issues: [] },
    geometry: null,
  };
}
// The merged canvas: laneA has two steps (front at x=0, back at x=600); laneB is a distractor lane.
function mergedTwoStepLanes(): Node[] {
  return [
    { id: "laneA::front", position: { x: 0, y: 40 }, data: {} },
    { id: "laneA::back", position: { x: 600, y: 40 }, data: {} },
    { id: "laneB::front", position: { x: 0, y: 260 }, data: {} },
  ];
}

describe("buildLoopBackLayer", () => {
  it("loops an outcome back to the FRONT (leftmost step) of its originating pipeline", () => {
    const o = outcome({ id: "o1", channelId: "laneA", kind: "business-outcome" });
    const canvas = canvasWith([o]);
    const merged = mergedTwoStepLanes();
    const drawn = new Set<string>([...merged.map((n) => n.id), anchorNodeId(o.ref)]);
    const edges = buildLoopBackLayer(canvas, merged, drawn, null);
    expect(edges).toHaveLength(1);
    expect(edges[0].source).toBe(anchorNodeId(o.ref));
    // Lands on the front (x=0) step, not the back (x=600) one.
    expect(edges[0].target).toBe("laneA::front");
    expect(edges[0].className).toContain("woven-loopback");
  });

  it("marks a warm lead (an observed reply still in play) with is-warm; a close is not warm", () => {
    const warm = outcome({ id: "w", channelId: "laneA", kind: "observed-response" });
    const closed = outcome({ id: "c", channelId: "laneA", kind: "business-outcome" });
    const canvas = canvasWith([warm, closed]);
    const merged = mergedTwoStepLanes();
    const drawn = new Set<string>([...merged.map((n) => n.id), anchorNodeId(warm.ref), anchorNodeId(closed.ref)]);
    const edges = buildLoopBackLayer(canvas, merged, drawn, null);
    const warmEdge = edges.find((e) => e.id === "loopback:w")!;
    const closedEdge = edges.find((e) => e.id === "loopback:c")!;
    expect(warmEdge.className).toContain("is-warm");
    expect(closedEdge.className).not.toContain("is-warm");
  });

  it("skips an outcome with no originating pipeline, and one whose front step is not rendered", () => {
    const noChannel = outcome({ id: "n", channelId: "" });
    const unrendered = outcome({ id: "u", channelId: "laneGONE" });
    const canvas = canvasWith([noChannel, unrendered]);
    const merged = mergedTwoStepLanes();
    const drawn = new Set<string>([...merged.map((n) => n.id), anchorNodeId(noChannel.ref), anchorNodeId(unrendered.ref)]);
    expect(buildLoopBackLayer(canvas, merged, drawn, null)).toHaveLength(0);
  });

  it("skips an outcome whose own anchor is not drawn (honest, never a stranded edge)", () => {
    const o = outcome({ id: "o1", channelId: "laneA" });
    const canvas = canvasWith([o]);
    const merged = mergedTwoStepLanes();
    // Anchor id deliberately omitted from the drawn set.
    const drawn = new Set<string>(merged.map((n) => n.id));
    expect(buildLoopBackLayer(canvas, merged, drawn, null)).toHaveLength(0);
  });

  it("is emitted by buildWovenOverlay on the objects axis and absent on the type axis", () => {
    const o = outcome({ id: "o1", channelId: "laneA", kind: "observed-response" });
    const canvas = canvasWith([o]);
    const woven = wovenGraph([objNode({ objectKey: "erie", laneKeys: ["laneA"] })], [
      tie({ channelId: "laneA", objectKey: "erie", anchorStepId: "front" }),
    ]);
    const lanes = new Map<string, ChannelLane>([["laneA", lane({ offsetY: 0 })]]);
    const mergedNodes = mergedTwoStepLanes();
    const objectAxis = buildWovenOverlay({ woven, lanes, mergedNodes, axis: "objects", zoom: 1, focus: null, canvas });
    expect(objectAxis.edges.some((e) => e.className?.includes("woven-loopback"))).toBe(true);
    const typeAxis = buildWovenOverlay({ woven, lanes, mergedNodes, axis: "type", zoom: 0.2, focus: null, canvas });
    expect(typeAxis.edges.some((e) => e.className?.includes("woven-loopback"))).toBe(false);
  });
});

// ── No-home coverage: an outcome with NO originating pipeline loops back to its nearest HONEST anchor (the
// question it answered, or a product it names), in the same calm motion vocabulary — retiring the old static
// return edge. Never to a fake or undrawn target.
function canvasWithAnchors(
  outcomes: WovenCanvasOutcome[],
  extraAnchors: WovenCanvas["anchors"],
): WovenCanvas {
  const base = canvasWith(outcomes);
  return { ...base, anchors: [...base.anchors, ...extraAnchors] };
}
function anchor(kind: string, ref: { type: string; id: string }, label = ref.id): WovenCanvas["anchors"][number] {
  return { id: `anchor:${kind}:${ref.id}`, ref, kind, label, body: null, authority: { owner: "x", id: ref.id, projectId: "p", updatedAt: null } };
}

describe("buildLoopBackLayer — no-home coverage", () => {
  it("loops a pipeline-less outcome back to the QUESTION it answered when that anchor is drawn", () => {
    const q = anchor("question", { type: "question", id: "q1" }, "Which segment?");
    const o = outcome({ id: "o1", channelId: "", kind: "business-outcome" });
    (o as WovenCanvasOutcome).questionId = "q1";
    const canvas = canvasWithAnchors([o], [q]);
    const merged = mergedTwoStepLanes();
    const drawn = new Set<string>([...merged.map((n) => n.id), anchorNodeId(o.ref), anchorNodeId(q.ref)]);
    const edges = buildLoopBackLayer(canvas, merged, drawn, null);
    expect(edges).toHaveLength(1);
    expect(edges[0].source).toBe(anchorNodeId(o.ref));
    expect(edges[0].target).toBe(anchorNodeId(q.ref));
    expect(edges[0].className).toContain("woven-loopback");
  });

  it("falls back to a PRODUCT anchor it names when there is no question", () => {
    const p = anchor("product-thing", { type: "thing", id: "device" }, "Monitored device");
    const o = outcome({ id: "o2", channelId: "", kind: "business-outcome" });
    (o as WovenCanvasOutcome).productRefs = ["device"];
    const canvas = canvasWithAnchors([o], [p]);
    const merged = mergedTwoStepLanes();
    const drawn = new Set<string>([...merged.map((n) => n.id), anchorNodeId(o.ref), anchorNodeId(p.ref)]);
    const edges = buildLoopBackLayer(canvas, merged, drawn, null);
    expect(edges).toHaveLength(1);
    expect(edges[0].target).toBe(anchorNodeId(p.ref));
  });

  // FIX 6: a colliding ref.id on a NON-product anchor must NOT be targeted by a product-ref fallback. The
  // old code matched any drawn anchor with the same ref.id — so a question/run/person sharing the id would
  // be stroked to. The fallback now requires the matched anchor to actually be a product anchor.
  it("does NOT target a same-id NON-product anchor for a product-ref fallback (wrong-target guard)", () => {
    // A non-product anchor (a question) that happens to share the ref.id the outcome's productRef names.
    const collidingQuestion = anchor("question", { type: "question", id: "device" }, "A question, not a product");
    const o = outcome({ id: "o-collide", channelId: "", kind: "business-outcome" });
    (o as WovenCanvasOutcome).productRefs = ["device"];
    // No question the outcome answers, so the product-ref fallback is the only path — and the only drawn
    // anchor with id "device" is the colliding QUESTION, which must be rejected.
    const canvas = canvasWithAnchors([o], [collidingQuestion]);
    const merged = mergedTwoStepLanes();
    const drawn = new Set<string>([...merged.map((n) => n.id), anchorNodeId(o.ref), anchorNodeId(collidingQuestion.ref)]);
    // Nothing honest to target → no stroke, never a wrong-target stroke to the question.
    expect(buildLoopBackLayer(canvas, merged, drawn, null)).toHaveLength(0);
  });

  it("still targets the PRODUCT anchor when both a colliding non-product and the real product anchor are drawn", () => {
    const collidingRun = anchor("run", { type: "run", id: "device" }, "A run sharing the id");
    const realProduct = anchor("product-thing", { type: "thing", id: "device" }, "Monitored device");
    const o = outcome({ id: "o-both", channelId: "", kind: "business-outcome" });
    (o as WovenCanvasOutcome).productRefs = ["device"];
    const canvas = canvasWithAnchors([o], [collidingRun, realProduct]);
    const merged = mergedTwoStepLanes();
    const drawn = new Set<string>([
      ...merged.map((n) => n.id),
      anchorNodeId(o.ref),
      anchorNodeId(collidingRun.ref),
      anchorNodeId(realProduct.ref),
    ]);
    const edges = buildLoopBackLayer(canvas, merged, drawn, null);
    expect(edges).toHaveLength(1);
    expect(edges[0].target).toBe(anchorNodeId(realProduct.ref));
  });

  it("carries the warm ember register to a no-home warm lead just like a pipelined one", () => {
    const q = anchor("question", { type: "question", id: "q1" });
    const warm = outcome({ id: "w", channelId: "", kind: "observed-response" });
    (warm as WovenCanvasOutcome).questionId = "q1";
    const canvas = canvasWithAnchors([warm], [q]);
    const merged = mergedTwoStepLanes();
    const drawn = new Set<string>([...merged.map((n) => n.id), anchorNodeId(warm.ref), anchorNodeId(q.ref)]);
    const edges = buildLoopBackLayer(canvas, merged, drawn, null);
    expect(edges[0].className).toContain("is-warm");
  });

  it("never strokes to a fake target: a no-home outcome whose question/product anchor is not drawn is skipped", () => {
    const o = outcome({ id: "o3", channelId: "" });
    (o as WovenCanvasOutcome).questionId = "q-missing";
    (o as WovenCanvasOutcome).productRefs = ["p-missing"];
    const canvas = canvasWith([o]); // no question/product anchor drawn
    const merged = mergedTwoStepLanes();
    const drawn = new Set<string>([...merged.map((n) => n.id), anchorNodeId(o.ref)]);
    expect(buildLoopBackLayer(canvas, merged, drawn, null)).toHaveLength(0);
  });

  it("prefers the pipeline front over the no-home anchor when the outcome HAS a resolvable pipeline", () => {
    const q = anchor("question", { type: "question", id: "q1" });
    const o = outcome({ id: "o4", channelId: "laneA", kind: "business-outcome" });
    (o as WovenCanvasOutcome).questionId = "q1";
    const canvas = canvasWithAnchors([o], [q]);
    const merged = mergedTwoStepLanes();
    const drawn = new Set<string>([...merged.map((n) => n.id), anchorNodeId(o.ref), anchorNodeId(q.ref)]);
    const edges = buildLoopBackLayer(canvas, merged, drawn, null);
    expect(edges[0].target).toBe("laneA::front"); // pipeline front wins
  });

  it("loops a no-home outcome back even with zero pipeline lanes (object axis, no merged step cards)", () => {
    const q = anchor("question", { type: "question", id: "q1" });
    const o = outcome({ id: "o5", channelId: "", kind: "business-outcome" });
    (o as WovenCanvasOutcome).questionId = "q1";
    const canvas = canvasWithAnchors([o], [q]);
    const edges = buildLoopBackLayer(canvas, [], new Set([anchorNodeId(o.ref), anchorNodeId(q.ref)]), null);
    expect(edges).toHaveLength(1);
    expect(edges[0].target).toBe(anchorNodeId(q.ref));
  });
});
