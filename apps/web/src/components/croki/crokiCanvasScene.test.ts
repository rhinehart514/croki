import type { CrokiContext } from "@croki/shared/crokiContext";
import { describe, expect, it } from "vite-plus/test";

import { projectCrokiCanvasScene } from "./crokiCanvasScene";

const context: CrokiContext = {
  version: 1,
  product: "Croki",
  updatedAt: "2026-07-31T18:00:00.000Z",
  nodes: [
    {
      id: "intent",
      kind: "intent",
      status: "current",
      domain: "product",
      origin: "founder",
      title: "Keep judgment near the work",
      body: "",
      updatedAt: "2026-07-31T18:00:00.000Z",
    },
    {
      id: "evidence",
      kind: "evidence",
      status: "current",
      domain: "product",
      origin: "repository",
      title: "The Canvas is implemented in the workspace",
      body: "",
      updatedAt: "2026-07-31T18:00:00.000Z",
      references: [
        { kind: "file", path: "apps/web/src/components/croki/CrokiCanvas.tsx", line: 42 },
        { kind: "url", url: "https://example.com/product-evidence" },
      ],
    },
    {
      id: "decision",
      kind: "decision",
      status: "current",
      domain: "product",
      origin: "founder",
      title: "Canvas is a native ADE surface",
      body: "",
      updatedAt: "2026-07-31T18:00:00.000Z",
    },
    {
      id: "unrelated",
      kind: "work",
      status: "current",
      domain: "product",
      origin: "founder",
      title: "Unrelated work",
      body: "",
      updatedAt: "2026-07-31T18:00:00.000Z",
    },
  ],
  edges: [
    { from: "intent", to: "decision", relation: "shapes" },
    { from: "evidence", to: "decision", relation: "supports" },
  ],
};

describe("projectCrokiCanvasScene", () => {
  it("preserves native references and marks only semantic relationships mutable", () => {
    const before = JSON.stringify(context);
    const scene = projectCrokiCanvasScene({
      activePlan: null,
      context,
      focusIds: [],
      view: "product",
    });

    const references = scene.items.filter((item) => item.kind === "reference");
    expect(references).toHaveLength(2);
    expect(references.map((item) => item.reference)).toEqual(context.nodes[1]?.references);
    expect(scene.edges.filter((edge) => edge.relation === "source")).toHaveLength(2);
    expect(
      scene.edges.filter((edge) => edge.relation === "source").every((edge) => !edge.mutable),
    ).toBe(true);
    expect(
      scene.edges.filter((edge) => edge.relation !== "source").every((edge) => edge.mutable),
    ).toBe(true);
    expect(JSON.stringify(context)).toBe(before);
  });

  it("keeps a focused semantic path and the exact artifacts attached to it", () => {
    const focusedContext: CrokiContext = {
      ...context,
      nodes: [
        ...context.nodes,
        {
          id: "far",
          kind: "work",
          status: "current",
          domain: "product",
          origin: "founder",
          title: "Two hops away",
          body: "",
          updatedAt: "2026-07-31T18:00:00.000Z",
        },
      ],
      edges: [
        ...context.edges,
        { from: "decision", to: "unrelated", relation: "guides" },
        { from: "unrelated", to: "far", relation: "precedes" },
      ],
    };
    const scene = projectCrokiCanvasScene({
      activePlan: null,
      context: focusedContext,
      focusIds: ["decision"],
      view: "product",
    });

    expect(scene.items.some((item) => item.id === "unrelated")).toBe(true);
    expect(scene.items.some((item) => item.id === "far")).toBe(false);
    expect(scene.items.filter((item) => item.kind === "semantic").map((item) => item.id)).toEqual(
      expect.arrayContaining(["intent", "evidence", "decision"]),
    );
    expect(scene.items.filter((item) => item.kind === "reference")).toHaveLength(2);
  });

  it("projects Thread steps with their native status and immutable ordering", () => {
    const scene = projectCrokiCanvasScene({
      activePlan: {
        createdAt: "2026-07-31T18:00:00.000Z",
        turnId: null,
        steps: [
          { step: "Define the grammar", status: "completed" },
          { step: "Verify the experience", status: "inProgress" },
        ],
      },
      context,
      focusIds: [],
      view: "workflow",
    });

    const steps = scene.items.filter((item) => item.kind === "plan-step");
    expect(steps.map((item) => item.step.status)).toEqual(["completed", "inProgress"]);
    expect(steps.every((item) => !("node" in item))).toBe(true);
    expect(scene.edges).toEqual([expect.objectContaining({ relation: "then", mutable: false })]);
  });

  it("uses a visible requested decision as focus instead of a filtered default", () => {
    const alternateDecision = {
      ...context.nodes[2]!,
      id: "alternate-decision",
      title: "A focused alternate branch",
    };
    const focused = projectCrokiCanvasScene({
      activePlan: null,
      context: {
        ...context,
        nodes: [...context.nodes, alternateDecision],
        edges: [
          ...context.edges,
          { from: "alternate-decision", to: "unrelated", relation: "guides" },
        ],
      },
      focusIds: ["alternate-decision"],
      view: "product",
    });

    expect(focused.focusId).toBe("alternate-decision");
    expect(focused.items.filter((item) => item.kind === "semantic").map((item) => item.id)).toEqual(
      expect.arrayContaining(["alternate-decision", "unrelated"]),
    );
    expect(focused.items.some((item) => item.id === "decision")).toBe(false);
  });
});
