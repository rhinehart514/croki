import type { CrokiContext, CrokiContextNode } from "@t3tools/shared/crokiContext";
import { describe, expect, it } from "vite-plus/test";

import { crokiNodeEpistemicLabel, projectCrokiCanvas } from "./crokiCanvasProjection";

const NOW = "2026-07-31T12:00:00.000Z";

function node(
  id: string,
  kind: CrokiContextNode["kind"],
  status: CrokiContextNode["status"],
  overrides: Partial<CrokiContextNode> = {},
): CrokiContextNode {
  return {
    id,
    kind,
    status,
    title: id,
    body: "",
    updatedAt: NOW,
    ...overrides,
  };
}

const context: CrokiContext = {
  version: 1,
  product: "Croki",
  updatedAt: NOW,
  nodes: [
    node("product-intent", "intent", "current", { domain: "product" }),
    node("product-decision", "decision", "current", { domain: "product" }),
    node("shared-evidence", "evidence", "current", {
      domain: "shared",
      references: [{ kind: "file", path: "README.md" }],
    }),
    node("open-work", "work", "provisional", { domain: "product" }),
    node("gtm-claim", "decision", "provisional", { domain: "gtm" }),
    node("retired-work", "work", "retired", { domain: "product" }),
  ],
  edges: [
    { from: "shared-evidence", to: "product-decision", relation: "supports" },
    { from: "product-decision", to: "product-intent", relation: "implements" },
    { from: "gtm-claim", to: "shared-evidence", relation: "depends-on" },
  ],
};

describe("crokiCanvasProjection", () => {
  it("derives the same visual field without mutating or persisting layout", () => {
    const before = structuredClone(context);
    const first = projectCrokiCanvas(context, "product");
    const second = projectCrokiCanvas(context, "product");

    expect(second).toEqual(first);
    expect(context).toEqual(before);
    expect(first.focusId).toBe("product-decision");
    expect(first.items.map((item) => item.id)).toEqual([
      "product-decision",
      "product-intent",
      "shared-evidence",
      "open-work",
      "retired-work",
    ]);
    expect(first.edges).toEqual([
      { from: "shared-evidence", to: "product-decision", relation: "supports" },
      { from: "product-decision", to: "product-intent", relation: "implements" },
    ]);
    expect(first.items.every((item) => Object.keys(item.node).includes("position") === false)).toBe(
      true,
    );
  });

  it("uses the review view as a cross-domain projection of provisional proposals", () => {
    const review = projectCrokiCanvas(context, "review");

    expect(review.items.map((item) => item.id)).toEqual(["gtm-claim", "open-work"]);
    expect(review.focusId).toBe("gtm-claim");
    expect(review.edges).toEqual([]);
  });

  it("makes authority and evidence legible without changing semantic status", () => {
    expect(crokiNodeEpistemicLabel(context.nodes[1]!)).toBe("Founder-approved");
    expect(crokiNodeEpistemicLabel(context.nodes[2]!)).toBe("Source-backed");
    expect(crokiNodeEpistemicLabel(context.nodes[3]!)).toBe("Open proposition");
    expect(crokiNodeEpistemicLabel(context.nodes[5]!)).toBe("Prior understanding");
  });
});
