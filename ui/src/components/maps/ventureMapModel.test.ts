import { describe, expect, it } from "vitest";
import type { WorkIndexOutline, WorkIndexOutlineObject } from "@/api";
import { connectedIds, objectMapFacts, objectMapTypeLabel, ventureGraph } from "./ventureMapModel";

function object(
  id: string,
  type: string,
  territory: "product" | "gtm" | null,
  details: Record<string, unknown> = {},
): WorkIndexOutlineObject {
  return {
    id, objectRef: `object:${id}`, name: id, statement: `${id} statement`, type, territory,
    sectionId: type, parentRef: null, assertion: "founder-asserted", provenance: null, details,
    threadRefs: [], targetable: true, architectureRole: type, updatedAt: null,
  };
}

const objects = [
  object("idea", "concept", null),
  object("orphan", "concept", null),
  object("loop", "product-loop", "product"),
  object("system", "system", "product", { does: "Turns work into proof", supportsProductRefs: ["loop#proof"] }),
  object("motion", "motion", "gtm", {
    actor: "Recent graduate",
    entry: "A project worth advancing",
    value: "Credible proof",
    repeatabilityClaim: "Proof recruits the next builder.",
    systemIds: ["system"],
    productRefs: ["loop"],
  }),
  object("campaign", "campaign", "gtm", { primaryMotionId: "motion", motionIds: ["motion"] }),
  object("response", "response", "gtm"),
];

const outline: WorkIndexOutline = {
  architectureRevision: 4,
  objects,
  relationships: [
    { id: "idea-motion", fromRef: "object:idea", toRef: "object:motion", label: "may open", type: "connection", assertion: "tentative", sourceRefs: [] },
    { id: "campaign-response", fromRef: "object:campaign", toRef: "object:response", label: "returns", type: "connection", assertion: "founder-asserted", sourceRefs: [] },
  ],
  unplacedThreadRefs: [],
};

describe("generated venture system graph", () => {
  it("shows the whole connected Product and go-to-market system without flooding it with orphan notes", () => {
    const graph = ventureGraph(outline);
    expect(graph.nodes.map((node) => node.object.id)).toEqual(expect.arrayContaining(["idea", "loop", "system", "motion", "campaign", "response"]));
    expect(graph.nodes.map((node) => node.object.id)).not.toContain("orphan");
    expect(graph.motionCount).toBe(1);
  });

  it("turns existing system, product, and campaign references into visible links", () => {
    const graph = ventureGraph(outline);
    expect(graph.links).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "system", target: "loop", label: "supports" }),
      expect.objectContaining({ source: "system", target: "motion", label: "powers" }),
      expect.objectContaining({ source: "loop", target: "motion", label: "delivers value through" }),
      expect.objectContaining({ source: "motion", target: "campaign", label: "activated by" }),
    ]));
  });

  it("keeps Product support visible in the go-to-market view", () => {
    const graph = ventureGraph(outline, "gtm");
    expect(graph.nodes.map((node) => node.object.id)).toEqual(expect.arrayContaining(["system", "loop", "motion", "campaign", "response"]));
  });

  it("packs large groups across the canvas instead of one unreadable vertical stack", () => {
    const denseOutline = {
      ...outline,
      objects: [...outline.objects, ...Array.from({ length: 20 }, (_, index) => object(`push-${index}`, "campaign", "gtm"))],
    };
    const marketNodes = ventureGraph(denseOutline).nodes.filter((node) => node.object.type === "campaign");
    expect(new Set(marketNodes.map((node) => node.position.x)).size).toBeGreaterThan(1);
    expect(Math.max(...marketNodes.map((node) => node.position.y))).toBeLessThanOrEqual(9 * 148 + 34);
  });

  it("focuses a selected motion without hiding the rest of the system", () => {
    const graph = ventureGraph(outline);
    expect([...connectedIds(graph, "motion")]).toEqual(expect.arrayContaining(["motion", "idea", "loop", "system", "campaign"]));
  });

  it("exposes the operating facts that make a motion understandable", () => {
    expect(objectMapFacts(objects.find((entry) => entry.id === "motion")!)).toEqual([
      { label: "Who", value: "Recent graduate" },
      { label: "Enters with", value: "A project worth advancing" },
      { label: "Leaves with", value: "Credible proof" },
      { label: "How it repeats", value: "Proof recruits the next builder." },
    ]);
    expect(objectMapTypeLabel(objects.find((entry) => entry.id === "motion")!)).toBe("Repeatable path");
    expect(objectMapTypeLabel(objects.find((entry) => entry.id === "campaign")!)).toBe("Market push");
  });
});
