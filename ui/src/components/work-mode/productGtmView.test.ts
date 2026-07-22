import { describe, expect, it } from "vitest";
import { productGtmViewFromTimeline } from "./productGtmView";

describe("productGtmViewFromTimeline", () => {
  it("returns the latest branch-backed local Product and GTM view", () => {
    const timeline = {
      ventureId: "v1", threadRef: "thread:one", agents: [], visuals: [],
      items: [{
        kind: "artifact", id: "view", ref: "work:view-one", title: "Ecosystem proof", betRef: "bet:one", at: "2026-07-21T10:00:00.000Z",
        artifact: { id: "view-one", content: { kind: "model-view", purpose: "product-gtm-local-model", question: "When should ecosystem distribution begin?", branchRef: "model-branch:branch-one", nodes: [
          { id: "question", label: "When should distribution begin?", kind: "question", state: "provisional" },
          { id: "unknown", label: "External proof", kind: "unknown", state: "unresolved" },
        ], edges: [{ from: "unknown", to: "question", label: "changes the answer", kind: "dependency" }] } },
      }],
    } as never;
    expect(productGtmViewFromTimeline(timeline)).toMatchObject({
      workId: "view-one", branchRef: "model-branch:branch-one", branchId: "branch-one", question: "When should ecosystem distribution begin?",
      nodes: [{ kind: "question" }, { kind: "unknown" }],
    });
  });

  it("does not reinterpret a legacy workflow as the new local model contract", () => {
    const timeline = { ventureId: "v1", threadRef: "thread:one", agents: [], visuals: [], items: [{ kind: "artifact", id: "flow", ref: "work:flow", artifact: { content: { kind: "flow", purpose: "product-gtm-workflow", steps: [], edges: [] } } }] } as never;
    expect(productGtmViewFromTimeline(timeline)).toBeNull();
  });
});
