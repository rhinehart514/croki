import { beforeEach, describe, expect, it } from "vitest";
import { advanceReturnCursor, readReturnCursor } from "./return-cursor";

describe("presentation-only return cursor", () => {
  beforeEach(() => localStorage.clear());

  it("advances but never moves backward", () => {
    advanceReturnCursor("venture-1", "2026-07-14T12:00:00.000Z");
    advanceReturnCursor("venture-1", "2026-07-14T11:00:00.000Z");
    expect(readReturnCursor("venture-1")).toBe("2026-07-14T12:00:00.000Z");
  });

  it("is isolated per venture and ignores invalid timestamps", () => {
    advanceReturnCursor("venture-a", "not-a-date");
    advanceReturnCursor("venture-b", "2026-07-14T13:00:00.000Z");
    expect(readReturnCursor("venture-a")).toBeNull();
    expect(readReturnCursor("venture-b")).toBe("2026-07-14T13:00:00.000Z");
  });
});
