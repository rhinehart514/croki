import { useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type NodeTypes,
  type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { WorkIndexOutline } from "@/api";
import { connectedIds, ventureGraph, type VentureMapView } from "./ventureMapModel";
import { VentureGraphNode, type VentureGraphFlowNode } from "./VentureGraphNode";

const NODE_TYPES: NodeTypes = { venture: VentureGraphNode };

export function VentureSystemGraph({
  outline,
  view,
  selectedId,
  onSelect,
  camera,
  onCameraChange,
}: {
  outline: WorkIndexOutline;
  view: VentureMapView;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  camera?: Viewport | null;
  onCameraChange?: (camera: Viewport) => void;
}) {
  const graph = useMemo(() => ventureGraph(outline, view), [outline, view]);
  const route = useMemo(() => connectedIds(graph, selectedId), [graph, selectedId]);
  const nodes = useMemo<VentureGraphFlowNode[]>(() => graph.nodes.map((node) => ({
    id: node.object.id,
    type: "venture",
    position: node.position,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    data: {
      object: node.object,
      connectionCount: node.connectionCount,
      selected: selectedId === node.object.id,
      quiet: Boolean(selectedId && !route.has(node.object.id)),
      onSelect: (id: string) => onSelect(selectedId === id ? null : id),
    },
  })), [graph.nodes, onSelect, route, selectedId]);
  const edges = useMemo<Edge[]>(() => graph.links.map((link) => {
    const highlighted = Boolean(selectedId && (link.source === selectedId || link.target === selectedId));
    return {
      id: link.id,
      source: link.source,
      target: link.target,
      type: "smoothstep",
      label: highlighted ? link.label : undefined,
      animated: false,
      className: highlighted ? "venture-graph-edge is-active" : "venture-graph-edge",
      style: {
        stroke: highlighted ? "var(--primary)" : "var(--n-line-2)",
        strokeWidth: highlighted ? 2 : 1,
        strokeDasharray: link.assertion === "tentative" ? "5 5" : undefined,
        opacity: selectedId && !highlighted ? 0.24 : 1,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 12,
        height: 12,
        color: highlighted ? "var(--primary)" : "var(--n-ink-4)",
      },
      labelStyle: { fill: "var(--n-ink-2)", fontSize: 11, fontFamily: "var(--sans)" },
      labelBgStyle: { fill: "var(--n-sunk)", fillOpacity: 0.96 },
      labelBgPadding: [6, 4] as [number, number],
      labelBgBorderRadius: 4,
    };
  }), [graph.links, selectedId]);

  return (
    <div className="venture-system-graph" data-testid="venture-system-graph">
      <ReactFlow<VentureGraphFlowNode>
        key={`${view}:${outline.architectureRevision}`}
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        fitView={!camera}
        defaultViewport={camera ?? undefined}
        fitViewOptions={{ padding: 0.18, minZoom: 0.35, maxZoom: 1 }}
        minZoom={0.22}
        maxZoom={1.55}
        nodesDraggable={false}
        nodesConnectable={false}
        panOnDrag
        selectionOnDrag={false}
        onNodeClick={(_event, node) => node.data.onSelect(node.id)}
        onPaneClick={() => onSelect(null)}
        onMoveEnd={(_event, viewport) => onCameraChange?.(viewport)}
        proOptions={{ hideAttribution: true }}
        aria-label="Full venture system graph. Product systems connect to people, market work, and returned evidence."
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="var(--canvas-dot)" />
        <Controls position="bottom-left" showInteractive={false} />
      </ReactFlow>
      <div className="venture-graph-readout" aria-label="Graph summary">
        <span>{graph.nodes.length} nodes</span>
        <span>{graph.links.length} links</span>
        <span>{graph.motionCount} {graph.motionCount === 1 ? "path" : "paths"} to market</span>
        {graph.gapCount ? <span data-gap="true">{graph.gapCount} unconnected</span> : null}
      </div>
    </div>
  );
}
