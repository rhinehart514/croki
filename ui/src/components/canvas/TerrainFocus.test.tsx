import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TerrainFocusItem } from "@/lib/terrainProjection";
import { TerrainFocus } from "./TerrainFocus";

const item: TerrainFocusItem = {
  kind: "hypothesis",
  ref: { type: "terrain-hypothesis", id: "h1" },
  hypothesis: {
    id: "h1", stance: "tension", title: "Setup obscures the first win", claim: "The first win appears after too much setup.",
    whyItMatters: "Founders may leave before seeing product understanding.", provenance: "inferred",
    evidenceRefs: [{ type: "product-truth", id: "truth-1" }], productRefs: [], marketRefs: [],
    counterEvidenceRefs: [{ type: "market-evidence", id: "counter-1" }],
    unknown: "Whether the reveal changes activation.", falsifier: "Activation remains unchanged in grounded trials.",
    suggestedMove: { title: "Lead with the grounded reveal", intendedEffect: "Show value before setup", measurementIntent: "Observe first-session continuation" },
    crewRefs: [{ type: "teammate", id: "scout" }],
  },
};

describe("TerrainFocus", () => {
  it("shows provenance, receipts, counterevidence, unknown, falsifier, crew, and a possible move", () => {
    render(<TerrainFocus item={item} onClose={() => {}} onAction={() => {}} />);
    expect(screen.getByText("inferred")).toBeInTheDocument();
    expect(screen.getByText("product-truth:truth-1")).toBeInTheDocument();
    expect(screen.getByText("market-evidence:counter-1")).toBeInTheDocument();
    expect(screen.getByText("Whether the reveal changes activation.")).toBeInTheDocument();
    expect(screen.getByText("Activation remains unchanged in grounded trials.")).toBeInTheDocument();
    expect(screen.getByText("Lead with the grounded reveal")).toBeInTheDocument();
  });

  it("routes every hypothesis action through the supplied authority callback", () => {
    const onAction = vi.fn();
    render(<TerrainFocus item={item} onClose={() => {}} onAction={onAction} />);
    for (const name of ["Correct", "Keep", "Park", "Find evidence", "Ask crew", "Pin as question", "Turn into pipeline"]) {
      fireEvent.click(screen.getByRole("button", { name }));
    }
    expect(onAction.mock.calls.map(([action]) => action)).toEqual(["correct", "keep", "park", "investigate", "ask", "pin", "pipeline"]);
  });
});
