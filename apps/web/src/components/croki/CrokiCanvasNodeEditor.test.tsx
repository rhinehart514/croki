import type { CrokiContextNode } from "@croki/shared/crokiContext";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { CrokiCanvasNodeEditor } from "./CrokiCanvasNodeEditor";

const NODE: CrokiContextNode = {
  id: "work-1",
  kind: "work",
  status: "provisional",
  title: "Ship the review loop",
  body: "Connect completed work back to product truth.",
  updatedAt: "2026-07-30T00:00:00.000Z",
};

describe("CrokiCanvasNodeEditor", () => {
  it("starts as a readable judgment inspector instead of a form", () => {
    const markup = renderToStaticMarkup(
      <CrokiCanvasNodeEditor
        node={NODE}
        onAdopt={vi.fn()}
        onAddReference={vi.fn(() => null)}
        onBack={vi.fn()}
        onDecline={vi.fn()}
        onDelete={vi.fn()}
        onRemoveReference={vi.fn()}
        onRetire={vi.fn()}
        onUpdate={vi.fn()}
      />,
    );

    expect(markup).toContain('aria-label="Close inspector"');
    expect(markup).toContain('aria-label="Founder judgment"');
    expect(markup).toContain("Accept");
    expect(markup).toContain("Decline");
    expect(markup).toContain("Proposed");
    expect(markup).toContain("origin agent");
    expect(markup).toContain("Advanced edit");
    expect(markup).not.toContain('aria-label="Kind"');
    expect(markup).not.toContain("Delete item");
  });

  it("marks invalid titles and over-limit details for assistive technology", () => {
    const markup = renderToStaticMarkup(
      <CrokiCanvasNodeEditor
        node={{ ...NODE, title: "", body: "x".repeat(12_001) }}
        onAdopt={vi.fn()}
        onAddReference={vi.fn(() => null)}
        onBack={vi.fn()}
        onDecline={vi.fn()}
        onDelete={vi.fn()}
        onRemoveReference={vi.fn()}
        onRetire={vi.fn()}
        onUpdate={vi.fn()}
      />,
    );

    expect(markup).toContain('aria-label="Edit untitled Canvas item"');
    expect(markup).toContain("Advanced edit");
    expect(markup).not.toContain('aria-label="Kind"');
  });
});
