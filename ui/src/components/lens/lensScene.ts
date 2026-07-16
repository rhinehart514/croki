export type CanvasAltitude = "far" | "middle" | "near";

export function altitudeForZoom(zoom: number): CanvasAltitude {
  if (zoom < 0.55) return "far";
  if (zoom < 1.05) return "middle";
  return "near";
}
