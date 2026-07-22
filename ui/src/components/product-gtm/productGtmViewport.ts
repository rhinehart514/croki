import type { Viewport } from "@xyflow/react";

export const PRODUCT_GTM_READABLE_ZOOM = 0.82;

export function productGtmViewportIsAway(current: Viewport, focal: Viewport) {
  return Math.abs(current.zoom - focal.zoom) > 0.08
    || Math.hypot(current.x - focal.x, current.y - focal.y) > 80;
}

export function productGtmMotionDuration(duration: number) {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 0 : duration;
}
