import {
  Background,
  BackgroundVariant,
  MarkerType,
  ReactFlow,
  type Connection,
  type NodeChange,
  type NodeTypes,
  type OnMoveEnd,
  type ReactFlowInstance,
} from "@xyflow/react";
import { memo, useCallback, useRef } from "react";
import { ArchitectureElement } from "./ArchitectureElement";
import { ArchitectureGroup } from "./ArchitectureGroup";
import { FounderWall } from "./FounderWall";
import { AtlasIntentNode } from "./AtlasIntentNode";
import { AtlasBetNode } from "./AtlasBetNode";
import { AtlasCrewNode } from "./AtlasCrewNode";
import { AtlasCapabilityNode } from "./AtlasCapabilityNode";
import type { AtlasAltitude, AtlasEdge, AtlasNode } from "./atlasTypes";
import { CANVAS_ITEM_MIME } from "@/components/lens/canvasCapabilities";

const NODE_TYPES: NodeTypes = {
  architectureElement: ArchitectureElement,
  architectureGroup: ArchitectureGroup,
  founderWall: FounderWall,
  atlasIntent: AtlasIntentNode,
  atlasBet: AtlasBetNode,
  atlasCrew: AtlasCrewNode,
  atlasCapability: AtlasCapabilityNode,
};

function AtlasCanvasView({
  nodes,
  edges,
  altitude,
  onInit,
  onMoveEnd,
  onNodesChange,
  onPaneClick,
  onPaneDoubleClick,
  onConnect,
  onDropItem,
}: {
  nodes: AtlasNode[];
  edges: AtlasEdge[];
  altitude: AtlasAltitude;
  onInit: (instance: ReactFlowInstance<AtlasNode>) => void;
  onMoveEnd: OnMoveEnd;
  onNodesChange: (changes: NodeChange<AtlasNode>[]) => void;
  onPaneClick: () => void;
  onPaneDoubleClick: (point: { x: number; y: number }) => void;
  onConnect: (connection: Connection) => void;
  onDropItem: (key: string, point: { x: number; y: number }) => void;
}) {
  const instanceRef = useRef<ReactFlowInstance<AtlasNode> | null>(null);
  const handleInit = useCallback((instance: ReactFlowInstance<AtlasNode>) => {
    instanceRef.current = instance;
    onInit(instance);
  }, [onInit]);
  const handleDoubleClick = useCallback((event: React.MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Element) || !target.classList.contains("react-flow__pane")) return;
    const instance = instanceRef.current;
    if (!instance) return;
    onPaneDoubleClick(instance.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
  }, [onPaneDoubleClick]);
  return (
    <ReactFlow<AtlasNode>
      className="atlas-canvas"
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      onInit={handleInit}
      onMoveEnd={onMoveEnd}
      onNodesChange={onNodesChange}
      onNodeClick={(_, node) => node.data.onSelect(node.id)}
      onNodeDoubleClick={(_, node) => node.data.onFocus(node.id)}
      onPaneClick={(event) => {
        const target = event.target;
        if (target instanceof Element && target.classList.contains("react-flow__pane")) onPaneClick();
      }}
      onDoubleClick={handleDoubleClick}
      onConnect={onConnect}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes(CANVAS_ITEM_MIME)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        const key = event.dataTransfer.getData(CANVAS_ITEM_MIME);
        if (!key || !instanceRef.current) return;
        event.preventDefault();
        onDropItem(key, instanceRef.current.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
      }}
      nodesConnectable
      nodesFocusable={false}
      edgesFocusable={false}
      defaultEdgeOptions={{ markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: "var(--ink-3)" } }}
      panOnDrag
      selectionOnDrag={false}
      minZoom={0.18}
      maxZoom={1.7}
      proOptions={{ hideAttribution: true }}
      aria-label="Living venture atlas. Pan and zoom the venture architecture, or open the outline for deterministic access."
      data-atlas-altitude={altitude}
    >
      <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
    </ReactFlow>
  );
}

export const AtlasCanvas = memo(AtlasCanvasView);
