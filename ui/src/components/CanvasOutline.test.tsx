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
    expect(rows.map((row) => row.anchor.label)).toEqual(["Activation explanations", "Improve activation"]);
    expect(rows[1]).toMatchObject({ outgoing: 1, regionTitles: ["Fix activation"] });
  });

  it("selects, inspects, and supports spatial arrow navigation", () => {
    const onSelect = vi.fn();
    const onInspect = vi.fn();
    render(<CanvasOutline canvas={canvas} onSelect={onSelect} onInspect={onInspect} />);
    fireEvent.click(screen.getByRole("button", { name: /outline/i }));
    const comparison = screen.getByRole("button", { name: /Activation explanations/i });
    const goal = screen.getByRole("button", { name: /Improve activation/i });
    comparison.focus();
    fireEvent.keyDown(comparison, { key: "ArrowDown" });
    expect(goal).toHaveFocus();
    fireEvent.click(goal);
    expect(onSelect).toHaveBeenCalledWith({ type: "goal", id: "g1" });
    fireEvent.keyDown(goal, { key: "Enter" });
    expect(onInspect).toHaveBeenCalledWith({ type: "goal", id: "g1" });
  });
});
