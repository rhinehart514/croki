import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background, Controls, Handle, Panel, Position, ReactFlow,
  type Edge, type Node, type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowRight, Box, Circle, FileText, RefreshCw, Lightbulb, User, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  ProductModel, ProductModelEdit, ProductStateElement, ProductThing,
} from "@/types";

// The product picture is a GRAPH, not a list: things are nodes, relationships are the lines
// between them. This canvas renders the founder-editable INTERPRETATION model in the same React
// Flow visual language as the GTM graph, so GTM mode and Product mode read as one tool. Provenance
// is load-bearing in the rendering: a "derived" thing (grounded in real code) is solid; a
// "speculative" thing (a model/founder guess) is ghosted and tagged, so a guess can never read as
// a proven fact — the same anti-pollution discipline the context provider enforces in text.

// ─── Kind → visual ────────────────────────────────────────────────────────────
// `kind` is free text from the modeler (entity / actor / artifact / event). Normalize loosely so a
// near-miss ("person", "user") still gets a sensible icon rather than the fallback circle.
function kindVisual(kind: string): { icon: React.ReactNode; label: string } {
  const k = (kind || "").toLowerCase();
  if (k.includes("actor") || k.includes("user") || k.includes("person") || k.includes("role"))
    return { icon: <User />, label: "Actor" };
  if (k.includes("event") || k.includes("trigger") || k.includes("signal"))
    return { icon: <Zap />, label: "Event" };
  if (k.includes("artifact") || k.includes("doc") || k.includes("file") || k.includes("record"))
    return { icon: <FileText />, label: "Artifact" };
  if (k.includes("entity") || k.includes("object") || k.includes("thing"))
    return { icon: <Box />, label: "Entity" };
  return { icon: <Circle />, label: kind ? kind.replace(/^\w/, (c) => c.toUpperCase()) : "Thing" };
}

// ─── Thing node ───────────────────────────────────────────────────────────────

type ThingNodeData = {
  thing: ProductThing;
  states: ProductStateElement[];
  hasSignal: boolean;
  selected: boolean;
  onSelect: () => void;
};

function ThingNodeComponent({ data }: NodeProps<Node<ThingNodeData>>) {
  const { thing, states, hasSignal, selected, onSelect } = data;
  const visual = kindVisual(thing.kind);
  const speculative = thing.provenance === "speculative";
  const citeCount = thing.evidence?.length ?? 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "product-node",
        speculative && "product-node-speculative",
        selected && "product-node-selected",
      )}
    >
      <Handle type="target" position={Position.Left} className="product-handle" />
      <div className="product-node-head">
        <span className="product-node-icon">{visual.icon}</span>
        <span className="product-node-kind">{visual.label}</span>
        {hasSignal && (
          <span className="product-node-live" title="Real-world feedback is pinned to this object">
            <span className="product-node-live-dot" /> live
          </span>
        )}
        <span
          className={cn("product-prov", speculative ? "product-prov-spec" : "product-prov-derived")}
          title={speculative
            ? "Speculative — a model or founder guess, not proven from code"
            : `Derived — grounded in ${citeCount} code citation${citeCount === 1 ? "" : "s"}`}
        >
          {speculative ? "guess" : citeCount > 0 ? `${citeCount} cited` : "derived"}
        </span>
      </div>
      <div className="product-node-name">{thing.name || "Untitled"}</div>
      {thing.summary && <div className="product-node-summary">{thing.summary}</div>}
      {states.length > 0 && (
        <div className="product-node-states" title="Lifecycle states">
          {states.map((s) => (
            <span key={s.id} className="product-state-pill">{s.name}</span>
          ))}
        </div>
      )}
      <Handle type="source" position={Position.Right} className="product-handle" />
    </button>
  );
}

const NODE_TYPES = { thingNode: ThingNodeComponent };

// ─── Layout (DAG rank, mirrors GraphCanvas.computeLayout) ──────────────────────

const COLUMN_GAP = 320;
const ROW_GAP = 168;

type Resolved = { id: string; from: string; to: string; label: string; speculative: boolean };

function computeLayout(thingIds: string[], edges: Resolved[]): Map<string, { x: number; y: number }> {
  const ids = new Set(thingIds);
  const adj = new Map<string, string[]>(thingIds.map((id) => [id, []]));
  const indeg = new Map<string, number>(thingIds.map((id) => [id, 0]));
  for (const e of edges) {
    if (!ids.has(e.from) || !ids.has(e.to) || e.from === e.to) continue;
    adj.get(e.from)!.push(e.to);
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  }
  const rank = new Map<string, number>(thingIds.map((id) => [id, 0]));
  const queue = thingIds.filter((id) => (indeg.get(id) ?? 0) === 0);
  const deg = new Map(indeg);
  while (queue.length) {
    const id = queue.shift()!;
    for (const next of adj.get(id) ?? []) {
      rank.set(next, Math.max(rank.get(next) ?? 0, (rank.get(id) ?? 0) + 1));
      deg.set(next, (deg.get(next) ?? 0) - 1);
      if ((deg.get(next) ?? 0) === 0) queue.push(next);
    }
  }
  const byRank = new Map<number, string[]>();
  for (const id of thingIds) {
    const r = rank.get(id) ?? 0;
    if (!byRank.has(r)) byRank.set(r, []);
    byRank.get(r)!.push(id);
  }
  const pos = new Map<string, { x: number; y: number }>();
  for (const [r, group] of byRank) {
    const total = group.length;
    group.forEach((id, i) => {
      pos.set(id, { x: r * COLUMN_GAP, y: (i - (total - 1) / 2) * ROW_GAP });
    });
  }
  return pos;
}

// ─── Canvas ────────────────────────────────────────────────────────────────────

export function ProductFlowCanvas({
  model, productName, busy, onDerive, onRevise, onExitToGtm,
}: {
  model: ProductModel | null;
  productName: string;
  busy: boolean;
  onDerive: () => void;
  onRevise: (edit: ProductModelEdit) => void;
  onExitToGtm?: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(new Map());

  const things = useMemo(() => model?.things ?? [], [model]);

  // Things can be referenced by id OR by name in relationships/states — resolve both.
  const idByRef = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of things) {
      map.set(t.id, t.id);
      if (t.name) map.set(t.name.toLowerCase(), t.id);
    }
    return map;
  }, [things]);

  const resolvedEdges = useMemo<Resolved[]>(() => {
    const out: Resolved[] = [];
    for (const r of model?.relationships ?? []) {
      const from = idByRef.get(r.from) ?? idByRef.get((r.from || "").toLowerCase());
      const to = idByRef.get(r.to) ?? idByRef.get((r.to || "").toLowerCase());
      if (!from || !to) continue;
      out.push({ id: r.id, from, to, label: r.label, speculative: r.provenance === "speculative" });
    }
    return out;
  }, [model, idByRef]);

  const statesByThing = useMemo(() => {
    const map = new Map<string, ProductStateElement[]>();
    for (const s of model?.states ?? []) {
      const tid = idByRef.get(s.thingId) ?? idByRef.get((s.thingId || "").toLowerCase());
      if (!tid) continue;
      if (!map.has(tid)) map.set(tid, []);
      map.get(tid)!.push(s);
    }
    return map;
  }, [model, idByRef]);

  const signalThingIds = useMemo(() => {
    const set = new Set<string>();
    for (const p of model?.pinnedSignals ?? []) {
      if (p.target.kind === "thing" && p.target.id) {
        const tid = idByRef.get(p.target.id) ?? idByRef.get(p.target.id.toLowerCase());
        if (tid) set.add(tid);
      }
    }
    return set;
  }, [model, idByRef]);

  // Re-layout whenever the set of things/relationships changes; preserve manual drags otherwise.
  const topology = useMemo(
    () => `${things.map((t) => t.id).sort().join(",")}|${resolvedEdges.map((e) => `${e.from}>${e.to}`).sort().join(",")}`,
    [things, resolvedEdges],
  );
  const lastTopology = useRef<string | null>(null);
  useEffect(() => {
    if (topology === lastTopology.current) return;
    lastTopology.current = topology;
    setPositions(computeLayout(things.map((t) => t.id), resolvedEdges));
  }, [topology, things, resolvedEdges]);

  const nodes = useMemo<Node[]>(() => things.map((t) => ({
    id: t.id,
    type: "thingNode",
    position: positions.get(t.id) ?? { x: 0, y: 0 },
    draggable: true,
    selectable: false,
    data: {
      thing: t,
      states: statesByThing.get(t.id) ?? [],
      hasSignal: signalThingIds.has(t.id),
      selected: selected === t.id,
      onSelect: () => setSelected(t.id),
    } as ThingNodeData,
  })), [things, positions, statesByThing, signalThingIds, selected]);

  const edges = useMemo<Edge[]>(() => resolvedEdges.map((e) => ({
    id: e.id,
    source: e.from,
    target: e.to,
    label: e.label,
    type: "smoothstep",
    className: e.speculative ? "product-edge product-edge-spec" : "product-edge",
  })), [resolvedEdges]);

  const handleNodeDragStop = useCallback((_e: unknown, node: Node) => {
    setPositions((prev) => new Map(prev).set(node.id, node.position));
  }, []) as Parameters<typeof ReactFlow>[0]["onNodeDragStop"];

  const citedCount = things.filter((t) => t.provenance === "derived").length;
  const guessCount = things.length - citedCount;
  const selectedThing = things.find((t) => t.id === selected) ?? null;

  const saveThing = useCallback((id: string, patch: Partial<ProductThing>) => {
    onRevise({ things: things.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
  }, [onRevise, things]);

  // Empty — no picture yet. Invite the founder to derive the first draft.
  if (!model || things.length === 0) {
    return (
      <div className="product-canvas-empty">
        <Lightbulb className="product-empty-icon" />
        <h2>No picture yet</h2>
        <p>
          Draw the first picture of <strong>{productName}</strong> — its core objects, how they
          relate, and what people come to do. It reads your code and hands you a draft to correct.
        </p>
        <button className="product-derive-btn" onClick={onDerive} disabled={busy} type="button">
          {busy ? <><RefreshCw className="spin" /> Reading the product…</> : <><Lightbulb /> Draw the picture</>}
        </button>
      </div>
    );
  }

  return (
    <div className="product-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        onNodeDragStop={handleNodeDragStop}
        onPaneClick={() => setSelected(null)}
        fitView
        fitViewOptions={{ padding: 0.16 }}
        minZoom={0.2}
        maxZoom={1.8}
        nodesConnectable={false}
        edgesReconnectable={false}
        proOptions={{ hideAttribution: true }}
      >
        {/* Header — what this picture is and how grounded it is. */}
        <Panel position="top-left">
          <div className="product-head-panel">
            <div className="product-head-title">
              <span className="product-head-name">{productName}</span>
              <span className="product-head-meta">
                v{model.version} · {model.generatedBy === "claude" ? "drawn from code" : model.generatedBy}
              </span>
            </div>
            <div className="product-head-counts">
              <span className="product-count product-count-cited" title="Objects grounded in real code">{citedCount} cited</span>
              {guessCount > 0 && <span className="product-count product-count-guess" title="Objects that are interpretive guesses">{guessCount} guess{guessCount === 1 ? "" : "es"}</span>}
            </div>
            <button className="product-rederive-btn" onClick={onDerive} disabled={busy} type="button" title="Redraw the picture from the product code">
              {busy ? <RefreshCw className="spin" /> : <RefreshCw />} {busy ? "Redrawing…" : "Redraw"}
            </button>
          </div>
        </Panel>

        {/* What users come to do — the goals layer, kept beside the object graph so it stays legible. */}
        {(model.userGoals?.length ?? 0) > 0 && (
          <Panel position="top-right">
            <div className="product-goals-panel">
              <div className="product-goals-title">What people come to do</div>
              <ul className="product-goals-list">
                {model.userGoals.map((g) => (
                  <li key={g.id} className={cn("product-goal", g.provenance === "speculative" && "product-goal-spec")}>
                    <span className="product-goal-actor">{g.actor}</span>
                    <span className="product-goal-text">{g.goal}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Panel>
        )}

        {/* The shared-model wire, made visible: this picture grounds the GTM side. */}
        <Panel position="bottom-center">
          <button className="product-bridge" onClick={onExitToGtm} type="button" title="Switch to GTM mode — your channels are grounded in this picture">
            This picture grounds your go-to-market <ArrowRight />
          </button>
        </Panel>

        {/* Inline editor for the selected object. */}
        {selectedThing && (
          <Panel position="bottom-left">
            <div className="product-editor">
              <div className="product-editor-head">
                <span>Edit object</span>
                <button className="product-editor-close" onClick={() => setSelected(null)} type="button">×</button>
              </div>
              <input
                className="product-editor-name"
                defaultValue={selectedThing.name}
                key={`${selectedThing.id}-name-${model.version}`}
                onBlur={(e) => { if (e.target.value !== selectedThing.name) saveThing(selectedThing.id, { name: e.target.value }); }}
                placeholder="Name"
              />
              <textarea
                className="product-editor-summary"
                defaultValue={selectedThing.summary}
                key={`${selectedThing.id}-sum-${model.version}`}
                onBlur={(e) => { if (e.target.value !== selectedThing.summary) saveThing(selectedThing.id, { summary: e.target.value }); }}
                placeholder="What is this object, in plain words?"
                rows={3}
              />
              <div className="product-editor-foot">Changes are remembered — every edit bumps the version.</div>
            </div>
          </Panel>
        )}

        <Background color="#e4e4e7" gap={26} size={1.5} />
        <Controls showInteractive={false} position="bottom-left" />
      </ReactFlow>
    </div>
  );
}
