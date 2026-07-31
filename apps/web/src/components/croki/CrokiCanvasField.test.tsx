import type { CrokiContext } from "@t3tools/shared/crokiContext";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { CrokiCanvasField } from "./CrokiCanvasField";

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
      title: "Keep founder judgment near the work",
      body: "",
      updatedAt: "2026-07-31T18:00:00.000Z",
    },
    {
      id: "proposal",
      kind: "decision",
      status: "provisional",
      domain: "gtm",
      origin: "agent",
      title: "Continuity is the wedge",
      body: "Ground this claim in customer evidence.",
      updatedAt: "2026-07-31T18:00:00.000Z",
    },
  ],
  edges: [],
};

describe("CrokiCanvasField", () => {
  it("renders semantic items as a visual field with explicit authority", () => {
    const markup = renderToStaticMarkup(
      <CrokiCanvasField
        activePlan={null}
        context={context}
        focusIds={[]}
        layoutKey="local:/work/croki"
        view="product"
        onClearSelection={vi.fn()}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
        onReplaceEdge={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    expect(markup).toContain('aria-label="Visual Canvas field"');
    expect(markup).toContain("Keep founder judgment near the work");
    expect(markup).toContain("Founder-approved");
    expect(markup).toContain("react-flow");
    expect(markup).toContain("intent-object");
    expect(markup).not.toContain("Drag to arrange");
  });

  it("makes proposal judgment available directly in Review", () => {
    const markup = renderToStaticMarkup(
      <CrokiCanvasField
        activePlan={null}
        context={context}
        focusIds={[]}
        layoutKey="local:/work/croki"
        view="review"
        onClearSelection={vi.fn()}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
        onReplaceEdge={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    expect(markup).toContain("Continuity is the wedge");
    expect(markup).toContain("Open proposition");
    expect(markup).not.toContain("Accept");
    expect(markup).not.toContain("Decline");
    expect(markup).not.toContain("Keep founder judgment near the work");
  });

  it("projects the active Croki Thread plan as native workflow objects", () => {
    const markup = renderToStaticMarkup(
      <CrokiCanvasField
        activePlan={{
          createdAt: "2026-07-31T18:00:00.000Z",
          turnId: null,
          steps: [
            { step: "Define the object grammar", status: "completed" },
            { step: "Connect IDE surfaces", status: "inProgress" },
          ],
        }}
        context={context}
        focusIds={[]}
        layoutKey="local:/work/croki"
        view="workflow"
        onClearSelection={vi.fn()}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
        onReplaceEdge={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    expect(markup).toContain("Define the object grammar");
    expect(markup).toContain("Connect IDE surfaces");
    expect(markup).toContain("Thread plan");
    expect(markup).toContain("In progress");
    expect(markup).toContain("then");
  });
});
