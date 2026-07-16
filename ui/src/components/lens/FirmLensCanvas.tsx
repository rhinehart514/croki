import {
  Background,
  Controls,
  ReactFlow,
  type Edge,
  type Node,
  type NodeTypes,
  type OnMoveEnd,
  type ReactFlowInstance,
} from "@xyflow/react";
import { useCallback, useMemo, useState, type ComponentProps } from "react";
import { canvasRenderingPolicy } from "@/lib/canvasPerformance";
import type { FitOpts } from "@/lib/lensViewport";
import type { LensAnchorKey } from "@/lib/lensLayout";
import type { CanvasAnchorKey } from "@/lib/lensLayout";
import { CanvasVisibilityGuard, MeasureGuard, ViewportRestorer } from "./lensCanvasGuards";
import type { CanvasAltitude } from "./lensScene";
import { CANVAS_ITEM_MIME } from "./canvasCapabilities";

export function FirmLensCanvas({
  nodes,
  edges,
  nodeTypes,
  fitOptions,
  receiptKey,
  onInit,
  onNodesChange,
  onNodeDragStop,
  onInspect,
  onClearSelection,
  onMoveEnd,
  onCanvasItemDrop,
  altitude,
}: {
  nodes: Node[];
  edges: Edge[];
  nodeTypes: NodeTypes;
  fitOptions: FitOpts;
  receiptKey: string;
  onInit: (instance: ReactFlowInstance) => void;
  onNodesChange: ComponentProps<typeof ReactFlow>["onNodesChange"];
  onNodeDragStop: ComponentProps<typeof ReactFlow>["onNodeDragStop"];
  onInspect: (anchorKey: LensAnchorKey, additive?: boolean) => void;
  onClearSelection: () => void;
  onMoveEnd: OnMoveEnd;
  onCanvasItemDrop?: (key: CanvasAnchorKey, point: { x: number; y: number }) => void;
  altitude: CanvasAltitude;
}) {
  const renderingPolicy = canvasRenderingPolicy(nodes.length, edges.length);
  const topology = useMemo(
    () => `${nodes.map((node) => node.id).join("|")}::${edges.length}`,
    [edges.length, nodes],
  );
  const [framedTopology, setFramedTopology] = useState<string | null>(null);
  const frameReady = framedTopology === topology;
  // The far view is already the lightweight semantic overview and must keep the whole firm legible.
  // Virtualize only the richer middle/near variants once the initial frame is proven; enabling XYFlow
  // culling at the far fit can remove every tiny node before it has stable measured bounds.
  const virtualizeRichNodes = renderingPolicy.virtualize && frameReady && altitude !== "far";
  const markFramed = useCallback(() => setFramedTopology(topology), [topology]);
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onlyRenderVisibleElements={virtualizeRichNodes}
      data-canvas-node-count={renderingPolicy.nodeCount}
      data-canvas-virtualized={virtualizeRichNodes ? "true" : "false"}
      data-canvas-virtualization-ready={renderingPolicy.virtualize && frameReady ? "true" : "false"}
      data-canvas-framed={frameReady ? "true" : "false"}
      data-canvas-altitude={altitude}
      onInit={onInit}
      onNodesChange={onNodesChange}
      onNodeDragStop={onNodeDragStop}
      onNodeClick={(event, node) => {
        if (node.id.startsWith("crew:") || node.id.startsWith("bet:")) {
          onInspect(node.id as LensAnchorKey, event.shiftKey || event.metaKey || event.ctrlKey);
        }
      }}
      onPaneClick={onClearSelection}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes(CANVAS_ITEM_MIME)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        const key = event.dataTransfer.getData(CANVAS_ITEM_MIME) as CanvasAnchorKey;
        if (!key) return;
        event.preventDefault();
        onCanvasItemDrop?.(key, { x: event.clientX, y: event.clientY });
      }}
      onMoveEnd={onMoveEnd}
      fitView
      fitViewOptions={fitOptions}
      minZoom={0.15}
      maxZoom={1.8}
      nodesConnectable={false}
      edgesFocusable={false}
      panOnDrag
      proOptions={{ hideAttribution: true }}
      aria-label="The firm: configured participants, their work, and founder decisions."
    >
      <Background />
      <Controls showInteractive={false} position="bottom-right" />
      <ViewportRestorer viewport={null} receiptKey={receiptKey} fitOptions={fitOptions} />
      <MeasureGuard nodeIds={nodes.map((node) => node.id)} />
      <CanvasVisibilityGuard topology={topology} fitOptions={fitOptions} onFramed={markFramed} />
    </ReactFlow>
  );
}
