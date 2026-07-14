// Rendering policy for the Firm lens. React Flow keeps every node in its store (so search,
// focus, keyboard selection, and fit calculations still see the complete durable projection),
// while `onlyRenderVisibleElements` prevents rich node bodies and relationship SVGs outside the
// viewport from entering the DOM. Keep the threshold deterministic: device speed must never change
// which authorities exist or where they are placed.

export const DENSE_CANVAS_NODE_THRESHOLD = 120;
export const DENSE_CANVAS_EDGE_THRESHOLD = 240;

export type CanvasRenderingPolicy = {
  virtualize: boolean;
  nodeCount: number;
  edgeCount: number;
};

export function canvasRenderingPolicy(nodeCount: number, edgeCount: number): CanvasRenderingPolicy {
  const safeNodeCount = Math.max(0, Math.trunc(nodeCount));
  const safeEdgeCount = Math.max(0, Math.trunc(edgeCount));
  return {
    virtualize: safeNodeCount >= DENSE_CANVAS_NODE_THRESHOLD || safeEdgeCount >= DENSE_CANVAS_EDGE_THRESHOLD,
    nodeCount: safeNodeCount,
    edgeCount: safeEdgeCount,
  };
}
