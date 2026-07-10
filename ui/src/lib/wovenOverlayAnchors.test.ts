import { describe, it, expect } from "vitest";
import type { Node, Edge } from "@xyflow/react";
import { buildWovenOverlay, buildCanvasAnchorLayer, anchorNodeId, groupNodeId, alignGatesToWall } from "@/lib/wovenOverlay";
import type { ChannelLane } from "@/lib/channelLanes";
import type { WovenCanvas, WovenCanvasAnchor, WovenCanvasRelationship, WovenGraph } from "@/types";

// A weaving with no objects — isolates the anchor layer (fix 3) so its nodes/edges are unambiguous.
function emptyWoven(): WovenGraph {
  return {
    projectId: "p", objectNodes: [], ties: [], kindClusters: [], laneKinds: {}, collapsedByLane: {},
    stats: { objectCount: 0, drawnObjectCount: 0, collapsedObjectCount: 0, tieCount: 0, drawnTieCount: 0, kindCount: 0 },
  };
}
function canvasWith(): WovenCanvas {
  return {
    state: { kind: "ready", stale: false, issues: [] },
    geometry: null,
    anchors: [
      { id: "a1", kind: "product-truth", ref: { type: "productTruth", id: "t1" }, label: "Tracks project_created", body: {}, authority: { owner: "x", id: "t1", projectId: "p", updatedAt: null } },
      { id: "a2", kind: "question", ref: { type: "question", id: "q1" }, label: "Which segment?", body: {}, authority: { owner: "x", id: "q1", projectId: "p", updatedAt: null } },
      { id: "a3", kind: "outcome", ref: { type: "outcome", id: "r1" }, label: "reply", body: {}, authority: { owner: "x", id: "r1", projectId: "p", updatedAt: null } },
    ],
    relationships: [
      { id: "relA", source: { type: "outcome", id: "r1" }, target: { type: "question", id: "q1" }, kind: "returns-to", resolved: true, authority: { owner: "x", projectId: "p" } },
    ],
  };
}
const lanes = new Map<string, ChannelLane>([["ch1", { offsetY: 0, height: 200, centerX: 300, centerY: 100 }]]);

describe("woven overlay — canvas anchor layer (fix 3)", () => {
  it("renders product-truth, question, and outcome anchors as nodes plus the return edge", () => {
    const layer = buildCanvasAnchorLayer(canvasWith(), { top: 0, bottom: 200, minX: 300, maxX: 300 }, null);
    const ids = layer.nodes.map((n: Node) => n.id);
    expect(ids).toContain(anchorNodeId({ type: "productTruth", id: "t1" }));
    expect(ids).toContain(anchorNodeId({ type: "question", id: "q1" }));
    expect(ids).toContain(anchorNodeId({ type: "outcome", id: "r1" }));
    expect(layer.nodes.every((n) => n.type === "canvasAnchor")).toBe(true);
    // The outcome returns to the question — a dashed return edge between the two anchors.
    const ret = layer.edges.find((e: Edge) => e.id === "return:relA");
    expect(ret).toBeTruthy();
    expect(ret?.source).toBe(anchorNodeId({ type: "outcome", id: "r1" }));
    expect(ret?.target).toBe(anchorNodeId({ type: "question", id: "q1" }));
  });

  it("places product/question landmarks left of the lane band and outcomes to the right", () => {
    const layer = buildCanvasAnchorLayer(canvasWith(), { top: 0, bottom: 200, minX: 300, maxX: 300 }, null);
    const q = layer.nodes.find((n) => n.id === anchorNodeId({ type: "question", id: "q1" }))!;
    const o = layer.nodes.find((n) => n.id === anchorNodeId({ type: "outcome", id: "r1" }))!;
    expect(q.position.x).toBeLessThan(300);   // landmark column, left of the band
    expect(o.position.x).toBeGreaterThan(300); // outcomes return from the right
  });

  it("anchor focus lights the anchor and its related anchors, dimming the rest", () => {
    const focus = { kind: "anchor" as const, anchorId: anchorNodeId({ type: "outcome", id: "r1" }) };
    const layer = buildCanvasAnchorLayer(canvasWith(), { top: 0, bottom: 200, minX: 300, maxX: 300 }, focus);
    const byId = new Map(layer.nodes.map((n) => [n.id, n.data as { focus?: string }]));
    expect(byId.get(anchorNodeId({ type: "outcome", id: "r1" }))?.focus).toBe("focus");   // the anchor
    expect(byId.get(anchorNodeId({ type: "question", id: "q1" }))?.focus).toBe("focus");   // its related question
    expect(byId.get(anchorNodeId({ type: "productTruth", id: "t1" }))?.focus).toBe("dim"); // unrelated recedes
  });

  it("integrates through buildWovenOverlay additively without disturbing the object weaving", () => {
    const out = buildWovenOverlay({
      woven: emptyWoven(), lanes, mergedNodes: [], axis: "objects", zoom: 1, focus: null, canvas: canvasWith(),
    });
    // The anchors are present alongside (here, in the absence of) any object chips.
    expect(out.nodes.filter((n) => n.type === "canvasAnchor")).toHaveLength(3);
    // No canvas → no anchor nodes (pure weaving, unchanged behavior).
    const bare = buildWovenOverlay({ woven: emptyWoven(), lanes, mergedNodes: [], axis: "objects", zoom: 1, focus: null });
    expect(bare.nodes.filter((n) => n.type === "canvasAnchor")).toHaveLength(0);
  });
});

// ── Semantic collapse of the long-tail product taxonomy (Fit-View legibility) ──
function A(kind: string, id: string, label = id): WovenCanvasAnchor {
  return { id: `anchor:${kind}:${id}`, kind, ref: { type: kind.replace(/^product-/, "") || kind, id }, label, body: {}, authority: { owner: "x", id, projectId: "p", updatedAt: null } };
}
function rel(source: { type: string; id: string }, kind: string, target: { type: string; id: string }): WovenCanvasRelationship {
  return { id: `rel:${source.id}:${kind}:${target.id}`, source, target, kind, resolved: true, authority: { owner: "x", projectId: "p" } };
}
// A canonical projection shaped like RodentRadar: a product root, 3 questions, a few product truths, and a
// large long tail of product-model detail anchors across several kinds — 100+ anchors total.
function bigCanvas(): WovenCanvas {
  const anchors: WovenCanvasAnchor[] = [
    A("product-model", "root", "RodentRadar"),
    A("product-truth", "t1", "Tracks install_completed"),
    A("product-truth", "t2", "Captures acquisition source"),
    A("question", "q1", "Which segment?"),
    A("question", "q2", "Where do wins enter?"),
    A("question", "q3", "Does the pilot convert?"),
    A("outcome", "o1", "Got 3 replies"),
  ];
  // 100 unconnected detail anchors spread across kinds — the long tail that used to form the ladder.
  const kinds = ["product-thing", "product-goal", "product-state", "product-workflow", "product-interaction"];
  for (let i = 0; i < 100; i++) anchors.push(A(kinds[i % kinds.length], `d${i}`, `Detail ${i}`));
  // Two details are causally connected — a question is "about" one, a pipeline "grounds" another.
  anchors.push(A("product-thing", "connected-thing", "The monitored device"));
  anchors.push(A("product-workflow", "connected-flow", "Onboarding flow"));
  const relationships: WovenCanvasRelationship[] = [
    rel({ type: "question", id: "q1" }, "about", { type: "thing", id: "connected-thing" }),
    rel({ type: "thing", id: "connected-flow" }, "grounds", { type: "pipeline", id: "ch1" }),
    rel({ type: "outcome", id: "o1" }, "returns-to", { type: "question", id: "q1" }),
  ];
  return { anchors, relationships, state: { kind: "ready", stale: false, issues: [] }, geometry: null };
}
const band = { top: 0, bottom: 400, minX: 200, maxX: 400 };

describe("woven overlay — semantic collapse of the product taxonomy", () => {
  it("bounds the overlay geometry: 100+ detail anchors collapse to a few per-kind summaries", () => {
    const c = bigCanvas();
    const anchorCount = c.anchors.filter((a) => a.kind.startsWith("product-")).length;
    expect(anchorCount).toBeGreaterThan(100); // the raw tail really is huge
    const { nodes } = buildCanvasAnchorLayer(c, band, null);
    const detailKinds = new Set(c.anchors.filter((a) => a.kind.startsWith("product-") && a.kind !== "product-truth" && a.kind !== "product-model").map((a) => a.kind));
    // The rendered set is BOUNDED: root + 2 truths + 3 questions + 2 connected details + 1 outcome
    // + one summary chip per detail kind — never ~100 postage stamps.
    expect(nodes.length).toBeLessThanOrEqual(9 + detailKinds.size);
    expect(nodes.length).toBeLessThan(20);
    // The vertical extent is bounded too, so Fit View stays legible (no 5000px ladder).
    const maxY = Math.max(...nodes.map((n) => n.position.y));
    expect(maxY).toBeLessThan(20 * 92);
  });

  it("retains ALL questions and the product root as individual, clickable landmarks", () => {
    const { nodes } = buildCanvasAnchorLayer(bigCanvas(), band, null);
    for (const id of ["q1", "q2", "q3"]) {
      expect(nodes.some((n) => n.id === anchorNodeId({ type: "question", id }))).toBe(true);
    }
    expect(nodes.some((n) => n.id === anchorNodeId({ type: "model", id: "root" }))).toBe(true);
  });

  it("keeps causally-connected product details individual, summarizes the unconnected tail", () => {
    const { nodes } = buildCanvasAnchorLayer(bigCanvas(), band, null);
    // The two connected details render individually (causal context retained).
    expect(nodes.some((n) => n.id === anchorNodeId({ type: "thing", id: "connected-thing" }))).toBe(true);
    expect(nodes.some((n) => n.id === anchorNodeId({ type: "workflow", id: "connected-flow" }))).toBe(true);
    // The unconnected tail is represented by summary chips carrying the real counts (data preserved).
    const groups = nodes.filter((n) => (n.data as { group?: boolean }).group);
    expect(groups.length).toBeGreaterThan(0);
    const summarized = groups.reduce((s, g) => s + ((g.data as { count?: number }).count ?? 0), 0);
    expect(summarized).toBe(100); // every one of the 100 unconnected details is accounted for, none dropped
    // No individual chip for an unconnected detail.
    expect(nodes.some((n) => n.id === anchorNodeId({ type: "thing", id: "d0" }))).toBe(false);
  });

  it("expands a kind's members on focus (zoom/focus access to the collapsed tail), stable selection", () => {
    const c = bigCanvas();
    const collapsed = buildCanvasAnchorLayer(c, band, null);
    const thingGroup = collapsed.nodes.find((n) => n.id === groupNodeId("product-thing"))!;
    expect(thingGroup).toBeTruthy();
    // Focusing the summary chip expands that kind: its members now render individually.
    const focused = buildCanvasAnchorLayer(c, band, { kind: "anchor", anchorId: groupNodeId("product-thing"), ref: { type: "group", id: "product-thing" } });
    expect(focused.nodes.some((n) => n.id === anchorNodeId({ type: "thing", id: "d0" }))).toBe(true);
    // The expanded members are lit; an unrelated question recedes — focus-to-trace intact.
    const d0 = focused.nodes.find((n) => n.id === anchorNodeId({ type: "thing", id: "d0" }))!;
    expect((d0.data as { focus?: string }).focus).toBe("focus");
    const q2 = focused.nodes.find((n) => n.id === anchorNodeId({ type: "question", id: "q2" }))!;
    expect((q2.data as { focus?: string }).focus).toBe("dim");
    // Other kinds stay collapsed (only the focused kind expands).
    expect(focused.nodes.some((n) => n.id === groupNodeId("product-goal"))).toBe(true);
  });

  it("preserves the outcome→question return edge across the collapse", () => {
    const { edges } = buildCanvasAnchorLayer(bigCanvas(), band, null);
    expect(edges.some((e: Edge) => e.source === anchorNodeId({ type: "outcome", id: "o1" }) && e.target === anchorNodeId({ type: "question", id: "q1" }))).toBe(true);
  });
});

// ── One founder wall: gate-x alignment across lanes (docs/production-direction/16, P1) ──
describe("alignGatesToWall — one shared founder wall", () => {
  const lanes = new Map([
    ["a", { offsetY: 0, height: 100, centerX: 200 }],
    ["b", { offsetY: 120, height: 100, centerX: 200 }],
  ]);
  const gate = (ch: string, x: number, id = `${ch}-gate`) => ({ id, position: { x, y: 0 }, data: { channelId: ch, node: { category: "gate" } } });
  const step = (ch: string, x: number, id = `${ch}-step`) => ({ id, position: { x, y: 0 }, data: { channelId: ch, node: { category: "generate" } } });

  it("shifts each lane so every gate lands on one shared x, and reports the wall band", () => {
    const nodes = [step("a", 100), gate("a", 300), step("b", 100), gate("b", 500)];
    const { nodes: out, wall } = alignGatesToWall(nodes, lanes);
    const gates = out.filter((n) => (n.data as { node?: { category?: string } }).node?.category === "gate");
    const xs = gates.map((g) => g.position.x);
    expect(new Set(xs).size).toBe(1);        // both gates now share one x
    expect(xs[0]).toBe(500);                  // aligned to the rightmost gate column
    // Lane 'a' shifted right by 200 (500-300), so its step moved with it.
    expect(out.find((n) => n.id === "a-step")!.position.x).toBe(300);
    expect(wall).toEqual({ x: 500, top: 0, bottom: 220 }); // spans the full gated band
  });

  it("is a no-op with fewer than two gated lanes (a single pipeline needs no wall)", () => {
    const nodes = [step("a", 100), gate("a", 300), step("b", 100)];
    const { nodes: out, wall } = alignGatesToWall(nodes, lanes);
    expect(wall).toBeNull();
    expect(out.find((n) => n.id === "a-gate")!.position.x).toBe(300); // unchanged
  });
});
