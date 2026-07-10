import { describe, it, expect } from "vitest";
import { showSelfObservedFailureChip } from "@/lib/failureChipVisibility";

// The self-observed-failure diagnostic (docs/production-direction/16) is AUDIENCE-AWARE: hidden at
// Operator/product altitude to keep the founder operation clean, reachable at Engineer/builder altitude
// when failures exist. It is not turned off globally.
const base = { view: "canvas", effectiveLens: "engineer" as const, failuresToFix: 1, failureLogOpen: false };

describe("showSelfObservedFailureChip — audience-aware failure diagnostic", () => {
  it("is HIDDEN at Operator/product altitude even when failures exist (clean founder operation)", () => {
    expect(showSelfObservedFailureChip({ ...base, effectiveLens: "operator" })).toBe(false);
  });

  it("is REACHABLE at Engineer/builder altitude when failures exist (the only entry to the panel)", () => {
    expect(showSelfObservedFailureChip({ ...base, effectiveLens: "engineer" })).toBe(true);
  });

  it("shows nothing when there are no failures, regardless of altitude (a clean machine stays clean)", () => {
    expect(showSelfObservedFailureChip({ ...base, effectiveLens: "engineer", failuresToFix: 0 })).toBe(false);
    expect(showSelfObservedFailureChip({ ...base, effectiveLens: "operator", failuresToFix: 0 })).toBe(false);
  });

  it("hides the chip while the panel is already open, and off the canvas view", () => {
    expect(showSelfObservedFailureChip({ ...base, failureLogOpen: true })).toBe(false);
    expect(showSelfObservedFailureChip({ ...base, view: "projects" })).toBe(false);
  });
});
