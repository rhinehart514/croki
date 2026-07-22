import { describe, expect, it } from "vitest";
import type { FirmSemanticModel, MarketMovementIndex } from "@/types";
import { reflowExpandedNeighborhood } from "./productGtmLayout";
import { productGtmTypeLabel, projectProductGtm } from "./productGtmProjection";

const object = (id: string, type: string, name: string, assertion: "founder-asserted" | "tentative" = "founder-asserted") => ({
  id, type, name, statement: `${name} detail`, properties: {}, assertion,
});
const relationship = (id: string, from: string, to: string, label: string, assertion: "founder-asserted" | "tentative" = "founder-asserted") => ({
  id, fromRef: `object:${from}`, toRef: `object:${to}`, label, type: "connected", properties: {}, assertion, sourceRefs: [],
});

const model: FirmSemanticModel = {
  schemaVersion: 3, ventureId: "venture-one", revision: 1,
  objects: [
    object("direction", "direction", "Prove changed work"),
    object("capability", "capability", "Project Drop"),
    object("path", "pipeline", "Project Drop to changed work"),
    object("test", "campaign", "First builder test"),
    object("gap", "open", "No market outcome yet"),
    object("signal", "signal", "Builder is stuck alone"),
    object("read", "working-theory", "What it may do", "tentative"),
  ],
  relationships: [
    relationship("direction-capability", "direction", "capability", "tests through"),
    relationship("capability-path", "capability", "path", "creates"),
    relationship("path-test", "path", "test", "proves through"),
    relationship("test-gap", "test", "gap", "must return evidence to"),
    relationship("signal-path", "signal", "path", "triggers"),
  ],
  modelBranches: [], modelChanges: [], modelMergeReceipts: [], workScopes: [], outwardActions: [],
};

const movement: MarketMovementIndex = {
  ventureId: "venture-one", revision: 1, actions: [], modelBranches: [],
  liveWork: [{ id: "run-one", threadRef: "thread:one", founderIntent: "Test Project Drop", activity: "running", subjectRefs: ["object:capability", "object:path"] }],
};

describe("Product/GTM causal projection", () => {
  it("builds one readable founder-authored consequence spine", () => {
    const graph = projectProductGtm(model, movement);
    const position = (id: string) => graph.nodes.find((node) => node.id === id)?.position;
    const spine = ["direction", "capability", "path", "test", "gap"].map((id) => position(id));

    expect(spine.map((entry) => entry?.x)).toEqual([...spine].map((entry) => entry?.x).sort((a, b) => Number(a) - Number(b)));
    expect(spine[1]?.y).toBeLessThan(spine[0]?.y ?? 0);
    expect(spine[3]?.y).toBeGreaterThan(spine[2]?.y ?? 0);
    expect(spine[4]?.x).toBeGreaterThan(spine[3]?.x ?? 0);
    expect(graph.edges.filter((entry) => entry.className?.includes("is-spine")).map((entry) => entry.label)).toEqual([
      "tests through", "creates", "proves through", "returns evidence",
    ]);
    expect(graph.edges.every((entry) => entry.type === "productGtmEdge")).toBe(true);
    expect(graph.edges.find((entry) => entry.id === "direction-capability")?.data).toMatchObject({ crossTerritory: true, sourceTerritory: "shared", targetTerritory: "product" });
    expect(graph.nodes.find((node) => node.id === "direction")?.data.role).toBe("direction");
    expect(graph.nodes.find((node) => node.id === "capability")?.data.role).toBe("product");
    expect(graph.nodes.find((node) => node.id === "path")?.data.role).toBe("path");
    expect(graph.nodes.find((node) => node.id === "test")?.data.role).toBe("market-test");
    expect(graph.nodes.find((node) => node.id === "gap")?.data.role).toBe("evidence-gap");
    expect(graph.nodes.find((node) => node.id === "signal")?.data.role).toBe("market-signal");
    expect(graph.nodes.find((node) => node.id === "capability")?.data.territory).toBe("product");
    expect(graph.nodes.find((node) => node.id === "test")?.data.territory).toBe("gtm");
    expect(graph.focusName).toBe("Test Project Drop");
    expect(graph.focusSummary).toBe("Live work is attached to what it may change.");
    expect(graph.chapterKind).toBe("active");
  });

  it("keeps supporting, provisional, and live work subordinate to the spine", () => {
    const graph = projectProductGtm(model, movement);
    const byId = (id: string) => graph.nodes.find((node) => node.id === id);

    expect(byId("signal")?.position.y).toBeGreaterThan(byId("path")?.position.y ?? 0);
    expect(byId("read")?.position.y).toBeGreaterThan(byId("path")?.position.y ?? 0);
    expect(byId("read")?.data).toMatchObject({ provisional: true, primary: false, meta: "Provisional read" });
    expect(byId("work:run-one:0")?.position.x).toBe(byId("capability")?.position.x);
    expect(byId("work:run-one:0")?.position.y).toBeGreaterThan(byId("capability")?.position.y ?? 0);
    expect(graph.edges.filter((entry) => entry.id.startsWith("work-edge:"))).toHaveLength(1);
    expect(graph.edges.find((entry) => entry.id.startsWith("work-edge:"))?.targetHandle).toBe("work-target");
    expect(graph.edges.find((entry) => entry.id === "signal-path")).toMatchObject({ type: "productGtmEdge", data: { crossTerritory: true } });
    expect(graph.edges.find((entry) => entry.id === "signal-path")?.label).toBeUndefined();
  });

  it("uses founder language instead of compatibility taxonomy", () => {
    expect(productGtmTypeLabel("pipeline")).toBe("Product / GTM path");
    expect(productGtmTypeLabel("campaign")).toBe("Market test");
    expect(productGtmTypeLabel("channel")).toBe("Route to market");
    expect(productGtmTypeLabel("signal")).toBe("Market reality");
  });

  it("reveals the selected node's local causal neighborhood", () => {
    const graph = projectProductGtm(model, movement, "signal");
    const focused = new Map(graph.nodes.map((node) => [node.id, node.data.focus]));

    expect(focused.get("signal")).toBe(true);
    expect(focused.get("path")).toBe(true);
    expect(focused.get("capability")).toBe(true);
    expect(focused.get("read")).toBe(false);
    expect(graph.chapterKind).toBe("selection");
    expect(graph.focusName).toBe("Builder is stuck alone");
  });

  it("unfolds an adopted GTM workflow into its established operating steps", () => {
    const workflowModel: FirmSemanticModel = {
      ...model,
      objects: [...model.objects, {
        ...object("workflow", "mechanism", "Founder proof loop"),
        properties: { territory: "gtm", workflowGraph: {
          steps: [
            { id: "ready", label: "Proof is ready", type: "trigger" },
            { id: "prepare", label: "Prepare the story", type: "agent-work" },
            { id: "approve", label: "Approve the claim", type: "founder-gate" },
            { id: "publish", label: "Publish proof", type: "external-action" },
            { id: "return", label: "Observe qualified replies", detail: "Bring the exact reply back to the claim.", type: "observation" },
          ],
          edges: [
            { from: "ready", to: "prepare" }, { from: "prepare", to: "approve" },
            { from: "approve", to: "publish" }, { from: "publish", to: "return" },
            { from: "return", to: "prepare", label: "proof sharpens the next story" },
          ],
        } },
      }],
    };
    const graph = projectProductGtm(workflowModel, movement, "workflow");
    const steps = graph.nodes.filter((node) => node.data.kind === "workflow");

    expect(steps).toHaveLength(5);
    expect(steps.map((node) => node.data.meta)).toEqual(["Trigger", "Agent work", "Founder gate", "Outward action", "Observation"]);
    expect(steps.map((node) => node.position.x)).toEqual([...steps].map((node) => node.position.x).sort((a, b) => a - b));
    expect(graph.edges.filter((entry) => entry.id.startsWith("workflow-"))).toHaveLength(6);
    expect(graph.edges.find((entry) => entry.id.includes(":return:prepare:"))?.data).toMatchObject({ kind: "return", route: "return" });
    expect(graph.initialFocusIds).toEqual(expect.arrayContaining(["workflow", ...steps.map((node) => node.id)]));
    expect(graph.focusSummary).toMatch(/established trigger/);

    const selectedStep = projectProductGtm(workflowModel, movement, "workflow:workflow:return");
    expect(selectedStep.chapterAnchorId).toBe("workflow:workflow:return");
    expect(selectedStep.focusName).toBe("Observe qualified replies");
    expect(selectedStep.focusSummary).toBe("Bring the exact reply back to the claim.");
    expect(selectedStep.nodes.find((node) => node.id === "workflow:workflow:return")?.data.workRef).toBe("object:workflow");
  });

  it("frames unread returned evidence but stays quiet after it is reviewed", () => {
    const returnedMovement: MarketMovementIndex = {
      ...movement,
      liveWork: [],
      actions: [{
        id: "interview", ventureId: "venture-one", kind: "founder-interview",
        subjectRefs: ["object:path"], branchRefs: [], motionRefs: [], productDeltaRefs: [], workRefs: ["thread:one"],
        decisionRef: "decision:one", executedAt: "2026-07-21T12:00:00.000Z", executorReceipt: {},
        observationRefs: [], outcomeRefs: ["evidence:one"], state: "returned",
      }],
    };
    const unread = projectProductGtm(model, returnedMovement, null, {
      unreadSubjectRefs: ["object:path"], unreadThreadRefs: ["thread:one"],
    });
    const reviewed = projectProductGtm(model, returnedMovement, null, {
      unreadSubjectRefs: [], unreadThreadRefs: [],
    });

    expect(unread.chapterKind).toBe("return");
    expect(unread.chapterAnchorId).toBe("action:interview");
    expect(unread.focusSummary).toMatch(/Reality returned/);
    expect(reviewed.chapterKind).toBe("whole");
  });

  it("lets the founder return directly to the whole venture", () => {
    const graph = projectProductGtm(model, movement, null, { wholeVenture: true });

    expect(graph.chapterKind).toBe("whole");
    expect(graph.chapterAnchorId).toBeNull();
    expect(graph.focusName).toBe("Prove changed work");
    expect(graph.focusSummary).toMatch(/4 connected moves/);
  });

  it("brings failed exact work back on its owning causal path", () => {
    const graph = projectProductGtm(model, {
      ...movement,
      liveWork: [{
        ...movement.liveWork[0], activity: "idle", attention: "failure", unread: true,
        latestMeaningfulEvent: { summary: "The attempt stopped before verification." },
      }],
    }, null, { unreadSubjectRefs: ["object:capability"], unreadThreadRefs: ["thread:one"] });

    expect(graph.chapterKind).toBe("review");
    expect(graph.chapterAnchorId).toBe("work:run-one:0");
    expect(graph.nodes.find((node) => node.id === "work:run-one:0")?.data.attention).toBe("review");
    expect(graph.initialFocusIds).toContain("work:run-one:0");
  });

  it("keeps multiple exact work items in one Thread visually distinct", () => {
    const graph = projectProductGtm(model, {
      ...movement,
      liveWork: [movement.liveWork[0], { ...movement.liveWork[0], founderIntent: "Try another exact approach" }],
    });
    const work = graph.nodes.filter((node) => node.data.role === "work");

    expect(new Set(work.map((node) => node.id)).size).toBe(2);
    expect(new Set(work.map((node) => `${node.position.x}:${node.position.y}`)).size).toBe(2);
  });

  it("separates unattached compatibility work from work on current Product truth", () => {
    const graph = projectProductGtm(model, {
      ...movement,
      liveWork: [
        { ...movement.liveWork[0], threadRef: "thread:legacy", subjectRefs: ["bet:legacy"] },
        { ...movement.liveWork[0], threadRef: "thread:current", subjectRefs: ["object:direction"] },
      ],
    });
    const work = graph.nodes.filter((node) => node.data.role === "work");

    expect(new Set(work.map((node) => `${node.position.x}:${node.position.y}`)).size).toBe(2);
  });

  it("compresses non-consequential features into their owning Product object", () => {
    const withFeature: FirmSemanticModel = {
      ...model,
      objects: [...model.objects, object("detail-feature", "feature", "Quiet implementation detail")],
      relationships: [...model.relationships, relationship("capability-feature", "capability", "detail-feature", "contains")],
    };
    const resting = projectProductGtm(withFeature, movement);
    const active = projectProductGtm(withFeature, {
      ...movement,
      liveWork: [{ ...movement.liveWork[0], subjectRefs: ["object:detail-feature"] }],
    });

    expect(resting.nodes.some((node) => node.id === "detail-feature")).toBe(false);
    expect(resting.nodes.find((node) => node.id === "capability")?.data.meta).toContain("1 feature");
    expect(active.nodes.some((node) => node.id === "detail-feature")).toBe(true);
  });

  it("frames the causal neighborhood and derived attention by default", () => {
    const graph = projectProductGtm(model, movement);

    expect(graph.initialFocusIds).toEqual(expect.arrayContaining(["direction", "capability", "path", "test", "work:run-one:0"]));
    expect(graph.initialFocusIds).not.toContain("signal");
    expect(graph.initialFocusIds).not.toContain("read");
    expect(graph.nodes.find((node) => node.id === "gap")?.data.attention).toBe("decision");
    expect(graph.nodes.find((node) => node.id === "work:run-one:0")?.data.attention).toBe("active");
  });

  it("places founder gates near their subject and routes returns distinctly", () => {
    const graph = projectProductGtm(model, {
      ...movement,
      actions: [{
        id: "interview", ventureId: "venture-one", kind: "founder-interview",
        subjectRefs: ["object:path"], branchRefs: [], motionRefs: [], productDeltaRefs: [], workRefs: [],
        decisionRef: "decision:one", executedAt: null, executorReceipt: null,
        observationRefs: [], outcomeRefs: ["evidence:one"], state: "needs-founder",
      }],
    });
    const path = graph.nodes.find((node) => node.id === "path")!;
    const action = graph.nodes.find((node) => node.id === "action:interview")!;
    const returned = graph.edges.find((entry) => entry.id === "return-edge:interview:path");

    expect(action.position.x).toBeGreaterThan(path.position.x);
    expect(action.data.attention).toBe("decision");
    expect(graph.initialFocusIds).toContain("action:interview");
    expect(returned?.data).toMatchObject({ route: "return", kind: "return" });
  });

  it("reflows only the selected node's immediate neighborhood", () => {
    const nodes = [
      { id: "selected", position: { x: 100, y: 100 } },
      { id: "downstream", position: { x: 430, y: 110 } },
      { id: "below", position: { x: 120, y: 220 } },
      { id: "distant", position: { x: 900, y: 600 } },
    ];
    const reflowed = reflowExpandedNeighborhood(nodes, "selected");

    expect(reflowed.find((node) => node.id === "downstream")?.position.x).toBe(606);
    expect(reflowed.find((node) => node.id === "below")?.position.y).toBe(450);
    expect(reflowed.find((node) => node.id === "distant")?.position).toEqual({ x: 900, y: 600 });
  });
});
