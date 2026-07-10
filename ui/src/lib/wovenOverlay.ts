// wovenOverlay — the integrator's bridge from the backend woven projection (WovenGraph) to the React Flow
// nodes + edges that overlay the merged lane canvas (docs/INTERTWINED-CANVAS.md §3, "Canvas rendering").
//
// It takes what the server already computed (object nodes, ties, kind clusters, the 2+-touch collapse) plus
// the merged canvas's own lane geometry (channelLanes: offsetY/height/centerX per lane), the live zoom, the
// axis (objects vs type), and the focus-to-trace selection, and emits:
//   - objectChip nodes (one per 2+-touch object), placed at the mean-X of their touching steps in the lane
//     gutter (v1) or hash-seeded into kind regions (v2);
//   - kindCluster nodes (far-zoom blend on the OBJECT axis, or the always-clustered TYPE axis);
//   - tie edges: thin 1px zinc curves from each touching step's real node id to its object chip.
//
// Nothing here is persisted. It re-runs on every re-weave (the deriveFunnel discipline) — change the axis or
// the zoom and the picture changes next render with nothing to migrate. Deterministic placement (mean-X /
// objectKey-hash) so the field never reshuffles between reads.

import type { Node, Edge } from "@xyflow/react";
import type {
  WovenGraph, WovenObjectNode, OperatingObject, OperatingProvenance,
} from "@/types";
import type { ChannelLane } from "@/lib/channelLanes";
import {
  layoutObjectsPrimary, isClustered, type ObjectChipData, type KindClusterData,
} from "@/lib/wovenLayout";

export type WovenAxis = "objects" | "type";

// The focus-to-trace selection: an object chip, a lane (pipeline), or a kind cluster. Everything NOT on the
// selection's crossing set dims to near-monochrome; the crossings stay lit. `null` = no focus (neutral).
export type WovenFocus =
  | { kind: "object"; objectKey: string }
  | { kind: "lane"; channelId: string }
  | { kind: "cluster"; motionKind: string }
  | null;

// The lit set for a focus: which object keys and which lane keys stay bright. Everything else dims.
function litSetsFor(focus: WovenFocus, woven: WovenGraph): { objects: Set<string>; lanes: Set<string> } {
  const objects = new Set<string>();
  const lanes = new Set<string>();
  if (!focus) return { objects, lanes };
  if (focus.kind === "object") {
    const node = woven.objectNodes.find((o) => o.objectKey === focus.objectKey);
    objects.add(focus.objectKey);
    for (const lk of node?.laneKeys ?? []) lanes.add(lk);
  } else if (focus.kind === "lane") {
    lanes.add(focus.channelId);
    for (const o of woven.objectNodes) if (o.laneKeys.includes(focus.channelId)) objects.add(o.objectKey);
  } else if (focus.kind === "cluster") {
    const cluster = woven.kindClusters.find((c) => c.motionKind === focus.motionKind);
    for (const lk of cluster?.laneKeys ?? []) lanes.add(lk);
    for (const o of woven.objectNodes) if (o.laneKeys.some((lk) => lanes.has(lk))) objects.add(o.objectKey);
  }
  return { objects, lanes };
}

// Whether a focus actually lights anything on the CURRENT woven graph. A persisted/restored focus (e.g. a
// parked lane the project reopened with) can point at a channel/object/cluster that no longer exists in this
// weave — its lit set is then empty, and treating it as an active focus would dim EVERY node (the whole
// canvas boots as faint confetti). The integrator calls this to collapse an empty-match focus to "no focus"
// so the canvas boots fully lit — a stale focus never dims the first view.
export function focusIsEffective(focus: WovenFocus, woven: WovenGraph | null | undefined): boolean {
  if (!focus || !woven) return false;
  // Whether the focus's TARGET actually exists on the current weave. `litSetsFor` can't answer this — a lane
  // focus unconditionally seeds its own channelId into the lit set, so a stale lane still reports a non-empty
  // set. We test existence directly: a lane must appear in some object's laneKeys or a cluster; an object must
  // be a real objectNode; a cluster must be a real kindCluster. A target that matches nothing = no focus.
  if (focus.kind === "object") {
    return woven.objectNodes.some((o) => o.objectKey === focus.objectKey);
  }
  if (focus.kind === "cluster") {
    return woven.kindClusters.some((c) => c.motionKind === focus.motionKind);
  }
  // lane
  return (
    woven.objectNodes.some((o) => o.laneKeys.includes(focus.channelId)) ||
    woven.kindClusters.some((c) => c.laneKeys.includes(focus.channelId)) ||
    woven.ties.some((t) => t.channelId === focus.channelId)
  );
}

// A chip's focus state: undefined when no focus is active, "focus" when it's on the lit crossing set,
// "dim" when it recedes. Applied to both chips and clusters.
function focusState(
  active: boolean, lit: boolean,
): "focus" | "dim" | undefined {
  if (!active) return undefined;
  return lit ? "focus" : "dim";
}

// A synthetic OperatingObject-shaped record the layout functions expect, projected from a WovenObjectNode
// (the backend already carries kind/label/bucket/motionCount/laneKeys). Layout only reads objectKey, kind,
// motionCount, lanes — the rest rides for the chip data.
function asOperatingObject(o: WovenObjectNode): OperatingObject {
  return {
    objectKey: o.objectKey,
    kind: o.kind ?? "object",
    label: o.label,
    bucket: (o.bucket ?? "seen") as OperatingObject["bucket"],
    lanes: o.laneKeys,
    motionCount: o.motionCount,
    touchCount: o.touchCount,
    lastSeenAt: null,
    provenance: (o.provenance ?? { kind: "grounded", basis: "" }) as OperatingProvenance,
  };
}

function chipDataFor(
  o: WovenObjectNode, normDegree: number | undefined, focus: "focus" | "dim" | undefined,
): ObjectChipData {
  return {
    objectKey: o.objectKey,
    kind: o.kind ?? "object",
    label: o.label,
    bucket: (o.bucket ?? "seen") as OperatingObject["bucket"],
    degree: o.motionCount,
    normDegree,
    touchCount: o.touchCount,
    lanes: o.laneKeys,
    provenance: (o.provenance ?? { kind: "grounded", basis: "" }) as OperatingProvenance,
    focus,
  };
}

export type WovenOverlayInput = {
  woven: WovenGraph;
  // The merged lane geometry, keyed by channelId (from buildMergedFlowGraph → computeChannelLanes).
  lanes: Map<string, ChannelLane>;
  // The already-built merged React Flow nodes, so a tie can find its anchor step's namespaced id +
  // on-screen position. Keyed by `channelId::rawNodeId`.
  mergedNodes: Node[];
  axis: WovenAxis;
  zoom: number;
  focus: WovenFocus;
  // The lane keys whose single-touch collapse the founder popped open (the "+N touched once" expand).
  expandedLaneIds?: ReadonlySet<string>;
};

export function buildWovenOverlay(input: WovenOverlayInput): { nodes: Node[]; edges: Edge[] } {
  const { woven, lanes, mergedNodes, axis, zoom, expandedLaneIds = new Set() } = input;
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  // A focus that matches nothing on the current weave (a stale/restored selection) is treated as no focus,
  // so the canvas boots fully lit instead of dimming every chip against an empty lit set (the ghost field).
  const focus = focusIsEffective(input.focus, woven) ? input.focus : null;
  const lit = litSetsFor(focus, woven);
  const focusActive = !!focus;

  // A quick index of the merged nodes' on-screen positions by their namespaced id, so a tie edge sources
  // from the real step card (React Flow resolves the edge by the node's rendered id).
  const posById = new Map<string, { x: number; y: number }>();
  for (const n of mergedNodes) posById.set(n.id, n.position);

  // The drawn object set — the 2+-touch rule the backend already applied as `draw`, minus any single-touch
  // objects the founder expanded (rare on this axis; kept for parity with partitionByTouch).
  const drawnObjects = woven.objectNodes.filter((o) => o.draw || (o.laneKeys[0] && expandedLaneIds.has(o.laneKeys[0])));

  // ── TYPE axis (the spread view): lanes of the same derived motionKind collapse into one cluster chip.
  // Fully zoomed out, this is the broad GTM-forms map. Only cross-kind objects show individually in the
  // gutter; here we render just the clusters (the type axis is about the forms in play, not the population).
  if (axis === "type") {
    const clusters = woven.kindClusters;
    const totalW = 460;
    const gap = 120;
    clusters.forEach((c, i) => {
      const totalDegree = c.laneCount; // on the type axis, "weight" is how many motions the form holds
      const state = focusState(focusActive, lit.lanes.size === 0 ? false : c.laneKeys.some((lk) => lit.lanes.has(lk)));
      nodes.push({
        id: `kind:${c.motionKind}`,
        type: "kindCluster",
        position: { x: i * (totalW + gap), y: 0 },
        draggable: false,
        selectable: true,
        data: {
          clusterKey: `type:${c.motionKind}`,
          label: c.motionKind,
          count: c.laneCount,
          totalDegree,
          focus: state,
        } satisfies KindClusterData,
      });
    });
    return { nodes, edges };
  }

  // ── OBJECT axis (the moat view). Two altitudes decided by zoom (semantic zoom, scale rule #3).
  const clustered = isClustered(zoom);

  if (clustered) {
    // Far zoom: same-kind objects blend into one cluster chip; overlap reads as node weight (member count
    // + summed degree), never as N new lines. Placed at the mean position of their members' chips.
    const byKind = new Map<string, { count: number; totalDegree: number; keys: string[] }>();
    const order: string[] = [];
    for (const o of drawnObjects) {
      const k = (o.kind ?? "object").trim() || "object";
      if (!byKind.has(k)) { byKind.set(k, { count: 0, totalDegree: 0, keys: [] }); order.push(k); }
      const acc = byKind.get(k)!;
      acc.count += 1;
      acc.totalDegree += o.motionCount;
      acc.keys.push(o.objectKey);
    }
    // Deterministic left-to-right region layout — same seed as v2 so a zoom-out lands where the population
    // sits. Width per region scales gently with member count so a crowded kind reads bigger.
    let x = 0;
    order.forEach((k) => {
      const acc = byKind.get(k)!;
      const state = focusState(focusActive, acc.keys.some((key) => lit.objects.has(key)));
      nodes.push({
        id: `kind:${k}`,
        type: "kindCluster",
        position: { x, y: 0 },
        draggable: false,
        selectable: true,
        data: {
          clusterKey: `kind:${k}`,
          label: k,
          count: acc.count,
          totalDegree: acc.totalDegree,
          focus: state,
        } satisfies KindClusterData,
      });
      x += 420 + Math.min(240, acc.count * 24);
    });
    return { nodes, edges };
  }

  // Near zoom on the object axis: individual object chips + their converging ties.
  // Placement — v1 mean-X gutter (lanes-primary, the default weave) vs v2 objects-primary (hash-seeded).
  // The two altitudes both live on the object axis; we pick v1 whenever we have a live lane layout to hang
  // gutters off, else v2 (the population as its own substrate). The integrator toggles v2 explicitly via a
  // zero-lane input; here, when lanes exist, mean-X keeps the chips docked to the pipelines they cross.
  const useObjectsPrimary = lanes.size === 0;

  let placement: Map<string, { x: number; y: number }>;
  let normByObject: Map<string, number> | null = null;

  if (useObjectsPrimary) {
    const primary = layoutObjectsPrimary(drawnObjects.map(asOperatingObject));
    placement = primary.positions;
    normByObject = primary.sizeByObject;
  } else {
    // The center-band weave (the reference composition): the shared objects are the moat, so they get
    // their OWN vertical column, sitting BETWEEN the crew's motion steps (which converge on them from the
    // left) and the gate column (which the ties fan on to at the right). This reads as one confident weave
    // instead of chips stranded in the lane gutters on top of the source cards. Deterministic: the column X
    // is a stable function of the real laid-out step positions, and the row is a stable ordering of the
    // drawn set, so the field never reshuffles between reads.
    //
    // Column X is derived from where the steps ACTUALLY render on the merged canvas (posById), not from the
    // backend's lane-local anchorMeanX guess — the two coordinate spaces differ, and using the guess strands
    // chips on top of the source cards. We take the rightmost anchor step that feeds any drawn object, and
    // the leftmost gate/terminal step, and park the object column in the gap between them (biased toward the
    // anchors so ties stay short). Falls back to the lane-center mean when positions aren't available yet.
    const laneList = [...lanes.values()];
    const canvasMidX = laneList.length
      ? laneList.reduce((s, l) => s + l.centerX, 0) / laneList.length
      : 0;
    const drawnObjectKeys = new Set(drawnObjects.map((o) => o.objectKey));
    let anchorMaxX = -Infinity; // rightmost real X of a step that feeds a drawn object
    for (const tie of woven.ties) {
      if (!tie.drawn || !drawnObjectKeys.has(tie.objectKey) || !tie.anchorStepId) continue;
      const p = posById.get(`${tie.channelId}::${tie.anchorStepId}`);
      if (p && p.x > anchorMaxX) anchorMaxX = p.x;
    }
    // The object column sits in the GUTTER between the anchors and the very next step column to their right
    // (the draft/generate step), so ties enter cleanly from the left and the chips never land on a step
    // card. `nextStepX` is the leftmost step strictly to the right of the rightmost anchor; the column is
    // the midpoint of that gap. Falls back to a fixed offset past the anchors, then the lane-center mean.
    const OBJ_CHIP_W = 176;
    const STEP_W = 220;   // a step card's rough width, so the gutter math clears the anchor's own box
    let nextStepX = Infinity;
    if (Number.isFinite(anchorMaxX)) {
      for (const n of mergedNodes) {
        // The next step column strictly to the right of the anchor column (skip nodes within the same
        // column as the anchor, which start at ~anchorMaxX).
        if (n.position.x > anchorMaxX + STEP_W * 0.5 && n.position.x < nextStepX) nextStepX = n.position.x;
      }
    }
    // The chip's left edge must clear the anchor card's right edge; its right edge must clear the next
    // step card's left edge. Center it in that real gap when it fits, else park it just past the anchor.
    const gapLeft = anchorMaxX + STEP_W + 28;                 // just right of the anchor card
    let candidateX = Number.isFinite(anchorMaxX)
      ? (Number.isFinite(nextStepX)
          ? Math.min(
              Math.max(gapLeft, (anchorMaxX + STEP_W + nextStepX) / 2 - OBJ_CHIP_W / 2),
              Math.max(gapLeft, nextStepX - OBJ_CHIP_W - 28),  // never overlap the next card
            )
          : gapLeft)
      : canvasMidX;

    if (!Number.isFinite(candidateX)) candidateX = canvasMidX;

    // Every real step card's box (x/y span) — the occlusion set. Only real step cards occlude; the woven
    // overlay's own synthetic nodes aren't in mergedNodes. The guard below is 2D (x AND y): a chip only
    // dodges a card it would actually overlap on screen, so a chip sitting in the vertical gutter BETWEEN two
    // lanes is free to keep the tight candidate X even when a card in another row shares that X.
    const CLEAR = 24;      // breathing room between a chip edge and any card edge
    const STEP_H = 60;     // a step card's rough height, so the vertical overlap test clears its box
    type Box = { x0: number; x1: number; y0: number; y1: number };
    const boxes: Box[] = mergedNodes.map((nd) => ({
      x0: nd.position.x - CLEAR, x1: nd.position.x + STEP_W + CLEAR,
      y0: nd.position.y - CLEAR, y1: nd.position.y + STEP_H + CLEAR,
    }));

    // Column Y: spread the drawn chips evenly down the full height of the lane stack, ordered by their mean
    // touched-lane band so a chip sits near the pipelines it ties to (less tie-crossing). Even spacing keeps
    // the column composed rather than clumped.
    const bandTop = laneList.length ? Math.min(...laneList.map((l) => l.offsetY)) : 0;
    const bandBot = laneList.length ? Math.max(...laneList.map((l) => l.offsetY + l.height)) : 0;
    const meanLaneY = (o: WovenObjectNode): number => {
      const ys: number[] = [];
      for (const lk of o.laneKeys) { const lane = lanes.get(lk); if (lane) ys.push(lane.offsetY + lane.height / 2); }
      return ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : (bandTop + bandBot) / 2;
    };
    const ordered = [...drawnObjects].sort((a, b) => meanLaneY(a) - meanLaneY(b) || a.objectKey.localeCompare(b.objectKey));
    const n = ordered.length;
    const bandH = Math.max(0, bandBot - bandTop);
    const inset = Math.min(bandH * 0.18, 160);
    const usableTop = bandTop + inset;
    const usableBot = bandBot - inset;
    const CHIP_H = 56;
    placement = new Map();
    ordered.forEach((o, i) => {
      const t = n <= 1 ? 0.5 : i / (n - 1);
      const y = usableTop + t * (usableBot - usableTop);
      // Cards this chip would actually overlap vertically at its own Y — the only ones it must dodge in X.
      const rowBoxes = boxes.filter((b) => y < b.y1 && y + CHIP_H > b.y0).sort((a, b) => a.x0 - b.x0);
      const hitsCard = (x: number): boolean => rowBoxes.some((b) => x < b.x1 && x + OBJ_CHIP_W > b.x0);
      let x = candidateX;
      if (hitsCard(x)) {
        // Snap to the NEAREST clear gutter among this row's cards (gaps between adjacent cards, plus the open
        // ends), so the chip stays inside the weave instead of getting walked off to the far right edge.
        const gutters: number[] = [];
        for (let g = 0; g <= rowBoxes.length; g++) {
          const leftEdge = g === 0 ? -Infinity : rowBoxes[g - 1].x1;
          const rightEdge = g === rowBoxes.length ? Infinity : rowBoxes[g].x0;
          const gx = g === 0 ? (Number.isFinite(rightEdge) ? rightEdge - OBJ_CHIP_W - 8 : candidateX)
            : g === rowBoxes.length ? leftEdge + 8
            : (leftEdge + rightEdge) / 2 - OBJ_CHIP_W / 2;
          if (Number.isFinite(gx) && !hitsCard(gx)) gutters.push(gx);
        }
        if (gutters.length) x = gutters.reduce((best, gx) => (Math.abs(gx - candidateX) < Math.abs(best - candidateX) ? gx : best), gutters[0]);
      }
      placement.set(o.objectKey, { x, y });
    });
  }

  for (const o of drawnObjects) {
    const pos = placement.get(o.objectKey) ?? { x: 0, y: 0 };
    const norm = normByObject?.get(o.objectKey);
    const state = focusState(focusActive, lit.objects.has(o.objectKey));
    nodes.push({
      id: `obj:${o.objectKey}`,
      type: "objectChip",
      position: pos,
      draggable: false,
      selectable: true,
      data: chipDataFor(o, norm, state),
    });
  }

  // Tie edges — one per drawn tie, from the touching step's namespaced node id to the object chip. A soft
  // taupe curve; the one feeding an in-flight object reads in teal (the live edge). Ties to collapsed
  // objects are not drawn (drawn:false). Focus dims a tie whose object isn't lit.
  const drawnKeys = new Set(nodes.filter((n) => n.type === "objectChip").map((n) => (n.data as ObjectChipData).objectKey));
  const inflightKeys = new Set(drawnObjects.filter((o) => o.bucket === "in_flight").map((o) => o.objectKey));
  for (const tie of woven.ties) {
    if (!tie.drawn) continue;
    if (!drawnKeys.has(tie.objectKey)) continue;
    // The anchor step's rendered id on the merged canvas is namespaced. Fall back to any node in the lane
    // if the specific anchor id isn't present (a lane with no loaded graph).
    const anchorId = tie.anchorStepId ? `${tie.channelId}::${tie.anchorStepId}` : null;
    const source = anchorId && posById.has(anchorId) ? anchorId : null;
    if (!source) continue;
    const dimmed = focusActive && !(lit.objects.has(tie.objectKey) && lit.lanes.has(tie.channelId));
    const live = !dimmed && inflightKeys.has(tie.objectKey);
    edges.push({
      id: `tie:${tie.channelId}:${tie.objectKey}`,
      source,
      target: `obj:${tie.objectKey}`,
      sourceHandle: null,
      targetHandle: "obj-in",
      type: "default",
      className: `woven-tie${dimmed ? " is-dim" : ""}${live ? " is-live" : ""}`,
      data: { verb: tie.verb, runId: tie.runId },
      selectable: false,
      focusable: false,
    });
  }

  return { nodes, edges };
}
