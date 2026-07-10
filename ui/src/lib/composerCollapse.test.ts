import { describe, it, expect } from "vitest";
import { composerStartsCollapsed } from "@/lib/composerCollapse";

const base = { startOpen: false, preferCollapsed: false, floating: false, hasSession: false, terminal: false };

// P0 (docs/production-direction/16): the composer rests slim at product altitude, opens with its session at
// action altitude, and an explicit cold-landing open always wins.
describe("composerStartsCollapsed — composer default/context behavior (P0)", () => {
  it("rests SLIM at product altitude (preferCollapsed) even with a live session", () => {
    expect(composerStartsCollapsed({ ...base, preferCollapsed: true, hasSession: true })).toBe(true);
  });

  it("OPENS with a live session at action altitude (preferCollapsed false)", () => {
    expect(composerStartsCollapsed({ ...base, preferCollapsed: false, hasSession: true })).toBe(false);
  });

  it("an explicit cold-landing open (startOpen) always wins over the survey default", () => {
    expect(composerStartsCollapsed({ ...base, startOpen: true, preferCollapsed: true, hasSession: true })).toBe(false);
  });

  it("rests slim when there is no session, when floating, or when the session is terminal", () => {
    expect(composerStartsCollapsed({ ...base, hasSession: false })).toBe(true);
    expect(composerStartsCollapsed({ ...base, floating: true, hasSession: true })).toBe(true);
    expect(composerStartsCollapsed({ ...base, hasSession: true, terminal: true })).toBe(true);
  });
});
