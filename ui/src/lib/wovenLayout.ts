// wovenLayout — the pure placement math for the intertwined canvas (docs/INTERTWINED-CANVAS.md §5).
//
// Two altitudes over ONE woven graph, plus the scale rules that keep it from becoming a hairball. Every
// function here is a pure export: no React, no store reads, no persisted state — feed it the arrays
// getOperatingView already builds (OperatingObject[] + OperatingLane[]) and the per-lane step positions
// the merged canvas already lays out, and it returns positions/collapsed groups. Nothing here writes; the
// integrator re-runs these on every re-weave, so the placement is derived fresh each render (the
// deriveFunnel discipline — change the rule and the picture changes next render with nothing to migrate).
//
// Determinism is load-bearing: v1 places a chip at the mean-X of its touching steps (a stable function of
// where the crossing happens); v2 seeds each chip from a hash of its objectKey (a stable function of the
// object's identity). Neither uses a random seed or a force simulation, so the field never reshuffles
// between reads and the founder builds spatial memory.

import type { OperatingObject } from "@/types";

// ─── The woven-node projection shapes ──────────────────────────────────────────────────────────────
// What the integrator's buildWovenGraph feeds each synthetic node. These are RENDER-TIME projections
// (obj:/tie:/kind: ids), never persisted — the layout functions and the node components share this shape.

// One shared-object chip's data — a straight projection of an OperatingObject plus the render-time
// degree/focus state the layout and focus-to-trace compute. `degree` is motionCount surfaced onto the
// chip so far-zoom weight (size + ink) reads off it without re-deriving.
export type ObjectChipData = {
  objectKey: string;
  kind: string;               // the ledger's OPEN kind string — never an enum
  label: string | null;
  bucket: OperatingObject["bucket"];
  degree: number;             // motionCount — drives size + ink at far zoom
  // Optional pre-normalized degree in [0,1] (v2 passes it from layoutObjectsPrimary's sizeByObject, so the
  // chip sizes against the CANVAS-WIDE degree range, not a local ramp). Absent in v1 → the chip falls back
  // to a local (degree-1)/4 ramp, which is honest at the sparse lanes-primary altitude.
  normDegree?: number;
  touchCount: number;
  lanes: string[];            // channelIds that touched it (the tie endpoints)
  provenance: OperatingObject["provenance"];
  // Focus-to-trace render state (set by the integrator from findReferences): "focus" = this chip is on the
  // isolated crossing path, "dim" = receded to near-monochrome, undefined = neutral (no focus active).
  focus?: "focus" | "dim";
};

// One kind-cluster region chip's data — a labeled region for a group of same-kind objects (the far-zoom
// blend), or a GTM-type cluster on the TYPE axis. `label` is an OPEN string (an object kind, or a
// deriveMotionName motion name) — never a closed catalog slot. `count` is how many members it stands in for.
export type KindClusterData = {
  clusterKey: string;         // e.g. "kind:person" or "type:outbound"
  label: string;              // open string — object kind OR deriveMotionName motion name
  count: number;              // members collapsed into this chip
  totalDegree: number;        // sum of member degrees — overlap shown as weight, not lines
  focus?: "focus" | "dim";
};

// A per-lane collapse badge: the single-touch objects a lane touched, rolled into one "+N touched once"
// count instead of N individual chips (the 2+-touch rule). Expands on demand (the integrator owns the
// expanded set); this is just the count + which keys it stands for.
export type CollapsedTouchBadge = {
  laneId: string;
  count: number;
  objectKeys: string[];
};

// A placed node: an id + an (x, y) the integrator hands React Flow. Kept minimal so these functions never
// need to know about React Flow's Node shape.
export type Placed = { x: number; y: number };

// ─── The 2+-touch filter / collapse (scale rule #1) ─────────────────────────────────────────────────
// Only objects touched by 2+ MOTIONS ever draw individually; single-touch objects collapse to a per-lane
// "+N touched once" badge. Visible density then scales with INTERTWINING, not population size.
//
// `expandedLaneIds` lets the founder pop one lane's collapsed set open (those single-touch objects then
// return to `individual` so the integrator draws them); everything else stays collapsed. A blended-kind
// object touched by two motions is never bucketed away — it's individual by the 2+ rule regardless of kind.
export function partitionByTouch(
  objects: OperatingObject[],
  expandedLaneIds: ReadonlySet<string> = new Set(),
): { individual: OperatingObject[]; badges: CollapsedTouchBadge[] } {
  const individual: OperatingObject[] = [];
  // laneId → the single-touch objectKeys that lane touched, for the collapse badge.
  const singleByLane = new Map<string, string[]>();

  for (const obj of objects) {
    const motions = obj.motionCount ?? 0;
    if (motions >= 2) {
      individual.push(obj);
      continue;
    }
    // Single-touch (or untouched): its one lane, if any. An object with no lane can't hang a tie, so it
    // rolls into a synthetic "unwired" bucket key rather than vanishing silently.
    const laneId = obj.lanes[0] ?? "unwired";
    if (expandedLaneIds.has(laneId)) {
      individual.push(obj);
      continue;
    }
    if (!singleByLane.has(laneId)) singleByLane.set(laneId, []);
    singleByLane.get(laneId)!.push(obj.objectKey);
  }

  const badges: CollapsedTouchBadge[] = [];
  for (const [laneId, objectKeys] of singleByLane) {
    badges.push({ laneId, count: objectKeys.length, objectKeys });
  }
  return { individual, badges };
}

// ─── v1 — mean-X gutter placement (lanes-primary) ───────────────────────────────────────────────────
// Place each object chip at the MEAN X of its touching steps (approach 2's rule): a prospect two motions
// touch late sits far right, at the causal depth where the crossing happens. Y sits in the GUTTER between /
// beyond the lanes it ties to — the mean of the touched lanes' gutter rows, nudged into open space so a
// chip never lands on top of a step card.
//
// Inputs the integrator already has:
//   - `stepXByObject`: objectKey → the x-coordinates of the steps that touched it (from the tie join —
//     a tie runs from a lane's last data-producing step to the object, and that step's laid-out x is
//     known). Mean of these is the chip's x.
//   - `laneGutterYByLane`: channelId → the y of the gutter band just below that lane (the integrator reads
//     it off computeChannelLanes: offsetY + height gives the band under a lane). Mean over the object's
//     touched lanes is the chip's y.
// Deterministic: identical inputs → identical output, no seed, no simulation.
export function layoutMeanXGutter(
  objects: OperatingObject[],
  stepXByObject: ReadonlyMap<string, number[]>,
  laneGutterYByLane: ReadonlyMap<string, number>,
  fallbackX = 0,
  fallbackY = 0,
): Map<string, Placed> {
  const out = new Map<string, Placed>();
  for (const obj of objects) {
    const xs = stepXByObject.get(obj.objectKey);
    const x = xs && xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : fallbackX;

    const gutterYs: number[] = [];
    for (const laneId of obj.lanes) {
      const gy = laneGutterYByLane.get(laneId);
      if (typeof gy === "number") gutterYs.push(gy);
    }
    const y = gutterYs.length ? gutterYs.reduce((a, b) => a + b, 0) / gutterYs.length : fallbackY;
    out.set(obj.objectKey, { x, y });
  }
  return out;
}

// ─── v2 — objects-primary layout (the graft, same nodes) ────────────────────────────────────────────
// The population becomes the substrate: chips cluster into regions by their OPEN kind string, and node
// SIZE encodes degree (motionCount) so moat objects are visibly the largest with no overlay. Placement is
// seeded by an objectKey hash (never random, never force), so the field never reshuffles between reads.
//
// Each kind gets a region (a column of width `regionWidth`, laid left-to-right in the order kinds first
// appear). Within a region, a chip's (x, y) is the hash of its objectKey mapped into the region's box —
// stable per key. Degree is returned as `size` (a normalized 0..1 the component turns into px/ink), so the
// integrator can size chips without re-deriving.

// A tiny, stable string hash (FNV-1a, 32-bit). Deterministic and dependency-free — same key, same number,
// forever. Used only to SEED a position, never as identity.
function hashKey(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // >>> 0 forces unsigned; /2^32 maps to [0, 1).
  return (h >>> 0) / 0x100000000;
}

// Two decorrelated unit values from one key, so x and y don't line up on a diagonal.
function seed2(key: string): { u: number; v: number } {
  return { u: hashKey(key), v: hashKey(`${key}#y`) };
}

export type ObjectsPrimaryPlacement = {
  positions: Map<string, Placed>;
  // objectKey → normalized degree in [0,1] (0 = min degree, 1 = the moat object). The component maps this
  // to a px size and an ink step. Returned alongside so the size rule stays one derivation, not two.
  sizeByObject: Map<string, number>;
  // The region label + box for each kind, so the integrator can drop a KindCluster label behind each group.
  regions: Array<{ label: string; x: number; y: number; width: number; height: number }>;
};

export function layoutObjectsPrimary(
  objects: OperatingObject[],
  opts: {
    regionWidth?: number;   // horizontal box per kind region
    regionHeight?: number;  // vertical extent chips scatter within
    regionGap?: number;     // gap between kind regions
    pad?: number;           // inner padding so chips don't hug the region edge
  } = {},
): ObjectsPrimaryPlacement {
  const regionWidth = opts.regionWidth ?? 460;
  const regionHeight = opts.regionHeight ?? 560;
  const regionGap = opts.regionGap ?? 96;
  const pad = opts.pad ?? 40;

  // Group by OPEN kind string, preserving first-seen order so regions never reshuffle across reads.
  const byKind = new Map<string, OperatingObject[]>();
  for (const obj of objects) {
    const kind = (obj.kind ?? "").trim() || "object";
    if (!byKind.has(kind)) byKind.set(kind, []);
    byKind.get(kind)!.push(obj);
  }

  // Degree range across ALL objects (not per-region), so a moat object reads largest canvas-wide.
  let minDeg = Infinity;
  let maxDeg = -Infinity;
  for (const obj of objects) {
    const d = obj.motionCount ?? 0;
    if (d < minDeg) minDeg = d;
    if (d > maxDeg) maxDeg = d;
  }
  const degSpan = Math.max(1, (Number.isFinite(maxDeg) ? maxDeg : 0) - (Number.isFinite(minDeg) ? minDeg : 0));

  const positions = new Map<string, Placed>();
  const sizeByObject = new Map<string, number>();
  const regions: ObjectsPrimaryPlacement["regions"] = [];

  let regionX = 0;
  for (const [kind, members] of byKind) {
    regions.push({ label: kind, x: regionX, y: 0, width: regionWidth, height: regionHeight });
    const innerW = regionWidth - pad * 2;
    const innerH = regionHeight - pad * 2;
    for (const obj of members) {
      const { u, v } = seed2(obj.objectKey);
      positions.set(obj.objectKey, {
        x: regionX + pad + u * innerW,
        y: pad + v * innerH,
      });
      const norm = ((obj.motionCount ?? 0) - (Number.isFinite(minDeg) ? minDeg : 0)) / degSpan;
      sizeByObject.set(obj.objectKey, Math.max(0, Math.min(1, norm)));
    }
    regionX += regionWidth + regionGap;
  }

  return { positions, sizeByObject, regions };
}

// ─── Semantic zoom (scale rule #3) ──────────────────────────────────────────────────────────────────
// Far out, same-kind lanes/objects blend into one cluster chip and overlap shows as node WEIGHT (size /
// ink), not lines; zoom in and clusters fan into lanes/ties. This helper answers the one question the
// integrator asks every zoom tick — "am I clustered or fanned, and what are the cluster chips?" — from the
// live zoom level, so the render swaps between the two without a second data read.
//
// `groupKey` picks the axis: on the OBJECT axis it's the object's kind; on the TYPE axis it's the lane's
// derived motion name (deriveMotionName). Either way it's an OPEN string — a new value just makes a new
// cluster chip, never forced into a bucket. A blended-kind pipeline the integrator maps to BOTH clusters
// straddles them (it passes the same lane under two groupKeys); this helper never forces it into one.

// The zoom below which same-group nodes blend into a cluster chip. A first pass at the altitude where
// individual chips stop being legible; tune live.
export const CLUSTER_ZOOM = 0.45;

export function isClustered(zoom: number): boolean {
  return zoom < CLUSTER_ZOOM;
}

// Blend a set of grouped nodes into cluster chips for the far-zoom render. Each input carries its group
// (an open string) and its degree; the output is one KindClusterData per group, placed at the MEAN X/Y of
// its members (approach 5's depth-not-lines: N crossings add zero lines, the cluster just carries more
// totalDegree and reads heavier). Deterministic — mean placement, stable group order (first-seen).
export function blendToClusters(
  members: Array<{ id: string; group: string; degree: number; pos: Placed }>,
): Array<KindClusterData & { pos: Placed }> {
  const groups = new Map<string, { count: number; totalDegree: number; sx: number; sy: number }>();
  const order: string[] = [];
  for (const m of members) {
    const g = (m.group ?? "").trim() || "object";
    if (!groups.has(g)) { groups.set(g, { count: 0, totalDegree: 0, sx: 0, sy: 0 }); order.push(g); }
    const acc = groups.get(g)!;
    acc.count += 1;
    acc.totalDegree += m.degree ?? 0;
    acc.sx += m.pos.x;
    acc.sy += m.pos.y;
  }
  return order.map((g) => {
    const acc = groups.get(g)!;
    return {
      clusterKey: `cluster:${g}`,
      label: g,
      count: acc.count,
      totalDegree: acc.totalDegree,
      pos: { x: acc.sx / acc.count, y: acc.sy / acc.count },
    };
  });
}

// ─── Degree → visual weight (shared by both altitudes) ──────────────────────────────────────────────
// The one mapping from a normalized degree (0..1) to the two visual channels the far-zoom weight rule
// uses: SIZE (px) and INK step (a zinc darkness 0..4). Kept here, not in the component, so v1 and v2 and
// the cluster chip all speak one weight grammar. A single-touch chip (degree 0) is the smallest/lightest;
// the moat object (degree 1) is the largest/darkest. Pure and testable.
export function degreeWeight(norm: number): { size: number; inkStep: 0 | 1 | 2 | 3 | 4 } {
  const n = Math.max(0, Math.min(1, norm));
  // 96px (single crossing) → 168px (the most-crossed object), so a moat object is unmistakably largest.
  const size = Math.round(96 + n * 72);
  const inkStep = Math.min(4, Math.round(n * 4)) as 0 | 1 | 2 | 3 | 4;
  return { size, inkStep };
}
