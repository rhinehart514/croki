import type { CrokiContextNode } from "@t3tools/shared/crokiContext";
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
  it("labels every focused editing control", () => {
    const markup = renderToStaticMarkup(
      <CrokiCanvasNodeEditor
        node={NODE}
        onAddReference={vi.fn(() => null)}
        onBack={vi.fn()}
        onDelete={vi.fn()}
        onRemoveReference={vi.fn()}
        onUpdate={vi.fn()}
      />,
    );

    expect(markup).toContain('aria-label="Back to Canvas overview"');
    expect(markup).toContain('aria-label="Kind"');
    expect(markup).toContain('aria-label="Area"');
    expect(markup).not.toContain('aria-label="Status"');
    expect(markup).toContain("Proposed");
    expect(markup).toContain("origin agent");
    expect(markup).toContain(">Title</span>");
    expect(markup).toContain(">Details</span>");
    expect(markup).toContain("Delete item");
  });

  it("marks invalid titles and over-limit details for assistive technology", () => {
    const markup = renderToStaticMarkup(
      <CrokiCanvasNodeEditor
        node={{ ...NODE, title: "", body: "x".repeat(12_001) }}
        onAddReference={vi.fn(() => null)}
        onBack={vi.fn()}
        onDelete={vi.fn()}
        onRemoveReference={vi.fn()}
        onUpdate={vi.fn()}
      />,
    );

    expect(markup.match(/aria-invalid="true"/g)).toHaveLength(2);
    expect(markup.match(/aria-describedby=/g)).toHaveLength(2);
    expect(markup.match(/role="alert"/g)).toHaveLength(2);
    expect(markup).toContain('aria-label="Edit untitled Canvas item"');
    expect(markup).toContain("Enter a title under 240 characters.");
    expect(markup).toContain("Details exceed the Canvas limit.");
  });
});
