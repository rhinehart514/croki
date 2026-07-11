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
  WovenCanvas, WovenCanvasAnchor, WovenRef,
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
  // A stable canvas anchor (product truth, a question, an outcome, …) from operatingView.woven.canvas.
  // Focusing one lights it and the anchors it relates to; object/tie/kind weaving stays neutral.
  | { kind: "anchor"; anchorId: string; ref?: WovenRef }
  | {
      kind: "relationship";
      relationshipId: string;
      relationshipRef: { type: "goal-relation" | "work-relationship"; id: string };
      source: WovenRef;
      target: WovenRef;
    }
  | null;

// ── Canvas anchors (fix 3) — the stable product/question/outcome landmarks the backend projects onto the
// woven canvas (brain/src/woven-graph.mjs → projectCanvas), rendered ADDITIVELY beside the object/tie/kind
// weaving. Product truth and questions sit in a left landmark column; outcomes sit in a right column and
// grow dashed "return" edges back to the question/product they returned to. Never replaces the weaving.
//
// SEMANTIC COLLAPSE (the long-tail product taxonomy): a canonical projection can carry ~60+ product-model
// detail anchors (things / goals / states / IA / workflows / interactions / transitions). Laying all of
// them into one vertical ladder buried the three real pipelines and the questions under a wall of
// postage-stamp cards at Fit View. So the layer keeps the HIGH-SIGNAL anchors individual — the product
// root, every product truth, every question, every outcome — and any product detail that is CAUSALLY
// CONNECTED to real GTM work (a question, pipeline, run, outcome, teammate, or decision references it).
// The remaining unconnected detail taxonomy folds into ONE compact summary chip PER KIND ("Things · 42"),
// which stays selectable: focusing a summary expands its members individually (zoom/focus access to the
// tail). Canonical data is never discarded — only its default rendering is summarized. Deterministic and
// stable: the same projection always yields the same bounded set.

const ROOT_KINDS = new Set(["product", "product-model"]);
const ANCHOR_RIGHT_KINDS = new Set(["outcome"]);
const TERRAIN_KINDS = new Set(["terrain-opening", "terrain-tension", "terrain-hypothesis"]);
const GOAL_KIND = "goal";
// A product DETAIL is any "product-*" kind that is not the root, a truth, or an implication (implications
// live on the outcome-return rail, not here). These are the long-tail the layer summarizes.
function isDetailKind(kind: string): boolean {
  return kind.startsWith("product-") && kind !== "product-truth" && kind !== "product-model" && kind !== "product-implication";
}
// The endpoint types that make a product detail causally relevant — connected to real GTM work.
const SIGNAL_ENDPOINT_TYPES = new Set(["question", "pipeline", "path", "run", "outcome", "teammate", "decision"]);
const GROUP_PREFIX = "canchor:group:";
export function groupNodeId(kind: string): string { return `${GROUP_PREFIX}${kind}`; }

const DETAIL_PLURAL: Record<string, string> = {
  "product-thing": "Things", "product-goal": "User goals", "product-state": "States", "product-ia": "IA areas",
  "product-workflow": "Workflows", "product-interaction": "Interactions", "product-transition": "Transitions",
  "product-relationship": "Relationships",
};
function detailLabel(kind: string): string {
  return DETAIL_PLURAL[kind]
    ?? `${kind.replace(/^product-/, "").replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}s`;
}

function cleanConflictLabel(summary: string | undefined, goalCount: number | undefined): string {
  const count = Math.max(2, Number(goalCount ?? 2));
  return summary?.trim() || `${count} active goals share this work`;
}

export function anchorNodeId(ref: WovenRef): string {
  return `canchor:${ref.type ?? ""}:${ref.id}`;
}

export type CanvasAnchorData = {
  anchorId: string;
  ref: WovenRef;
  kind: string;
  label: string;
  body?: unknown;
  focus?: "focus" | "dim";
  // Set on a summary chip standing in for a collapsed kind's tail — its member count. Selecting it expands.
  count?: number;
  group?: boolean;
  conflict?: { count: number; goalCount: number; label: string; detail: string };
  connection?: { active: boolean; source: boolean };
  onKeyboardConnect?: () => void;
  onAuthorityChanged?: () => void | Promise<void>;
};

// A durable work region is rendered as quiet canvas ground, not as another artifact card. The callbacks
// are injected by GraphCanvas because this projection stays pure and has no write authority of its own.
export type CanvasRegionData = {
  regionId: string;
  ref: WovenRef;
  title: string;
  purpose: string | null;
  memberCount: number;
  size: { width: number; height: number };
  collapsed: boolean;
  revision: number;
  focus?: "focus" | "dim";
  onToggleCollapsed?: () => void;
  onResizeEnd?: (size: { width: number; height: number }) => void;
  onArchive?: () => void;
};

// The lit set for a real-anchor focus: the anchor itself plus every anchor it relates to (either direction).
function anchorLitSet(canvas: WovenCanvas, focus: Extract<WovenFocus, { kind: "anchor" }>): Set<string> {
  const lit = new Set<string>([focus.anchorId]);
  // Dense canvases can carry hundreds of anchors and relationships. Index once instead of scanning the
  // full anchor array for each adjacent relationship (the previous path was O(anchors × relationships)).
  const anchorsByRef = new Map<string, WovenCanvasAnchor>();
  const anchorsByNodeId = new Map<string, WovenCanvasAnchor>();
  for (const anchor of canvas.anchors) {
    anchorsByRef.set(`${anchor.ref.type ?? ""}:${anchor.ref.id}`, anchor);
    anchorsByNodeId.set(anchorNodeId(anchor.ref), anchor);
  }
  const target = anchorsByNodeId.get(focus.anchorId);
  if (!target) return lit;
  for (const rel of canvas.relationships ?? []) {
    if (rel.source.type === target.ref.type && rel.source.id === target.ref.id) {
      const other = anchorsByRef.get(`${rel.target.type ?? ""}:${rel.target.id}`);
      if (other) lit.add(anchorNodeId(other.ref));
    }
    if (rel.target.type === target.ref.type && rel.target.id === target.ref.id) {
      const other = anchorsByRef.get(`${rel.source.type ?? ""}:${rel.source.id}`);
      if (other) lit.add(anchorNodeId(other.ref));
    }
  }
  return lit;
}

function relationshipLitSet(focus: Extract<WovenFocus, { kind: "relationship" }>): Set<string> {
  return new Set([anchorNodeId(focus.source), anchorNodeId(focus.target)]);
}

// ── One founder wall (docs/production-direction/16, P1) ──────────────────────────────────────────────
// On the Operator merged canvas with 2+ pipelines, each lane carries its own gate at its own causal depth,
// so the overview reads as scattered gates. This aligns every lane's gate onto ONE shared x by shifting
// each lane horizontally so its gate lands on the rightmost gate column, and returns the wall geometry so a
// single vertical amber threshold can be drawn across the whole lane band. The gate cards stay individually
// actionable (this only moves them); backend and authorization are untouched. Pure and testable.
export type WallAlignInput = {
  nodes: Array<{ id: string; position: { x: number; y: number }; data?: unknown }>;
  lanes: Map<string, { offsetY: number; height: number; centerX: number }>;
};
export type FounderWall = { x: number; top: number; bottom: number } | null;

function nodeChannelId(n: { data?: unknown }): string | null {
  const d = n.data as { channelId?: string } | undefined;
  return typeof d?.channelId === "string" ? d.channelId : null;
}
function nodeIsGate(n: { data?: unknown }): boolean {
  const d = n.data as { node?: { category?: string } } | undefined;
  return d?.node?.category === "gate";
}

export function alignGatesToWall<T extends WallAlignInput["nodes"][number]>(
  nodes: T[], lanes: WallAlignInput["lanes"],
): { nodes: T[]; wall: FounderWall } {
  // Each lane's gate x (the leftmost gate if a lane somehow has more than one).
  const gateXByChannel = new Map<string, number>();
  for (const n of nodes) {
    if (!nodeIsGate(n)) continue;
    const ch = nodeChannelId(n);
    if (!ch) continue;
    const prev = gateXByChannel.get(ch);
    if (prev == null || n.position.x < prev) gateXByChannel.set(ch, n.position.x);
  }
  // A single wall only reads when 2+ lanes actually cross it.
  if (gateXByChannel.size < 2) return { nodes, wall: null };
  const targetX = Math.max(...gateXByChannel.values());
  const shifted = nodes.map((n) => {
    const ch = nodeChannelId(n);
    const gateX = ch ? gateXByChannel.get(ch) : undefined;
    if (gateX == null) return n;
    const dx = targetX - gateX;
    return dx === 0 ? n : { ...n, position: { x: n.position.x + dx, y: n.position.y } };
  });
  // The wall spans the full band of the lanes that carry a gate.
  const gated = [...gateXByChannel.keys()].map((ch) => lanes.get(ch)).filter(Boolean) as Array<{ offsetY: number; height: number }>;
  const top = gated.length ? Math.min(...gated.map((l) => l.offsetY)) : 0;
  const bottom = gated.length ? Math.max(...gated.map((l) => l.offsetY + l.height)) : 0;
  return { nodes: shifted, wall: { x: targetX, top, bottom } };
}

export function buildCanvasAnchorLayer(
  canvas: WovenCanvas | null | undefined,
  laneBand: { top: number; bottom: number; minX: number; maxX: number } | null,
  focus: WovenFocus,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  if (!canvas?.anchors?.length) return { nodes, edges };

  const band = laneBand ?? { top: 0, bottom: 480, minX: 0, maxX: 0 };
  const leftX = band.minX - 560;
  const rightX = band.maxX + 380;
  const rowH = 92;

  // Which detail kind (if any) the founder has focused-open — that kind renders individually (tail access).
  const expandedKind = focus && focus.kind === "anchor" && focus.anchorId.startsWith(GROUP_PREFIX)
    ? focus.anchorId.slice(GROUP_PREFIX.length) : null;

  // Causally-connected product-detail ids — connected to a question/pipeline/run/outcome/teammate/decision.
  const connectedDetailIds = new Set<string>();
  for (const rel of canvas.relationships ?? []) {
    if (rel.target.type && SIGNAL_ENDPOINT_TYPES.has(rel.target.type)) connectedDetailIds.add(rel.source.id);
    if (rel.source.type && SIGNAL_ENDPOINT_TYPES.has(rel.source.type)) connectedDetailIds.add(rel.target.id);
  }

  const roots = canvas.anchors.filter((a) => ROOT_KINDS.has(a.kind));
  const truths = canvas.anchors.filter((a) => a.kind === "product-truth");
  const questions = canvas.anchors.filter((a) => a.kind === "question");
  const details = canvas.anchors.filter((a) => isDetailKind(a.kind));
  const outcomes = canvas.anchors.filter((a) => ANCHOR_RIGHT_KINDS.has(a.kind));
  const terrain = canvas.anchors.filter((a) => TERRAIN_KINDS.has(a.kind));
  const goals = canvas.anchors.filter((a) => a.kind === GOAL_KIND && a.ref.type === GOAL_KIND);
  const work = canvas.anchors.filter((a) => a.ref.type === "work-artifact" || a.ref.type === "product-change");
  const byId = (a: WovenCanvasAnchor, b: WovenCanvasAnchor) => a.ref.id.localeCompare(b.ref.id);
  const boundedBody = (a: WovenCanvasAnchor) => {
    if (!a.body || typeof a.body !== "object" || Array.isArray(a.body)) return a.body;
    if (a.ref.type === "goal") {
      const body = a.body as Record<string, unknown>;
      return Object.fromEntries(["projectId", "revision", "updatedAt", "statement", "desiredChange", "status"].filter((key) => body[key] !== undefined).map((key) => [key, body[key]]));
    }
    if (a.ref.type === "work-artifact") {
      const body = a.body as Record<string, unknown>;
      return Object.fromEntries(["projectId", "revision", "updatedAt", "title", "summary", "kind", "format", "contentType", "status"].filter((key) => body[key] !== undefined).map((key) => [key, body[key]]));
    }
    return a.body;
  };
  const anchorData = (a: WovenCanvasAnchor, id: string): CanvasAnchorData => {
    const conflicts = Array.isArray(a.facets?.goalConflicts)
      ? a.facets.goalConflicts as Array<{ goalCount?: number; summary?: string; detail?: string }>
      : [];
    const first = conflicts[0];
    return {
      anchorId: id, ref: a.ref, kind: a.kind, label: a.label, body: boundedBody(a), focus: stateFor(id),
      ...(first ? {
        conflict: {
          count: conflicts.length,
          goalCount: Math.max(2, ...conflicts.map((item) => Number(item.goalCount ?? 2))),
          label: cleanConflictLabel(first.summary, first.goalCount),
          detail: first.detail ?? "Multiple active goals use this shared object.",
        },
      } : {}),
    };
  };

  // A detail renders individually when it is causally connected OR its kind is expanded; the rest form the
  // per-kind tail that a summary chip stands in for.
  const keptDetail = (a: WovenCanvasAnchor) => connectedDetailIds.has(a.ref.id) || a.kind === expandedKind;
  const keptDetails = details.filter(keptDetail);
  const tailByKind = new Map<string, WovenCanvasAnchor[]>();
  for (const a of details) {
    if (keptDetail(a)) continue;
    const list = tailByKind.get(a.kind) ?? [];
    list.push(a);
    tailByKind.set(a.kind, list);
  }

  // ── focus lighting ──
  let lit: Set<string> | null = null;
  if (focus?.kind === "relationship") {
    lit = relationshipLitSet(focus);
  } else if (focus && focus.kind === "anchor") {
    if (expandedKind) {
      lit = new Set<string>();
      for (const a of details) if (a.kind === expandedKind) lit.add(anchorNodeId(a.ref));
    } else {
      lit = anchorLitSet(canvas, focus);
    }
  }
  const stateFor = (id: string): "focus" | "dim" | undefined => (!lit ? undefined : lit.has(id) ? "focus" : "dim");

  // ── the left landmark column — a BOUNDED, ordered set: root, questions, truths, then per detail kind
  // (kept individuals + one summary chip). Questions sit high so they stay large and clickable at Fit View.
  const detailKinds = [...new Set(details.map((a) => a.kind))].sort();
  const left: Node[] = [];
  const pushAnchor = (a: WovenCanvasAnchor) => {
    const id = anchorNodeId(a.ref);
    left.push({
      id, type: "canvasAnchor", position: { x: 0, y: 0 }, draggable: false, selectable: true,
      data: anchorData(a, id),
    });
  };
  [...roots].sort(byId).forEach(pushAnchor);
  [...questions].sort(byId).forEach(pushAnchor);
  [...truths].sort(byId).forEach(pushAnchor);
  for (const kind of detailKinds) {
    keptDetails.filter((a) => a.kind === kind).sort(byId).forEach(pushAnchor);
    const tail = tailByKind.get(kind);
    if (tail && tail.length) {
      const gid = groupNodeId(kind);
      left.push({
        id: gid, type: "canvasAnchor", position: { x: 0, y: 0 }, draggable: false, selectable: true,
        data: { anchorId: gid, ref: { type: "group", id: kind }, kind, label: detailLabel(kind), count: tail.length, group: true, focus: stateFor(gid) } satisfies CanvasAnchorData,
      });
    }
  }
  // Assign the bounded column's real y positions now that its length is known.
  left.forEach((n, i) => { n.position = { x: leftX, y: band.top + i * rowH }; nodes.push(n); });

  // Model-owned openings and tensions sit between product truth and worked pipeline lanes. They remain
  // bounded upstream to five and visibly typed as reads, never promoted into the product landmark.
  [...terrain].sort(byId).forEach((a, i) => {
    const id = anchorNodeId(a.ref);
    nodes.push({
      id, type: "canvasAnchor", position: { x: leftX + 300, y: band.top + (goals.length ? 6 * rowH + 42 : 42) + i * rowH },
      draggable: false, selectable: true,
      data: anchorData(a, id),
    });
  });

  // Goals and their work are first-class canvas material, not rows hidden behind a project page. A
  // compact deterministic grid handles dozens without creating a single privileged goal. Work sits on
  // the opposite side so goal→work relationships read as movement across the shared field.
  const pushGrid = (anchors: WovenCanvasAnchor[], x: number, direction: 1 | -1) => {
    [...anchors].sort(byId).forEach((a, i) => {
      const id = anchorNodeId(a.ref);
      // Geometry is keyed by the canonical anchor authority id (`anchor:type:id`), not React Flow's
      // presentation id (`canchor:type:id`). Keeping the two namespaces separate lets the backend detect
      // genuinely detached positions without treating every founder drag as unresolved geometry.
      const saved = canvas.geometry?.positions?.[a.id];
      nodes.push({
        id, type: "canvasAnchor",
        position: saved ?? { x: x + direction * Math.floor(i / 6) * 250, y: band.top + (i % 6) * rowH },
        draggable: true, selectable: true,
        data: anchorData(a, id),
      });
    });
  };
  pushGrid(goals, leftX + 300, -1);
  pushGrid(work, rightX, 1);
  // Regions remain their own spatial authority. Their move/resize controls write through the region CAS
  // API rather than the generic layout sidecar, so deliberate placement still has one source of truth.
  [...(canvas.regions ?? [])].sort((a, b) => a.id.localeCompare(b.id)).forEach((region) => {
    const ref: WovenRef = { type: "work-region", id: region.id };
    const id = anchorNodeId(ref);
    const width = Math.max(160, Number(region.size?.width) || 640);
    const height = Math.max(120, Number(region.size?.height) || 420);
    const collapsed = Boolean(region.collapsed);
    nodes.push({
      id, type: "canvasRegion",
      position: { x: Number(region.position?.x) || 0, y: Number(region.position?.y) || 0 },
      style: { width: collapsed ? Math.min(width, 420) : width, height: collapsed ? 72 : height },
      draggable: true, dragHandle: ".canvas-region-drag-handle", selectable: true, zIndex: -1,
      data: {
        regionId: region.id,
        ref,
        title: region.title,
        purpose: region.purpose ?? null,
        memberCount: region.memberRefs?.length ?? 0,
        size: { width, height },
        collapsed,
        revision: region.revision,
        focus: stateFor(id),
      } satisfies CanvasRegionData,
    });
  });

  // ── the right outcome column ──
  [...outcomes].sort(byId).forEach((a, i) => {
    const id = anchorNodeId(a.ref);
    nodes.push({
      id, type: "canvasAnchor", position: { x: rightX, y: band.top + (work.length ? 6 * rowH + 36 : 0) + i * rowH }, draggable: false, selectable: true,
      data: anchorData(a, id),
    });
  });

  const drawnIds = new Set(nodes.map((n) => n.id));
  const byRef = new Map(canvas.anchors.map((a) => [`${a.ref.type ?? ""}:${a.ref.id}`, anchorNodeId(a.ref)]));
  // Draw every resolved relationship whose endpoints are visible. Open relation kinds remain data on the
  // edge; returns-to keeps its established stronger treatment.
  for (const rel of canvas.relationships ?? []) {
    // A region's member references are already expressed by spatial containment. Drawing one line per
    // member would turn the quiet bound back into a node-editor group and overwhelm shared artifacts.
    if (rel.source.type === "work-region" && rel.kind === "member") continue;
    const source = byRef.get(`${rel.source.type ?? ""}:${rel.source.id}`);
    const target = byRef.get(`${rel.target.type ?? ""}:${rel.target.id}`);
    if (!source || !target || !drawnIds.has(source) || !drawnIds.has(target)) continue;
    const dim = lit ? !(lit.has(source) && lit.has(target)) : false;
    const isReturn = rel.kind === "returns-to";
    const relationType = rel.receipt && typeof rel.receipt === "object"
      ? (rel.receipt as { recordRef?: { type?: string; id?: string } }).recordRef?.type
      : null;
    const relationId = rel.authority?.id;
    const editableType = relationType === "goal-relation"
      ? "goal-relation"
      : relationType === "work-relationship-revision" ? "work-relationship" : null;
    const selected = focus?.kind === "relationship" && focus.relationshipId === rel.id;
    const proposed = rel.disposition === "proposed";
    edges.push({
      id: `${isReturn ? "return" : "relation"}:${rel.id}`,
      source,
      target,
      type: "default",
      className: `${isReturn ? "woven-return" : "woven-relation"}${dim ? " is-dim" : ""}${selected ? " selected" : ""}${proposed ? " is-proposed" : ""}`,
      selectable: Boolean(editableType && relationId && rel.capabilities?.inspect),
      deletable: false,
      focusable: true,
      ariaLabel: `${proposed ? "Proposed " : ""}${rel.label || rel.kind}: ${rel.source.type ?? "item"} ${rel.source.id} to ${rel.target.type ?? "item"} ${rel.target.id}${editableType ? ". Open relationship details." : ""}`,
      label: rel.label || undefined,
      data: {
        kind: rel.kind,
        ...(editableType && relationId ? {
          canvasRelationship: {
            relationshipId: rel.id,
            relationshipRef: { type: editableType, id: relationId },
            source: rel.source,
            target: rel.target,
          },
        } : {}),
        disposition: rel.disposition,
      },
    });
  }
  return { nodes, edges };
}

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
  // An anchor focus is NOT an object-weave focus — it drives the anchor layer separately, so it never
  // dims the object/tie/kind weaving. Reporting it "ineffective" here keeps object weaving neutral.
  if (focus.kind === "anchor" || focus.kind === "relationship") return false;
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
  // The canonical stable-anchor projection (operatingView.woven.canvas). When present, product/question/
  // outcome anchors render additively beside the weaving (fix 3). Absent → weaving-only, exactly as before.
  canvas?: WovenCanvas | null;
};

export function buildWovenOverlay(input: WovenOverlayInput): { nodes: Node[]; edges: Edge[] } {
  const { woven, lanes, mergedNodes, axis, zoom, expandedLaneIds = new Set() } = input;
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // The canvas anchor layer (fix 3) — additive stable landmarks, computed once and included on EVERY axis
  // (they are altitude-independent). Placed against the real lane band so they never reshuffle. Anchor
  // focus lights the anchor and its related anchors without touching the object/tie/kind weaving below.
  const laneVals = [...lanes.values()];
  const laneBand = laneVals.length
    ? {
        top: Math.min(...laneVals.map((l) => l.offsetY)),
        bottom: Math.max(...laneVals.map((l) => l.offsetY + l.height)),
        minX: Math.min(...laneVals.map((l) => l.centerX)),
        maxX: Math.max(...laneVals.map((l) => l.centerX)),
      }
    : null;
  const anchorLayer = buildCanvasAnchorLayer(input.canvas, laneBand, input.focus);
  nodes.push(...anchorLayer.nodes);
  edges.push(...anchorLayer.edges);

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
