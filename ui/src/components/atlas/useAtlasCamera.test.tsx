import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactFlowInstance, Viewport } from "@xyflow/react";
import type { AtlasNode } from "./atlasTypes";
import { useAtlasCamera } from "./useAtlasCamera";

function node(id: string, x: number, y: number, width = 280, height = 160) {
  return { id, position: { x, y }, measured: { width, height }, data: {} } as AtlasNode;
}

function flowInstance(nodes: AtlasNode[], initial: Viewport) {
  let viewport = initial;
  const setViewport = vi.fn(async (next: Viewport) => { viewport = next; return true; });
  const setCenter = vi.fn(async (x: number, y: number, options?: { zoom?: number }) => {
    viewport = { x, y, zoom: options?.zoom ?? viewport.zoom };
    return true;
  });
  const fitView = vi.fn(async () => true);
  const instance = {
    getNodes: () => nodes,
    getViewport: () => viewport,
    getZoom: () => viewport.zoom,
    setViewport,
    setCenter,
    fitView,
  } as unknown as ReactFlowInstance<AtlasNode>;
  return { instance, setCenter, setViewport, fitView };
}

describe("useAtlasCamera", () => {
  beforeEach(() => {
    Object.defineProperty(window, "requestAnimationFrame", {
      configurable: true,
      value: (callback: FrameRequestCallback) => { callback(0); return 1; },
    });
  });

  it("reveals an externally selected exact target and restores the prior camera when selection clears", async () => {
    const nodes = [node("bet:one", 100, 200), node("work:release", 700, 420, 300, 180)];
    const initial = { x: 12, y: 24, zoom: 0.66 };
    localStorage.setItem("drover:atlas-camera:v6:venture-one", JSON.stringify(initial));
    const flow = flowInstance(nodes, initial);
    const { result } = renderHook(() => useAtlasCamera(nodes, "venture-one"));

    await act(async () => {
      result.current.onInit(flow.instance);
      await Promise.resolve();
    });
    flow.setCenter.mockClear();
    flow.setViewport.mockClear();

    act(() => result.current.syncSelection("work:release"));
    expect(result.current.targetId).toBe("work:release");
    expect(result.current.focusedId).toBeNull();
    expect(flow.setCenter).toHaveBeenCalledWith(850, 510, { zoom: 0.72, duration: 0 });

    act(() => result.current.syncSelection(null));
    expect(result.current.targetId).toBeNull();
    expect(flow.setViewport).toHaveBeenLastCalledWith(initial, { duration: 0 });
  });

  it("keeps Escape's target-to-trace hierarchy without losing the original camera", async () => {
    const nodes = [node("bet:one", 100, 200), node("work:release", 700, 420)];
    const initial = { x: 0, y: 0, zoom: 0.8 };
    localStorage.setItem("drover:atlas-camera:v6:venture-two", JSON.stringify(initial));
    const flow = flowInstance(nodes, initial);
    const { result } = renderHook(() => useAtlasCamera(nodes, "venture-two"));

    await act(async () => {
      result.current.onInit(flow.instance);
      await Promise.resolve();
    });
    flow.setViewport.mockClear();
    act(() => result.current.syncSelection("bet:one"));
    const targetViewport = flow.instance.getViewport();
    act(() => result.current.focus("bet:one", new Set(["bet:one", "work:release"])));
    expect(result.current.focusedId).toBe("bet:one");

    act(() => result.current.unfocus());
    expect(result.current.targetId).toBe("bet:one");
    expect(result.current.focusedId).toBeNull();
    expect(flow.setViewport).toHaveBeenLastCalledWith(targetViewport, { duration: 0 });

    act(() => result.current.syncSelection(null));
    expect(result.current.targetId).toBeNull();
    expect(flow.setViewport).toHaveBeenLastCalledWith(initial, { duration: 0 });
  });
});
