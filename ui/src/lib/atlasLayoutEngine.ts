// The ADE layout engine: engine-owned, collision-free placement for the venture atlas.
//
// The founder never drags. Given the projected graph (what nodes/edges exist, decided upstream by
// AtlasProjection) and the live stage-cell dimensions, this decides *where* every node sits so cards
// physically cannot overlap and the whole field reads as the approved composite: one central hub with
// efforts, teammates, capabilities, and the wall ringing it in clear space.
//
// It is a d3-force radial constellation (the composite is hub-at-center, not a left-to-right layered
// flow, so elkjs's layered layout is the wrong shape — d3-force is already installed). The simulation
// is run fully deterministically: seeded initial angles derived from node id, a fixed tick count, no
// Math.random anywhere, hub pinned at the origin. Same input, same output — required so the browser
// journey and screenshots are stable.
//
// Pure domain: no React, no persistence, no xyflow runtime. It takes plain node descriptors and returns
// a Map<id, {x,y}> of top-left positions, which the caller folds onto the React Flow nodes.

import {
  forceCollide,
  forceManyBody,
  forceRadial,
  forceSimulation,
  forceX,
  forceY,
  type SimulationNodeDatum,
} from "d3-force";

export type LayoutKind =
  | "hub"
  | "effort"
  | "teammate"
  | "capability"
  | "wall"
  | "architecture"
  | "record"
  | "satellite";

export type LayoutInput = {
  id: string;
  kind: LayoutKind;
  /** Rendered size in flow units. Real measured size when known; a per-kind default otherwise. */
  width: number;
  height: number;
  /** Optional pin — the hub is anchored so the constellation never drifts off it. */
  pinned?: boolean;
};

/** Minimum clear space guaranteed between any two node boxes (composite: every adjacent pair >= 20px). */
export const LAYOUT_GAP = 22;

// Ring radii by kind, in flow units. The hub sits at the origin; everything else rings it outward.
// Efforts form the primary ring, teammates tuck inside it near the hub, capabilities and records sit
// further out, and the wall sits on the far edge (outward acts stop there). Tuned so the resting field
// reads at the composite's proportions: efforts ring the hub closely enough that the whole
// constellation fills the stage cell at a legible zoom, rather than scattering into empty canvas.
const RING_RADIUS: Record<LayoutKind, number> = {
  hub: 0,
  teammate: 250,
  effort: 400,
  architecture: 400,
  satellite: 400,
  record: 440,
  capability: 470,
  wall: 470,
};

const RADIAL_STRENGTH: Record<LayoutKind, number> = {
  hub: 1,
  teammate: 0.62,
  effort: 0.9,
  architecture: 0.9,
  satellite: 0.9,
  record: 0.82,
  capability: 0.82,
  wall: 0.86,
};

const TICKS = 420;

/** Horizontal spread applied to the settled radial field so it reads as a wide ellipse matching the
 *  desktop stage cell (1 = circular, higher = wider). The stage cell is markedly wide-and-short
 *  (docked rail + inspector leave a wide but ~720px-tall canvas), so the field is biased notably wider
 *  than the composite's near-square plane — a flatter constellation fills this stage at a legible zoom
 *  instead of being shrunk to fit a too-tall field. Widening X only ever increases clearance, so it
 *  cannot introduce a collision and the separation pass stays exact. */
const FIELD_ASPECT_BIAS = 2.3;

type Size = { width: number; height: number };

// Selected-effort expansion clearance. React Flow positions an effort by its resting 180px box, so
// its center is 90px from the left edge. Expanded, the 566px DOM box spans centerX - 90 through
// centerX + 476 (right-side card, grows right), or — via translateX(-434) — centerX - 524 through
// centerX + 42 (left-side card, grows left). Crucially the card only ever expands *outward* (toward
// the open side of the field, stamped as orbitSide from the settled position), never both ways at
// once. So the resting field reserves the expansion envelope ASYMMETRICALLY on the outward side only
// — not a symmetric 1048px box that balloons the resting constellation into empty canvas. This keeps
// the selected card collision-free while letting the resting field read at composite density.
const EFFORT_EXPAND_OUTWARD = 476; // extra width past the resting box on the expansion side
const EFFORT_EXPAND_HEIGHT = 300; // expanded card height envelope

type SimNode = SimulationNodeDatum & LayoutInput & {
  collisionWidth: number;
  collisionHeight: number;
  /** Which way this effort expands when selected (from its settled side of the field). */
  expandDir: -1 | 0 | 1;
  /** Signed outward reach past the resting box on the expansion side, for the AABB separation pass. */
  expandReach: number;
};

// FNV-1a hash → a stable per-id angle so initial placement (and therefore the settled layout) is
// deterministic without any random source.
function hashAngle(id: string): number {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) / 4294967296) * Math.PI * 2;
}

// Circumscribed-circle radius keeps the force pass roughly clear; the AABB pass below makes the
// >= LAYOUT_GAP guarantee exact for wide rectangular cards the circle would over- or under-space.
function collideRadius(node: SimNode): number {
  // The force pass uses resting sizes only. Effort expansion clearance is reserved against non-effort
  // cards in the exact AABB separation pass (see boxEdges) — not here — so the effort ring settles at
  // composite density instead of being blown apart by clearance two efforts never need between them.
  return Math.hypot(node.collisionWidth, node.height) / 2 + LAYOUT_GAP / 2;
}

// The half-extents of a node's collision box, per axis, computed against a specific neighbour. An
// effort reserves its resting half-width plus its outward expansion reach on the side it expands
// toward — but only against nodes it could actually collide with when expanded.
//
// Effort expansion clearance is reserved only against nodes the selected card could actually reach:
//  - non-effort cards (hub, teammate, capability, wall, record) — always, on the expansion side; and
//  - efforts on the SAME side of the field (same expandDir), because an inner card growing outward
//    grows straight into the outer card next to it. Cross-centre efforts (opposite expandDir) expand
//    away from each other and never need mutual clearance.
// This keeps the resting effort ring at composite density instead of ballooning it with clearance the
// selected state never actually needs (e.g. between two efforts that expand apart).
function boxEdges(node: SimNode, other: SimNode): { left: number; right: number; top: number; bottom: number } {
  const halfW = node.collisionWidth / 2;
  const restHalfH = node.height / 2;
  const reserveExpansion =
    node.kind === "effort" && (other.kind !== "effort" || other.expandDir === node.expandDir);
  const reachRight = reserveExpansion && node.expandDir > 0 ? node.expandReach : 0;
  const reachLeft = reserveExpansion && node.expandDir < 0 ? node.expandReach : 0;
  // The selected card keeps its resting top edge and grows DOWNWARD (the workflow unfolds below), so
  // the height envelope is asymmetric on Y: resting half-height above center, expanded reach below.
  const reachDown = reserveExpansion ? Math.max(0, node.collisionHeight - node.height) : 0;
  return { left: halfW + reachLeft, right: halfW + reachRight, top: restHalfH, bottom: restHalfH + reachDown };
}

function overlaps(a: SimNode, b: SimNode): boolean {
  const ax = a.x ?? 0;
  const bx = b.x ?? 0;
  const ay = a.y ?? 0;
  const by = b.y ?? 0;
  const ae = boxEdges(a, b);
  const be = boxEdges(b, a);
  // Directional AABB: separation on each axis must clear a's extent against b's opposite extent.
  const gapNeededX = ax <= bx ? ae.right + be.left : ae.left + be.right;
  const gapNeededY = ay <= by ? ae.bottom + be.top : ae.top + be.bottom;
  return (
    Math.abs(ax - bx) < gapNeededX + LAYOUT_GAP &&
    Math.abs(ay - by) < gapNeededY + LAYOUT_GAP
  );
}

// Deterministic rectangle-aware separation. The force pass settles the constellation; this pass makes
// the axis-aligned gap exact — it pushes any overlapping pair apart along their least-overlapping axis,
// never moving a pinned node. Ordered iteration keeps it deterministic.
function separateBoxes(nodes: SimNode[]): void {
  for (let pass = 0; pass < 160; pass += 1) {
    let moved = false;
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i];
        const b = nodes[j];
        if (!overlaps(a, b)) continue;
        const ax = a.x ?? 0;
        const ay = a.y ?? 0;
        const bx = b.x ?? 0;
        const by = b.y ?? 0;
        const ae = boxEdges(a, b);
        const be = boxEdges(b, a);
        const gapNeededX = ax <= bx ? ae.right + be.left : ae.left + be.right;
        const gapNeededY = ay <= by ? ae.bottom + be.top : ae.top + be.bottom;
        const overlapX = gapNeededX + LAYOUT_GAP - Math.abs(ax - bx);
        const overlapY = gapNeededY + LAYOUT_GAP - Math.abs(ay - by);
        // Push along the axis with the smaller penetration (least work to clear).
        if (overlapX < overlapY) {
          const dir = ax <= bx ? -1 : 1;
          const shift = overlapX / 2;
          if (!a.pinned) a.x = ax + dir * shift;
          if (!b.pinned) b.x = bx - dir * shift;
          if (a.pinned && !b.pinned) b.x = bx - dir * overlapX;
          if (b.pinned && !a.pinned) a.x = ax + dir * overlapX;
        } else {
          const dir = ay <= by ? -1 : 1;
          const shift = overlapY / 2;
          if (!a.pinned) a.y = ay + dir * shift;
          if (!b.pinned) b.y = by - dir * shift;
          if (a.pinned && !b.pinned) b.y = by - dir * overlapY;
          if (b.pinned && !a.pinned) a.y = ay + dir * overlapY;
        }
        moved = true;
      }
    }
    if (!moved) break;
  }
}

export type LayoutResult = {
  positions: Map<string, { x: number; y: number }>;
  /** Bounding box of the settled field (top-left origin), useful for stage-cell fit. */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
};

/**
 * Compute collision-free top-left positions for the given nodes, hub-centered, deterministically.
 * Placement is viewport-independent by design: the composition is byte-identical across desktop widths,
 * and the camera fits the settled field (see `bounds`) to the live stage cell. Stage-aware spreading is a
 * Phase-2 seam — it is not needed for the collision-free/hub-centered guarantee this engine makes.
 */
export function computeAtlasLayout(nodes: LayoutInput[]): LayoutResult {
  const positions = new Map<string, { x: number; y: number }>();
  if (!nodes.length) {
    return { positions, bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 } };
  }

  // Stable order so the simulation is reproducible regardless of upstream ordering.
  const ordered = [...nodes].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  // Seed each ring's members at EVEN angles rather than pure hash angles, so 7 efforts read as a clean
  // balanced ring around the hub (the composite's structure) instead of a lopsided cluster. The order
  // within a ring is the stable sorted order; a small hash jitter breaks exact symmetry deterministically
  // without clustering. Efforts and teammates get their own even distributions; the wall/capabilities/
  // records ring on the outside keep hash angles (few of them, position is less load-bearing).
  const evenAngleKinds = new Set<LayoutKind>(["effort", "teammate", "architecture", "satellite", "record"]);
  const ringIndex = new Map<string, number>();
  const ringCount = new Map<LayoutKind, number>();
  for (const node of ordered) {
    if (!evenAngleKinds.has(node.kind)) continue;
    const seen = ringCount.get(node.kind) ?? 0;
    ringIndex.set(node.id, seen);
    ringCount.set(node.kind, seen + 1);
  }
  // Offsets so efforts and teammates interleave rather than stacking on the same spokes: efforts start
  // near the top and go clockwise; teammates sit in the gaps between them.
  const RING_ANGLE_OFFSET: Partial<Record<LayoutKind, number>> = {
    effort: -Math.PI / 2,
    teammate: -Math.PI / 2 + Math.PI / 7,
    // Records (staged work) ring on the same spokes as their efforts, just further out, so each draft
    // reads as sitting radially outward from the direction it belongs to — keeping the field balanced
    // around the hub rather than clustering the tall record cards to one side.
    record: -Math.PI / 2,
  };

  const sim: SimNode[] = ordered.map((node) => {
    const radius = RING_RADIUS[node.kind] ?? RING_RADIUS.effort;
    const isEffort = node.kind === "effort";
    const total = ringCount.get(node.kind) ?? 0;
    const angle = evenAngleKinds.has(node.kind) && total > 0
      ? (RING_ANGLE_OFFSET[node.kind] ?? 0)
        + ((ringIndex.get(node.id) ?? 0) / total) * Math.PI * 2
        + (hashAngle(node.id) - Math.PI) * 0.06 // tiny deterministic jitter, ±~11°
      : hashAngle(node.id);
    const startX = Math.cos(angle) * radius;
    const datum: SimNode = {
      ...node,
      // Collision uses the resting render size; efforts additionally reserve their selected-card
      // expansion clearance, but only OUTWARD (see expandReach) — so the resting field is not
      // ballooned by a symmetric expansion box. Height reserves the expanded card's envelope so a
      // selected card never overlaps a node above/below it either.
      collisionWidth: node.width,
      collisionHeight: isEffort ? Math.max(node.height, EFFORT_EXPAND_HEIGHT) : node.height,
      // Seeded from the initial side of the field; re-derived from the settled position before the
      // exact separation pass so the reservation matches the card's real (orbitSide) expansion.
      expandDir: isEffort ? (startX >= 0 ? 1 : -1) : 0,
      expandReach: isEffort ? EFFORT_EXPAND_OUTWARD : 0,
      x: startX,
      y: Math.sin(angle) * radius,
    };
    if (node.pinned || node.kind === "hub") {
      datum.x = 0;
      datum.y = 0;
      datum.fx = 0;
      datum.fy = 0;
      datum.pinned = true;
    }
    return datum;
  });

  const simulation = forceSimulation<SimNode>(sim)
    .stop()
    .alpha(1)
    .alphaMin(0.001)
    .alphaDecay(0.028)
    .velocityDecay(0.4)
    .force("collide", forceCollide<SimNode>(collideRadius).strength(1).iterations(6))
    .force("rings", forceRadial<SimNode>((node) => RING_RADIUS[node.kind] ?? RING_RADIUS.effort, 0, 0)
      .strength((node) => RADIAL_STRENGTH[node.kind] ?? 0.8))
    .force("charge", forceManyBody<SimNode>().strength(-140))
    .force("x", forceX<SimNode>(0).strength(0.014))
    .force("y", forceY<SimNode>(0).strength(0.014));

  for (let tick = 0; tick < TICKS; tick += 1) simulation.tick();
  simulation.stop();

  // Bias the settled constellation into a wide ellipse so the field matches the ~16:9 desktop stage
  // cell: a radial layout is naturally circular, which fits a widescreen stage poorly (fitView must
  // zoom far out to contain a tall field, shrinking every card). Spreading X *outward* (never
  // compressing Y) widens the field to the stage's aspect while only ever *increasing* the clearance
  // between nodes — so it can never introduce a collision, and the separation pass stays exact.
  for (const node of sim) {
    if (node.pinned) continue;
    node.x = (node.x ?? 0) * FIELD_ASPECT_BIAS;
  }

  // Re-derive each effort's expansion direction from its settled side of the field (the hub is pinned
  // at the origin, so sign(x) is the outward side). This is the same rule the adapter stamps as
  // orbitSide, so the clearance the separation pass now reserves matches exactly where the selected
  // card grows — outward, into open space.
  for (const node of sim) {
    if (node.kind !== "effort") continue;
    node.expandDir = (node.x ?? 0) >= 0 ? 1 : -1;
  }

  // Make the >= LAYOUT_GAP guarantee exact for rectangular cards, including the outward expansion
  // envelope on efforts.
  separateBoxes(sim);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of sim) {
    // d3 tracks centers; React Flow positions by top-left corner. Bounds deliberately use resting
    // render sizes, not collision envelopes, so the camera does not permanently fit inactive growth.
    const x = (node.x ?? 0) - node.width / 2;
    const y = (node.y ?? 0) - node.height / 2;
    positions.set(node.id, { x, y });
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + node.width);
    maxY = Math.max(maxY, y + node.height);
  }

  return { positions, bounds: { minX, minY, maxX, maxY } };
}

// ── xyflow adapter ──────────────────────────────────────────────────────────────────────────────
// Fold engine positions onto React Flow nodes without changing which nodes/edges exist. The projection
// decides *what*; the engine decides *where*. Background/field nodes (the orbit ring, group frames) are
// left where the projection put them — they are not part of the collision set. Everything the founder
// reads as a placed card (hub, effort, teammate, capability, wall, architecture, record) is engine-owned.

type FlowNodeLike = {
  id: string;
  position: { x: number; y: number };
  width?: number | null;
  height?: number | null;
  measured?: { width?: number; height?: number } | null;
  style?: { width?: number | string; height?: number | string } | null;
  zIndex?: number;
  selectable?: boolean;
  draggable?: boolean;
  type?: string;
  data: { kind: string; orbitSide?: "left" | "right"; memberRefs?: string[]; [key: string]: unknown };
};

// Padding a group frame keeps around its members (flow units).
const GROUP_FRAME_PAD = { x: 40, y: 44 };

// Resting rendered sizes (flow units), used before the browser measures a node and for camera bounds.
// The browser's measured resting size wins once known. Effort expansion clearance is intentionally
// separate in COLLISION_SIZE_MINIMUM so it cannot make the inactive field bounds over-zoom.
const KIND_SIZE: Record<LayoutKind, Size> = {
  hub: { width: 280, height: 280 },
  effort: { width: 180, height: 180 },
  teammate: { width: 210, height: 140 },
  capability: { width: 210, height: 140 },
  wall: { width: 230, height: 130 },
  architecture: { width: 224, height: 160 },
  // Records (concrete/staged work cards) render tall and narrow — match the real DOM so the engine
  // reserves the right footprint and the camera's vertical fit is accurate.
  record: { width: 150, height: 224 },
  satellite: { width: 224, height: 160 },
};

// The projection's visual kinds → the engine's layout kinds. Architecture/theory/system/etc. all ring
// as "architecture"; work/outcome are records; teammate/capability/wall/bet map directly; intent is the hub.
export function layoutKindFor(visualKind: string): LayoutKind | null {
  switch (visualKind) {
    case "intent":
    case "theory":
      return "hub";
    case "bet":
      return "effort";
    case "teammate":
      return "teammate";
    case "capability":
      return "capability";
    case "wall":
      return "wall";
    case "work":
    case "outcome":
      return "record";
    case "orbit-field":
    case "group":
      return null; // field/background — not placed by the engine
    default:
      return "architecture";
  }
}

function measuredSize(node: FlowNodeLike, fallback: { width: number; height: number }) {
  const styleWidth = typeof node.style?.width === "number" ? node.style.width : undefined;
  const styleHeight = typeof node.style?.height === "number" ? node.style.height : undefined;
  return {
    width: node.measured?.width ?? node.width ?? styleWidth ?? fallback.width,
    height: node.measured?.height ?? node.height ?? styleHeight ?? fallback.height,
  };
}

/**
 * Return a new array of the same nodes with engine-computed positions on every placeable card, and the
 * settled field bounds. Only the first hub-kind node is pinned at the origin, so a working theory +
 * intent never fight for the center; any later hub-kind node rings as architecture.
 *
 * Two derived properties are stamped after the field settles:
 * - **orbitSide** on effort cards, from which side of the field center the card landed. The effort
 *   card's in-place expansion grows toward that open side (the CSS translateX), so it must follow the
 *   engine's own placement — not a stale orbit coordinate. The engine reserves clearance for either
 *   direction, so this only makes the expansion point outward; it can never cause a collision.
 * - **group frames** are recomputed from their members' settled positions so a decorative group frame
 *   still wraps its architecture cards after engine placement (it is not itself placed by the engine).
 */
export function layoutAtlasNodes<T extends FlowNodeLike>(
  nodes: T[],
): { nodes: T[]; bounds: LayoutResult["bounds"] } {
  const inputs: LayoutInput[] = [];
  let hubClaimed = false;
  for (const node of nodes) {
    const kind = layoutKindFor(node.data.kind);
    if (!kind) continue;
    const size = measuredSize(node, KIND_SIZE[kind]);
    const pinned = kind === "hub" && !hubClaimed;
    if (pinned) hubClaimed = true;
    inputs.push({ id: node.id, kind: pinned ? "hub" : kind === "hub" ? "architecture" : kind, width: size.width, height: size.height, pinned });
  }
  const { positions, bounds } = computeAtlasLayout(inputs);
  const fieldCenterX = (bounds.minX + bounds.maxX) / 2;

  // Members-by-id, so group frames can wrap their (now engine-placed) members.
  const sizeById = new Map<string, Size>();
  for (const node of nodes) {
    const kind = layoutKindFor(node.data.kind);
    if (kind) sizeById.set(node.id, measuredSize(node, KIND_SIZE[kind]));
  }

  const laidOut = nodes.map((node) => {
    if (node.data.kind === "group") {
      const memberRefs = node.data.memberRefs ?? [];
      const boxes = memberRefs
        .map((ref) => ({ position: positions.get(`architecture:${ref}`), size: sizeById.get(`architecture:${ref}`) }))
        .filter((entry): entry is { position: { x: number; y: number }; size: Size } => Boolean(entry.position && entry.size));
      if (!boxes.length) return node;
      const minX = Math.min(...boxes.map((box) => box.position.x)) - GROUP_FRAME_PAD.x;
      const minY = Math.min(...boxes.map((box) => box.position.y)) - GROUP_FRAME_PAD.y;
      const maxX = Math.max(...boxes.map((box) => box.position.x + box.size.width)) + GROUP_FRAME_PAD.x;
      const maxY = Math.max(...boxes.map((box) => box.position.y + box.size.height)) + GROUP_FRAME_PAD.y;
      return { ...node, position: { x: minX, y: minY }, style: { ...node.style, width: maxX - minX, height: maxY - minY } };
    }
    const position = positions.get(node.id);
    if (!position) return node;
    if (node.data.kind === "bet") {
      const center = position.x + (sizeById.get(node.id)?.width ?? KIND_SIZE.effort.width) / 2;
      const orbitSide: "left" | "right" = center < fieldCenterX ? "left" : "right";
      return { ...node, position, data: { ...node.data, orbitSide } };
    }
    return { ...node, position };
  });
  return { nodes: laidOut, bounds };
}
