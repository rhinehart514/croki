// lensCanvasGuards.tsx — the small ReactFlow-context guards the lens's canvas needs: restore a saved
// viewport once nodes are measured, force a re-measure when the pane gains real size, and a one-shot
// post-layout invariant so a non-empty canvas never settles with nothing visible. Ported from
// lens canvas's ViewportRestorer/MeasureGuard/CanvasVisibilityGuard (docs/firm-build/07-F6-lens.md
// "Survives unchanged") into the lens's own module — see lensViewport.ts's header comment for why this
// is a port rather than an import from a file whose surrounding machinery is dying.

import { useEffect, useMemo, useRef } from "react";
import { useNodesInitialized, useReactFlow, useStore, useUpdateNodeInternals, type Viewport } from "@xyflow/react";
import { viewportShowsAnyObject } from "@/lib/canvasViewportContract";
import { measuredNodeBounds, type FitOpts } from "@/lib/lensViewport";

// The durable viewport is fetched after the canvas shell mounts. React Flow's `defaultViewport` is only
// read on mount, so without this bridge a correctly saved pan still reopens at 0,0 until an auto-fit
// happens. Applies each authoritative receipt once.
export function ViewportRestorer({ viewport, receiptKey, fitOptions }: { viewport: Viewport | null; receiptKey: string | null; fitOptions: FitOpts }) {
  const { fitView, getNodes, setViewport } = useReactFlow();
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);
  const size = useMemo(() => ({ width, height }), [width, height]);
  const initialized = useNodesInitialized();
  const applied = useRef<string | null>(null);
  useEffect(() => {
    if (!viewport || !initialized || size.width <= 0 || size.height <= 0) return;
    const signature = `${receiptKey ?? "lens"}:${viewport.x}:${viewport.y}:${viewport.zoom}`;
    if (applied.current === signature) return;
    applied.current = signature;
    const objects = measuredNodeBounds(getNodes());
    if (viewportShowsAnyObject(viewport, size, objects)) void setViewport(viewport, { duration: 0 });
    else void fitView({ ...fitOptions, duration: 0 });
  }, [fitOptions, fitView, getNodes, initialized, receiptKey, setViewport, size, viewport]);
  return null;
}

// Forces a re-measure of every node the moment the pane gains real dimensions while nodes are still
// unmeasured — the zero-height mount race guard.
export function MeasureGuard({ nodeIds }: { nodeIds: string[] }) {
  const sized = useStore((s) => s.width > 0 && s.height > 0);
  const initialized = useNodesInitialized();
  const updateNodeInternals = useUpdateNodeInternals();
  useEffect(() => {
    if (!sized || initialized || nodeIds.length === 0) return;
    const raf = requestAnimationFrame(() => updateNodeInternals(nodeIds));
    return () => cancelAnimationFrame(raf);
  }, [sized, initialized, nodeIds, updateNodeInternals]);
  return null;
}

// One final post-layout invariant: a non-empty canvas may never settle with every object outside the
// viewport. Runs once per topology + container size, after measurement has stabilized.
export function CanvasVisibilityGuard({ topology, fitOptions }: { topology: string; fitOptions: FitOpts }) {
  const { fitView, getNodes, getViewport } = useReactFlow();
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);
  const size = useMemo(() => ({ width, height }), [width, height]);
  const nodeCount = useStore((state) => state.nodes.length);
  const checked = useRef<string | null>(null);
  useEffect(() => {
    if (nodeCount === 0 || size.width <= 0 || size.height <= 0) return;
    const signature = `${topology}:${Math.round(size.width)}x${Math.round(size.height)}`;
    if (checked.current === signature) return;
    const timer = setTimeout(() => {
      checked.current = signature;
      const objects = measuredNodeBounds(getNodes());
      if (objects.length > 0 && !viewportShowsAnyObject(getViewport(), size, objects)) {
        void fitView({ ...fitOptions, duration: 0 });
      }
    }, 240);
    return () => clearTimeout(timer);
  }, [fitOptions, fitView, getNodes, getViewport, nodeCount, size, topology]);
  return null;
}

// Re-fires fitView once when `nonce` changes — used after a placement load replaces node positions in
// bulk so the canvas re-centers on the settled layout.
export function Refitter({ nonce, fitOptions }: { nonce?: number; fitOptions: FitOpts }) {
  const { fitView } = useReactFlow();
  const seen = useRef(nonce);
  useEffect(() => {
    if (nonce === undefined || nonce === seen.current) return;
    seen.current = nonce;
    const t = setTimeout(() => fitView({ ...fitOptions, duration: 420 }), 90);
    return () => clearTimeout(t);
  }, [nonce, fitView, fitOptions]);
  return null;
}
