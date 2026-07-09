// buildWovenGraph — the ONE projector that turns the three regions of the Operator lens into a single
// woven graph (docs/INTERTWINED-CANVAS.md §2, "Backend projection — one pure function"). It COMPOSES what
// getOperatingView already returns (lanes + objects + the laneKeysByObject join) plus the per-channel
// GTMGraphs already in memory, and emits one graph of three synthetic node/edge families layered over the
// real step + gate nodes:
//
//   - obj:<objectKey>            — one synthetic node per touched OperatingObject. Kind is the ledger's
//                                  OPEN string (person / geo / keyword / page / partner / change / …), never
//                                  an enum. Carries motionCount (its degree — v2 sizes on this), bucket, and
//                                  the object's provenance receipt. The 2+-touch rule rides as `draw`: only
//                                  objects touched by 2+ motions draw individually; single-touch objects
//                                  collapse to a per-lane "+N touched once" badge (see `collapsedByLane`).
//   - tie:<channelId>:<objectKey> — one synthetic edge per (lane, object) touch, from the lane's LAST
//                                  data-producing step (or its gate, if that is later) to the object node.
//                                  Carries the touch's `verb` (real, from the ledger) and the anchor step id
//                                  so a thread can label itself ("emailed", "converted via page") and land on
//                                  the exact step. An object two motions touched has two ties converging on
//                                  one node — the intertwining is the convergence, drawn once.
//   - kind:<motionKind>          — one synthetic cluster node per distinct shape-derived motion name
//                                  (deriveMotionName over the graph's own stages — an OPEN string, never an
//                                  enum), grouping the lanes whose motion matches. A pipeline whose engine
//                                  name resolves to one kind sits in one cluster; the render straddles a
//                                  blended pipeline across two clusters by listing it in both — this function
//                                  reports every kind a lane belongs to, so nothing is forced into a bucket.
//
// NOTHING here is persisted. Every obj:/tie:/kind: id is derived fresh on each call and thrown away — the
// same deriveFunnel discipline. Change the join rule and the picture changes next call with nothing to
// migrate. Pure, read-only, honest-blind: an empty project returns empty node/edge arrays and empty
// collapse/cluster maps, never a seeded node.
//
// On the "step id already in the ledger" note in the change map: the touch ledger records
// { motionId, runId, verb, at } — it does NOT persist a per-touch step id (see normalizeTouch in
// gtm-store.mjs). So the tie's anchor step is DERIVED deterministically from the lane's own graph (its last
// data-producing step, or its gate) rather than read from a field the ledger doesn't carry. The verb IS
// read from the ledger. This keeps the tie honest without inventing a ledger field.

import { deriveMotionName } from "./engine.mjs";
import { listObjectTouches } from "./gtm-store.mjs";

// The universal framing categories that are never a motion's OWN step. A tie should anchor on the motion's
// real work (its emergent middle) or its gate — never on context/resource scaffolding or a measure/learn
// tail that produced no items to touch an object with.
const UNIVERSAL_NONWORK = new Set(["context", "resource"]);

// The graph's last DATA-PRODUCING step: the rightmost node (by position.x, the same left-to-right order the
// engine and lane layout use) that is a motion's own work — not context/resource scaffolding. This is the
// causal point where the lane last touched the world, so a tie leaving it lands at the depth the crossing
// actually happens (approach 2's mean-X intent, resolved to a real anchor node). Ties then carry that x so
// the renderer can place the object chip at the mean-X of its anchors. Falls back to the gate, then to the
// rightmost node of any kind, then null for an empty graph.
function anchorStepFor(graph) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  if (!nodes.length) return null;
  const xOf = (n) => (typeof n?.position?.x === "number" ? n.position.x : 0);

  // Prefer the rightmost real work step (the last data-producing node).
  const work = nodes.filter((n) => n?.category && !UNIVERSAL_NONWORK.has(n.category) && n.category !== "gate");
  let anchor = work.length ? work.reduce((best, n) => (xOf(n) >= xOf(best) ? n : best)) : null;

  // The gate terminates the lane; if it sits at or after the last work step, anchor the tie there instead
  // so a lane whose only downstream is its gate still ties to the object honestly.
  const gate = nodes.filter((n) => n?.category === "gate").reduce((best, n) => (!best || xOf(n) > xOf(best) ? n : best), null);
  if (gate && (!anchor || xOf(gate) >= xOf(anchor))) anchor = gate;

  // Nothing categorized — fall back to the plain rightmost node so a tie still has a home.
  if (!anchor) anchor = nodes.reduce((best, n) => (xOf(n) >= xOf(best) ? n : best));

  return anchor ? { id: anchor.id, x: xOf(anchor), category: anchor.category ?? null } : null;
}

// Build a lane index by BOTH its channel graph id and its channel id, since a touch's motionId may be
// either (the ledger records whatever the run stamped). getOperatingView keys lanes by channelId === the
// graph id, so that's the primary key; we also index by any alias the caller supplies.
function indexLanes(lanes) {
  const byKey = new Map();
  for (const lane of lanes ?? []) {
    if (lane?.channelId) byKey.set(String(lane.channelId), lane);
  }
  return byKey;
}

// The touches for one object, per lane, as { laneKey → verb }. The ledger carries one record per objectKey
// with a touches[] array; each touch names its motionId (the lane) and verb. When a lane touched an object
// more than once we keep the MOST RECENT verb (touches are appended in time order) so the tie labels itself
// with what the lane last did. A touch with no motionId can't tie to a lane and is skipped.
function versByLaneFor(record) {
  const out = new Map();
  for (const t of Array.isArray(record?.touches) ? record.touches : []) {
    const laneKey = t?.motionId ? String(t.motionId) : null;
    if (!laneKey) continue;
    // Later touches overwrite earlier — the tie carries the lane's latest verb on this object.
    out.set(laneKey, { verb: t.verb ?? null, runId: t.runId ?? null, at: t.at ?? null });
  }
  return out;
}

// buildWovenGraph(view, opts) — the projector.
//
//   view — exactly what getOperatingView returns: { projectId, lanes[], objects[], pending, ... }.
//   opts.channelGraphs — a Map<channelId, GTMGraph> of the per-channel graphs already in memory (App's
//                        channelGraphs). Used ONLY to derive each tie's anchor step and each lane's kind;
//                        never mutated. A lane with no graph here still emits ties (anchor id null) so an
//                        object it touched is not silently dropped.
//   opts.touchRecords — the raw touch ledger (listObjectTouches output). Optional: when omitted, it is read
//                        from the store using view.projectId + opts.storeOptions. Passing it in keeps the
//                        function pure and testable and avoids a second store read when the caller already
//                        has it.
//   opts.storeOptions — passed through to listObjectTouches when touchRecords is not supplied (the temp-home
//                        root in tests, etc).
//
// Returns:
//   {
//     projectId,
//     objectNodes: [{ id:"obj:<key>", objectKey, kind, label, bucket, motionCount, touchCount,
//                     draw:boolean, provenance, laneKeys:[...], anchorMeanX:number|null }],
//     ties:        [{ id:"tie:<channelId>:<key>", channelId, objectKey, verb, runId,
//                     anchorStepId:string|null, anchorX:number|null, drawn:boolean }],
//     kindClusters:[{ id:"kind:<motionKind>", motionKind, laneKeys:[...], laneCount }],
//     laneKinds:   { <laneKey>: [<motionKind>, ...] }  // every kind each lane belongs to (blended = 2+)
//     collapsedByLane: { <laneKey>: { count, objectKeys:[...] } }  // the single-touch "+N touched once" badge
//     stats: { objectCount, drawnObjectCount, collapsedObjectCount, tieCount, drawnTieCount, kindCount }
//   }
//
// The 2+-touch rule is DATA the renderer applies, not a filter here: every object is emitted with `draw`
// set, and single-touch objects are ALSO tallied into `collapsedByLane` so the renderer can show the badge
// without re-deriving anything. A `tie.drawn` mirrors its object's `draw` so a tie to a collapsed object
// isn't rendered as an individual thread.
export function buildWovenGraph(view = {}, opts = {}) {
  const projectId = view.projectId ?? "default";
  const lanesByKey = indexLanes(view.lanes);
  const channelGraphs = opts.channelGraphs instanceof Map ? opts.channelGraphs : new Map();

  // The raw ledger — passed in (pure/testable path) or read once from the store.
  const touchRecords = Array.isArray(opts.touchRecords)
    ? opts.touchRecords
    : (() => { try { return listObjectTouches(projectId, opts.storeOptions ?? {}); } catch { return []; } })();
  const recordByKey = new Map();
  for (const r of touchRecords) {
    if (r?.objectKey) recordByKey.set(String(r.objectKey), r);
  }

  // Precompute each lane's anchor step once (used by every tie leaving that lane).
  const anchorByLane = new Map();
  for (const laneKey of lanesByKey.keys()) {
    const graph = channelGraphs.get(laneKey) ?? null;
    anchorByLane.set(laneKey, anchorStepFor(graph));
  }

  const objectNodes = [];
  const ties = [];
  const collapsedByLane = new Map(); // laneKey → { count, objectKeys[] }

  for (const obj of view.objects ?? []) {
    const objectKey = obj.objectKey;
    if (!objectKey) continue;
    const motionCount = obj.motionCount ?? 0;
    // The load-bearing scale rule: only objects 2+ motions touch draw individually.
    const draw = motionCount >= 2;

    objectNodes.push({
      id: `obj:${objectKey}`,
      objectKey,
      kind: obj.kind ?? null,
      label: obj.label ?? null,
      bucket: obj.bucket ?? null,
      motionCount,
      touchCount: obj.touchCount ?? 0,
      draw,
      provenance: obj.provenance ?? null,
      laneKeys: Array.isArray(obj.lanes) ? [...obj.lanes] : [],
      // Filled below once its ties' anchor xs are known (the mean-X placement rule, v1).
      anchorMeanX: null,
    });

    const versByLane = versByLaneFor(recordByKey.get(objectKey));
    const anchorXs = [];
    for (const laneKey of obj.lanes ?? []) {
      const anchor = anchorByLane.get(laneKey) ?? null;
      const touchMeta = versByLane.get(laneKey) ?? null;
      if (typeof anchor?.x === "number") anchorXs.push(anchor.x);
      ties.push({
        id: `tie:${laneKey}:${objectKey}`,
        channelId: laneKey,
        objectKey,
        verb: touchMeta?.verb ?? null,
        runId: touchMeta?.runId ?? null,
        anchorStepId: anchor?.id ?? null,
        anchorX: typeof anchor?.x === "number" ? anchor.x : null,
        // A tie to a collapsed (single-touch) object is not drawn as an individual thread; it rides the
        // per-lane count badge instead. Mirrors the object's draw so the renderer never re-derives it.
        drawn: draw,
      });
    }

    // The mean-X placement (v1): the object chip sits at the causal depth its touches happen at.
    const objNode = objectNodes[objectNodes.length - 1];
    objNode.anchorMeanX = anchorXs.length ? anchorXs.reduce((a, b) => a + b, 0) / anchorXs.length : null;

    // Single-touch collapse: tally the object into the one lane that touched it, so the renderer can draw a
    // "+N touched once" badge on that lane instead of an individual chip + thread.
    if (!draw) {
      const laneKey = (obj.lanes ?? [])[0] ?? null;
      if (laneKey) {
        const entry = collapsedByLane.get(laneKey) ?? { count: 0, objectKeys: [] };
        entry.count += 1;
        entry.objectKeys.push(objectKey);
        collapsedByLane.set(laneKey, entry);
      }
    }
  }

  // Kind clusters — group lanes by their shape-derived motion name (deriveMotionName over the graph's own
  // stages). A lane's kind is the graph's composer-given name when it has one (the real, goal-specific
  // identity), else its first-stage fallback — exactly what the engine and efficiency table key on, so the
  // cluster a lane joins is the SAME kind its efficiency row lives under. A lane with no loaded graph falls
  // back to the lane's own reported motionKind so it still clusters honestly rather than vanishing.
  const clusterMembers = new Map(); // motionKind → Set(laneKey)
  const laneKinds = {}; // laneKey → [motionKind, ...] (every kind a lane belongs to; 2+ = blended/straddling)
  for (const [laneKey, lane] of lanesByKey) {
    const graph = channelGraphs.get(laneKey) ?? null;
    // deriveMotionName wants the graph's own stage categories; when we have the graph, derive from it, else
    // trust the lane's precomputed motionKind (getOperatingView set it from the same engine read).
    const kinds = kindsForLane(graph, lane);
    laneKinds[laneKey] = kinds;
    for (const k of kinds) {
      if (!clusterMembers.has(k)) clusterMembers.set(k, new Set());
      clusterMembers.get(k).add(laneKey);
    }
  }
  const kindClusters = [...clusterMembers.entries()]
    .map(([motionKind, set]) => ({
      id: `kind:${motionKind}`,
      motionKind,
      laneKeys: [...set].sort(),
      laneCount: set.size,
    }))
    .sort((a, b) => b.laneCount - a.laneCount || a.motionKind.localeCompare(b.motionKind));

  const drawnObjectCount = objectNodes.filter((o) => o.draw).length;
  const drawnTieCount = ties.filter((t) => t.drawn).length;

  return {
    projectId,
    objectNodes,
    ties,
    kindClusters,
    laneKinds,
    collapsedByLane: Object.fromEntries(collapsedByLane),
    stats: {
      objectCount: objectNodes.length,
      drawnObjectCount,
      collapsedObjectCount: objectNodes.length - drawnObjectCount,
      tieCount: ties.length,
      drawnTieCount,
      kindCount: kindClusters.length,
    },
  };
}

// The kind(s) a lane belongs to. Primary: the shape-derived motion name from its own graph (the un-caging —
// an open string from deriveMotionName over the stages actually present, never an enum). When the lane has
// no loaded graph, fall back to its precomputed motionKind so it still clusters. A lane may report more than
// one kind only when a caller explicitly supplies additional blend kinds on the lane (lane.blendKinds) —
// this is how a pipeline whose shape straddles two motions is drawn in BOTH clusters rather than forced into
// one. We never invent a second kind; a single-shape lane returns exactly one.
function kindsForLane(graph, lane) {
  const kinds = [];
  const primary = motionKindFromGraph(graph) ?? (lane?.motionKind ? String(lane.motionKind) : null);
  if (primary) kinds.push(primary);
  // Honest straddling: if the lane itself reports blend kinds (a shape the composer flagged as spanning two
  // motions), include them so the render straddles both clusters. Open strings, de-duped, never forced.
  for (const b of Array.isArray(lane?.blendKinds) ? lane.blendKinds : []) {
    const k = b ? String(b) : null;
    if (k && !kinds.includes(k)) kinds.push(k);
  }
  // A lane with nothing to name at all still gets one honest bucket so it clusters rather than vanishing.
  if (!kinds.length) kinds.push(lane?.name ? String(lane.name) : "GTM loop");
  return kinds;
}

// The motion's shape-derived name from its graph — the same derivation the engine and efficiency table use
// (deriveMotionName over the graph's own emergent stage categories, preferring a composer-given graph name).
// Null when there is no graph to name, so the caller can fall back to the lane's precomputed kind.
function motionKindFromGraph(graph) {
  if (!graph || !Array.isArray(graph.nodes) || !graph.nodes.length) return null;
  // The emergent stage categories, left-to-right, excluding the universal framing (deriveMotionName names
  // after the first EMERGENT stage). We reuse the engine's rule: a motion's own stages are its non-universal
  // categories; a composer-given graph.name wins regardless (deriveMotionName handles that).
  const UNIVERSAL = new Set(["context", "gate", "measure", "learn", "resource"]);
  const seen = new Set();
  const cats = [];
  const sorted = [...graph.nodes].sort((a, b) => (a.position?.x ?? 0) - (b.position?.x ?? 0));
  for (const n of sorted) {
    const cat = n?.category;
    if (!cat || UNIVERSAL.has(cat) || seen.has(cat)) continue;
    seen.add(cat);
    cats.push(cat);
  }
  return deriveMotionName(cats, graph.name ?? null);
}
