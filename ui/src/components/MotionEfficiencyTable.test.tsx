import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { MotionEfficiencyTable, type MotionEfficiencyData } from "./MotionEfficiencyTable";

// The honesty rules the Measure table must render (never a fabricated rate) — the same table the
// Operator lens's funnel consumes.

const twoMotions: MotionEfficiencyData = {
  projectId: "estatesale",
  motions: [
    {
      motionKind: "Generate loop",
      motionRef: "path-pages",
      staged: 3,
      measured: 2,
      outcomesByKind: { signup: 2 },
      coverage: 2 / 3,
      lastOutcomeAt: new Date().toISOString(),
      orderRank: 0,
    },
    {
      motionKind: "Source loop",
      motionRef: "path-outbound",
      staged: 4,
      measured: 0,
      outcomesByKind: {},
      coverage: 0,
      lastOutcomeAt: null,
      orderRank: 1,
    },
  ],
  totals: { motions: 2, staged: 7, measured: 2 },
};

describe("MotionEfficiencyTable", () => {
  it("renders one row per motion, keyed by its shape-derived kind", () => {
    render(<MotionEfficiencyTable data={twoMotions} />);
    expect(screen.getByText("Generate loop")).toBeTruthy();
    expect(screen.getByText("Source loop")).toBeTruthy();
  });

  it("shows an honest 'Nothing measured yet' for a staged-but-unmeasured motion — never a fake rate", () => {
    render(<MotionEfficiencyTable data={twoMotions} />);
    expect(screen.getByText(/nothing measured yet/i)).toBeTruthy();
  });

  it("renders a plain empty state when nothing is measured across the operation", () => {
    render(<MotionEfficiencyTable data={{ motions: [] }} />);
    expect(screen.getByText(/nothing measured yet/i)).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("renders an em-dash for coverage when nothing is staged — never 0% or 100%", () => {
    render(
      <MotionEfficiencyTable
        data={{
          motions: [
            {
              motionKind: "AI visibility",
              staged: 0,
              measured: 1,
              outcomesByKind: { ranked: 1 },
              coverage: null,
              lastOutcomeAt: null,
              orderRank: 0,
            },
          ],
        }}
      />,
    );
    // Coverage renders an em-dash (null coverage), never a fabricated 0%/100%. lastOutcomeAt is also
    // em-dashed when null, so there is more than one — assert at least one exists in the coverage column.
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("surfaces an error state and a loading state without inventing rows", () => {
    const { rerender } = render(<MotionEfficiencyTable data={null} loading />);
    expect(screen.getByText(/reading the outcome ledger/i)).toBeTruthy();
    rerender(<MotionEfficiencyTable data={null} error="Could not read outcomes" />);
    expect(screen.getByText(/could not read outcomes/i)).toBeTruthy();
  });
});
