import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("reveals nodes before hub-centered framing on mount, resize, and fit-whole", async () => {
    let resize: ResizeObserverCallback | null = null;
    class ResizeObserverMock {
      constructor(callback: ResizeObserverCallback) { resize = callback; }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);

    const canvas = document.createElement("div");
    canvas.className = "atlas-canvas";
    Object.defineProperties(canvas, {
      clientWidth: { configurable: true, value: 1200 },
      clientHeight: { configurable: true, value: 800 },
    });
    canvas.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 1200,
      bottom: 800,
      width: 1200,
      height: 800,
      toJSON: () => ({}),
    });
    document.body.append(canvas);

    const nodes = [node("atlas:intent", -104, -104, 208, 208), node("bet:one", 260, -105, 204, 210)];
    const flow = flowInstance(nodes, { x: 0, y: 0, zoom: 0.8 });
    const { result } = renderHook(() => useAtlasCamera(nodes, "venture-reveal"));
    const flushFrame = async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    };
    const expectRevealBeforeFrame = () => {
      expect(flow.fitView).toHaveBeenCalledWith({ duration: 0 });
      expect(flow.setViewport).toHaveBeenCalled();
      expect(flow.fitView.mock.invocationCallOrder[0]).toBeLessThan(flow.setViewport.mock.invocationCallOrder[0]);
    };

    await act(async () => {
      result.current.onInit(flow.instance);
      await flushFrame();
    });
    expectRevealBeforeFrame();

    flow.fitView.mockClear();
    flow.setViewport.mockClear();
    await act(async () => {
      resize?.([], {} as ResizeObserver);
      await flushFrame();
    });
    expectRevealBeforeFrame();

    flow.fitView.mockClear();
    flow.setViewport.mockClear();
    await act(async () => {
      result.current.fitWhole();
      await flushFrame();
    });
    expectRevealBeforeFrame();
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
