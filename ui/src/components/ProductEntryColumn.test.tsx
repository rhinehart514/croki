import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ProductEntryColumn } from "./ProductEntryColumn";
import type { ProductModel } from "@/types";

const model = { userGoals: [{ goal: "Book a valuation", actor: "A seller" }], things: [] } as unknown as ProductModel;

// The compact left-headwaters SOURCE (docs/production-direction/16, P1): product name, where wins enter,
// a few cited truths, and the important open unknowns — bounded, canonical, never a taxonomy ladder.
describe("ProductEntryColumn — the compact source", () => {
  it("renders the product name, where-wins-enter, cited truths, and open unknowns when expanded", () => {
    render(
      <ProductEntryColumn
        productName="estatesaleusa"
        model={model}
        truths={["Tracks project_created", "Captures acquisition source"]}
        unknowns={["Which segment does the scorecard attract?"]}
        defaultOpen
      />,
    );
    // Product root / name.
    expect(screen.getByText("estatesaleusa")).toBeTruthy();
    // Where wins enter (from the model goal).
    expect(screen.getByText("Book a valuation")).toBeTruthy();
    // Cited truths.
    expect(screen.getByLabelText("What we know")).toBeTruthy();
    expect(screen.getByText("Tracks project_created")).toBeTruthy();
    // Important open unknowns (the pinned question).
    expect(screen.getByLabelText("Open unknowns")).toBeTruthy();
    expect(screen.getByText("Which segment does the scorecard attract?")).toBeTruthy();
  });

  it("omits the truth and unknown sections when there is nothing real to show (no fabrication)", () => {
    render(<ProductEntryColumn productName="estatesaleusa" model={model} defaultOpen />);
    expect(screen.queryByLabelText("What we know")).toBeNull();
    expect(screen.queryByLabelText("Open unknowns")).toBeNull();
  });

  it("collapses to the quiet 'Where wins enter' tab, demoted, when not expanded", () => {
    render(<ProductEntryColumn productName="estatesaleusa" model={model} defaultOpen={false} />);
    expect(screen.getByRole("button", { name: "Show where wins enter" })).toBeTruthy();
  });

  it("makes truths and unknowns keyboard-reachable focus actions", () => {
    const onFocusTruth = vi.fn();
    const onFocusUnknown = vi.fn();
    render(<ProductEntryColumn productName="p" model={model} truths={["Observed truth"]} unknowns={["Open question"]} onFocusTruth={onFocusTruth} onFocusUnknown={onFocusUnknown} />);
    fireEvent.click(screen.getByRole("button", { name: "Observed truth" }));
    fireEvent.click(screen.getByRole("button", { name: "Open question" }));
    expect(onFocusTruth).toHaveBeenCalledWith(0);
    expect(onFocusUnknown).toHaveBeenCalledWith(0);
  });
});
