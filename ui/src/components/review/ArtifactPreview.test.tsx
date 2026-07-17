import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Streamdown loads lazily and pulls a heavy markdown/diagram parser; stub it so the markdown case
// renders synchronously and the test asserts wiring, not the third-party renderer.
vi.mock("streamdown", () => ({
  Streamdown: ({ children }: { children?: string }) => <div data-testid="streamdown">{children}</div>,
}));

import { ArtifactPreview } from "./ArtifactPreview";

describe("ArtifactPreview", () => {
  it("renders an image artifact", () => {
    render(<ArtifactPreview artifact={{ kind: "image", src: "data:image/png;base64,AAAA", caption: "A chart" }} />);
    const img = screen.getByRole("img") as HTMLImageElement;
    expect(img.src).toContain("data:image/png");
    expect(screen.getByText("A chart")).toBeInTheDocument();
  });

  it("renders an html artifact in a sandboxed labeled iframe", () => {
    render(<ArtifactPreview artifact={{ kind: "html", content: "<h1>Hi</h1>" }} />);
    expect(screen.getByText("Preview")).toBeInTheDocument();
    const frame = screen.getByTitle("HTML preview") as HTMLIFrameElement;
    expect(frame.getAttribute("sandbox")).toBe("");
    expect(frame.getAttribute("srcdoc")).toBe("<h1>Hi</h1>");
  });

  it("renders a markdown artifact via Streamdown", async () => {
    render(<ArtifactPreview artifact={{ kind: "markdown", content: "# Heading" }} />);
    expect(await screen.findByTestId("streamdown")).toHaveTextContent("# Heading");
  });

  it("renders a text artifact in a pre block", () => {
    render(<ArtifactPreview artifact={{ kind: "text", content: "plain body" }} />);
    expect(screen.getByText("plain body").tagName).toBe("PRE");
  });

  it("falls back to a quiet empty state for an unknown/empty artifact", () => {
    // @ts-expect-error — defends against an unexpected payload kind.
    render(<ArtifactPreview artifact={{ kind: "video" }} />);
    expect(screen.getByText("No preview is available for this artifact.")).toBeInTheDocument();
  });
});
