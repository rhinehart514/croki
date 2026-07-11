import { describe, expect, it } from "vitest";
import { isGroupableCanvasNode, regionRequestForSelection } from "./canvasRegionGrouping";

const node = (id: string, type: string, x: number, y: number, width = 240, height = 112) => ({
  id: `canchor:${type}:${id}`,
  type: type === "work-region" ? "canvasRegion" : "canvasAnchor",
  position: { x, y },
  measured: { width, height },
  data: { ref: { type, id }, ...(type === "work-region" ? { size: { width, height } } : {}) },
});

describe("canvas region grouping", () => {
  it("wraps selected goal and work references at their spatial bounds without copying content", () => {
    const request = regionRequestForSelection([
      node("activation", "goal", 100, 100, 220, 100),
      node("journey", "work-artifact", 460, 260, 280, 140),
    ], "Fix activation");
    expect(request).toEqual({
      title: "Fix activation",
      memberRefs: [{ type: "goal", id: "activation" }, { type: "work-artifact", id: "journey" }],
      position: { x: 52, y: 40 },
      size: { width: 736, height: 400 },
    });
  });

  it("allows a selected region as a non-owning member but excludes pipeline and decorative nodes", () => {
    const child = node("child", "work-region", 50, 40, 500, 300);
    expect(isGroupableCanvasNode(child)).toBe(true);
    expect(regionRequestForSelection([
      child,
      node("goal", "goal", 620, 100),
      node("pipeline", "pipeline", 0, 0),
    ], "Parent")?.memberRefs).toEqual([
      { type: "goal", id: "goal" },
      { type: "work-region", id: "child" },
    ]);
  });

  it("requires two distinct supported references", () => {
    const goal = node("goal", "goal", 0, 0);
    expect(regionRequestForSelection([goal], "One")).toBeNull();
    expect(regionRequestForSelection([goal, { ...goal, id: "duplicate" }], "Duplicate")).toBeNull();
  });
});
