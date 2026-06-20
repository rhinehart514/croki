import { useCallback, useMemo } from "react";
import {
  Background, Controls, Handle, Position, ReactFlow,
  type Edge, type Node, type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  AlertCircle, Ban, CheckCircle2, Circle, Database, GitMerge,
  Loader, MessageSquare, Search, ShieldCheck, Sparkles,
  Target, TrendingUp, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  ConnectorMeta, GTMEdge, GTMEdgeType, GTMGraph,
  GTMNode, GTMNodeCategory, GTMNodeResult, GTMRunResult, NodeSelection,
} from "@/types";

// ─── Category icons and colors ────────────────────────────────────────────────

const CATEGORY_ICON: Record<GTMNodeCategory, React.ReactNode> = {
  resource: <Database />,
  source:   <Search />,
  context:  <Target />,
  enrich:   <GitMerge />,
  filter:   <Sparkles />,
  generate: <MessageSquare />,
  gate:     <ShieldCheck />,
  execute:  <Zap />,
  measure:  <TrendingUp />,
};

const CATEGORY_CLASS: Record<GTMNodeCategory, string> = {
  resource: "gtm-node-resource",
  source:   "gtm-node-source",
  context:  "gtm-node-context",
  enrich:   "gtm-node-enrich",
  filter:   "gtm-node-filter",
  generate: "gtm-node-generate",
  gate:     "gtm-node-gate",
  execute:  "gtm-node-execute",
  measure:  "gtm-node-measure",
};

// ─── Node data types ──────────────────────────────────────────────────────────

type GTMNodeData = {
  node: GTMNode;
  result?: GTMNodeResult;
  running: boolean;
  selected: boolean;
  connectors: ConnectorMeta[];
  onSelect: () => void;
};

// ─── Status helpers ───────────────────────────────────────────────────────────

type RunStatus = "idle" | "running" | "done" | "error" | "pending" | "blocked";

function getStatus(_node: GTMNode, result?: GTMNodeResult, running = false): RunStatus {
  if (!result) return running ? "running" : "idle";
  if (result.blocked) return "blocked";
  if (result.pendingReview) return "pending";
  return result.ok ? "done" : "error";
}

function StatusIcon({ status }: { status: RunStatus }) {
  if (status === "running") return <Loader className="spin" />;
  if (status === "done")    return <CheckCircle2 />;
  if (status === "error")   return <AlertCircle />;
  if (status === "pending") return <Circle />;
  if (status === "blocked") return <Ban />;
  return null;
}

function itemCount(result: GTMNodeResult): string | null {
  const n = result.items.length;
  const m = result.meta ?? {};
  if (result.pendingReview) return `${typeof m.awaitingReview === "number" ? m.awaitingReview : n} awaiting review`;
  if (result.category === "measure") return `${n} staged`;
  if (result.category === "filter")  return `${n} qualified`;
  if (result.category === "generate") return `${n} drafted`;
  if (result.category === "source")  return `${n} found`;
  if (result.category === "enrich")  return `${n} enriched`;
  return n > 0 ? `${n}` : null;
}

// ─── Resource node (compact, dark) ───────────────────────────────────────────

function ResourceNodeComponent({ data }: NodeProps<Node<GTMNodeData>>) {
  const { node, connectors, selected, onSelect, result } = data;
  const conn = connectors.find((c) => c.id === node.connector && c.category === "resource");
  const configured = conn ? conn.configured && !conn.stub : false;

  return (
    <button
      className={cn("gtm-node gtm-node-resource", selected && "gtm-node-selected")}
      onClick={onSelect} type="button"
    >
      <div className="gtm-node-resource-inner">
        <span className={cn("gtm-node-resource-dot", configured ? "dot-ready" : "dot-missing")} />
        <span className="gtm-node-resource-name">{node.label}</span>
        {!configured && conn?.envKey && (
          <span className="gtm-node-resource-key">{conn.envKey}</span>
        )}
      </div>
      {result && !result.ok && (
        <span className="gtm-node-error-text">{result.error?.slice(0, 40)}</span>
      )}
      <Handle type="source" position={Position.Right} />
    </button>
  );
}

// ─── Context node (floating, distinct) ───────────────────────────────────────

function ContextNodeComponent({ data }: NodeProps<Node<GTMNodeData>>) {
  const { node, selected, onSelect, result } = data;
  const status = getStatus(node, result, data.running);
  const preview = node.config.query
    ? String(node.config.query).slice(0, 60)
    : node.config.name
    ? String(node.config.name)
    : node.connector;

  return (
    <button
      className={cn("gtm-node gtm-node-context", selected && "gtm-node-selected")}
      onClick={onSelect} type="button"
    >
      <Handle type="target" position={Position.Left} />
      <div className="gtm-node-header">
        <span className="gtm-node-icon">{CATEGORY_ICON.context}</span>
        <span className="gtm-node-connector">{node.connector}</span>
        {status !== "idle" && <span className="gtm-node-status"><StatusIcon status={status} /></span>}
      </div>
      <span className="gtm-node-label">{node.label}</span>
      <span className="gtm-node-preview">{preview}</span>
      <Handle type="source" position={Position.Right} />
      <Handle type="source" position={Position.Bottom} id="bottom" />
    </button>
  );
}

// ─── Standard work node ───────────────────────────────────────────────────────

function WorkNodeComponent({ data }: NodeProps<Node<GTMNodeData>>) {
  const { node, result, running, selected, onSelect } = data;
  const status   = getStatus(node, result, running);
  const count    = result ? itemCount(result) : null;
  const hasError = status === "error" || status === "blocked";
  const catClass = CATEGORY_CLASS[node.category] ?? "";

  return (
    <button
      className={cn("gtm-node", catClass, selected && "gtm-node-selected", hasError && "gtm-node-error")}
      onClick={onSelect} type="button"
    >
      <Handle type="target" position={Position.Left} />
      <div className="gtm-node-header">
        <span className="gtm-node-icon">{CATEGORY_ICON[node.category]}</span>
        <div className="gtm-node-header-right">
          <span className="gtm-node-connector">{node.connector}</span>
          {status !== "idle" && <span className="gtm-node-status"><StatusIcon status={status} /></span>}
        </div>
      </div>
      <span className="gtm-node-label">{node.label}</span>
      <span className="gtm-node-category">{node.category}</span>
      {count && !hasError && <span className="gtm-node-count">{count}</span>}
      {hasError && result?.error && (
        <span className="gtm-node-error-text">{result.error.slice(0, 55)}</span>
      )}
      <Handle type="source" position={Position.Right} />
    </button>
  );
}

const NODE_TYPES = {
  resourceNode: ResourceNodeComponent,
  contextNode:  ContextNodeComponent,
  workNode:     WorkNodeComponent,
};

function nodeType(category: GTMNodeCategory): string {
  if (category === "resource") return "resourceNode";
  if (category === "context")  return "contextNode";
  return "workNode";
}

// ─── Edge style by type ───────────────────────────────────────────────────────

function edgeClass(type: GTMEdgeType): string {
  if (type === "context")  return "edge-context";
  if (type === "feedback") return "edge-feedback";
  return "edge-data";
}

// ─── Build React Flow nodes/edges from GTMGraph ───────────────────────────────

function buildFlowGraph(
  graph: GTMGraph,
  result: GTMRunResult | null,
  running: boolean,
  selection: NodeSelection,
  connectors: ConnectorMeta[],
  onSelect: (id: string) => void
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = graph.nodes.map((n) => ({
    id: n.id,
    type: nodeType(n.category),
    position: n.position,
    draggable: true,
    selectable: false,
    data: {
      node: n,
      result: result?.nodes[n.id],
      running,
      selected: selection === n.id,
      connectors,
      onSelect: () => onSelect(n.id),
    } as GTMNodeData,
  }));

  const edges: Edge[] = graph.edges.map((e: GTMEdge) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: e.edgeType === "feedback" ? "default" : "smoothstep",
    className: edgeClass(e.edgeType),
    label: e.label,
    animated: e.edgeType === "feedback",
    // Feedback edges flow right → left visually (we reverse source/target in display only)
    ...(e.edgeType === "feedback" ? {
      sourceHandle: undefined,
      style: { strokeDasharray: "5 5" },
    } : {}),
  }));

  return { nodes, edges };
}

// ─── Canvas component ─────────────────────────────────────────────────────────

export function GraphCanvas({
  graph, result, running, selection, connectors, onSelect, onNodePositionChange,
}: {
  graph: GTMGraph;
  result: GTMRunResult | null;
  running: boolean;
  selection: NodeSelection;
  connectors: ConnectorMeta[];
  onSelect: (id: string) => void;
  onNodePositionChange?: (nodeId: string, position: { x: number; y: number }) => void;
}) {
  const handleSelect = useCallback((id: string) => onSelect(id), [onSelect]);

  const { nodes, edges } = useMemo(
    () => buildFlowGraph(graph, result, running, selection, connectors, handleSelect),
    [graph, result, running, selection, connectors, handleSelect]
  );

  const handleNodeDragStop = useCallback(
    (_event: unknown, node: Node) => {
      onNodePositionChange?.(node.id, node.position);
    },
    [onNodePositionChange]
  ) as Parameters<typeof ReactFlow>[0]["onNodeDragStop"];

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      onNodeDragStop={handleNodeDragStop}
      fitView
      fitViewOptions={{ padding: 0.14 }}
      minZoom={0.2}
      maxZoom={1.6}
      nodesConnectable={false}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={28} size={1} />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}
