import {
  Background,
  BackgroundVariant,
  Handle,
  MarkerType,
  NodeToolbar,
  Position,
  ReactFlow,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { ExternalLink, Link2 } from "lucide-react";
import { useEffect, useMemo } from "react";
import "@xyflow/react/dist/style.css";

import type { LabNode } from "../model";
import type { CanvasRendererProps } from "../rendererTypes";

type CrokiFlowNode = Node<{ readonly source: LabNode }, "croki">;

const nodeTypes = { croki: CrokiFlowNodeCard };

export function ReactFlowCanvas(props: CanvasRendererProps) {
  const initialNodes = useMemo(() => toFlowNodes(props.projection.nodes), [props.projection.nodes]);
  const [nodes, setNodes, onNodesChange] = useNodesState<CrokiFlowNode>(initialNodes);
  const edges = useMemo<readonly Edge[]>(
    () =>
      props.projection.edges.map((edge) => ({
        id: edge.id,
        source: edge.from,
        target: edge.to,
        label: edge.relation,
        markerEnd: { type: MarkerType.ArrowClosed, color: "#53535a" },
        style: { stroke: "#53535a", strokeWidth: 1.2 },
        labelStyle: { fill: "#8b8b93", fontSize: 10 },
        labelBgStyle: { fill: "#080808", fillOpacity: 0.92 },
        labelBgPadding: [5, 3],
      })),
    [props.projection.edges],
  );

  useEffect(() => {
    setNodes((current) =>
      current.map((node) => ({ ...node, selected: node.id === props.selectedId })),
    );
  }, [props.selectedId, setNodes]);

  return (
    <ReactFlow<CrokiFlowNode>
      colorMode="dark"
      nodes={nodes}
      edges={[...edges]}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onNodeClick={(_, node) => props.onSelect(node.data.source)}
      onPaneClick={() => props.onSelect(null)}
      fitView
      fitViewOptions={{ padding: 0.2, maxZoom: 1.05 }}
      minZoom={0.35}
      maxZoom={1.5}
      nodesConnectable={false}
      selectionOnDrag={false}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={28} size={0.8} color="#242429" />
    </ReactFlow>
  );
}

function CrokiFlowNodeCard({ data, selected }: NodeProps<CrokiFlowNode>) {
  return (
    <>
      <NodeToolbar isVisible={selected} position={Position.Top} offset={8}>
        <div className="node-toolbar">
          <button type="button">
            <ExternalLink size={12} /> Open Thread
          </button>
          <button type="button">
            <Link2 size={12} /> Connect
          </button>
        </div>
      </NodeToolbar>
      <article className={`flow-card authority-${data.source.authority}`}>
        <Handle type="target" position={Position.Left} className="flow-handle" />
        <header>
          <span>{data.source.kind}</span>
          <i>{data.source.authority}</i>
        </header>
        <h3>{data.source.title}</h3>
        <p>{data.source.body}</p>
        <footer>{data.source.meta}</footer>
        <Handle type="source" position={Position.Right} className="flow-handle" />
      </article>
    </>
  );
}

function toFlowNodes(nodes: readonly LabNode[]): CrokiFlowNode[] {
  return nodes.map((node) => ({
    id: node.id,
    type: "croki",
    position: { x: node.x, y: node.y },
    data: { source: node },
  }));
}
