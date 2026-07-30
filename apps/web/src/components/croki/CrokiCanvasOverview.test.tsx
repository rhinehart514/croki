import type { CrokiContext } from "@t3tools/shared/crokiContext";
import { describe, expect, it, vi } from "vite-plus/test";
import { renderToStaticMarkup } from "react-dom/server";

import { CrokiCanvasOverview } from "./CrokiCanvasOverview";

const CONTEXT: CrokiContext = {
  version: 1,
  product: "Croki",
  updatedAt: "2026-07-30T00:00:00.000Z",
  nodes: [
    {
      id: "intent-1",
      kind: "intent",
      status: "current",
      title: "Keep product truth near the work",
      body: "",
      updatedAt: "2026-07-30T00:00:00.000Z",
    },
    {
      id: "work-1",
      kind: "work",
      status: "provisional",
      title: "Add the review loop",
      body: "",
      updatedAt: "2026-07-30T00:00:00.000Z",
    },
    {
      id: "decision-1",
      kind: "decision",
      status: "retired",
      title: "Build another coding runtime",
      body: "",
      updatedAt: "2026-07-30T00:00:00.000Z",
    },
  ],
  edges: [{ from: "work-1", to: "intent-1", relation: "advances" }],
};

describe("CrokiCanvasOverview", () => {
  it("separates current understanding, proposals, retired items, and relationships", () => {
    const markup = renderToStaticMarkup(
      <CrokiCanvasOverview
        context={CONTEXT}
        edgeFrom=""
        edgeRelation="supports"
        edgeTo=""
        onAddEdge={vi.fn()}
        onAddNode={vi.fn()}
        onAdopt={vi.fn()}
        onDeleteEdge={vi.fn()}
        onEdgeFromChange={vi.fn()}
        onEdgeRelationChange={vi.fn()}
        onEdgeToChange={vi.fn()}
        onReject={vi.fn()}
        onRetire={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    expect(markup).toContain("Current understanding");
    expect(markup).toContain("Proposals");
    expect(markup).toContain("Retired · 1");
    expect(markup).toContain("Add the review loop");
    expect(markup).toContain("advances →");
  });

  it("presents cross-domain proposals as semantic review", () => {
    const markup = renderToStaticMarkup(
      <CrokiCanvasOverview
        context={{
          ...CONTEXT,
          nodes: [
            ...CONTEXT.nodes,
            {
              id: "claim-1",
              kind: "decision",
              status: "provisional",
              domain: "gtm",
              origin: "external",
              title: "Founders need continuity",
              body: "",
              updatedAt: "2026-07-30T00:00:00.000Z",
            },
          ],
        }}
        edgeFrom=""
        edgeRelation="supports"
        edgeTo=""
        onAddEdge={vi.fn()}
        onAddNode={vi.fn()}
        onAdopt={vi.fn()}
        onDeleteEdge={vi.fn()}
        onEdgeFromChange={vi.fn()}
        onEdgeRelationChange={vi.fn()}
        onEdgeToChange={vi.fn()}
        onReject={vi.fn()}
        onRetire={vi.fn()}
        onSelect={vi.fn()}
        view="review"
      />,
    );

    expect(markup).toContain("Semantic review");
    expect(markup).toContain("future agent turns");
    expect(markup).toContain("Claim · gtm · external");
    expect(markup).not.toContain("Current understanding");
  });
});
