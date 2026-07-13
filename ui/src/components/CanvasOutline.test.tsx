import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WovenCanvas } from "@/types";
import { CanvasOutline } from "./CanvasOutline";
import { buildCanvasOutline } from "@/lib/canvasOutline";

const canvas = {
  anchors: [
    { ref: { type: "goal", id: "g1" }, kind: "goal", label: "Improve activation" },
    { ref: { type: "work-artifact", id: "w1" }, kind: "comparison", label: "Activation explanations" },
  ],
  relationships: [{ source: { type: "goal", id: "g1" }, target: { type: "work-artifact", id: "w1" }, kind: "tests", resolved: true, authority: { owner: "work", projectId: "p1" } }],
  regions: [{ id: "r1", projectId: "p1", title: "Fix activation", memberRefs: [{ type: "goal", id: "g1" }], position: { x: 0, y: 0 }, size: { width: 400, height: 300 }, collapsed: false, founderPlaced: true, revision: 1 }],
  state: { kind: "ready", stale: false, issues: [] },
  geometry: null,
} as unknown as WovenCanvas;

describe("CanvasOutline", () => {
  it("builds a stable linear view with regions and connection counts", () => {
    const rows = buildCanvasOutline(canvas);
    expect(rows.map((row) => row.anchor.label)).toEqual(["Improve activation", "Activation explanations"]);
    expect(rows[0]).toMatchObject({ outgoing: 1, regionTitles: ["Fix activation"] });
  });

  it("selects, inspects, and supports spatial arrow navigation", () => {
    const onSelect = vi.fn();
    const onInspect = vi.fn();
    const { container } = render(<CanvasOutline canvas={canvas} onSelect={onSelect} onInspect={onInspect} />);
    const outline = container.querySelector(".canvas-outline");
    const toggle = container.querySelector(".canvas-outline-toggle");
    expect(outline).not.toHaveClass("open");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle!);
    expect(outline).toHaveClass("open");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Founder goal")).toBeInTheDocument();
    expect(screen.getByText("Crew work")).toBeInTheDocument();
    const comparison = screen.getByRole("button", { name: /Activation explanations/i });
    const goal = screen.getByRole("button", { name: /Improve activation/i });
    comparison.focus();
    fireEvent.keyDown(comparison, { key: "ArrowDown" });
    expect(goal).toHaveFocus();
    fireEvent.keyDown(goal, { key: "Enter" });
    expect(onInspect).toHaveBeenCalledWith({ type: "goal", id: "g1" });
    expect(outline).not.toHaveClass("open");
    expect(screen.queryByText("Linear access to the same canvas")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /outline/i }));
    const reopenedGoal = screen.getByRole("button", { name: /Improve activation/i });
    fireEvent.click(reopenedGoal);
    expect(onSelect).toHaveBeenCalledWith({ type: "goal", id: "g1" });
    expect(screen.queryByText("Linear access to the same canvas")).not.toBeInTheDocument();
  });
});
