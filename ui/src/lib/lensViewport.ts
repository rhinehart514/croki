// Pure viewport math for the Firm lens: fit-padding resolution and measured node bounds.

import type { Node } from "@xyflow/react";

export type PaddingUnit = number | `${number}px` | `${number}%`;
export type FitPadding = PaddingUnit | { top?: PaddingUnit; right?: PaddingUnit; bottom?: PaddingUnit; left?: PaddingUnit };
export type FitOpts = { padding: FitPadding; maxZoom: number; minZoom?: number };

export type CanvasFrame = {
  padding: { top: number; right: number; bottom: number; left: number };
  offset: { x: number; y: number };
  width: number;
  height: number;
};

function paddingPixels(value: PaddingUnit | undefined, extent: number): number {
  if (typeof value === "number") return value;
  if (!value) return 0;
  if (value.endsWith("px")) return Number.parseFloat(value) || 0;
  if (value.endsWith("%")) return (extent * (Number.parseFloat(value) || 0)) / 100;
  return 0;
}

// Resolve fit padding against the React Flow pane. The lens has no occupied side panel.
export function resolveCanvasFrame(width: number, height: number, padding: FitPadding): CanvasFrame {
  const resolved = typeof padding === "object"
    ? {
        top: paddingPixels(padding.top, height),
        right: paddingPixels(padding.right, width),
        bottom: paddingPixels(padding.bottom, height),
        left: paddingPixels(padding.left, width),
      }
    : {
        top: paddingPixels(padding, height),
        right: paddingPixels(padding, width),
        bottom: paddingPixels(padding, height),
        left: paddingPixels(padding, width),
      };
  return {
    padding: resolved,
    width,
    height,
    offset: {
      x: (resolved.right - resolved.left) / 2,
      y: (resolved.bottom - resolved.top) / 2,
    },
  };
}

export function measuredNodeBounds(nodes: Node[]) {
  return nodes.map((node) => ({
    x: node.position.x,
    y: node.position.y,
    width: node.measured?.width ?? node.width ?? 0,
    height: node.measured?.height ?? node.height ?? 0,
  }));
}
