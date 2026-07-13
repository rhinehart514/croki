export type CanvasViewport = { x: number; y: number; zoom: number };
export type CanvasRect = { x: number; y: number; width: number; height: number };
export type CanvasViewportSize = { width: number; height: number };

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 1.8;
const MIN_VISIBLE_PX = 24;

export function isRestorableViewport(value: CanvasViewport | null | undefined): value is CanvasViewport {
  return !!value
    && Number.isFinite(value.x)
    && Number.isFinite(value.y)
    && Number.isFinite(value.zoom)
    && value.zoom >= MIN_ZOOM
    && value.zoom <= MAX_ZOOM;
}

export function viewportShowsAnyObject(
  viewport: CanvasViewport,
  size: CanvasViewportSize,
  objects: CanvasRect[],
): boolean {
  if (!isRestorableViewport(viewport) || size.width <= 0 || size.height <= 0 || objects.length === 0) return false;

  return objects.some((object) => {
    if (![object.x, object.y, object.width, object.height].every(Number.isFinite)) return false;
    if (object.width <= 0 || object.height <= 0) return false;

    const left = object.x * viewport.zoom + viewport.x;
    const top = object.y * viewport.zoom + viewport.y;
    const right = left + object.width * viewport.zoom;
    const bottom = top + object.height * viewport.zoom;
    const visibleWidth = Math.min(right, size.width) - Math.max(left, 0);
    const visibleHeight = Math.min(bottom, size.height) - Math.max(top, 0);

    return visibleWidth >= Math.min(MIN_VISIBLE_PX, object.width * viewport.zoom)
      && visibleHeight >= Math.min(MIN_VISIBLE_PX, object.height * viewport.zoom);
  });
}
