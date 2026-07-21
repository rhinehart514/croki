import { useEffect, useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  Position,
  ReactFlow,
  useNodesState,
  type Edge,
  type NodeTypes,
  type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { WorkIndexOutline } from "@/api";
import type { SystemAgentContext } from "@/components/system-mode/systemWorkState";
import { connectedIds, ventureGraph, type VentureMapView } from "./ventureMapModel";
import { VentureGraphNode, type VentureGraphFlowNode, type VentureGraphNodeData } from "./VentureGraphNode";
import { VenturePipelineLane, type VenturePipelineLaneNode } from "./VenturePipelineLane";

const NODE_TYPES: NodeTypes = { venture: VentureGraphNode, pipelineLane: VenturePipelineLane };

export function VentureSystemGraph({
  outline,
  view,
  selectedId,
  onSelect,
  camera,
  onCameraChange,
  workByObject,
  positions,
  onNodeMove,
}: {
  outline: WorkIndexOutline;
  view: VentureMapView;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  camera?: Viewport | null;
  onCameraChange?: (camera: Viewport) => void;
  workByObject?: ReadonlyMap<string, SystemAgentContext>;
  positions?: Record<string, { x: number; y: number }>;
  onNodeMove?: (objectRef: string, position: { x: number; y: number }) => void;
}) {
  const graph = useMemo(() => ventureGraph(outline, view), [outline, view]);
  const route = useMemo(() => connectedIds(graph, selectedId), [graph, selectedId]);
  const projectedNodes = useMemo<Array<VentureGraphFlowNode | VenturePipelineLaneNode>>(() => [
    ...graph.pipelines.map((pipeline, index): VenturePipelineLaneNode => ({
      id: `pipeline-lane:${pipeline.id}`,
      type: "pipelineLane",
      position: pipeline.position,
      style: { width: pipeline.width, height: pipeline.height },
      initialWidth: pipeline.width,
      initialHeight: pipeline.height,
      selectable: false,
      draggable: false,
      focusable: false,
      zIndex: 0,
      data: {
        index,
        name: pipeline.name,
        audience: pipeline.audience,
        trigger: pipeline.trigger,
        value: pipeline.value,
        repeatability: pipeline.repeatability,
        signalCount: pipeline.signalCount,
        campaignCount: pipeline.campaignCount,
        releaseCount: pipeline.releaseCount,
        outcomeCount: pipeline.outcomeCount,
        workState: workByObject?.get(pipeline.id)?.state ?? null,
        active: Boolean(selectedId && pipeline.nodeIds.includes(selectedId)),
        quiet: Boolean(selectedId && !pipeline.nodeIds.includes(selectedId)),
      },
    })),
    ...graph.nodes.map((node): VentureGraphFlowNode => ({
      id: node.object.id,
      type: "venture",
      position: positions?.[node.object.objectRef] ?? positions?.[node.object.id] ?? node.position,
      initialWidth: ["motion", "pipeline"].includes(node.object.type.toLowerCase()) ? 276 : node.object.type.toLowerCase() === "campaign" ? 258 : node.object.type.toLowerCase() === "return" ? 264 : 244,
      initialHeight: ["motion", "pipeline"].includes(node.object.type.toLowerCase()) ? 132 : 126,
      zIndex: 1,
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
    })),
  ], [graph.nodes, graph.pipelines, onSelect, positions, route, selectedId, workByObject]);
  const [nodes, setNodes, onNodesChange] = useNodesState<VentureGraphFlowNode | VenturePipelineLaneNode>(projectedNodes);
  useEffect(() => setNodes(projectedNodes), [projectedNodes, setNodes]);
  const edges = useMemo<Edge[]>(() => {
    const firstHighlightedReturn = graph.links.findIndex((link) => link.sourceKind === "evidence-return" && Boolean(selectedId && route.has(link.source) && route.has(link.target)));
    return graph.links.map((link, index) => {
      const highlighted = Boolean(selectedId && route.has(link.source) && route.has(link.target));
      const touchesSelection = Boolean(selectedId && (link.source === selectedId || link.target === selectedId));
      const returned = link.sourceKind === "evidence-return";
      const showLabel = touchesSelection && (!returned || index === firstHighlightedReturn);
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
          opacity: selectedId ? (highlighted ? 0.9 : 0.07) : (returned ? 0.48 : 0.18),
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
  }, [graph.links, route, selectedId]);

  return (
    <div className="venture-system-graph" data-testid="venture-system-graph">
      <ReactFlow<VentureGraphFlowNode | VenturePipelineLaneNode>
        key={`${view}:${outline.architectureRevision}`}
        nodes={nodes}
        onNodesChange={onNodesChange}
        edges={edges}
        nodeTypes={NODE_TYPES}
        fitView={!camera}
        defaultViewport={camera ?? undefined}
        fitViewOptions={{ padding: 0.1, minZoom: 0.35, maxZoom: 1 }}
        minZoom={0.22}
        maxZoom={1.55}
        nodesDraggable={Boolean(onNodeMove)}
        nodesConnectable={false}
        panOnDrag
        selectionOnDrag={false}
        onNodeClick={(_event, node) => { if (node.type === "venture") (node.data as VentureGraphNodeData).onSelect(node.id); }}
        onNodeDragStop={(_event, node) => { if (node.type === "venture") onNodeMove?.((node.data as VentureGraphNodeData).object.objectRef, node.position); }}
        onPaneClick={() => onSelect(null)}
        onMoveEnd={(_event, viewport) => onCameraChange?.(viewport)}
        proOptions={{ hideAttribution: true }}
        aria-label="Product and go-to-market system. Meaningful signals activate reusable agent pipelines, bounded campaigns, and returned outcomes."
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="var(--canvas-dot)" />
        <Controls position="bottom-left" showInteractive={false} />
      </ReactFlow>
      {view === "product" ? <div className="venture-graph-landmarks is-product" aria-hidden="true"><span>Product truth</span><i>→</i><span>Customer value</span><i>→</i><span>Market support</span></div> : <div className="venture-graph-foundation-label" aria-hidden="true"><span>Connected venture context</span><strong>Audiences, offers, channels, releases, agents, tools, and evidence attach to the loop</strong></div>}
      <div className="venture-graph-readout" aria-label="Relationship legend">
        <span><i data-line="adopted" />Founder-set</span>
        <span><i data-line="provisional" />Provisional</span>
        <span><i data-line="return" />Evidence return</span>
      </div>
    </div>
  );
}
