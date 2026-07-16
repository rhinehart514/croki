import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FirmArchitectureProjection, FirmLens } from "@/types";
import { AtlasReturnBand } from "./AtlasReturnBand";

function projection(overrides: Partial<FirmArchitectureProjection> = {}): FirmArchitectureProjection {
  const document = {
    schemaVersion: 1,
    ventureId: "venture-1",
    revision: 1,
    intent: { statement: "Turn real work into credible proof." },
    elements: [],
    connections: [],
    groups: [],
    evidenceAnnotations: [],
  };
  return {
    ventureId: "venture-1",
    document,
    revision: 1,
    elements: [],
    connections: [],
    groups: [],
    evidenceAnnotations: [],
    pressure: [],
    joins: { bets: [], work: [], wall: [], outcomes: [] },
    ...overrides,
  };
}

function lens(overrides: Partial<FirmLens> = {}): FirmLens {
  return {
    ventureId: "venture-1",
    crew: [],
    bets: [],
    outcomes: [],
    wall: { count: 0, oldestParkedAt: null },
    placement: { positions: {}, revision: 0 },
    ...overrides,
  };
}

describe("AtlasReturnBand", () => {
  it("leaves a quiet venture to the permanent intent node", () => {
    render(<AtlasReturnBand projection={projection()} lens={lens()} onFocusOutcome={vi.fn()} onFocusPressure={vi.fn()} />);
    expect(screen.queryByRole("region", { name: "What changed since you left" })).not.toBeInTheDocument();
  });

  it("surfaces an outcome without duplicating the wall boundary", () => {
    const onFocusOutcome = vi.fn();
    render(
      <AtlasReturnBand
        projection={projection()}
        lens={lens({
          wall: { count: 1, oldestParkedAt: "2026-07-15T00:00:00Z" },
          outcomes: [{
            type: "outcome",
            id: "outcome-1",
            outcomeKind: "reply",
            from: "Builder",
            body: "The first builder replied.",
            source: "captured",
            channel: "email",
            observedAt: "2026-07-15T00:00:00Z",
            joined: true,
          }],
        })}
        onFocusOutcome={onFocusOutcome}
        onFocusPressure={vi.fn()}
      />,
    );

    expect(screen.queryByText("Needs you")).not.toBeInTheDocument();
    expect(screen.queryByText(/Jacob/i)).not.toBeInTheDocument();
    expect(screen.getByText("Returned evidence")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Returned evidence/i }));
    expect(onFocusOutcome).toHaveBeenCalledWith("outcome-1");
  });
});
