import { useCallback, useMemo, useState } from "react";

// ── The navigation brain ────────────────────────────────────────────────────
// One source of truth for "what surface am I on" and "what layers float over it".
// Before this module the answer was re-derived in ~20 JSX conditionals from
// overlapping flags (view, overlay, operatorDriving, canvasGraph, activeProjectId,
// channels.length, canvasCandidates, operatorSession.status) with no two agreeing.
// Here the base surface is computed once (`describeSurface`), and the layers that
// float over the canvas — the full-screen overlay drawer, the mutually-exclusive
// right-rail popover, and the centered modal — are held in ONE reducer that
// enforces mutual exclusion in the model instead of in a dozen scattered
// `setX(false)` calls across handlers.

// The full-screen drawers that replace the canvas chrome (they carry their own
// header + close). At most one is open. `understand` = product grounding,
// `settings` = the admin drawer.
export type Overlay = "understand" | "settings" | null;

// The right-rail popovers. Exactly one open at a time — this is the mutual
// exclusion the old code enforced by hand in every toggle handler.
export type Popover = "issues" | "decisions" | "failureLog" | null;

export type NavLayers = {
  overlay: Overlay;
  popover: Popover;
};

// The base surface — the ONE screen under any floating layers. Computed by
// `describeSurface` from the real domain flags; the render switches on `.kind`
// instead of re-deriving the same booleans inline. Mutual exclusion of the base
// surface lives here (a discriminated union can only be one thing at a time),
// not in a fragile ?:-chain.
export type Surface =
  | { kind: "teamOnboarding" }
  | { kind: "connectClaude" }
  | { kind: "productEntry" }
  | { kind: "newProduct" } // the "start" view — add another product
  | { kind: "projects" } // the product picker
  | { kind: "operatorTakeover" } // a cold-start drive that failed/blocked with no canvas to show
  | { kind: "canvas" } // the woven GTM canvas (the home surface)
  | { kind: "operatorDrive" } // a live cold-start drive with no graph yet
  | { kind: "booting" }
  | { kind: "goalLauncher" }; // freshly-grounded product, no goal yet

export type SurfaceInputs = {
  convexEnabled: boolean;
  teamIdentity: unknown;
  booted: boolean;
  connectionResolvedDisconnected: boolean; // booted && connection && !connection.connected
  productGrounded: boolean;
  view: "projects" | "canvas" | "start";
  hasCanvas: boolean; // canvasGraph || (activeProjectId && channels>0) || candidates>0
  operatorStatus: string | null;
  booting: boolean;
  projectBusy: boolean;
};

// Pure. Given the real domain flags, return the single base surface. This is the
// one place the base-surface decision is made; the render just switches on it.
// Order matters: the hard gates (team, Claude, grounding) win first, exactly as
// the old early-returns did, then the in-app surfaces.
export function describeSurface(i: SurfaceInputs): Surface {
  // Identity is DEFERRED, never a first gate. A founder used to land on "Set up your workspace" (name +
  // work email) before seeing anything; now they proceed as a solo party of one (App seeds a local
  // identity the instant Convex is on) and set up or join a shared team later, from Settings — or at the
  // moment something first sends. The teamOnboarding surface stays in the union as that later, opt-in
  // setup screen, but it is no longer a wall in front of the product. Prove value first, ask after.
  if (i.connectionResolvedDisconnected) return { kind: "connectClaude" };
  if (i.booted && !i.productGrounded) return { kind: "productEntry" };

  if (i.view === "start") return { kind: "newProduct" };
  if (i.view === "projects") return { kind: "projects" };

  const driving = ["ready", "running", "failed", "blocked"].includes(i.operatorStatus ?? "");
  const stopped = i.operatorStatus === "failed" || i.operatorStatus === "blocked";

  // A cold-start drive that stopped with no canvas seizes the screen; a stopped
  // drive on a product that HAS a canvas keeps the canvas (the error lives in the
  // crew rail). This mirrors the old failed/blocked branch precisely.
  if (stopped && !i.hasCanvas) return { kind: "operatorTakeover" };
  if (i.hasCanvas) return { kind: "canvas" };
  if (driving && (i.operatorStatus === "ready" || i.operatorStatus === "running")) {
    return { kind: "operatorDrive" };
  }
  if (i.booting || i.projectBusy) return { kind: "booting" };
  return { kind: "goalLauncher" };
}

// ── The layer reducer ───────────────────────────────────────────────────────
// Every mutation goes through here so mutual exclusion can't be forgotten at a
// call site. Opening any layer closes the ones it must be exclusive with.
export function useNavigationLayers() {
  const [layers, setLayers] = useState<NavLayers>({ overlay: null, popover: null });

  // Opening a full-screen overlay closes every right-rail popover (they'd render
  // behind it) but leaves any modal alone (a modal sits above the overlay).
  const openOverlay = useCallback((overlay: NonNullable<Overlay>) => {
    setLayers((l) => ({ ...l, overlay, popover: null }));
  }, []);
  const closeOverlay = useCallback(() => {
    setLayers((l) => (l.overlay === null ? l : { ...l, overlay: null }));
  }, []);

  // Popovers are mutually exclusive with each other AND hidden under an overlay,
  // so opening one clears the overlay too. Toggling the open one closes it.
  const openPopover = useCallback((popover: NonNullable<Popover>) => {
    setLayers((l) => ({ ...l, popover, overlay: null }));
  }, []);
  const togglePopover = useCallback((popover: NonNullable<Popover>) => {
    setLayers((l) => ({ ...l, popover: l.popover === popover ? null : popover, overlay: null }));
  }, []);
  const closePopover = useCallback(() => {
    setLayers((l) => (l.popover === null ? l : { ...l, popover: null }));
  }, []);

  // Clear both floating layers — used when the base surface changes (opening a
  // project, switching pipelines, starting a new pipeline) so open panels never
  // leak across a switch. (The payloaded modals/cards App owns are cleared beside
  // this call.)
  const closeAllLayers = useCallback(() => {
    setLayers((l) => (l.overlay === null && l.popover === null ? l : { overlay: null, popover: null }));
  }, []);

  // Escape's tail: close the topmost of THESE two layers (popover above overlay).
  // App runs its own payloaded closers (modals, cards) before falling through to
  // this, and checks `anyLayerOpen` to know whether it consumed the key.
  const closeTopLayer = useCallback(() => {
    setLayers((c) => (c.popover !== null ? { ...c, popover: null } : c.overlay !== null ? { ...c, overlay: null } : c));
  }, []);

  const derived = useMemo(
    () => ({
      overlay: layers.overlay,
      popover: layers.popover,
      issuesOpen: layers.popover === "issues",
      decisionsOpen: layers.popover === "decisions",
      failureLogOpen: layers.popover === "failureLog",
      anyLayerOpen: layers.overlay !== null || layers.popover !== null,
    }),
    [layers],
  );

  return {
    ...derived,
    openOverlay,
    closeOverlay,
    openPopover,
    togglePopover,
    closePopover,
    closeAllLayers,
    closeTopLayer,
  };
}
