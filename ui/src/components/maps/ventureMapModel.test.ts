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
  object("signal", "signal", "gtm"),
  object("motion", "motion", "gtm", {
    actor: "Recent graduate",
    entry: "A project worth advancing",
    value: "Credible proof",
    repeatabilityClaim: "Proof recruits the next builder.",
    systemIds: ["system"],
    productRefs: ["loop"],
  }),
  object("campaign", "campaign", "gtm", { primaryMotionId: "motion", motionIds: ["motion"] }),
  object("release", "release", "product"),
  object("response", "response", "gtm"),
];

const outline: WorkIndexOutline = {
  architectureRevision: 4,
  objects,
  relationships: [
    { id: "signal-motion", fromRef: "object:signal", toRef: "object:motion", label: "activates", type: "connection", assertion: "founder-asserted", sourceRefs: [] },
    { id: "idea-motion", fromRef: "object:idea", toRef: "object:motion", label: "may open", type: "connection", assertion: "tentative", sourceRefs: [] },
    { id: "release-campaign", fromRef: "object:release", toRef: "object:campaign", label: "moves to market", type: "connection", assertion: "founder-asserted", sourceRefs: [] },
    { id: "campaign-response", fromRef: "object:campaign", toRef: "object:response", label: "returns", type: "connection", assertion: "founder-asserted", sourceRefs: [] },
  ],
  unplacedThreadRefs: [],
};

describe("generated venture system graph", () => {
  it("shows the whole connected Product and go-to-market system without flooding it with orphan notes", () => {
    const graph = ventureGraph(outline);
    expect(graph.nodes.map((node) => node.object.id)).toEqual(expect.arrayContaining(["idea", "loop", "system", "motion", "campaign", "response"]));
    expect(graph.nodes.map((node) => node.object.id)).not.toContain("orphan");
    expect(graph.pipelineCount).toBe(1);
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
    expect(Math.max(...marketNodes.map((node) => node.position.y))).toBeLessThanOrEqual(10 * 148);
  });

  it("focuses a selected motion without hiding the rest of the system", () => {
    const graph = ventureGraph(outline);
    expect([...connectedIds(graph, "motion")]).toEqual(expect.arrayContaining(["motion", "idea", "loop", "system", "campaign", "release", "response"]));
    expect([...connectedIds(graph, "campaign")]).toEqual(expect.arrayContaining(["motion", "loop", "system", "release", "response"]));
  });

  it("projects each reusable pipeline as signal, campaign, and outcome without inventing missing records", () => {
    const graph = ventureGraph(outline);
    expect(graph.pipelines).toEqual([expect.objectContaining({
      id: "motion",
      name: "motion",
      audience: "Recent graduate",
      trigger: "A project worth advancing",
      value: "Credible proof",
      repeatability: "Proof recruits the next builder.",
      signalCount: 1,
      campaignCount: 1,
      releaseCount: 1,
      outcomeCount: 1,
      nodeIds: expect.arrayContaining(["signal", "motion", "campaign", "release", "response"]),
    })]);
    expect(graph.nodes.find((node) => node.object.id === "signal")?.position.x).toBeLessThan(graph.nodes.find((node) => node.object.id === "motion")?.position.x ?? 0);
    expect(graph.nodes.find((node) => node.object.id === "campaign")?.position.x).toBeGreaterThan(graph.nodes.find((node) => node.object.id === "motion")?.position.x ?? 0);
    expect(graph.nodes.find((node) => node.object.id === "response")?.position.x).toBeGreaterThan(graph.nodes.find((node) => node.object.id === "campaign")?.position.x ?? 0);

    const open = ventureGraph({
      ...outline,
      objects: outline.objects.filter((entry) => !["release", "response"].includes(entry.id)),
      relationships: outline.relationships.filter((entry) => !["release-campaign", "campaign-response"].includes(entry.id)),
    });
    expect(open.pipelines[0]).toEqual(expect.objectContaining({ releaseCount: 0, outcomeCount: 0 }));
  });

  it("exposes the operating facts that make a motion understandable", () => {
    expect(objectMapFacts(objects.find((entry) => entry.id === "motion")!)).toEqual([
      { label: "Trigger", value: "A project worth advancing" },
      { label: "Intended outcome", value: "Credible proof" },
      { label: "Audience", value: "Recent graduate" },
      { label: "Why it compounds", value: "Proof recruits the next builder." },
    ]);
    expect(objectMapTypeLabel(objects.find((entry) => entry.id === "motion")!)).toBe("GTM pipeline");
    expect(objectMapTypeLabel(objects.find((entry) => entry.id === "campaign")!)).toBe("Campaign");
  });

  it("projects founder-created pipelines with the same operating contract as compatibility motions", () => {
    const pipeline = object("new-pipeline", "pipeline", "gtm", {
      trigger: "A qualified founder replies",
      intendedOutcome: "A booked conversation",
      evidenceToReturn: "Booking, rejection, or silence",
      authority: "Founder sends the final message",
    });
    const graph = ventureGraph({ ...outline, objects: [...outline.objects, pipeline] });
    expect(graph.pipelineCount).toBe(2);
    expect(graph.pipelines).toEqual(expect.arrayContaining([expect.objectContaining({ id: "new-pipeline", trigger: "A qualified founder replies", value: "A booked conversation" })]));
    expect(objectMapFacts(pipeline)).toEqual([
      { label: "Trigger", value: "A qualified founder replies" },
      { label: "Intended outcome", value: "A booked conversation" },
      { label: "Evidence to return", value: "Booking, rejection, or silence" },
      { label: "Founder authority", value: "Founder sends the final message" },
    ]);
  });
});
