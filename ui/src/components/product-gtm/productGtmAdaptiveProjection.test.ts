import { describe, expect, it } from "vitest";
import type { FirmSemanticModel, MarketMovementIndex } from "@/types";
import { projectAdaptiveProductGtm } from "./productGtmAdaptiveProjection";

const page = (id: string, route: string) => ({
  id,
  type: "page",
  name: id === "home" ? "Home" : "Signup",
  statement: `${id} page`,
  assertion: "tentative" as const,
  properties: {
    territory: "product",
    page: { route, file: `src/${id}.tsx`, sourceRef: `repository:src/${id}.tsx#L1-L20:digest` },
  },
});

const model: FirmSemanticModel = {
  schemaVersion: 3,
  ventureId: "venture-one",
  revision: 2,
  objects: [
    page("home", "/"),
    page("signup", "/signup"),
    {
      id: "consequence", type: "product-consequence", name: "Faster first value",
      statement: "People reach useful work before setup.", assertion: "founder-asserted",
      properties: { territory: "product" },
    },
    {
      id: "assumption", type: "assumption", name: "Setup causes abandonment",
      statement: "The current setup loses ready users.", assertion: "founder-asserted",
      properties: { territory: "shared" },
    },
    {
      id: "play", type: "mechanism", name: "Proof loop", statement: "Bring proof to ready founders.",
      assertion: "founder-asserted", properties: {
        territory: "gtm",
        workflowGraph: {
          objective: "Return qualified evidence",
          steps: Array.from({ length: 30 }, (_, index) => ({ id: `s${index + 1}`, label: `Step ${index + 1}`, type: "agent-work" })),
          edges: Array.from({ length: 29 }, (_, index) => ({ from: `s${index + 1}`, to: `s${index + 2}` })),
        },
      },
    },
  ],
  relationships: [
    {
      id: "home-signup", fromRef: "object:home", toRef: "object:signup", label: "links to",
      type: "page-link", properties: {}, assertion: "tentative", sourceRefs: ["repository:src/home.tsx#L1-L20:digest"],
    },
    {
      id: "signup-consequence", fromRef: "object:signup", toRef: "object:consequence", label: "raises",
      type: "connected", properties: {}, assertion: "founder-asserted", sourceRefs: [],
    },
    {
      id: "consequence-assumption", fromRef: "object:consequence", toRef: "object:assumption", label: "depends on",
      type: "dependency", properties: {}, assertion: "founder-asserted", sourceRefs: [],
    },
    {
      id: "consequence-play", fromRef: "object:consequence", toRef: "object:play", label: "improves through",
      type: "connected", properties: {}, assertion: "founder-asserted", sourceRefs: [],
    },
  ],
  modelBranches: [], modelChanges: [], modelMergeReceipts: [], workScopes: [], outwardActions: [],
};

const movement: MarketMovementIndex = {
  ventureId: "venture-one", revision: 2, modelBranches: [], liveWork: [],
  actions: [{
    id: "return", ventureId: "venture-one", kind: "email", subjectRefs: ["object:signup"],
    branchRefs: [], motionRefs: [], productDeltaRefs: [], workRefs: [], decisionRef: "decision:return",
    executedAt: "2026-07-23T12:00:00.000Z", executorReceipt: {}, executionAttempts: [],
    lastExecutionError: null, needsReconnect: false, observationRefs: ["observation:return"],
    outcomeRefs: ["evidence:return"], preparedMaterial: null, expectedReturn: null, state: "returned",
  }],
};

describe("adaptive Product/GTM projection", () => {
  it("rests on code-proven pages and attention markers only", () => {
    const graph = projectAdaptiveProductGtm(model, movement);

    expect(graph.projection).toEqual({ kind: "product-walk" });
    expect(graph.nodes.map((node) => node.id).sort()).toEqual(["action:return", "home", "signup"]);
    expect(graph.edges.find((edge) => edge.id === "home-signup")).toMatchObject({
      label: "Links to",
      data: { relationshipVerb: "Links to", truthStatus: "code-proven" },
    });
    expect(graph.edges.find((edge) => edge.id === "home-signup")?.ariaLabel).toMatch(/Home links to Signup.*code-proven/i);
    expect(graph.initialFrameIds).toEqual(["home", "signup"]);
  });

  it("recomposes a selected Product consequence around its local causal trace", () => {
    const graph = projectAdaptiveProductGtm(model, movement, "consequence");

    expect(graph.projection).toEqual({ kind: "consequence-trace", anchorRef: "consequence" });
    expect(graph.nodes.map((node) => node.id)).toEqual(expect.arrayContaining(["signup", "consequence", "assumption", "play"]));
    expect(graph.edges.find((edge) => edge.id === "consequence-assumption")).toMatchObject({
      label: "Requires",
      data: { relationshipVerb: "Requires" },
    });
    expect(graph.edges.find((edge) => edge.id === "signup-consequence")).toMatchObject({
      label: "Related to",
      data: { relationshipVerb: "Related to" },
    });
  });

  it("renders every play step but frames only the owner and first three", () => {
    const graph = projectAdaptiveProductGtm(model, movement, "play");
    const steps = graph.nodes.filter((node) => node.data.kind === "workflow");

    expect(graph.projection).toEqual({ kind: "play", playRef: "object:play" });
    expect(steps).toHaveLength(30);
    expect(graph.initialFrameIds).toEqual(["play", "workflow:play:s1", "workflow:play:s2", "workflow:play:s3"]);
    expect(graph.edges.filter((edge) => edge.id.startsWith("workflow-edge:")).every((edge) => edge.label === "Then")).toBe(true);
  });

  it("opens returned actions as an evidence-return projection", () => {
    const graph = projectAdaptiveProductGtm(model, movement, "action:return");

    expect(graph.projection).toEqual({ kind: "evidence-return", evidenceRef: "outward-action:return" });
    expect(graph.nodes.map((node) => node.id)).toEqual(expect.arrayContaining(["action:return", "signup"]));
    expect(graph.focusSummary).toMatch(/Returned reality/);
  });
});
