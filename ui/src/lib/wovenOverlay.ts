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

// The gutter y just below a lane's band — where a chip sits so it never lands on a step card.
function laneGutterY(lane: ChannelLane): number {
  return lane.offsetY + lane.height - 40;
}

export function buildWovenOverlay(input: WovenOverlayInput): { nodes: Node[]; edges: Edge[] } {
  const { woven, lanes, mergedNodes, axis, zoom, focus, expandedLaneIds = new Set() } = input;
  const nodes: Node[] = [];
  const edges: Edge[] = [];
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
    // v1: chip x = mean-X of its ties' anchors (the backend precomputed anchorMeanX); y = the gutter row
    // of the lanes it ties to. Deterministic — a stable function of where the crossing happens.
    placement = new Map();
    for (const o of drawnObjects) {
      const gutterYs: number[] = [];
      for (const lk of o.laneKeys) {
        const lane = lanes.get(lk);
        if (lane) gutterYs.push(laneGutterY(lane));
      }
      const x = typeof o.anchorMeanX === "number" ? o.anchorMeanX : 0;
      const y = gutterYs.length ? gutterYs.reduce((a, b) => a + b, 0) / gutterYs.length : 0;
      placement.set(o.objectKey, { x, y });
    }
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

  // Tie edges — one per drawn tie, from the touching step's namespaced node id to the object chip. A thin
  // 1px zinc curve; dashed when the object is in-flight (state, not identity). Ties to collapsed objects are
  // not drawn (drawn:false). Focus dims a tie whose object isn't lit.
  const drawnKeys = new Set(nodes.filter((n) => n.type === "objectChip").map((n) => (n.data as ObjectChipData).objectKey));
  for (const tie of woven.ties) {
    if (!tie.drawn) continue;
    if (!drawnKeys.has(tie.objectKey)) continue;
    // The anchor step's rendered id on the merged canvas is namespaced. Fall back to any node in the lane
    // if the specific anchor id isn't present (a lane with no loaded graph).
    const anchorId = tie.anchorStepId ? `${tie.channelId}::${tie.anchorStepId}` : null;
    const source = anchorId && posById.has(anchorId) ? anchorId : null;
    if (!source) continue;
    const dimmed = focusActive && !(lit.objects.has(tie.objectKey) && lit.lanes.has(tie.channelId));
    edges.push({
      id: `tie:${tie.channelId}:${tie.objectKey}`,
      source,
      target: `obj:${tie.objectKey}`,
      sourceHandle: null,
      targetHandle: "obj-in",
      type: "default",
      className: `woven-tie${dimmed ? " is-dim" : ""}`,
      data: { verb: tie.verb, runId: tie.runId },
      selectable: false,
      focusable: false,
    });
  }

  return { nodes, edges };
}
