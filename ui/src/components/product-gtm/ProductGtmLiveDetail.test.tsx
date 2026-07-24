import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { FirmWorkDelta } from "@/api";
import { ProductGtmLiveDetail } from "./ProductGtmLiveDetail";
import { applyWorkDelta, emptyLiveDetail } from "./liveWorkDetail";

function fold(deltas: FirmWorkDelta[]) {
  return deltas.reduce(applyWorkDelta, emptyLiveDetail);
}

describe("applyWorkDelta focused-node fold (decision 28)", () => {
  it("promotes a started step to done with its measured duration", () => {
    const state = fold([
      { type: "step-started", stepId: "s1", label: "Reading the routes" },
      { type: "step-finished", stepId: "s1", label: "Reading the routes", status: "ok", durationMs: 1840 },
    ]);
    expect(state.steps).toHaveLength(1);
    expect(state.steps[0]).toMatchObject({ label: "Reading the routes", state: "done", durationMs: 1840 });
  });

  it("keeps a consulted source as a distinct factual line with its ref", () => {
    const state = fold([{ type: "source-consulted", label: "pricing.md", ref: "src/pricing.md" }]);
    expect(state.steps[0]).toMatchObject({ kind: "source", state: "done", label: "pricing.md · src/pricing.md" });
  });

  it("records the latest status without accumulating prose", () => {
    const state = fold([
      { type: "status-changed", status: "planning", previous: null },
      { type: "status-changed", status: "editing", previous: "planning" },
    ]);
    expect(state.status).toBe("editing");
  });

  it("caps the visible steps so a long run cannot grow unbounded", () => {
    const deltas: FirmWorkDelta[] = Array.from({ length: 10 }, (_, index) => ({
      type: "step-started" as const, stepId: `s${index}`, label: `Step ${index}`,
    }));
    expect(fold(deltas).steps).toHaveLength(6);
    expect(fold(deltas).steps[0].label).toBe("Step 4");
  });
});

describe("ProductGtmLiveDetail render", () => {
  it("shows the node detail and an honest waiting state before any delta arrives", () => {
    render(<ProductGtmLiveDetail ventureId="venture-1" threadRef="thread:one" detail="Testing the invitation." />);
    expect(screen.getByText("Testing the invitation.")).toBeTruthy();
    expect(screen.getByText(/Watching for live steps/)).toBeTruthy();
  });
});
