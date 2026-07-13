import { describe, expect, it } from "vitest";
import { resolveComposerAltitude, type ComposerAltitudeInput } from "./composerAltitude";

const quiet: ComposerAltitudeInput = {
  hasMeaningfulFounderWork: false,
  hasActiveSession: false,
  hasFormingWork: false,
  hasLiveActivity: false,
  hasExplicitSelection: false,
};

describe("resolveComposerAltitude", () => {
  it("uses empty only when there is no meaningful founder work and no active session", () => {
    expect(resolveComposerAltitude(quiet)).toBe("empty");
    expect(resolveComposerAltitude({ ...quiet, hasMeaningfulFounderWork: true })).toBe("resting");
    expect(resolveComposerAltitude({ ...quiet, hasActiveSession: true })).toBe("resting");
  });

  it("uses contextual for an explicit selection when no work is active", () => {
    expect(resolveComposerAltitude({ ...quiet, hasExplicitSelection: true })).toBe("contextual");
    expect(resolveComposerAltitude({
      ...quiet,
      hasMeaningfulFounderWork: true,
      hasActiveSession: true,
      hasExplicitSelection: true,
    })).toBe("contextual");
  });

  it("lets live activity outrank explicit context", () => {
    expect(resolveComposerAltitude({
      ...quiet,
      hasLiveActivity: true,
      hasExplicitSelection: true,
    })).toBe("activity");
  });

  it("uses live activity ahead of empty and resting states", () => {
    expect(resolveComposerAltitude({
      ...quiet,
      hasLiveActivity: true,
    })).toBe("activity");
    expect(resolveComposerAltitude({
      ...quiet,
      hasMeaningfulFounderWork: true,
      hasActiveSession: true,
      hasLiveActivity: true,
    })).toBe("activity");
  });

  it("lets forming work outrank every other state", () => {
    expect(resolveComposerAltitude({
      hasMeaningfulFounderWork: true,
      hasActiveSession: true,
      hasFormingWork: true,
      hasLiveActivity: true,
      hasExplicitSelection: true,
    })).toBe("forming");
  });
});
