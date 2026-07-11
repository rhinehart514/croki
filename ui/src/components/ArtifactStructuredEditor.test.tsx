import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ArtifactStructuredEditor } from "@/components/ArtifactStructuredEditor";
import { supportsStructuredArtifactEditing } from "@/lib/artifactStructuredEditing";

describe("ArtifactStructuredEditor", () => {
  it("edits comparison values without discarding unknown nested fields", () => {
    const change = vi.fn();
    render(<ArtifactStructuredEditor
      content={{ alternatives: [{ name: "Proof first", risk: "Narrow", evidence: { source: "calls" } }], decision: "open" }}
      contentType="application/vnd.drover.comparison+json"
      onChange={change}
    />);

    fireEvent.change(screen.getByLabelText("risk"), { target: { value: "Focused" } });
    expect(change).toHaveBeenCalledWith({
      alternatives: [{ name: "Proof first", risk: "Focused", evidence: { source: "calls" } }],
      decision: "open",
    });
  });

  it("adds and removes journey steps through direct controls", () => {
    const change = vi.fn();
    const content = { steps: [{ title: "Read product", status: "Complete" }] };
    const view = render(<ArtifactStructuredEditor content={content} contentType="application/vnd.drover.journey+json" onChange={change} />);

    fireEvent.click(screen.getByRole("button", { name: "Add step" }));
    expect(change).toHaveBeenCalledWith({ steps: [{ title: "Read product", status: "Complete" }, { title: "", status: "" }] });

    view.rerender(<ArtifactStructuredEditor content={content} contentType="application/vnd.drover.journey+json" onChange={change} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove step" }));
    expect(change).toHaveBeenCalledWith({ steps: [] });
  });

  it("keeps unknown content types on the generic source editor path", () => {
    expect(supportsStructuredArtifactEditing({ rows: [{ signal: "strong" }] }, "application/vnd.unknown+json")).toBe(false);
  });
});
