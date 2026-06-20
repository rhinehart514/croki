import { useMemo } from "react";
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Check, EyeOff, Link2Off } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EvidenceState, FunnelStage, ScanReport } from "@/types";

type StageNodeData = FunnelStage & {
  selected: boolean;
  onSelect: (id: string) => void;
};

function stateIcon(state: EvidenceState) {
  if (state === "proven") return <Check aria-hidden="true" />;
  if (state === "gap") return <Link2Off aria-hidden="true" />;
  return <EyeOff aria-hidden="true" />;
}

function StageNode({ data }: NodeProps<Node<StageNodeData>>) {
  return (
    <button
      className={cn("stage-node", `stage-${data.state}`, data.selected && "stage-selected")}
      onClick={() => data.onSelect(data.id)}
      type="button"
    >
      <Handle type="target" position={Position.Left} />
      <span className="stage-icon">{stateIcon(data.state)}</span>
      <span className="stage-label">{data.label}</span>
      <span className="stage-state">{data.state}</span>
      <Handle type="source" position={Position.Right} />
    </button>
  );
}

const nodeTypes = { stage: StageNode };

export function ReportCanvas({
  report,
  selectedId,
  onSelect,
}: {
  report: ScanReport;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const nodes = useMemo<Node<StageNodeData>[]>(
    () =>
      report.funnel.stages.map((stage, index) => ({
        id: stage.id,
        type: "stage",
        position: { x: index * 245, y: index === 1 ? 82 : 110 },
        data: {
          ...stage,
          selected: selectedId === stage.id,
          onSelect,
        },
      })),
    [onSelect, report, selectedId],
  );

  const edges = useMemo<Edge[]>(
    () =>
      report.funnel.edges.map((edge) => ({
        ...edge,
        animated: edge.state === "gap",
        label: edge.state === "gap" ? "source lost" : undefined,
        className: edge.state === "gap" ? "edge-gap" : "edge-proven",
      })),
    [report],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.24 }}
      minZoom={0.35}
      maxZoom={1.35}
      nodesDraggable={false}
      nodesConnectable={false}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={24} size={1} />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}
