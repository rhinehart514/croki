import type { Viewport } from "@xyflow/react";

export type CameraHistory = { entries: Viewport[]; index: number };

const INITIAL: CameraHistory = { entries: [], index: -1 };

export function emptyCameraHistory(): CameraHistory {
  return INITIAL;
}

function sameCamera(left: Viewport, right: Viewport): boolean {
  return Math.abs(left.x - right.x) < 0.5
    && Math.abs(left.y - right.y) < 0.5
    && Math.abs(left.zoom - right.zoom) < 0.001;
}

export function recordCamera(history: CameraHistory, viewport: Viewport, limit = 16): CameraHistory {
  const current = history.entries[history.index];
  if (current && sameCamera(current, viewport)) return history;
  const entries = [...history.entries.slice(0, history.index + 1), viewport].slice(-limit);
  return { entries, index: entries.length - 1 };
}

export function moveCameraHistory(history: CameraHistory, direction: -1 | 1): CameraHistory {
  if (!history.entries.length) return history;
  const index = Math.max(0, Math.min(history.entries.length - 1, history.index + direction));
  return index === history.index ? history : { ...history, index };
}

export function cameraAt(history: CameraHistory): Viewport | null {
  return history.entries[history.index] ?? null;
}
