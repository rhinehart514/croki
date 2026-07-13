import { describe, it, expect } from "vitest";
import type { Node, Edge } from "@xyflow/react";
import { buildWovenOverlay, buildCanvasAnchorLayer, anchorNodeId, groupNodeId, alignGatesToWall, projectFounderWall } from "@/lib/wovenOverlay";
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
  it("shows a prioritized, deduplicated grounded read instead of repeated scanner tokens", () => {
    const anchors = [
      A("product-truth", "segment-1", "Segment"),
      A("product-truth", "segment-2", "segment"),
      A("product-truth", "utm", "utm_source"),
      A("product-truth", "claim", "Signup captures campaign attribution before workspace creation"),
      A("product-truth", "sharing", "External clients can read a shared brief without buying a seat"),
    ];
    const layer = buildCanvasAnchorLayer({ ...canvasWith(), anchors, relationships: [] }, band, null);
    const rendered = layer.nodes.map((node) => (node.data as { label?: string }).label);
    expect(rendered).toEqual([
      "Signup captures campaign attribution before workspace creation",
      "External clients can read a shared brief without buying a seat",
      "utm_source",
    ]);
  });

  it("renders one product landmark when project and product-model authorities share a label", () => {
    const product = A("product", "project", "RodentRadar");
    const model = A("product-model", "model", "RodentRadar");
    const layer = buildCanvasAnchorLayer({ ...canvasWith(), anchors: [product, model], relationships: [] }, band, null);
    expect(layer.nodes).toHaveLength(1);
  });

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

  it("renders product-truth, question, and outcome anchors as nodes; the static return edge is retired", () => {
    const layer = buildCanvasAnchorLayer(canvasWith(), { top: 0, bottom: 200, minX: 300, maxX: 300 }, null);
    const ids = layer.nodes.map((n: Node) => n.id);
    expect(ids).toContain(anchorNodeId({ type: "productTruth", id: "t1" }));
    expect(ids).toContain(anchorNodeId({ type: "question", id: "q1" }));
    expect(ids).toContain(anchorNodeId({ type: "outcome", id: "r1" }));
    expect(layer.nodes.every((n) => n.type === "canvasAnchor")).toBe(true);
    // The static dashed `returns-to` stroke is RETIRED: what came back now loops home through the animated
    // loop-back layer, so the anchor layer draws no `return:*` (or `woven-return`) edge at all.
    expect(layer.edges.some((e: Edge) => e.id === "return:relA")).toBe(false);
    expect(layer.edges.some((e: Edge) => (e.className ?? "").includes("woven-return"))).toBe(false);
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
  const kinds = [
    "product-thing", "product-goal", "product-state", "product-ia", "product-workflow",
    "product-interaction", "product-transition", "product-relationship",
  ];
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
    // The rendered set is BOUNDED: root + 2 truths + 3 questions + 1 outcome + one progressive Product
    // details landmark, even when the underlying model spans many open categories.
    expect(nodes.length).toBe(8);
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

  it("renders one product-details landmark and reveals the real categories on focus", () => {
    const { nodes } = buildCanvasAnchorLayer(bigCanvas(), band, null);
    const groups = nodes.filter((n) => (n.data as { group?: boolean }).group);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.id).toBe(groupNodeId("product-details"));
    expect((groups[0]?.data as { count?: number }).count).toBe(102);
    // Connected and unconnected members alike stay inside their kind summary until the founder opens it.
    expect(nodes.some((n) => n.id === anchorNodeId({ type: "thing", id: "connected-thing" }))).toBe(false);
    expect(nodes.some((n) => n.id === anchorNodeId({ type: "thing", id: "d0" }))).toBe(false);

    const categories = buildCanvasAnchorLayer(bigCanvas(), band, { kind: "anchor", anchorId: groupNodeId("product-details"), ref: { type: "group", id: "product-details" } });
    expect(categories.nodes.filter((node) => (node.data as { group?: boolean }).group)).toHaveLength(8);
    expect(categories.nodes.some((node) => node.id === groupNodeId("product-thing"))).toBe(true);
  });

  it("expands a kind's members on focus (zoom/focus access to the collapsed tail), stable selection", () => {
    const c = bigCanvas();
    const collapsed = buildCanvasAnchorLayer(c, band, null);
    expect(collapsed.nodes.some((n) => n.id === groupNodeId("product-details"))).toBe(true);
    const categories = buildCanvasAnchorLayer(c, band, { kind: "anchor", anchorId: groupNodeId("product-details"), ref: { type: "group", id: "product-details" } });
    expect(categories.nodes.some((n) => n.id === groupNodeId("product-thing"))).toBe(true);
    // Focusing the summary chip expands that kind: its members now render individually.
    const focused = buildCanvasAnchorLayer(c, band, { kind: "anchor", anchorId: groupNodeId("product-thing"), ref: { type: "group", id: "product-thing" } });
    expect(focused.nodes.some((n) => n.id === anchorNodeId({ type: "thing", id: "d0" }))).toBe(true);
    // The expanded members are lit; an unrelated question recedes — focus-to-trace intact.
    const d0 = focused.nodes.find((n) => n.id === anchorNodeId({ type: "thing", id: "d0" }))!;
    expect((d0.data as { focus?: string }).focus).toBe("focus");
    const q2 = focused.nodes.find((n) => n.id === anchorNodeId({ type: "question", id: "q2" }))!;
    expect((q2.data as { focus?: string }).focus).toBe("dim");
    // Other categories return behind the one Product details landmark while this kind is inspected.
    expect(focused.nodes.some((n) => n.id === groupNodeId("product-details"))).toBe(false);
  });

  it("keeps the outcome and its question individual across the collapse, and draws no static return edge", () => {
    const canvas = bigCanvas();
    const { nodes, edges } = buildCanvasAnchorLayer(canvas, band, null);
    // Both endpoints of the returns-to relationship survive the collapse as individual, home-able anchors —
    // the loop-back needs them present to carry the outcome home. The `returns-to` relationship data itself
    // is preserved on the canvas (canvasProjection derives questionId/productRefs from it).
    expect(nodes.some((n) => n.id === anchorNodeId({ type: "outcome", id: "o1" }))).toBe(true);
    expect(nodes.some((n) => n.id === anchorNodeId({ type: "question", id: "q1" }))).toBe(true);
    expect(canvas.relationships.some((r) => r.kind === "returns-to")).toBe(true);
    // But the STATIC return stroke is retired — the animated loop-back layer now owns the return motion.
    expect(edges.some((e: Edge) => e.source === anchorNodeId({ type: "outcome", id: "o1" }) && e.target === anchorNodeId({ type: "question", id: "q1" }))).toBe(false);
  });

  it("summarizes inferred reads while keeping outcomes visible and both groups expandable", () => {
    const base = canvasWith();
    const openings = Array.from({ length: 7 }, (_, index) => A("terrain-opening", `opening-${index}`, `Opening ${index}`));
    const outcomes = Array.from({ length: 6 }, (_, index) => A("outcome", `outcome-${index}`, `Outcome ${index}`));
    const canvas = { ...base, anchors: [...openings, ...outcomes], relationships: [] };

    const collapsed = buildCanvasAnchorLayer(canvas, band, null);
    expect(collapsed.nodes.filter((node) => (node.data as { kind?: string; group?: boolean }).kind === "terrain-opening" && !(node.data as { group?: boolean }).group)).toHaveLength(0);
    expect(collapsed.nodes.filter((node) => (node.data as { kind?: string; group?: boolean }).kind === "outcome" && !(node.data as { group?: boolean }).group)).toHaveLength(1);
    expect((collapsed.nodes.find((node) => node.id === groupNodeId("terrain-opening"))?.data as { count?: number; groupType?: string; label?: string })).toMatchObject({ count: 7, groupType: "summary", label: "Inferred openings" });
    expect((collapsed.nodes.find((node) => node.id === groupNodeId("outcome"))?.data as { count?: number; groupType?: string })).toMatchObject({ count: 5, groupType: "overflow" });

    const expanded = buildCanvasAnchorLayer(canvas, band, { kind: "anchor", anchorId: groupNodeId("terrain-opening"), ref: { type: "group", id: "terrain-opening" } });
    expect(expanded.nodes.filter((node) => (node.data as { kind?: string }).kind === "terrain-opening")).toHaveLength(7);
    expect(expanded.nodes.some((node) => node.id === groupNodeId("terrain-opening"))).toBe(false);
    expect(expanded.nodes.some((node) => node.id === groupNodeId("outcome"))).toBe(true);
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

// ── One founder wall: geometry + optional gate-x alignment (docs/production-direction/16, P1) ──
describe("founder wall projection", () => {
  const lanes = new Map([
    ["a", { offsetY: 0, height: 100, centerX: 200 }],
    ["b", { offsetY: 120, height: 100, centerX: 200 }],
  ]);
  const gate = (ch: string, x: number, id = `${ch}-gate`) => ({ id, position: { x, y: 0 }, data: { channelId: ch, node: { category: "gate" } } });
  const step = (ch: string, x: number, id = `${ch}-step`) => ({ id, position: { x, y: 0 }, data: { channelId: ch, node: { category: "generate" } } });

  it("projects one gated lane without moving its persisted positions", () => {
    const nodes = [step("a", 100), gate("a", 300), step("b", 100)];
    const { nodes: out, wall } = alignGatesToWall(nodes, lanes);
    expect(out).toBe(nodes);
    expect(out.find((node) => node.id === "a-gate")!.position.x).toBe(300);
    expect(wall).toEqual({ x: 300, top: 0, bottom: 100 });
  });

  it("aligns multiple gated lanes to the rightmost gate and spans their full band", () => {
    const nodes = [step("a", 100), gate("a", 300), step("b", 100), gate("b", 500)];
    const originalPositions = nodes.map((node) => ({ ...node.position }));
    const { nodes: out, wall } = alignGatesToWall(nodes, lanes);
    const gates = out.filter((node) => (node.data as { node?: { category?: string } }).node?.category === "gate");
    expect(new Set(gates.map((node) => node.position.x))).toEqual(new Set([500]));
    expect(out.find((node) => node.id === "a-step")!.position.x).toBe(300);
    expect(wall).toEqual({ x: 500, top: 0, bottom: 220 });
    expect(nodes.map((node) => node.position)).toEqual(originalPositions);
  });

  it("can project multiple gates without aligning any node", () => {
    const nodes = [gate("a", 300), gate("b", 500)];
    const result = alignGatesToWall(nodes, lanes, { align: false });
    expect(result.nodes).toBe(nodes);
    expect(result.nodes.map((node) => node.position.x)).toEqual([300, 500]);
    expect(result.wall).toEqual({ x: 500, top: 0, bottom: 220 });
  });

  it("returns no wall and preserves nodes when there are no gates", () => {
    const nodes = [step("a", 100), step("b", 100)];
    const { nodes: out, wall } = alignGatesToWall(nodes, lanes);
    expect(out).toBe(nodes);
    expect(wall).toBeNull();
  });

  it("projects a non-actionable conceptual wall for zero pipelines from the supplied canvas band", () => {
    const band = { top: 40, bottom: 640, minX: -120, maxX: 880 };
    expect(projectFounderWall([], new Map(), band)).toEqual({ x: 880, top: 40, bottom: 640 });
    const result = alignGatesToWall([], new Map(), { conceptualBand: band });
    expect(result.nodes).toEqual([]);
    expect(result.wall).toEqual({ x: 880, top: 40, bottom: 640 });
  });
});
