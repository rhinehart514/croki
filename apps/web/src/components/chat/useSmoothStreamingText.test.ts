import { describe, expect, it } from "vite-plus/test";

import { nextStreamingTextLength, safeStreamingTextLength } from "./useSmoothStreamingText";

describe("smooth streaming text", () => {
  it("reveals small updates one character at a time", () => {
    expect(nextStreamingTextLength(10, 13)).toBe(11);
  });

  it("accelerates large chunks instead of revealing them one character per frame", () => {
    let current = 0;
    for (let frame = 0; frame < 8; frame += 1) {
      current = nextStreamingTextLength(current, 100);
    }

    expect(current).toBeGreaterThan(80);
  });

  it("never advances beyond the target", () => {
    expect(nextStreamingTextLength(8, 8)).toBe(8);
    expect(nextStreamingTextLength(10, 8)).toBe(8);
  });

  it("reveals emoji without splitting their surrogate pair", () => {
    expect(safeStreamingTextLength("🙂 hello", 1)).toBe(2);
    expect("🙂 hello".slice(0, safeStreamingTextLength("🙂 hello", 1))).toBe("🙂");
  });
});
