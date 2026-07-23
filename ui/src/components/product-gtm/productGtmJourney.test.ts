import { describe, expect, it } from "vitest";
import type { ProductGtmProjection } from "./productGtmProjection";
import { applyJourneyObservation, type ProductGtmJourneyObservation } from "./productGtmJourney";

const graph = {
  nodes: [
    { id: "home", position: { x: 0, y: 0 }, data: { kind: "truth", role: "page", territory: "product", ref: "object:home", name: "Home", detail: "", meta: "" } },
    { id: "signup", position: { x: 300, y: 0 }, data: { kind: "truth", role: "page", territory: "product", ref: "object:signup", name: "Signup", detail: "", meta: "" } },
    { id: "pricing", position: { x: 600, y: 0 }, data: { kind: "truth", role: "page", territory: "product", ref: "object:pricing", name: "Pricing", detail: "", meta: "" } },
  ],
  edges: [{
    id: "home-signup", source: "home", target: "signup", data: {
      kind: "spine", focused: true, crossTerritory: false, sourceTerritory: "product",
      targetTerritory: "product", route: "forward", relationshipVerb: "Links to", truthStatus: "code-proven",
    },
  }],
  focusName: "Product walk", focusSummary: "", initialFocusIds: ["home", "signup"],
  chapterKind: "whole", chapterAnchorId: null,
} as ProductGtmProjection;

const observation: ProductGtmJourneyObservation = {
  id: "journey-one", receiptRef: "receipt:one", sourceRef: "analytics-export",
  window: { from: "2026-07-01", to: "2026-07-22", timezone: "America/New_York" },
  pageCounts: [{ pageRef: "object:home", count: 100 }],
  transitions: [
    { fromPageRef: "object:home", toPageRef: "object:signup", count: 40 },
    { fromPageRef: "object:home", toPageRef: "object:pricing", count: 15 },
  ],
  dropOffs: [{ pageRef: "object:home", count: 45 }],
  createdAt: "2026-07-23T12:00:00.000Z",
};

describe("observed journey overlay", () => {
  it("does nothing at rest", () => {
    expect(applyJourneyObservation(graph, null)).toBe(graph);
  });

  it("annotates proven topology and distinguishes observed-only transitions", () => {
    const overlaid = applyJourneyObservation(graph, observation);
    const home = overlaid.nodes.find((node) => node.id === "home");
    const proven = overlaid.edges.find((edge) => edge.id === "home-signup");
    const observedOnly = overlaid.edges.find((edge) => edge.id.startsWith("journey:"));

    expect(home?.data.journeyCountLabel).toBe("100 observed · 45 drop-offs");
    expect(proven).toMatchObject({ label: "Links to · 40 observed", data: { observedOnly: false, observedCount: 40 } });
    expect(observedOnly).toMatchObject({
      source: "home", target: "pricing", className: "product-gtm-edge is-observed-only",
      data: { route: "observed", truthStatus: "observed", observedOnly: true, observedCount: 15 },
    });
    expect(graph.edges[0].label).toBeUndefined();
    expect(graph.edges[0].data).not.toHaveProperty("observedCount");
  });
});
