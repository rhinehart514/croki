import { ChevronDown, ChevronUp, Maximize2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Background, BackgroundVariant, MarkerType, Position, ReactFlow, type Edge, type Node } from "@xyflow/react";
import type { VisualReference } from "@/api";
import type { WorkflowSketch, WorkflowSketchStep } from "./workflowSketch";

const KIND_LABEL: Record<string, string> = {
  trigger: "Trigger",
  "agent-work": "Agent work",
  condition: "Condition",
  "founder-decision": "Founder decision",
  "founder-gate": "Founder gate",
  "external-action": "External action",
  observation: "Observation",
  outcome: "Outcome",
};

function graphLayout(sketch: WorkflowSketch) {
  const known = new Set(sketch.steps.map((step) => step.id));
  const incoming = new Map(sketch.steps.map((step) => [step.id, 0]));
  for (const edge of sketch.edges) if (known.has(edge.from) && known.has(edge.to)) incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
  const depth = new Map(sketch.steps.map((step) => [step.id, 0]));
  for (let pass = 0; pass < sketch.steps.length; pass += 1) {
    let changed = false;
    for (const edge of sketch.edges) {
      if (!known.has(edge.from) || !known.has(edge.to)) continue;
      const next = Math.min(sketch.steps.length - 1, (depth.get(edge.from) ?? 0) + 1);
      if (next > (depth.get(edge.to) ?? 0)) { depth.set(edge.to, next); changed = true; }
    }
    if (!changed) break;
  }
  const groups = new Map<number, WorkflowSketchStep[]>();
  for (const step of sketch.steps) {
    const column = incoming.get(step.id) === 0 ? 0 : depth.get(step.id) ?? 0;
    groups.set(column, [...(groups.get(column) ?? []), step]);
  }
  const maxRows = Math.max(1, ...[...groups.values()].map((group) => group.length));
  const nodes: Node[] = sketch.steps.map((step) => {
    const column = incoming.get(step.id) === 0 ? 0 : depth.get(step.id) ?? 0;
    const group = groups.get(column) ?? [step];
    const row = group.findIndex((candidate) => candidate.id === step.id);
    const y = (row - (group.length - 1) / 2) * 94 + (maxRows - 1) * 47;
    return {
      id: step.id,
      position: { x: column * 226, y },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      className: `work-graph-node is-${step.type ?? "open"}`,
      data: { label: <><small>{KIND_LABEL[step.type ?? ""] ?? "Open step"}</small><strong>{step.label}</strong>{step.detail ? <span>{step.detail}</span> : null}</> },
    };
  });
  const edges: Edge[] = sketch.edges.filter((edge) => known.has(edge.from) && known.has(edge.to)).map((edge, index) => ({
    id: `${edge.from}-${edge.to}-${index}`,
    source: edge.from,
    target: edge.to,
    label: edge.label,
    type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12 },
    className: "work-graph-edge",
  }));
  return { nodes, edges };
}

export function WorkGraphSketch({ sketch, adoptionState, busy, error, onOpen, onAdopt }: {
  sketch: WorkflowSketch;
  adoptionState: "new" | "changed" | "current";
  busy: boolean;
  error: string | null;
  onOpen: (visual: VisualReference, source: HTMLElement) => void;
  onAdopt: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const graph = useMemo(() => graphLayout(sketch), [sketch]);
  return (
    <section className="work-graph-sketch" data-collapsed={collapsed ? "true" : undefined} aria-label="Provisional Product and GTM workflow graph">
      <header>
        <div><span>{adoptionState === "current" ? "Adopted workflow" : adoptionState === "changed" ? "Workflow changes" : "Provisional workflow"}</span><strong>{sketch.title}</strong><small>{sketch.steps.length} {sketch.steps.length === 1 ? "step" : "steps"} · correct it in this conversation</small></div>
        <div>
          {sketch.item.visual ? <button type="button" onClick={(event) => onOpen(sketch.item.visual!, event.currentTarget)}><Maximize2 aria-hidden="true" />Review full graph</button> : null}
          <button type="button" className="work-graph-adopt" disabled={busy} onClick={onAdopt}>{busy ? "Adopting…" : adoptionState === "current" ? "Open in Canvas" : adoptionState === "changed" ? "Adopt changes" : "Adopt in Canvas"}</button>
          <button type="button" className="work-graph-collapse" aria-label={collapsed ? "Expand workflow sketch" : "Collapse workflow sketch"} aria-expanded={!collapsed} onClick={() => setCollapsed((value) => !value)}>{collapsed ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}</button>
        </div>
      </header>
      {!collapsed ? <div className="work-graph-sketch-canvas">
        <ReactFlow nodes={graph.nodes} edges={graph.edges} nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} fitView fitViewOptions={{ padding: 0.12, minZoom: 0.3, maxZoom: 1 }} minZoom={0.25} maxZoom={1.2} panOnDrag zoomOnScroll={false} zoomOnPinch proOptions={{ hideAttribution: true }} aria-label={`${sketch.title} provisional graph`}>
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--canvas-dot)" />
        </ReactFlow>
      </div> : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
