import type { Viewport } from "@xyflow/react";

export const PRODUCT_GTM_READABLE_ZOOM = 0.82;
// The whole-venture chapter is an overview altitude: the compact pill render is built to read when
// zoomed out, so the map is allowed below the focused-chapter readability floor to fit the venture
// in frame rather than crop it.
export const PRODUCT_GTM_WHOLE_ZOOM = 0.5;
// The camera's hard floor. Below this the compact pill face is unreadable dust; a wide venture or a
// full-length play may fit down to here, never past it.
export const PRODUCT_GTM_MIN_ZOOM = 0.3;

export function productGtmViewportIsAway(current: Viewport, focal: Viewport) {
  return Math.abs(current.zoom - focal.zoom) > 0.08
    || Math.hypot(current.x - focal.x, current.y - focal.y) > 80;
}

export function productGtmMotionDuration(duration: number) {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 0 : duration;
}
