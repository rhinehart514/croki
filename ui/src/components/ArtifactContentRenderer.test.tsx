import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ArtifactContentRenderer } from "@/components/ArtifactContentRenderer";

describe("ArtifactContentRenderer", () => {
  it("renders markdown as safe document structure without interpreting embedded HTML", () => {
    render(<ArtifactContentRenderer content={'# Launch direction\n\nUse **proof** first.\n\n- Show the result\n- [Read source](https://example.com)\n\n<script>alert("owned")</script>'} contentType="text/markdown" />);

    expect(screen.getByRole("heading", { name: "Launch direction" })).toBeInTheDocument();
    expect(screen.getByText("proof")).toHaveProperty("tagName", "STRONG");
    expect(screen.getByRole("link", { name: "Read source" })).toHaveAttribute("href", "https://example.com");
    expect(screen.getByText(/<script>alert/)).toBeInTheDocument();
    expect(document.querySelector("script")).toBeNull();
  });

  it("turns an array of unknown records into a readable table without a kind-specific renderer", () => {
    render(<ArtifactContentRenderer content={[{ company: "Northstar", signal: "Hiring sellers", score: 7 }, { company: "Atlas", signal: "New launch", score: 5 }]} contentType="application/vnd.prospect-map+json" />);

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Company" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Northstar" })).toBeInTheDocument();
    expect(screen.getByText("application/vnd.prospect-map+json")).toBeInTheDocument();
  });

  it("blocks executable link protocols while keeping the label legible", () => {
    render(<ArtifactContentRenderer content="[Run this](javascript:evil)" contentType="text/markdown" />);

    expect(screen.getByText("Run this")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("renders an open comparison content type as a readable decision table", () => {
    render(<ArtifactContentRenderer content={{ alternatives: [
      { name: "Founder-led proof", speed: "This week", evidence: "Direct replies", risk: "Narrow reach" },
      { name: "Broad launch", speed: "Two weeks", evidence: "Traffic", risk: "Weak signal" },
    ] }} contentType="application/vnd.drover.comparison+json" />);

    const renderer = screen.getByLabelText("Artifact content");
    expect(renderer).toHaveAttribute("data-renderer", "comparison");
    expect(screen.getByRole("table", { name: /comparison of 2 alternatives/i })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "Founder-led proof" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Evidence" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Direct replies" })).toBeInTheDocument();
  });

  it("renders journey content as an ordered, bounded sequence", () => {
    render(<ArtifactContentRenderer content={{ steps: [
      { title: "Read the product", when: "Day 1", description: "Ground the work in repo evidence.", status: "Complete" },
      { title: "Draft the proof", when: "Day 2", description: "Shape one artifact for review.", status: "Active" },
    ] }} contentType="application/vnd.drover.journey+json" />);

    const journey = screen.getByRole("list", { name: "Journey" });
    expect(journey).toHaveProperty("tagName", "OL");
    expect(screen.getByText("Read the product")).toBeInTheDocument();
    expect(screen.getByText("Day 2")).toHaveProperty("tagName", "TIME");
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("renders unified code diffs as inert text with semantic change lines", () => {
    const diff = [
      "--- a/app.ts",
      "+++ b/app.ts",
      "@@ -1,2 +1,2 @@",
      "-const claim = 'guess';",
      "+const claim = '<img src=x onerror=evil()>';",
    ].join("\n");
    render(<ArtifactContentRenderer content={diff} contentType="text/x-diff" />);

    const renderer = screen.getByLabelText("Artifact content");
    expect(renderer).toHaveAttribute("data-renderer", "diff");
    expect(screen.getByLabelText("Code changes")).toHaveTextContent("<img src=x onerror=evil()>");
    expect(document.querySelector("img")).toBeNull();
    expect(document.querySelector(".artifact-diff-line--add")).toHaveTextContent("+const claim");
    expect(document.querySelector(".artifact-diff-line--remove")).toHaveTextContent("-const claim");
  });

  it("falls back to bounded structured rendering when a specialized hint has an unknown shape", () => {
    render(<ArtifactContentRenderer content={{ thesis: "Keep the content model open" }} contentType="application/vnd.drover.comparison+json" />);

    expect(screen.getByLabelText("Artifact content")).toHaveAttribute("data-renderer", "structured");
    expect(screen.getByText("Keep the content model open")).toBeInTheDocument();
  });

  it("renders a bounded inert wireframe without fetching or executing artifact content", () => {
    const elements = [
      { type: "heading", label: "<script>Launch proof</script>", x: 40, y: 32, width: 500, height: 80 },
      { type: "media", label: "Remote hero", src: "https://tracking.example/hero.png", x: 40, y: 140, width: 500, height: 220 },
      { type: "control", label: "See the evidence", x: 570, y: 32, width: 180, height: 80 },
      ...Array.from({ length: 79 }, (_, index) => ({ type: "text", label: "Detail " + index })),
    ];
    render(<ArtifactContentRenderer content={{
      title: "Launch page",
      frame: { width: 800, height: 500 },
      elements,
      html: "<iframe src='https://tracking.example'></iframe>",
    }} contentType="application/vnd.drover.wireframe+json" />);

    expect(screen.getByLabelText("Artifact content")).toHaveAttribute("data-renderer", "visual");
    expect(screen.getByRole("group", { name: "Launch page wireframe" })).toBeInTheDocument();
    expect(screen.getByLabelText("Heading: <script>Launch proof</script>")).toBeInTheDocument();
    expect(document.querySelector("script")).toBeNull();
    expect(document.querySelector("iframe")).toBeNull();
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByText("Showing 80 of 82 regions.")).toBeInTheDocument();
  });

  it("moves focus spatially between wireframe regions with arrow keys", () => {
    render(<ArtifactContentRenderer content={{
      frame: { width: 1000, height: 600 },
      elements: [
        { type: "heading", label: "Top left", x: 20, y: 20, width: 200, height: 80 },
        { type: "control", label: "Top right", x: 700, y: 20, width: 200, height: 80 },
        { type: "text", label: "Bottom right", x: 700, y: 400, width: 200, height: 80 },
      ],
    }} contentType="application/vnd.product.layout-preview+json" />);

    const topLeft = screen.getByLabelText("Heading: Top left");
    const topRight = screen.getByLabelText("Control: Top right");
    const bottomRight = screen.getByLabelText("Text: Bottom right");
    topLeft.focus();
    fireEvent.keyDown(topLeft, { key: "ArrowRight" });
    expect(topRight).toHaveFocus();
    fireEvent.keyDown(topRight, { key: "ArrowDown" });
    expect(bottomRight).toHaveFocus();
    fireEvent.keyDown(bottomRight, { key: "ArrowLeft" });
    expect(topLeft).toHaveFocus();
  });
});
