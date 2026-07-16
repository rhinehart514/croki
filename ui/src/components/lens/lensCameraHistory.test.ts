import { describe, expect, it } from "vitest";
import { cameraAt, emptyCameraHistory, moveCameraHistory, recordCamera } from "./lensCameraHistory";

describe("lens camera history", () => {
  it("records honest camera stops, removes a forward branch, and restores both directions", () => {
    let history = recordCamera(emptyCameraHistory(), { x: 0, y: 0, zoom: 1 });
    history = recordCamera(history, { x: 20, y: 10, zoom: 0.8 });
    history = moveCameraHistory(history, -1);
    expect(cameraAt(history)).toEqual({ x: 0, y: 0, zoom: 1 });
    history = moveCameraHistory(history, 1);
    expect(cameraAt(history)).toEqual({ x: 20, y: 10, zoom: 0.8 });
    history = moveCameraHistory(history, -1);
    history = recordCamera(history, { x: -10, y: 4, zoom: 1.1 });
    expect(history.entries).toEqual([
      { x: 0, y: 0, zoom: 1 },
      { x: -10, y: 4, zoom: 1.1 },
    ]);
  });
});
