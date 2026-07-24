import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ArtifactPreview } from "./ArtifactPreview";
import { normalizeGeneratedDocument } from "./normalizeGeneratedDocument";

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

  it("renders markdown as a visual artifact instead of a document body", () => {
    render(<ArtifactPreview artifact={{ kind: "markdown", content: "# Heading" }} />);
    expect(screen.getByRole("heading", { level: 1, name: "Heading" })).toBeVisible();
    expect(screen.getByText("Product / GTM artifact")).toBeVisible();
  });

  it("lets the founder target one visual section for revision", () => {
    const onFocusSection = vi.fn();
    render(<ArtifactPreview artifact={{ kind: "markdown", content: "# Launch brief\n## Channel W\nStart with warm introductions.\n## Evidence\nTrack replies." }} artifactRef="work:launch" artifactAt="2026-07-20T12:00:00.000Z" onFocusSection={onFocusSection} />);
    fireEvent.click(screen.getByRole("button", { name: "Revise Channel W" }));
    expect(onFocusSection).toHaveBeenCalledWith({
      artifactRef: "work:launch",
      artifactTitle: "Launch brief",
      artifactAt: "2026-07-20T12:00:00.000Z",
      sectionId: "0:Channel W",
      sectionTitle: "Channel W",
      sectionIndex: 0,
    });
  });

  it("renders plain text inside the same visual artifact composition", () => {
    render(<ArtifactPreview artifact={{ kind: "text", content: "plain body" }} />);
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.getByText("plain body")).toBeVisible();
  });

  it("turns a strategy memo into visual sections, tiles, and a next action", () => {
    render(<ArtifactPreview artifact={{ kind: "text", content: [
      "FIRST 10 PROJECT DROPS",
      "Window: July 2026",
      "",
      "THE ONE JUDGMENT",
      "Trust is the constraint.",
      "",
      "WHO QUALIFIES",
      "1. Has a project in motion.",
      "2. Has bandwidth now.",
      "",
      "FIRST ACTION (today): Send the five warmest asks.",
    ].join("\n") }} />);
    expect(screen.getByRole("heading", { level: 1, name: "First 10 project drops" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "The one judgment" })).toBeVisible();
    expect(screen.getByRole("list")).toHaveClass("review-visual-list");
    expect(screen.getByText("First action (today)").closest("aside")).toHaveAttribute("data-action", "true");
  });

  it("recovers hierarchy from existing memo-shaped agent output", () => {
    const document = normalizeGeneratedDocument([
      "FIRST 10 PROJECT DROPS — WHO, WHERE, AND HOW",
      "Window: July 2026",
      "",
      "THE ONE JUDGMENT THAT SHAPES EVERYTHING",
      "Ten drops requires trust.",
      "WHO QUALIFIES (all four, or it is not a July drop)",
      "  - Start with the founder network.",
      "Channel W — Founder network [target: 7 drops]",
    ].join("\n"));
    expect(document).toContain("# First 10 project drops — who, where, and how");
    expect(document).toContain("**Window:** July 2026");
    expect(document).toContain("## The one judgment that shapes everything");
    expect(document).toContain("## Who qualifies (all four, or it is not a July drop)");
    expect(document).toContain("- Start with the founder network.");
    expect(document).toContain("### Channel W — Founder network");
  });

  it("preserves code artifacts in a pre block", () => {
    render(<ArtifactPreview artifact={{ kind: "code", content: "{\n  \"kind\": \"flow\"\n}" }} />);
    expect(screen.getByText(/"kind": "flow"/).tagName).toBe("PRE");
  });

  it("falls back to a quiet empty state for an unknown/empty artifact", () => {
    // @ts-expect-error — defends against an unexpected payload kind.
    render(<ArtifactPreview artifact={{ kind: "video" }} />);
    expect(screen.getByText("No preview is available for this artifact.")).toBeInTheDocument();
  });
});
