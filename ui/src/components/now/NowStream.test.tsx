import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NowStream } from "./NowStream";
import type { Direction, DirectionSection } from "./directionModel";

function direction(partial: Partial<Direction> & Pick<Direction, "id" | "sentence" | "state">): Direction {
  return {
    createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", betIds: [], primaryBetId: null,
    waitingWallItemIds: [], activeDriveIds: [], outcomeIds: [], proofCount: 0, approaches: 1,
    needsYou: partial.state === "needs-you", understanding: "…", attribution: null, ...partial,
  };
}

const sections: DirectionSection[] = [
  {
    key: "needs-you", label: "Needs you", tone: "needs-you",
    directions: [direction({ id: "d1", sentence: "Contact these roofing operators", state: "needs-you", understanding: "An outward act to ops@acme.com is waiting for your release." })],
  },
  {
    key: "working", label: "Working now", tone: "working",
    directions: [direction({ id: "d2", sentence: "Find out why signups stalled and fix what you can", state: "working", understanding: "2 drafts are ready to inspect.", approaches: 3, proofCount: 2 })],
  },
];

describe("NowStream", () => {
  it("renders one row per founder direction, titled by the sentence", () => {
    render(<NowStream sections={sections} now={Date.parse("2026-01-01T00:10:00Z")} onSelect={() => {}} />);
    const row = screen.getByRole("button", { name: /Find out why signups stalled/ });
    expect(row).toHaveAttribute("data-tone", "working");
    // Machinery summaries (N approaches / N drafts) are not shown to the founder.
    expect(screen.queryByText(/approaches/)).toBeNull();
    expect(screen.getByText(/An outward act to ops@acme\.com/)).toBeTruthy();
  });

  it("calls back with the direction when selected", () => {
    const onSelect = vi.fn();
    render(<NowStream sections={sections} now={Date.now()} onSelect={onSelect} />);
    screen.getByRole("button", { name: /Contact these roofing operators/ }).click();
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "d1" }));
  });

  it("shows the quiet first-run state when nothing is living", () => {
    render(<NowStream sections={[]} now={Date.now()} onSelect={() => {}} />);
    expect(screen.getByText(/This is your venture\. Tell it what to do\./)).toBeTruthy();
  });
});
