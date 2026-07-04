// InteractionLens — "Interaction": the screen/state machine. The interactions bag (states / screens
// / modes) are the nodes; the transitions bag (from → to, labelled by their trigger) are the
// directed edges. Together they read as a state machine / wireflow.
//
// It's the same calm React-Flow language as the conceptual graph and the GTM canvas, so Product mode
// reads as ONE tool: states are the shared ObjectCard, transitions reuse the shared product-edge
// styling, layout is the shared DAG rank pass, and the legend is the shared LensPanel. Provenance is
// load-bearing on BOTH ends — a speculative state is ghosted (ObjectCard does this automatically) and
// a speculative transition is a dashed, lower-contrast edge, so a guessed transition can never read
// as a proven one. The one bespoke touch is a subtle, monochrome left-accent that distinguishes a
// "screen" (a real surface) from a transient "state" / "mode" — no decorative color.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background, Controls, Handle, Panel, Position, ReactFlow,
  type Edge, type Node, type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { ProductInteraction, ProductModel, ProductModelEdit } from "@/types";
import { LensPanel, ObjectCard, computeLayout, type LayoutEdge } from "@/components/lenses/shared";
import "./InteractionLens.css";

type LensProps = {
  model: ProductModel;
  selected: string | null;
  onSelect: (id: string) => void;
  onRevise: (edit: ProductModelEdit) => void;
};

// Free-text `kind` → a coarse class for the subtle visual distinction the brief asks for. A surface
// the user lands on ("screen" / "view" / "page" / "modal") gets the solid accent; a transient
// "mode" reads as dashed; everything else (states) gets the soft accent.
type InteractionClass = "screen" | "mode" | "state";
function interactionClass(kind: string): InteractionClass {
  const k = (kind || "").toLowerCase();
  if (k.includes("screen") || k.includes("view") || k.includes("page") || k.includes("modal") || k.includes("dialog"))
    return "screen";
  if (k.includes("mode")) return "mode";
  return "state";
}

// ─── State node — the shared ObjectCard wrapped as a React Flow node ─────────────

type StateNodeData = {
  interaction: ProductInteraction;
  hasSignal: boolean;
  selected: boolean;
  onSelect: () => void;
};

function StateNodeComponent({ data }: NodeProps<Node<StateNodeData>>) {
  const { interaction, hasSignal, selected, onSelect } = data;
  const cls = interactionClass(interaction.kind);
  const citeCount = interaction.evidence?.length ?? 0;

  return (
    <>
      <Handle type="target" position={Position.Left} className="product-handle" />
      <ObjectCard
        kind={interaction.kind}
        name={interaction.name}
        summary={interaction.summary}
        provenance={interaction.provenance}
        citationCount={citeCount}
        hasSignal={hasSignal}
        selected={selected}
        onSelect={onSelect}
        asReactFlowNode
        className={`interaction-node-${cls}`}
      />
      <Handle type="source" position={Position.Right} className="product-handle" />
    </>
  );
}

const NODE_TYPES = { stateNode: StateNodeComponent };

// ─── Lens ────────────────────────────────────────────────────────────────────────

export function InteractionLens({ model, selected, onSelect }: LensProps) {
  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(new Map());

  const interactions = useMemo(() => model.interactions ?? [], [model]);

  // Transitions reference states by id OR by name — resolve both, mirroring ProductFlowCanvas.
  const idByRef = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of interactions) {
      map.set(i.id, i.id);
      if (i.name) map.set(i.name.toLowerCase(), i.id);
    }
    return map;
  }, [interactions]);

  type Resolved = { id: string; from: string; to: string; trigger: string; speculative: boolean };
  const resolvedTransitions = useMemo<Resolved[]>(() => {
    const out: Resolved[] = [];
    for (const t of model.transitions ?? []) {
      const from = idByRef.get(t.from) ?? idByRef.get((t.from || "").toLowerCase());
      const to = idByRef.get(t.to) ?? idByRef.get((t.to || "").toLowerCase());
      if (!from || !to) continue;
      out.push({ id: t.id, from, to, trigger: t.trigger, speculative: t.provenance === "speculative" });
    }
    return out;
  }, [model, idByRef]);

  // Which states carry a pinned real-world signal — same treatment as the conceptual lens.
  const signalIds = useMemo(() => {
    const set = new Set<string>();
    for (const p of model.pinnedSignals ?? []) {
      if (p.target.id) {
        const id = idByRef.get(p.target.id) ?? idByRef.get(p.target.id.toLowerCase());
        if (id) set.add(id);
      }
    }
    return set;
  }, [model, idByRef]);

  // Re-layout when the topology changes; preserve manual drags otherwise.
  const layoutEdges = useMemo<LayoutEdge[]>(
    () => resolvedTransitions.map((t) => ({ from: t.from, to: t.to })),
    [resolvedTransitions],
  );
  const topology = useMemo(
    () => `${interactions.map((i) => i.id).sort().join(",")}|${layoutEdges.map((e) => `${e.from}>${e.to}`).sort().join(",")}`,
    [interactions, layoutEdges],
  );
  const lastTopology = useRef<string | null>(null);
  useEffect(() => {
    if (topology === lastTopology.current) return;
    lastTopology.current = topology;
    setPositions(computeLayout(interactions.map((i) => i.id), layoutEdges));
  }, [topology, interactions, layoutEdges]);

  const nodes = useMemo<Node[]>(() => interactions.map((i) => ({
    id: i.id,
    type: "stateNode",
    position: positions.get(i.id) ?? { x: 0, y: 0 },
    draggable: true,
    selectable: false,
    data: {
      interaction: i,
      hasSignal: signalIds.has(i.id),
      selected: selected === i.id,
      onSelect: () => onSelect(i.id),
    } as StateNodeData,
  })), [interactions, positions, signalIds, selected, onSelect]);

  const edges = useMemo<Edge[]>(() => resolvedTransitions.map((t) => ({
    id: t.id,
    source: t.from,
    target: t.to,
    label: t.trigger,
    type: "smoothstep",
    className: t.speculative ? "product-edge product-edge-spec" : "product-edge",
  })), [resolvedTransitions]);

  const handleNodeDragStop = useCallback((_e: unknown, node: Node) => {
    setPositions((prev) => new Map(prev).set(node.id, node.position));
  }, []) as Parameters<typeof ReactFlow>[0]["onNodeDragStop"];

  const citedCount = interactions.filter((i) => i.provenance === "derived").length;
  const guessCount = interactions.length - citedCount;

  // Whether ANY interaction class is present, to keep the legend's kind key honest.
  const classesPresent = useMemo(() => {
    const set = new Set<InteractionClass>();
    for (const i of interactions) set.add(interactionClass(i.kind));
    return set;
  }, [interactions]);

  // The other bags may have content while interactions/transitions are still empty — say so plainly
  // rather than showing a blank canvas (the SHELL already handles the truly-empty model).
  const hasStates = interactions.length > 0;

  return (
    <div className="interaction-lens">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        onNodeDragStop={handleNodeDragStop}
        onPaneClick={() => onSelect("")}
        fitView
        fitViewOptions={{ padding: 0.16 }}
        minZoom={0.2}
        maxZoom={1.8}
        nodesConnectable={false}
        edgesReconnectable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Panel position="top-left">
          <LensPanel title="State machine" className="lens-panel-dock">
            <div className="interaction-legend-counts">
              <span className="interaction-legend-count-cited" title="States grounded in real code">
                {citedCount} cited
              </span>
              {guessCount > 0 && (
                <span className="interaction-legend-count-guess" title="States that are interpretive guesses">
                  {guessCount} guess{guessCount === 1 ? "" : "es"}
                </span>
              )}
              <span title="Directed transitions, labelled by their trigger">
                {resolvedTransitions.length} transition{resolvedTransitions.length === 1 ? "" : "s"}
              </span>
            </div>
            {classesPresent.size > 1 && (
              <div className="interaction-legend-rows">
                {classesPresent.has("screen") && (
                  <span className="interaction-legend-row">
                    <span className="interaction-legend-swatch interaction-legend-swatch-screen" />
                    Screen — a surface the user lands on
                  </span>
                )}
                {classesPresent.has("state") && (
                  <span className="interaction-legend-row">
                    <span className="interaction-legend-swatch interaction-legend-swatch-state" />
                    State — a transient condition
                  </span>
                )}
                {classesPresent.has("mode") && (
                  <span className="interaction-legend-row">
                    <span className="interaction-legend-swatch interaction-legend-swatch-mode" />
                    Mode — a temporary modal context
                  </span>
                )}
              </div>
            )}
          </LensPanel>
        </Panel>

        <Background color="var(--canvas-dot)" gap={26} size={1.5} />
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>

      {!hasStates && (
        <div className="interaction-empty">
          <div className="interaction-empty-title">No states drawn yet</div>
          <p className="interaction-empty-note">
            This picture has objects, but no screens, states, or transitions have been modelled.
            Redraw from the product code to map the state machine.
          </p>
        </div>
      )}
    </div>
  );
}
