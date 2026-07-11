import { describe, it, expect } from "vitest";
import { showSelfObservedFailureChip } from "@/lib/failureChipVisibility";

// The self-observed-failure diagnostic remains reachable on the continuous canvas.
const base = { view: "canvas", failuresToFix: 1, failureLogOpen: false };

describe("showSelfObservedFailureChip — continuous canvas diagnostic", () => {
  it("is reachable from the canvas", () => {
    expect(showSelfObservedFailureChip(base)).toBe(true);
  });

  it("shows nothing when there are no failures", () => {
    expect(showSelfObservedFailureChip({ ...base, failuresToFix: 0 })).toBe(false);
  });

  it("hides the chip while the panel is already open, and off the canvas view", () => {
    expect(showSelfObservedFailureChip({ ...base, failureLogOpen: true })).toBe(false);
    expect(showSelfObservedFailureChip({ ...base, view: "projects" })).toBe(false);
  });
});
