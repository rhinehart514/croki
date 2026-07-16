import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { Node } from "@xyflow/react";
import { FirmLensCanvas } from "./FirmLensCanvas";

vi.mock("@xyflow/react", () => ({
  ReactFlow: ({ children, onlyRenderVisibleElements }: { children?: ReactNode; onlyRenderVisibleElements?: boolean }) => (
    <div data-testid="flow" data-virtualized={onlyRenderVisibleElements ? "true" : "false"}>{children}</div>
  ),
  Background: () => null,
  Controls: () => null,
}));

vi.mock("./lensCanvasGuards", () => ({
  ViewportRestorer: () => null,
  MeasureGuard: () => null,
  CanvasVisibilityGuard: ({ onFramed }: { onFramed?: () => void }) => (
    <button type="button" onClick={onFramed}>frame ready</button>
  ),
}));

describe("FirmLensCanvas", () => {
  it("does not virtualize a dense topology until its measured first frame is visible", () => {
    const nodes = Array.from({ length: 121 }, (_, index): Node => ({
      id: `bet:${index}`,
      position: { x: index * 20, y: 0 },
      data: {},
    }));
    render(
      <FirmLensCanvas
        nodes={nodes}
        edges={[]}
        nodeTypes={{}}
        fitOptions={{ padding: 0.1, maxZoom: 1.1 }}
        receiptKey="v1"
        onInit={vi.fn()}
        onNodesChange={vi.fn()}
        onNodeDragStop={vi.fn()}
        onInspect={vi.fn()}
        onClearSelection={vi.fn()}
        onMoveEnd={vi.fn()}
        altitude="middle"
      />,
    );

    expect(screen.getByTestId("flow")).toHaveAttribute("data-virtualized", "false");
    fireEvent.click(screen.getByRole("button", { name: "frame ready" }));
    expect(screen.getByTestId("flow")).toHaveAttribute("data-virtualized", "true");
  });

  it("keeps the full lightweight topology visible at far altitude", () => {
    const nodes = Array.from({ length: 121 }, (_, index): Node => ({
      id: `bet:${index}`,
      position: { x: index * 20, y: 0 },
      data: {},
    }));
    render(
      <FirmLensCanvas
        nodes={nodes}
        edges={[]}
        nodeTypes={{}}
        fitOptions={{ padding: 0.1, maxZoom: 1.1 }}
        receiptKey="v1"
        onInit={vi.fn()}
        onNodesChange={vi.fn()}
        onNodeDragStop={vi.fn()}
        onInspect={vi.fn()}
        onClearSelection={vi.fn()}
        onMoveEnd={vi.fn()}
        altitude="far"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "frame ready" }));
    expect(screen.getByTestId("flow")).toHaveAttribute("data-virtualized", "false");
  });
});
