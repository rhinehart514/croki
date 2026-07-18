// useDropTarget — dwell-gated drop-onto-target arming for the interpretation preview (SPEC A / Exp Law 7).
//
// No drop-onto-target detection exists on the canvas today: a drop is a PURE reposition, always (the Law-6
// guarantee — the visual move commits to the node array before any interpretation is asked). This hook adds
// ONLY the read side of an optional preview: while a node is being dragged, it watches the live flow store
// for a sustained center-overlap between the dragged node's reserved box and another node's reserved box.
// When that overlap holds for the dwell window it emits `{ sourceId, targetId, armed:true }`. It NEVER moves
// a node, NEVER writes placement, NEVER commits a connection — the stage owns whether an armed drop opens the
// chip, and an UNARMED release emits nothing, so the existing reposition path runs completely untouched.
//
// Must be mounted inside a ReactFlowProvider (it reads the flow store via useStore). It is otherwise pure of
// side effects beyond a dwell timer it owns and clears.

import { useEffect, useMemo, useRef, useState } from "react";
import { useStore, type ReactFlowState } from "@xyflow/react";
import { canvasReservedWidth, canvasReservedHeight } from "./canvasSeedLayout";

// The dwell the overlap must hold before the preview arms. Short enough to feel responsive, long enough
// that a drag merely passing over a neighbour never arms (spec: 200ms dwell).
const DWELL_MS = 200;

export type DropTarget = {
  // The dragged node (the relationship's from side).
  sourceId: string;
  // The node the dragged card is centred over (the relationship's to side).
  targetId: string;
  // True only once the overlap has held for the dwell window.
  armed: boolean;
  // Flow-coordinate midpoint between the two node centres — where the stage floats the chip.
  midpoint: { x: number; y: number };
};

type Box = { id: string; cx: number; cy: number; halfW: number; halfH: number; dragging: boolean };

// A live snapshot of every node's centre + half-extents in flow coordinates, plus which one is dragging.
// Read from the store's internal node lookup so it tracks the drag frame-by-frame without the stage
// threading positions down. Reserved footprint is used for the box so the overlap test matches the SAME
// footprint the seed reserves (never a hand-mirror of card CSS).
function selectBoxes(state: ReactFlowState): Box[] {
  const boxes: Box[] = [];
  for (const internal of state.nodeLookup.values()) {
    const kind = String((internal.data as { kind?: unknown })?.kind ?? "");
    const width = typeof internal.measured?.width === "number" ? internal.measured.width : canvasReservedWidth(kind);
    const height = typeof internal.measured?.height === "number" ? internal.measured.height : canvasReservedHeight(kind);
    const position = internal.internals.positionAbsolute;
    boxes.push({
      id: internal.id,
      cx: position.x + width / 2,
      cy: position.y + height / 2,
      halfW: width / 2,
      halfH: height / 2,
      dragging: internal.dragging === true,
    });
  }
  return boxes;
}

// selectBoxes returns a FRESH array of fresh objects on every store tick, so React Flow's default Object.is
// equality treats every tick as a change and re-renders this hook's host on each one. React Flow ticks its
// store continuously during mount measurement / fitView, and re-rendering the stage every tick re-enters the
// controlled-flow sync — an update-depth loop (#185). This content equality collapses ticks that changed no
// box geometry or drag flag into a no-op, so the hook only re-renders when a box actually moved or a drag
// started/stopped (exactly the transitions the dwell logic needs). Pure over two snapshots.
function boxesEqual(a: Box[], b: Box[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i];
    const y = b[i];
    if (
      x.id !== y.id ||
      x.dragging !== y.dragging ||
      x.cx !== y.cx ||
      x.cy !== y.cy ||
      x.halfW !== y.halfW ||
      x.halfH !== y.halfH
    ) {
      return false;
    }
  }
  return true;
}

// The dragged box's centre falls inside another box's reserved extents. Centre-overlap (not any-overlap) so
// the preview arms on a deliberate drop-ONTO, not a card whose edge merely brushed a neighbour.
function centreInside(source: Box, target: Box): boolean {
  return (
    source.cx >= target.cx - target.halfW &&
    source.cx <= target.cx + target.halfW &&
    source.cy >= target.cy - target.halfH &&
    source.cy <= target.cy + target.halfH
  );
}

// The single overlap the dragged node currently sits over, or null. Pure over a box snapshot so the dwell
// logic (below) is the only stateful part. Picks the nearest centre when a drag sits over several.
function overlapFor(boxes: Box[]): { sourceId: string; targetId: string; midpoint: { x: number; y: number } } | null {
  const source = boxes.find((box) => box.dragging);
  if (!source) return null;
  let best: { box: Box; distance: number } | null = null;
  for (const target of boxes) {
    if (target.id === source.id) continue;
    if (!centreInside(source, target)) continue;
    const distance = (source.cx - target.cx) ** 2 + (source.cy - target.cy) ** 2;
    if (!best || distance < best.distance) best = { box: target, distance };
  }
  if (!best) return null;
  return {
    sourceId: source.id,
    targetId: best.box.id,
    midpoint: { x: (source.cx + best.box.cx) / 2, y: (source.cy + best.box.cy) / 2 },
  };
}

// A stable key for the currently-overlapped pair, or null when there is no overlap. Used to decide when the
// dwell must restart and when a stale armed value must be dropped.
function overlapKey(overlap: ReturnType<typeof overlapFor>): string | null {
  return overlap ? `${overlap.sourceId}→${overlap.targetId}` : null;
}

// Options: `disabled` short-circuits the hook (read-only surfaces, active overlays) so no preview ever arms
// where a placement commit itself is gated.
export function useDropTarget({ disabled = false }: { disabled?: boolean } = {}): DropTarget | null {
  // Subscribe to the live box snapshot. The selector returns a fresh array each store tick; React Flow's
  // useStore uses a shallow equality by default, so we memo the derived overlap rather than the array.
  const boxes = useStore(selectBoxes, boxesEqual);
  const overlap = useMemo(() => (disabled ? null : overlapFor(boxes)), [boxes, disabled]);
  const key = overlapKey(overlap);

  const [armed, setArmed] = useState<DropTarget | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Drop a stale armed value DURING RENDER (not in an effect) the instant the live overlap no longer matches
  // it — the drag moved off, or onto a different pair. This is what guarantees an unarmed release emits
  // nothing and the reposition path runs untouched, without a synchronous setState inside an effect body.
  const armedKey = armed ? overlapKey(armed) : null;
  if (armed && armedKey !== key) setArmed(null);

  // The dwell timer is the ONLY place armed is SET, and it fires asynchronously (allowed): a sustained
  // overlap over `key` for DWELL_MS arms the preview. Re-runs whenever the overlapped pair changes, so a new
  // pair restarts the dwell and an unchanged pair keeps its timer.
  useEffect(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (!overlap) return;
    const pending = overlap;
    timer.current = setTimeout(() => {
      setArmed({ ...pending, armed: true });
    }, DWELL_MS);
    return () => {
      if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps -- `overlap` is captured by `key`; re-running on the object identity would restart the dwell every store tick.

  // Only report an armed target that still matches the live overlap (the render-time guard above already
  // nulled a stale one; this is the belt-and-suspenders read).
  return armed && armedKey === key ? armed : null;
}
