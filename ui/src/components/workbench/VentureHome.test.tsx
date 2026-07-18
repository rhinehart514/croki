// VentureHome — the resting operating picture. Proves it reads from the direction fold, offers a real
// invitation when empty, opens a direction on click, summons the map, and stops active work in place.
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Direction, DirectionSection } from "@/components/now/directionModel";
import { VentureHome } from "./VentureHome";

function direction(partial: Partial<Direction> & Pick<Direction, "id" | "sentence" | "state">): Direction {
  return {
    createdAt: null, updatedAt: "2026-07-01T10:00:00.000Z", betIds: ["b1"], primaryBetId: "b1",
    waitingWallItemIds: [], activeDriveIds: [], outcomeIds: [], proofCount: 0, approaches: 1,
    needsYou: false, understanding: "", attribution: null,
    ...partial,
  };
}

function section(partial: DirectionSection): DirectionSection { return partial; }

const venture = { name: "RodentRadar" };

describe("VentureHome", () => {
  it("invites a first direction when there is no directed work yet", () => {
    render(<VentureHome venture={venture} sections={[]} now={Date.now()} onSelectDirection={vi.fn()} onSummonMap={vi.fn()} />);
    expect(screen.getByText("No directed work yet")).toBeTruthy();
    expect(screen.getByText(/Say what Drover should accomplish/)).toBeTruthy();
  });

  it("lists directions by section and opens one on click", () => {
    const onSelect = vi.fn();
    const sections = [
      section({ key: "working", label: "Working now", tone: "working", directions: [
        direction({ id: "d1", sentence: "Reach the first buyers.", state: "working", understanding: "Work is taking shape now.", activeDriveIds: ["drive-1"] }),
      ] }),
    ];
    const onStop = vi.fn();
    render(<VentureHome venture={venture} sections={sections} now={Date.now()} onSelectDirection={onSelect} onStop={onStop} onSummonMap={vi.fn()} />);

    expect(screen.getByText("Working now")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Reach the first buyers/ }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "d1" }));

    // A working direction offers an in-place Stop that carries its active drive.
    fireEvent.click(screen.getByRole("button", { name: /Stop work on Reach the first buyers/ }));
    expect(onStop).toHaveBeenCalledWith("drive-1");
  });

  it("summons the map without leaving Home", () => {
    const onSummon = vi.fn();
    render(<VentureHome venture={venture} sections={[]} now={Date.now()} onSelectDirection={vi.fn()} onSummonMap={onSummon} />);
    fireEvent.click(screen.getByRole("button", { name: /Open the map/ }));
    expect(onSummon).toHaveBeenCalled();
  });
});
