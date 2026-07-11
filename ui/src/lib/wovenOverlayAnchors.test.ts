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
  it("renders dozens of peer goals, open work kinds, and their native relationship without inventing a lead goal", () => {
    const base = canvasWith();
    const goals = Array.from({ length: 14 }, (_, index) => A("goal", `g${index}`, `Goal ${index}`));
    const work = A("goal", "brief", "A work artifact whose open kind is also goal");
    work.ref = { type: "work-artifact", id: "brief" };
    const canvas: WovenCanvas = {
      ...base,
      anchors: [...base.anchors, ...goals, work],
      relationships: [...base.relationships, rel({ type: "goal", id: "g0" }, "current-work", work.ref as { type: string; id: string })],
    };
    const layer = buildCanvasAnchorLayer(canvas, { top: 0, bottom: 400, minX: 300, maxX: 900 }, null);
    expect(layer.nodes.filter((node) => (node.data as { ref?: { type?: string } }).ref?.type === "goal")).toHaveLength(14);
    expect(layer.nodes.filter((node) => node.id === anchorNodeId({ type: "work-artifact", id: "brief" }))).toHaveLength(1);
    expect(layer.edges.some((edge) => edge.id.includes("current-work"))).toBe(true);
  });

  it("carries advisory shared-goal conflict state onto the goals and shared object", () => {
    const goal = A("goal", "g1", "Fix activation");
    const work = A("brief", "shared", "Onboarding change");
    work.ref = { type: "work-artifact", id: "shared" };
    work.id = "anchor:work-artifact:shared";
    const marker = {
      id: "goal-conflict:work-artifact:shared", goalCount: 2,
      summary: "2 active goals share work-artifact shared",
      detail: "Fix activation; Clarify positioning both touch this object. Shared context is not proof of incompatibility.",
    };
    goal.facets = { goalConflicts: [marker] };
    work.facets = { goalConflicts: [marker] };
    const layer = buildCanvasAnchorLayer({ ...canvasWith(), anchors: [goal, work], relationships: [] }, band, null);
    const goalData = layer.nodes.find((node) => node.id === anchorNodeId(goal.ref))?.data as { conflict?: { count: number; goalCount: number; detail: string } };
    const workData = layer.nodes.find((node) => node.id === anchorNodeId(work.ref))?.data as { conflict?: { count: number; detail: string } };
    expect(goalData.conflict?.count).toBe(1);
    expect(goalData.conflict?.goalCount).toBe(2);
    expect(workData.conflict?.detail).toMatch(/not proof/i);
  });

  it("restores founder positions from canonical anchor geometry and keeps goal/work anchors draggable", () => {
    const goal = A("goal", "g1", "Find the first ten teams");
    const work = A("brief", "w1", "Launch brief");
    work.ref = { type: "work-artifact", id: "w1" };
    work.id = "anchor:work-artifact:w1";
    const canvas: WovenCanvas = {
      ...canvasWith(),
      anchors: [goal, work],
      relationships: [],
      geometry: {
        namespace: "project-canvas",
        positions: {
          "anchor:goal:g1": { x: 111, y: 222 },
          "anchor:work-artifact:w1": { x: 777, y: 333 },
          // A presentation id is deliberately ignored. Geometry belongs to canonical authorities.
          "canchor:goal:g1": { x: 999, y: 999 },
        },
      },
    };
    const { nodes } = buildCanvasAnchorLayer(canvas, band, null);
    const goalNode = nodes.find((node) => node.id === anchorNodeId(goal.ref))!;
    const workNode = nodes.find((node) => node.id === anchorNodeId(work.ref))!;
    expect(goalNode.position).toEqual({ x: 111, y: 222 });
    expect(workNode.position).toEqual({ x: 777, y: 333 });
    expect(goalNode.draggable).toBe(true);
    expect(workNode.draggable).toBe(true);
  });

  it("shows a work region as draggable spatial ground using only its own authority geometry", () => {
    const region = A("work-region", "activation", "Fix activation");
    region.ref = { type: "work-region", id: "activation" };
    const regionBody = { id: "activation", projectId: "p1", title: "Fix activation", purpose: null, memberRefs: [], position: { x: 345, y: 234 }, size: { width: 720, height: 480 }, collapsed: false, founderPlaced: true, revision: 2 };
    region.body = regionBody;
    const { nodes, edges } = buildCanvasAnchorLayer({
      ...canvasWith(), anchors: [region, A("goal", "g1", "Improve first value")],
      relationships: [rel(region.ref as { type: string; id: string }, "member", { type: "goal", id: "g1" })],
      regions: [{ ...regionBody, memberRefs: [{ type: "goal", id: "g1" }] }],
    }, band, null);
    const node = nodes.find((item) => item.id === anchorNodeId(region.ref));
    expect(node?.position).toEqual({ x: 345, y: 234 });
    expect(node?.type).toBe("canvasRegion");
    expect(node?.draggable).toBe(true);
    expect(node?.style).toMatchObject({ width: 720, height: 480 });
    expect((node?.data as { memberCount?: number }).memberCount).toBe(1);
    expect(edges).toHaveLength(0);
  });

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

  it("makes only explicit explanatory authorities selectable and marks model reads as proposed", () => {
    const goalA = A("goal", "ga", "Activation");
    const goalB = A("goal", "gb", "Retention");
    const explicit: WovenCanvasRelationship = {
      id: "relation:goal-relation:gr-1", source: goalA.ref, target: goalB.ref,
      kind: "supports", label: "Activation supports retention", resolved: true,
      disposition: "proposed", capabilities: { inspect: true },
      receipt: { recordRef: { type: "goal-relation", id: "gr-1" } },
      authority: { owner: "goal-store", id: "gr-1", projectId: "p", revision: 0 },
    };
    const derived = rel(goalB.ref as { type: string; id: string }, "related", goalA.ref as { type: string; id: string });
    const layer = buildCanvasAnchorLayer({ ...canvasWith(), anchors: [goalA, goalB], relationships: [explicit, derived] }, band, null);
    const editable = layer.edges.find((edge) => edge.id.includes("gr-1"));
    const inert = layer.edges.find((edge) => edge.id.includes(derived.id));
    expect(editable?.selectable).toBe(true);
    expect(editable?.deletable).toBe(false);
    expect(editable?.className).toContain("is-proposed");
    expect(editable?.label).toBe("Activation supports retention");
    expect(editable?.data).toMatchObject({
      canvasRelationship: { relationshipRef: { type: "goal-relation", id: "gr-1" } },
    });
    expect(inert?.selectable).toBe(false);
    expect(inert?.data).not.toHaveProperty("canvasRelationship");
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

// A deterministic load fixture for the open-canvas contract. These are explicitly fixture authorities,
// never claimed user/customer data: 240 independent goals, 480 work artifacts, and 960 typed relations.
// Rich bodies are deliberately large so the test also proves the canvas projection does not copy them
// into React Flow node data; the selected workbench is the only place that should render artifact bodies.
function denseOpenCanvas(): WovenCanvas {
  const goals = Array.from({ length: 240 }, (_, index) => {
    const anchor = A("goal", `fixture-goal-${index}`, `Fixture goal ${String(index).padStart(3, "0")}`);
    anchor.ref = { type: "goal", id: `fixture-goal-${index}` };
    anchor.body = { statement: anchor.label, fixturePayload: `body-${index}-` + "x".repeat(4_096) };
    return anchor;
  });
  const work = Array.from({ length: 480 }, (_, index) => {
    const anchor = A("brief", `fixture-work-${index}`, `Fixture work ${String(index).padStart(3, "0")}`);
    anchor.id = `anchor:work-artifact:fixture-work-${index}`;
    anchor.ref = { type: "work-artifact", id: `fixture-work-${index}` };
    anchor.body = { content: `artifact-${index}-` + "y".repeat(8_192), contentType: "text/markdown" };
    return anchor;
  });
  const relationships = work.flatMap((anchor, index) => [
    rel({ type: "goal", id: `fixture-goal-${index % goals.length}` }, "current-work", anchor.ref as { type: string; id: string }),
    rel(anchor.ref as { type: string; id: string }, "informs", { type: "goal", id: `fixture-goal-${(index + 37) % goals.length}` }),
  ]);
  return {
    state: { kind: "ready", stale: false, issues: [] },
    geometry: null,
    anchors: [...goals, ...work],
    relationships,
  };
}

describe("woven overlay — deterministic dense open canvas", () => {
  it("projects hundreds of peer goals and work authorities with stable geometry in bounded time", () => {
    const canvas = denseOpenCanvas();
    const started = performance.now();
    const first = buildCanvasAnchorLayer(canvas, band, null);
    const elapsed = performance.now() - started;
    const second = buildCanvasAnchorLayer(canvas, band, null);

    expect(first.nodes).toHaveLength(720);
    expect(first.edges).toHaveLength(960);
    expect(first.nodes.map((node) => [node.id, node.position])).toEqual(second.nodes.map((node) => [node.id, node.position]));
    // This is a broad regression ceiling rather than a frame benchmark; interaction work is protected by
    // React Flow's visible-element virtualization. It catches accidental quadratic projection on CI.
    expect(elapsed).toBeLessThan(1_000);
  });

  it("focus-traces a dense relationship set without copying off-screen rich bodies into node data", () => {
    const canvas = denseOpenCanvas();
    const focusedId = anchorNodeId({ type: "goal", id: "fixture-goal-137" });
    const { nodes } = buildCanvasAnchorLayer(canvas, band, { kind: "anchor", anchorId: focusedId });
    const focused = nodes.filter((node) => (node.data as { focus?: string }).focus === "focus");

    expect(focused.some((node) => node.id === focusedId)).toBe(true);
    expect(focused.some((node) => node.id.startsWith("canchor:work-artifact:"))).toBe(true);
    expect(nodes.some((node) => (node.data as { focus?: string }).focus === "dim")).toBe(true);
    expect(JSON.stringify(nodes.map((node) => node.data))).not.toContain("artifact-137-");
    expect(JSON.stringify(nodes.map((node) => node.data))).not.toContain("body-137-");
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
