// useLensFlip — snapshot, apply, invert-and-play; RESTORE is instant (spec §3).
//
// The lens reorganizes the SAME controlled node array with a FLIP so the founder SEES the reorganize, and
// returns to their own layout with a `duration:0` covenant that is pixel-exact by construction. The engine:
//
//   ENTER (free→lens, or lens→lens):
//     1. SNAPSHOT — every rendered node's screen rect (.react-flow__node[data-id] → getBoundingClientRect)
//        + the camera (instance.getViewport()). The FIRST free viewport is stored as the restore target.
//     2. APPLY — arrangeLens positions via setNodes into the CONTROLLED node array ONLY. Never placement,
//        never putPlacement, never into foldPlacement's stored arg (Law 6, the marquee risk).
//     3. INVERT-AND-PLAY — after the browser paints the new positions, read each node's NEW rect, set an
//        inverse transform (old−new) with no transition, then on the next frame transition to identity over
//        ~400ms with ATLAS_EASE. The node visually travels from where it was to where it now is.
//
//   RESTORE (lens→free): INSTANT. Read positions from foldPlacement(scene.nodes, placement) — the founder
//     store, NEVER lens positions — and setNodes; setViewport(savedFreeViewport, {duration:0}). No tween,
//     no persistence → pixel-exact.
//
//   REDUCED MOTION: ENTER swaps to instant-but-complete — positions set, no invert/tween. Every signal
//     (the new arrangement) is preserved; only the travel animation is dropped.
//
// FLIP vs onlyRenderVisibleElements (hard risk 5): only rendered nodes are measured; a virtualized node
// simply snaps (it was off-screen, so there is no visible jump). The fixed-footprint arrangement means no
// measurement flash.

import { useCallback, useEffect, useRef } from "react";
import type { ReactFlowInstance, Viewport } from "@xyflow/react";
import type { Node } from "@xyflow/react";
import { ATLAS_EASE } from "@/components/atlas/atlasMotion";
import type { AtlasNode } from "@/components/atlas/atlasTypes";
import { foldPlacement, type SeededPositions } from "./canvasSeedLayout";
import { resolveTerritories } from "./canvasTerritory";
import { arrangeLens, type LensId } from "./lensArrangement";
import type { FirmArchitectureProjection, FirmLens } from "@/types";

const FLIP_MS = 400;
const EASE_CSS = `cubic-bezier(${ATLAS_EASE.join(",")})`;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function nodeElements(): HTMLElement[] {
  if (typeof document === "undefined") return [];
  return [...document.querySelectorAll<HTMLElement>(".react-flow__node[data-id]")];
}

// Snapshot every rendered node's top-left screen rect, keyed by node id.
function snapshotRects(): Map<string, { left: number; top: number }> {
  const rects = new Map<string, { left: number; top: number }>();
  for (const element of nodeElements()) {
    const id = element.getAttribute("data-id");
    if (!id) continue;
    const rect = element.getBoundingClientRect();
    rects.set(id, { left: rect.left, top: rect.top });
  }
  return rects;
}

export type LensFlip = {
  // Enter or cycle to a lens: snapshot → apply arrangement → invert-and-play. Positions go through setNodes
  // ONLY. Restoring is a separate instant path.
  enter: (lensId: LensId) => void;
  // Restore the founder's own layout, instant and pixel-exact from foldPlacement.
  restore: () => void;
};

export function useLensFlip({
  instance,
  sceneNodes,
  placementPositions,
  lens,
  projection,
  setNodes,
}: {
  instance: ReactFlowInstance | null;
  sceneNodes: AtlasNode[];
  placementPositions: SeededPositions;
  lens: FirmLens | null;
  projection: FirmArchitectureProjection | null;
  setNodes: (updater: (nodes: AtlasNode[]) => AtlasNode[]) => void;
}): LensFlip {
  // The FIRST free viewport captured before any enter — the exact camera the restore returns to.
  const freeViewportRef = useRef<Viewport | null>(null);
  // A running raf/timer so a fast cycle cancels the previous play before starting a new one.
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the latest inputs in refs so the returned callbacks are stable and always read current values.
  // Synced in an effect (never mutated during render) so a re-render never leaves a callback reading stale
  // inputs while satisfying the refs-during-render rule.
  const sceneRef = useRef(sceneNodes);
  const placementRef = useRef(placementPositions);
  const lensRef = useRef(lens);
  const projectionRef = useRef(projection);
  const instanceRef = useRef(instance);
  useEffect(() => {
    sceneRef.current = sceneNodes;
    placementRef.current = placementPositions;
    lensRef.current = lens;
    projectionRef.current = projection;
    instanceRef.current = instance;
  }, [sceneNodes, placementPositions, lens, projection, instance]);

  const clearPending = useCallback(() => {
    if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (timerRef.current != null) { clearTimeout(timerRef.current); timerRef.current = null; }
  }, []);

  useEffect(() => () => clearPending(), [clearPending]);

  // Write positions into the controlled node array. This is the ONLY way the lens moves nodes — never
  // putPlacement, never foldPlacement's stored arg.
  const applyPositions = useCallback((positions: SeededPositions) => {
    setNodes((nodes) => nodes.map((node) => (
      positions[node.id] ? { ...node, position: positions[node.id] } : node
    )));
  }, [setNodes]);

  const enter = useCallback((lensId: LensId) => {
    const activeLens = lensRef.current;
    if (!activeLens) return;
    clearPending();

    // 1. SNAPSHOT rects + camera. Store the first free viewport as the restore target (only when entering
    //    from the free arrangement — a lens→lens cycle keeps the original free viewport).
    const before = snapshotRects();
    const instanceNow = instanceRef.current;
    if (instanceNow && freeViewportRef.current === null) {
      freeViewportRef.current = instanceNow.getViewport();
    }

    // 2. APPLY the arrangement into the controlled node array.
    const nodes = sceneRef.current;
    const territory = resolveTerritories(nodes as unknown as Node[]);
    const positions = arrangeLens(lensId, nodes as unknown as Node[], {
      territory,
      projection: projectionRef.current,
      lens: activeLens,
    });
    applyPositions(positions);

    // Reduced motion: instant-but-complete. Positions are set above; skip the invert/tween entirely.
    if (prefersReducedMotion()) return;

    // 3. INVERT-AND-PLAY. After the browser lays the new positions out, read each node's NEW rect, set the
    //    inverse transform (so it visually sits where it WAS), then on the next frame transition to identity.
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const after = snapshotRects();
      const elements = nodeElements();
      // The FLIP transform rides the node's INNER child, NEVER the .react-flow__node wrapper — React Flow
      // controls the wrapper's transform (it positions the node), so fighting it corrupts placement. The
      // child carries the visual invert-and-play; when it clears, the node sits exactly where React Flow
      // placed it. No residual is ever left on the wrapper (the pixel-exact-restore covenant).
      for (const element of elements) {
        const id = element.getAttribute("data-id");
        const inner = element.firstElementChild as HTMLElement | null;
        if (!id || !inner) continue;
        const start = before.get(id);
        const end = after.get(id);
        if (!start || !end) continue; // a node that was virtualized simply snaps
        const dx = start.left - end.left;
        const dy = start.top - end.top;
        if (dx === 0 && dy === 0) continue;
        inner.style.transition = "none";
        inner.style.transform = `translate(${dx}px, ${dy}px)`;
      }
      // Next frame: transition the inner child back to identity so it travels to the wrapper's placed spot.
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        for (const element of elements) {
          const inner = element.firstElementChild as HTMLElement | null;
          if (!inner) continue;
          inner.style.transition = `transform ${FLIP_MS}ms ${EASE_CSS}`;
          inner.style.transform = "";
        }
        // After the tween, clear the transition so nothing is left on the inner child either.
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          for (const element of nodeElements()) {
            const inner = element.firstElementChild as HTMLElement | null;
            if (inner) inner.style.transition = "";
          }
        }, FLIP_MS + 40);
      });
    });
  }, [applyPositions, clearPending]);

  const restore = useCallback(() => {
    clearPending();
    // Clear any lingering FLIP transform/transition on the inner child so the restore is truly instant and
    // no residual offset survives (the pixel-exact covenant).
    for (const element of nodeElements()) {
      const inner = element.firstElementChild as HTMLElement | null;
      if (inner) { inner.style.transition = ""; inner.style.transform = ""; }
    }
    // Read positions from the FOUNDER store (foldPlacement over placement), never lens positions.
    const nodes = sceneRef.current;
    const positions = foldPlacement(nodes as unknown as Node[], placementRef.current);
    applyPositions(positions);
    // Return the camera to the exact free viewport captured before the first enter, instantly.
    const instanceNow = instanceRef.current;
    const freeViewport = freeViewportRef.current;
    if (instanceNow && freeViewport) instanceNow.setViewport(freeViewport, { duration: 0 });
    freeViewportRef.current = null;
  }, [applyPositions, clearPending]);

  return { enter, restore };
}
