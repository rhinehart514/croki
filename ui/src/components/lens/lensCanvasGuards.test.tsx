import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const flow = vi.hoisted(() => ({
  initialized: false,
  store: { width: 800, height: 600, nodes: [] as unknown[] },
  nodes: [] as Array<{ id: string; position: { x: number; y: number }; measured: { width: number; height: number } }>,
  fitView: vi.fn(),
  getViewport: vi.fn(() => ({ x: 0, y: 0, zoom: 1 })),
}));

vi.mock("@xyflow/react", () => ({
  useNodesInitialized: () => flow.initialized,
  useReactFlow: () => ({
    fitView: flow.fitView,
    getNodes: () => flow.nodes,
    getViewport: flow.getViewport,
    setViewport: vi.fn(),
  }),
  useStore: (selector: (state: typeof flow.store) => unknown) => selector(flow.store),
  useUpdateNodeInternals: () => vi.fn(),
}));

import { CanvasVisibilityGuard } from "./lensCanvasGuards";

describe("CanvasVisibilityGuard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    flow.initialized = false;
    flow.store = { width: 800, height: 600, nodes: [{}] };
    flow.nodes = [{ id: "bet:one", position: { x: 1600, y: 900 }, measured: { width: 0, height: 0 } }];
    flow.fitView.mockReset().mockResolvedValue(true);
    flow.getViewport.mockReset().mockReturnValue({ x: 0, y: 0, zoom: 1 });
  });

  it("waits for measured nodes, then guarantees a visible first frame", async () => {
    const onFramed = vi.fn();
    const { rerender } = render(
      <CanvasVisibilityGuard topology="bet:one" fitOptions={{ padding: 0.1, maxZoom: 1.1 }} onFramed={onFramed} />,
    );
    await vi.runOnlyPendingTimersAsync();
    expect(flow.fitView).not.toHaveBeenCalled();

    flow.initialized = true;
    rerender(<CanvasVisibilityGuard topology="bet:one" fitOptions={{ padding: 0.1, maxZoom: 1.1 }} onFramed={onFramed} />);
    await vi.advanceTimersByTimeAsync(1);
    expect(flow.fitView).not.toHaveBeenCalled();

    flow.nodes[0].measured = { width: 240, height: 140 };
    await vi.advanceTimersByTimeAsync(32);

    expect(flow.fitView).toHaveBeenCalledWith(expect.objectContaining({ duration: 0 }));
    expect(onFramed).toHaveBeenCalledTimes(1);
  });
});
