import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { describeSurface, useNavigationLayers, type SurfaceInputs } from "./navigation";

const base: SurfaceInputs = {
  convexEnabled: false,
  teamIdentity: null,
  booted: true,
  connectionResolvedDisconnected: false,
  productGrounded: true,
  view: "canvas",
  hasCanvas: false,
  operatorStatus: null,
  booting: false,
  projectBusy: false,
};

describe("describeSurface", () => {
  it("never gates on team onboarding — identity is deferred, the founder proceeds solo", () => {
    // Convex on and no identity chosen used to wall the founder behind "Set up your workspace"; now they
    // pass straight through to the product surface (App seeds a local identity), so no path ever resolves
    // to the teamOnboarding surface as a first gate.
    expect(describeSurface({ ...base, convexEnabled: true, teamIdentity: null }).kind).not.toBe("teamOnboarding");
    expect(describeSurface({ ...base, convexEnabled: true, teamIdentity: { id: "t" } }).kind).not.toBe("teamOnboarding");
  });

  it("gates on connecting Claude before grounding", () => {
    expect(describeSurface({ ...base, connectionResolvedDisconnected: true }).kind).toBe("connectClaude");
  });

  it("shows product entry when booted with no grounded product", () => {
    expect(describeSurface({ ...base, productGrounded: false }).kind).toBe("productEntry");
  });

  it("routes the non-canvas base views", () => {
    expect(describeSurface({ ...base, view: "start" }).kind).toBe("newProduct");
    expect(describeSurface({ ...base, view: "projects" }).kind).toBe("projects");
  });

  it("shows the canvas whenever there is a canvas to show, even while driving", () => {
    expect(describeSurface({ ...base, hasCanvas: true, operatorStatus: "running" }).kind).toBe("canvas");
    // A stopped drive WITH a canvas keeps the canvas — the error lives in the crew rail.
    expect(describeSurface({ ...base, hasCanvas: true, operatorStatus: "failed" }).kind).toBe("canvas");
  });

  it("hands the whole screen to a stopped cold-start drive only when there is no canvas", () => {
    expect(describeSurface({ ...base, hasCanvas: false, operatorStatus: "failed" }).kind).toBe("operatorTakeover");
    expect(describeSurface({ ...base, hasCanvas: false, operatorStatus: "blocked" }).kind).toBe("operatorTakeover");
  });

  it("shows the live drive on a true cold start (running, no canvas yet)", () => {
    expect(describeSurface({ ...base, hasCanvas: false, operatorStatus: "running" }).kind).toBe("operatorDrive");
    expect(describeSurface({ ...base, hasCanvas: false, operatorStatus: "ready" }).kind).toBe("operatorDrive");
  });

  it("shows a calm loading state while the workspace resolves", () => {
    expect(describeSurface({ ...base, booting: true }).kind).toBe("booting");
    expect(describeSurface({ ...base, projectBusy: true }).kind).toBe("booting");
  });

  it("falls through to the goal launcher for a grounded product with no goal yet", () => {
    expect(describeSurface(base).kind).toBe("goalLauncher");
  });
});

describe("useNavigationLayers — mutual exclusion in the model", () => {
  it("opening a popover closes any other popover", () => {
    const { result } = renderHook(() => useNavigationLayers());
    act(() => result.current.openPopover("issues"));
    expect(result.current.issuesOpen).toBe(true);
    act(() => result.current.openPopover("decisions"));
    expect(result.current.issuesOpen).toBe(false);
    expect(result.current.decisionsOpen).toBe(true);
    act(() => result.current.openPopover("failureLog"));
    expect(result.current.decisionsOpen).toBe(false);
    expect(result.current.failureLogOpen).toBe(true);
  });

  it("toggling the open popover closes it", () => {
    const { result } = renderHook(() => useNavigationLayers());
    act(() => result.current.togglePopover("issues"));
    expect(result.current.issuesOpen).toBe(true);
    act(() => result.current.togglePopover("issues"));
    expect(result.current.issuesOpen).toBe(false);
  });

  it("opening a popover clears an open overlay and vice versa", () => {
    const { result } = renderHook(() => useNavigationLayers());
    act(() => result.current.openOverlay("settings"));
    expect(result.current.overlay).toBe("settings");
    act(() => result.current.openPopover("issues"));
    expect(result.current.overlay).toBe(null);
    expect(result.current.issuesOpen).toBe(true);
    act(() => result.current.openOverlay("understand"));
    expect(result.current.issuesOpen).toBe(false);
    expect(result.current.overlay).toBe("understand");
  });

  it("closeAllLayers clears both floating layers at once", () => {
    const { result } = renderHook(() => useNavigationLayers());
    act(() => result.current.openOverlay("settings"));
    act(() => result.current.closeAllLayers());
    expect(result.current.anyLayerOpen).toBe(false);
  });

  it("closeTopLayer closes the popover before the overlay", () => {
    const { result } = renderHook(() => useNavigationLayers());
    act(() => result.current.openPopover("issues"));
    act(() => result.current.closeTopLayer());
    expect(result.current.popover).toBe(null);
    expect(result.current.anyLayerOpen).toBe(false);
    // With only an overlay open, closeTopLayer closes it.
    act(() => result.current.openOverlay("settings"));
    act(() => result.current.closeTopLayer());
    expect(result.current.overlay).toBe(null);
  });
});
