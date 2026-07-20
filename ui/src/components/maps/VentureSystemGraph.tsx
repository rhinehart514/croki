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
import type { SystemAgentContext } from "@/components/system-mode/systemWorkState";
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
  workByObject,
}: {
  outline: WorkIndexOutline;
  view: VentureMapView;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  camera?: Viewport | null;
  onCameraChange?: (camera: Viewport) => void;
  workByObject?: ReadonlyMap<string, SystemAgentContext>;
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
      workState: workByObject?.get(node.object.id)?.state ?? null,
      onSelect: (id: string) => onSelect(selectedId === id ? null : id),
    },
  })), [graph.nodes, onSelect, route, selectedId, workByObject]);
  const edges = useMemo<Edge[]>(() => {
    const firstHighlightedReturn = graph.links.findIndex((link) => link.sourceKind === "evidence-return" && Boolean(selectedId && (link.source === selectedId || link.target === selectedId)));
    return graph.links.map((link, index) => {
      const highlighted = Boolean(selectedId && (link.source === selectedId || link.target === selectedId));
      const returned = link.sourceKind === "evidence-return";
      const showLabel = highlighted && (!returned || index === firstHighlightedReturn);
      return {
        id: link.id,
        source: link.source,
        target: link.target,
        type: returned ? "bezier" : "smoothstep",
        label: showLabel ? link.label : undefined,
        animated: false,
        className: `venture-graph-edge${returned ? " is-return" : ""}${highlighted ? " is-active" : ""}`,
        style: {
          stroke: returned ? "var(--ember-ink)" : highlighted ? "var(--primary)" : "var(--n-line-2)",
          strokeWidth: returned || highlighted ? 2 : 1,
          strokeDasharray: link.assertion === "tentative" ? "5 5" : undefined,
          opacity: selectedId && !highlighted ? 0.24 : 1,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 12,
          height: 12,
          color: returned ? "var(--ember-ink)" : highlighted ? "var(--primary)" : "var(--n-ink-4)",
        },
        labelStyle: { fill: "var(--n-ink-2)", fontSize: 11, fontFamily: "var(--sans)" },
        labelBgStyle: { fill: "var(--n-sunk)", fillOpacity: 0.96 },
        labelBgPadding: [6, 4] as [number, number],
        labelBgBorderRadius: 4,
      };
    });
  }, [graph.links, selectedId]);

  return (
    <div className="venture-system-graph" data-testid="venture-system-graph">
      <ReactFlow<VentureGraphFlowNode>
        key={`${view}:${outline.architectureRevision}`}
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        fitView={!camera}
        defaultViewport={camera ?? undefined}
        fitViewOptions={{ padding: 0.1, minZoom: 0.35, maxZoom: 1 }}
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
        aria-label="Full Product and go-to-market graph. Product capabilities connect to people, market work, and returned evidence."
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="var(--canvas-dot)" />
        <Controls position="bottom-left" showInteractive={false} />
      </ReactFlow>
      <div className="venture-graph-landmarks" aria-hidden="true">
        <span>Product value</span><i>→</i><span>Market movement</span><i>→</i><span>Returned evidence</span>
      </div>
      <div className="venture-graph-readout" aria-label="Relationship legend">
        <span><i data-line="adopted" />Founder-set</span>
        <span><i data-line="provisional" />Provisional</span>
        <span><i data-line="return" />Evidence return</span>
      </div>
    </div>
  );
}
