import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ExactArtifact } from "./RichThreadItems";

describe("exact artifact recovery", () => {
  it("keeps unsupported legacy data out of the primary UI and explains recovery", () => {
    render(<ExactArtifact item={{
      kind: "artifact",
      id: "artifact:legacy",
      ref: "work:legacy",
      at: null,
      title: "Old generated output",
      artifact: { content: { kind: "unknown-structure", internal: "raw machine data" } },
    }} />);

    expect(screen.getByText("This saved material needs a supported view.")).toBeVisible();
    expect(screen.getByText(/original data is still preserved/i)).toBeVisible();
    expect(screen.queryByText(/raw machine data/i)).not.toBeInTheDocument();
  });
});
