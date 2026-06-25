// ConceptualLens — the object graph: things are nodes, relationships are the labelled lines
// between them. The DEFAULT Product lens.
//
// Ported from the original single-canvas ProductFlowCanvas (the React Flow node/edge setup, the
// id-or-name edge resolution, the states-by-thing and signal-by-thing maps, the drag-to-pin and
// re-layout-on-topology-change behaviour). Two things changed in the port:
//   1. The node draws the shared ObjectCard (one card for every lens) instead of a bespoke card.
//   2. The DEFAULT layout is a RADIAL HUB, not a flat DAG grid. A flat grid has no focal point — a
//      design critic flagged it reads as "everything matters equally." The radial layout puts the
//      center-of-gravity object (the most-connected thing) in the middle and orbits the rest in
//      rings by how few relationship-hops away they are, so the eye lands on the heart of the
//      product first. Two other layouts stay one click away: "tiered" groups by role (actor /
//      event / artifact / entity columns), and "free" is the original left→right DAG rank.
//
// Calm monochrome, rationed colour (green derived / amber guess), provenance load-bearing — a
// speculative thing is ghosted and tagged by ObjectCard automatically. States render as chips on
// their thing; a pinned real-world signal lights a small "live" marker.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background, Controls, Handle, Panel, Position, ReactFlow, useReactFlow,
  type Edge, type Node, type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { ProductModel, ProductModelEdit, ProductStateElement, ProductThing } from "@/types";
import { ObjectCard, computeLayout, kindVisual, type LayoutEdge, type LayoutPos } from "@/components/lenses/shared";
import "./ConceptualLens.css";

export type LensProps = {
  model: ProductModel;
  selected: string | null;
  onSelect: (id: string) => void;
  onRevise: (edit: ProductModelEdit) => void;
};

type LayoutMode = "radial" | "tiered" | "free";

// ─── Thing node ───────────────────────────────────────────────────────────────
// Wraps the shared ObjectCard in a React-Flow node body: the card is identical to every other
// lens, the Handles + `asReactFlowNode` (which drops the hover-lift that fights RF positioning) are
// the only flow-specific additions.

type ThingNodeData = {
  thing: ProductThing;
  states: ProductStateElement[];
  hasSignal: boolean;
  selected: boolean;
  focal: boolean;
  onSelect: () => void;
};

function ThingNodeComponent({ data }: NodeProps<Node<ThingNodeData>>) {
  const { thing, states, hasSignal, selected, focal, onSelect } = data;
  return (
    <>
      <Handle type="target" position={Position.Left} className="product-handle" />
      <ObjectCard
        kind={thing.kind}
        name={thing.name}
        summary={thing.summary}
        provenance={thing.provenance}
        citationCount={thing.evidence?.length ?? 0}
        states={states.map((s) => ({ id: s.id, label: s.name }))}
        hasSignal={hasSignal}
        selected={selected}
        focal={focal}
        onSelect={onSelect}
        asReactFlowNode
      />
      <Handle type="source" position={Position.Right} className="product-handle" />
    </>
  );
}

const NODE_TYPES = { thingNode: ThingNodeComponent };

// Fit the viewport to the graph after mount AND after the Product overlay's open animation settles.
// A single fit-on-init mis-measures because the overlay container is still mid-animation (near-zero
// width), which is why the lens was opening at a microscopic ~25% zoom. Fitting again on a short
// delay — and whenever the layout/topology changes — lands a readable zoom every time. This calls
// the imperative fitView API; it sets no React state, so it doesn't trip the set-state-in-effect rule.
function FitOnChange({ dep }: { dep: string }) {
  const rf = useReactFlow();
  useEffect(() => {
    const fit = () => { try { rf.fitView({ padding: 0.2, duration: 200 }); } catch { /* canvas not mounted yet */ } };
    const raf = requestAnimationFrame(fit);
    const settle = setTimeout(fit, 260);
    return () => { cancelAnimationFrame(raf); clearTimeout(settle); };
  }, [dep, rf]);
  return null;
}

// ─── Radial-hub layout ─────────────────────────────────────────────────────────
// The fix for the "flat grid, no focal" flaw. Pick the center-of-gravity thing (most relationships,
// ties broken by citation count then name), drop it at the origin, then ring everything else by its
// hop-distance from the hub: closest things on the inner ring, the rest further out. Within a ring
// the nodes spread evenly around the circle. Disconnected things (no path to the hub) land on an
// outermost ring so they're visibly peripheral, not pretending to be core.

// Ring 1 sits just clear of the focal hub card; outer rings step in tightly so the WHOLE graph fits
// the pane at a readable zoom. The old flat "ring × 300" spread the graph over ~2700px, which forced
// fitView to a microscopic ~0.2 zoom no matter how correctly it fit.
const RING0 = 300;     // first ring radius (clears the ~268px focal hub)
const RING_STEP = 230; // added per ring beyond the first

function computeRadialLayout(
  thingIds: string[],
  edges: LayoutEdge[],
  degree: Map<string, number>,
  citationCount: Map<string, number>,
): Map<string, LayoutPos> {
  const pos = new Map<string, LayoutPos>();
  if (thingIds.length === 0) return pos;

  // Undirected adjacency — relationships are a "how close" signal regardless of direction.
  const adj = new Map<string, Set<string>>(thingIds.map((id) => [id, new Set<string>()]));
  const ids = new Set(thingIds);
  for (const e of edges) {
    if (!ids.has(e.from) || !ids.has(e.to) || e.from === e.to) continue;
    adj.get(e.from)!.add(e.to);
    adj.get(e.to)!.add(e.from);
  }

  // Center of gravity: most-connected thing, tie-broken by citations, then name-stable order.
  const hub = [...thingIds].sort((a, b) => {
    const dd = (degree.get(b) ?? 0) - (degree.get(a) ?? 0);
    if (dd !== 0) return dd;
    const cc = (citationCount.get(b) ?? 0) - (citationCount.get(a) ?? 0);
    if (cc !== 0) return cc;
    return a.localeCompare(b);
  })[0];

  // BFS hop-distance from the hub → ring index.
  const hop = new Map<string, number>([[hub, 0]]);
  const queue = [hub];
  while (queue.length) {
    const id = queue.shift()!;
    for (const next of adj.get(id) ?? []) {
      if (!hop.has(next)) {
        hop.set(next, (hop.get(id) ?? 0) + 1);
        queue.push(next);
      }
    }
  }
  // Disconnected things join the OUTERMOST connected ring rather than adding a new ring beyond it —
  // an extra ring tripled the span and forced fitView to a microscopic zoom.
  const maxHop = Math.max(0, ...[...hop.values()]);
  for (const id of thingIds) if (!hop.has(id)) hop.set(id, Math.max(1, maxHop));

  // Group by ring, then fan each ring evenly around the circle.
  const byRing = new Map<number, string[]>();
  for (const id of thingIds) {
    const r = hop.get(id) ?? 0;
    if (!byRing.has(r)) byRing.set(r, []);
    byRing.get(r)!.push(id);
  }
  // Flatten the rings into WIDE ellipses (y squashed) so the radial's aspect roughly matches the
  // landscape lens pane (~1.9:1). A near-square radial made height the binding constraint, pinning
  // fitView to a microscopic zoom even after the radius shrink; ellipses let it open ~0.55.
  const Y_SQUASH = 0.58;
  let outerRadius = RING0;
  for (const [ring, group] of byRing) {
    if (ring === 0) {
      pos.set(group[0], { x: 0, y: 0 });
      continue;
    }
    const radius = RING0 + (ring - 1) * RING_STEP;
    outerRadius = Math.max(outerRadius, radius);
    const n = group.length;
    // Offset alternating rings by half a slot so spokes don't line up into visual columns.
    const phase = (ring % 2) * (Math.PI / Math.max(n, 1));
    group.forEach((id, i) => {
      const angle = phase + (i / n) * Math.PI * 2;
      pos.set(id, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius * Y_SQUASH });
    });
  }
  // Safety net: any thing the ring pass didn't place would otherwise fall back to (0,0) and pile
  // invisibly on the hub. Fan the strays onto an arc just past the outer ring instead.
  const unplaced = thingIds.filter((id) => !pos.has(id));
  unplaced.forEach((id, i) => {
    const angle = (i / Math.max(unplaced.length, 1)) * Math.PI * 2 + Math.PI / 4;
    const r = outerRadius + RING_STEP;
    pos.set(id, { x: Math.cos(angle) * r, y: Math.sin(angle) * r * Y_SQUASH });
  });
  return pos;
}

// ─── Tiered-by-role layout ─────────────────────────────────────────────────────
// Group things into columns by what they ARE (the kindVisual label: Actor / Event / Artifact /
// Entity / …), each column stacked and vertically centered. Reads the product as roles, not flow.

const TIER_COL_GAP = 320;
const TIER_ROW_GAP = 168;
const ROLE_ORDER = ["Actor", "Goal", "Event", "Entity", "Artifact", "Screen", "Section", "Action", "Flow", "Thing"];

function computeTieredLayout(things: ProductThing[]): Map<string, LayoutPos> {
  const byRole = new Map<string, string[]>();
  for (const t of things) {
    const role = kindVisual(t.kind).label;
    if (!byRole.has(role)) byRole.set(role, []);
    byRole.get(role)!.push(t.id);
  }
  const roles = [...byRole.keys()].sort((a, b) => {
    const ia = ROLE_ORDER.indexOf(a), ib = ROLE_ORDER.indexOf(b);
    return (ia === -1 ? ROLE_ORDER.length : ia) - (ib === -1 ? ROLE_ORDER.length : ib) || a.localeCompare(b);
  });
  const pos = new Map<string, LayoutPos>();
  roles.forEach((role, col) => {
    const group = byRole.get(role)!;
    const total = group.length;
    group.forEach((id, i) => {
      pos.set(id, { x: col * TIER_COL_GAP, y: (i - (total - 1) / 2) * TIER_ROW_GAP });
    });
  });
  return pos;
}

const LAYOUTS: { id: LayoutMode; label: string; hint: string }[] = [
  { id: "radial", label: "Radial", hint: "Core object in the middle, the rest orbiting by closeness" },
  { id: "tiered", label: "By role", hint: "Grouped into columns by what each object is" },
  { id: "free", label: "Free", hint: "Left-to-right by how relationships flow" },
];

// ─── Lens ────────────────────────────────────────────────────────────────────

export function ConceptualLens({ model, selected, onSelect, onRevise }: LensProps) {
  const [layout, setLayout] = useState<LayoutMode>("radial");
  // Manual drag overrides, keyed by their (layout, topology) pair. The base layout is computed
  // during render (useMemo); only a founder's hand-placement lives in state, layered on top. A
  // layout switch or topology change re-keys the overrides, so the new base wins — which is the
  // whole point of switching.
  const [drags, setDrags] = useState<{ key: string; pos: Map<string, LayoutPos> }>(
    { key: "", pos: new Map() },
  );

  const things = useMemo(() => model.things ?? [], [model]);

  // Things can be referenced by id OR by name in relationships/states — resolve both (ported).
  const idByRef = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of things) {
      map.set(t.id, t.id);
      if (t.name) map.set(t.name.toLowerCase(), t.id);
    }
    return map;
  }, [things]);

  type Resolved = { id: string; from: string; to: string; label: string; speculative: boolean };
  const resolvedEdges = useMemo<Resolved[]>(() => {
    const out: Resolved[] = [];
    for (const r of model.relationships ?? []) {
      const from = idByRef.get(r.from) ?? idByRef.get((r.from || "").toLowerCase());
      const to = idByRef.get(r.to) ?? idByRef.get((r.to || "").toLowerCase());
      if (!from || !to) continue;
      out.push({ id: r.id, from, to, label: r.label, speculative: r.provenance === "speculative" });
    }
    return out;
  }, [model, idByRef]);

  const statesByThing = useMemo(() => {
    const map = new Map<string, ProductStateElement[]>();
    for (const s of model.states ?? []) {
      const tid = idByRef.get(s.thingId) ?? idByRef.get((s.thingId || "").toLowerCase());
      if (!tid) continue;
      if (!map.has(tid)) map.set(tid, []);
      map.get(tid)!.push(s);
    }
    return map;
  }, [model, idByRef]);

  const signalThingIds = useMemo(() => {
    const set = new Set<string>();
    for (const p of model.pinnedSignals ?? []) {
      if (p.target.kind === "thing" && p.target.id) {
        const tid = idByRef.get(p.target.id) ?? idByRef.get(p.target.id.toLowerCase());
        if (tid) set.add(tid);
      }
    }
    return set;
  }, [model, idByRef]);

  // Degree + citation maps feed the radial hub pick.
  const degree = useMemo(() => {
    const d = new Map<string, number>(things.map((t) => [t.id, 0]));
    for (const e of resolvedEdges) {
      d.set(e.from, (d.get(e.from) ?? 0) + 1);
      d.set(e.to, (d.get(e.to) ?? 0) + 1);
    }
    return d;
  }, [things, resolvedEdges]);
  const citationCount = useMemo(
    () => new Map<string, number>(things.map((t) => [t.id, t.evidence?.length ?? 0])),
    [things],
  );

  const layoutEdges = useMemo<LayoutEdge[]>(
    () => resolvedEdges.map((e) => ({ from: e.from, to: e.to })),
    [resolvedEdges],
  );

  // The center of gravity — same pick the radial layout uses (most-connected, tie-broken by
  // citations then name). Marked focal so the hub card renders monumental, giving the lens the
  // visual heart the "flat grid" version lacked. Only meaningful in the radial layout.
  const hubId = useMemo(() => {
    const ids = things.map((t) => t.id);
    if (!ids.length) return null;
    return [...ids].sort((a, b) => {
      const dd = (degree.get(b) ?? 0) - (degree.get(a) ?? 0);
      if (dd !== 0) return dd;
      const cc = (citationCount.get(b) ?? 0) - (citationCount.get(a) ?? 0);
      if (cc !== 0) return cc;
      return a.localeCompare(b);
    })[0];
  }, [things, degree, citationCount]);

  // The base layout is computed during render from the (layout, topology) pair — no effect, no
  // cascading setState. A manual drag survives a re-render but not a layout switch or topology
  // change (the whole point of switching is to re-place).
  const topology = useMemo(
    () => `${things.map((t) => t.id).sort().join(",")}|${layoutEdges.map((e) => `${e.from}>${e.to}`).sort().join(",")}`,
    [things, layoutEdges],
  );
  const layoutKey = `${layout}::${topology}`;
  const basePositions = useMemo<Map<string, LayoutPos>>(() => {
    const ids = things.map((t) => t.id);
    if (layout === "radial") return computeRadialLayout(ids, layoutEdges, degree, citationCount);
    if (layout === "tiered") return computeTieredLayout(things);
    return computeLayout(ids, layoutEdges);
  }, [layout, things, layoutEdges, degree, citationCount]);

  // Drag overrides only apply while their key matches the current layout+topology; otherwise the
  // fresh base layout wins.
  const dragPos = drags.key === layoutKey ? drags.pos : null;

  const nodes = useMemo<Node[]>(() => things.map((t) => ({
    id: t.id,
    type: "thingNode",
    position: dragPos?.get(t.id) ?? basePositions.get(t.id) ?? { x: 0, y: 0 },
    draggable: true,
    selectable: false,
    data: {
      thing: t,
      states: statesByThing.get(t.id) ?? [],
      hasSignal: signalThingIds.has(t.id),
      selected: selected === t.id,
      focal: layout === "radial" && t.id === hubId,
      onSelect: () => onSelect(t.id),
    } as ThingNodeData,
  })), [things, dragPos, basePositions, statesByThing, signalThingIds, selected, onSelect, layout, hubId]);

  const edges = useMemo<Edge[]>(() => resolvedEdges.map((e) => ({
    id: e.id,
    source: e.from,
    target: e.to,
    label: e.label,
    type: "smoothstep",
    className: e.speculative ? "product-edge product-edge-spec" : "product-edge",
  })), [resolvedEdges]);

  const handleNodeDragStop = useCallback((_e: unknown, node: Node) => {
    setDrags((prev) => {
      const base = prev.key === layoutKey ? prev.pos : new Map<string, LayoutPos>();
      return { key: layoutKey, pos: new Map(base).set(node.id, node.position) };
    });
  }, [layoutKey]) as Parameters<typeof ReactFlow>[0]["onNodeDragStop"];

  // Founder edit: rename / re-summarize the selected thing (the inline editor, ported). Persists
  // through the shared onRevise — the only mutation this lens makes.
  const selectedThing = things.find((t) => t.id === selected) ?? null;
  const saveThing = useCallback((id: string, patch: Partial<ProductThing>) => {
    onRevise({ things: things.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
  }, [onRevise, things]);

  const speculativeCount = things.filter((t) => t.provenance === "speculative").length;
  const liveCount = signalThingIds.size;

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      onNodeDragStop={handleNodeDragStop}
      onPaneClick={() => onSelect("")}
      fitView
      fitViewOptions={{ padding: 0.18 }}
      minZoom={0.2}
      maxZoom={1.8}
      nodesConnectable={false}
      edgesReconnectable={false}
      proOptions={{ hideAttribution: true }}
    >
      <FitOnChange dep={layoutKey} />

      {/* Layout switcher — radial default, then by-role and free. */}
      <Panel position="top-right">
        <div className="lens-panel conceptual-layouts lens-panel-dock">
          <div className="lens-panel-title">Layout</div>
          <div className="conceptual-layout-row" role="radiogroup" aria-label="Graph layout">
            {LAYOUTS.map((l) => (
              <button
                key={l.id}
                type="button"
                role="radio"
                aria-checked={layout === l.id}
                title={l.hint}
                className={layout === l.id ? "conceptual-layout-btn is-active" : "conceptual-layout-btn"}
                onClick={() => setLayout(l.id)}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
      </Panel>

      {/* Legend — the rationed colour, said once so the canvas itself stays quiet. */}
      <Panel position="bottom-right">
        <div className="lens-panel conceptual-legend lens-panel-dock">
          <span className="conceptual-legend-item">
            <span className="conceptual-swatch conceptual-swatch-derived" /> derived from code
          </span>
          <span className="conceptual-legend-item">
            <span className="conceptual-swatch conceptual-swatch-guess" /> guess{speculativeCount > 0 ? ` · ${speculativeCount}` : ""}
          </span>
          {liveCount > 0 && (
            <span className="conceptual-legend-item">
              <span className="conceptual-swatch conceptual-swatch-live" /> live signal · {liveCount}
            </span>
          )}
        </div>
      </Panel>

      {/* Inline editor for the selected object (ported). */}
      {selectedThing && (
        <Panel position="bottom-left">
          <div className="lens-panel conceptual-editor lens-panel-dock">
            <div className="conceptual-editor-head">
              <span className="lens-panel-title">Edit object</span>
              <button className="conceptual-editor-close" onClick={() => onSelect("")} type="button" aria-label="Close editor">×</button>
            </div>
            <input
              className="conceptual-editor-name"
              defaultValue={selectedThing.name}
              key={`${selectedThing.id}-name-${model.version}`}
              onBlur={(e) => { if (e.target.value !== selectedThing.name) saveThing(selectedThing.id, { name: e.target.value }); }}
              placeholder="Name"
            />
            <textarea
              className="conceptual-editor-summary"
              defaultValue={selectedThing.summary}
              key={`${selectedThing.id}-sum-${model.version}`}
              onBlur={(e) => { if (e.target.value !== selectedThing.summary) saveThing(selectedThing.id, { summary: e.target.value }); }}
              placeholder="What is this object, in plain words?"
              rows={3}
            />
            <div className="conceptual-editor-foot">Changes are remembered — every edit bumps the version.</div>
          </div>
        </Panel>
      )}

      <Background color="var(--canvas-dot)" gap={26} size={1.5} />
      <Controls showInteractive={false} position="bottom-left" />
    </ReactFlow>
  );
}
