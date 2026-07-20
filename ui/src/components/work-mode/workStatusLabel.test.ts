import { describe, expect, it } from "vitest";
import { workStatusLabel } from "./workStatusLabel";

describe("work terminal language", () => {
  it("keeps current terminal outcomes and normalizes retained aliases", () => {
    expect(workStatusLabel("completed")).toBe("completed");
    expect(workStatusLabel("failed-verification")).toBe("failed verification");
    expect(workStatusLabel("stopped")).toBe("cancelled");
  });
});
