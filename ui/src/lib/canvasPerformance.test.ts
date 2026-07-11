import { describe, expect, it } from "vitest";
import {
  DENSE_CANVAS_EDGE_THRESHOLD,
  DENSE_CANVAS_NODE_THRESHOLD,
  canvasRenderingPolicy,
} from "@/lib/canvasPerformance";

describe("dense canvas rendering policy", () => {
  it("keeps small canvases on the low-overhead path", () => {
    expect(canvasRenderingPolicy(24, 30)).toEqual({ virtualize: false, nodeCount: 24, edgeCount: 30 });
  });

  it("virtualizes deterministically when either density boundary is reached", () => {
    expect(canvasRenderingPolicy(DENSE_CANVAS_NODE_THRESHOLD, 0).virtualize).toBe(true);
    expect(canvasRenderingPolicy(0, DENSE_CANVAS_EDGE_THRESHOLD).virtualize).toBe(true);
    expect(canvasRenderingPolicy(DENSE_CANVAS_NODE_THRESHOLD - 1, DENSE_CANVAS_EDGE_THRESHOLD - 1).virtualize).toBe(false);
  });

  it("normalizes malformed counts without making runtime/device-dependent choices", () => {
    expect(canvasRenderingPolicy(-1, 241.9)).toEqual({ virtualize: true, nodeCount: 0, edgeCount: 241 });
  });
});
