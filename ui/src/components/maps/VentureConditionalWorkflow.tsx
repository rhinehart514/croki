import { Background, BackgroundVariant, Controls, MarkerType, Position, ReactFlow, type Edge, type Node } from "@xyflow/react";
import { MessageCircle } from "lucide-react";
import { useMemo } from "react";
import type { WorkIndexOutlineObject } from "@/api";
import type { ConditionalWorkflowGraph, ConditionalWorkflowStep } from "./conditionalWorkflowGraph";

function layout(graph: ConditionalWorkflowGraph) {
  const known = new Set(graph.steps.map((step) => step.id));
  const depths = new Map(graph.steps.map((step) => [step.id, 0]));
  for (let pass = 0; pass < graph.steps.length; pass += 1) {
    let changed = false;
    for (const edge of graph.edges) {
      if (!known.has(edge.from) || !known.has(edge.to)) continue;
      const next = Math.min(graph.steps.length - 1, (depths.get(edge.from) ?? 0) + 1);
      if (next > (depths.get(edge.to) ?? 0)) { depths.set(edge.to, next); changed = true; }
    }
    if (!changed) break;
  }
  const columns = new Map<number, ConditionalWorkflowStep[]>();
  for (const step of graph.steps) { const depth = depths.get(step.id) ?? 0; columns.set(depth, [...(columns.get(depth) ?? []), step]); }
  const nodes: Node[] = graph.steps.map((step) => {
    const depth = depths.get(step.id) ?? 0;
    const column = columns.get(depth) ?? [step];
    const row = column.findIndex((candidate) => candidate.id === step.id);
    return { id: step.id, position: { x: depth * 270, y: row * 150 - (column.length - 1) * 75 }, sourcePosition: Position.Right, targetPosition: Position.Left, className: `conditional-workflow-node is-${step.type ?? "open"}`, data: { label: <><small>{(step.type ?? "open step").replaceAll("-", " ")}</small><strong>{step.label}</strong>{step.detail ? <span>{step.detail}</span> : null}</> } };
  });
  const edges: Edge[] = graph.edges.filter((edge) => known.has(edge.from) && known.has(edge.to)).map((edge, index) => ({ id: `${edge.from}-${edge.to}-${index}`, source: edge.from, target: edge.to, label: edge.label, type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 }, className: "conditional-workflow-edge" }));
  return { nodes, edges };
}

export function VentureConditionalWorkflow({ object, graph, onSelect, onChat }: { object: WorkIndexOutlineObject; graph: ConditionalWorkflowGraph; onSelect: (id: string | null) => void; onChat?: (objectRef: string) => void }) {
  const scene = useMemo(() => layout(graph), [graph]);
  return <section className="venture-conditional-workflow" aria-labelledby={`workflow-${object.id}`}>
    <header><div><span>Conditional workflow</span><h2 id={`workflow-${object.id}`}>{object.name}</h2><p>{object.statement || "Founder-adopted from its exact Work thread."}</p></div>{onChat ? <button type="button" onClick={() => onChat(object.objectRef)}><MessageCircle aria-hidden="true" />Work with agent</button> : null}</header>
    <div><ReactFlow nodes={scene.nodes} edges={scene.edges} nodesDraggable={false} nodesConnectable={false} fitView fitViewOptions={{ padding: 0.16, minZoom: 0.35, maxZoom: 1 }} minZoom={0.2} maxZoom={1.5} onNodeClick={() => onSelect(object.id)} onPaneClick={() => onSelect(null)} proOptions={{ hideAttribution: true }} aria-label={`${object.name} conditional workflow`}>
      <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="var(--canvas-dot)" />
      <Controls position="bottom-left" showInteractive={false} />
    </ReactFlow></div>
  </section>;
}
