import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { WorkIndexOutlineObject } from "@/api";
import { objectMapSummary, objectMapTypeLabel } from "./ventureMapModel";

export type VentureGraphNodeData = Record<string, unknown> & {
  object: WorkIndexOutlineObject;
  connectionCount: number;
  selected: boolean;
  quiet: boolean;
  onSelect: (id: string) => void;
};

export type VentureGraphFlowNode = Node<VentureGraphNodeData>;

function VentureGraphNodeView({ data }: NodeProps<VentureGraphFlowNode>) {
  const type = data.object.type.toLowerCase();
  const summary = objectMapSummary(data.object);
  return (
    <article
      className="venture-graph-node"
      data-kind={type}
      data-territory={data.object.territory ?? "context"}
      data-selected={data.selected ? "true" : "false"}
      data-quiet={data.quiet ? "true" : "false"}
      data-gap={data.connectionCount === 0 ? "true" : "false"}
    >
      <Handle className="venture-graph-handle" type="target" position={Position.Left} />
      <button
        type="button"
        className="venture-graph-node-main nodrag"
        aria-pressed={data.selected}
        aria-label={`Inspect ${data.object.name}`}
      >
        <span className="venture-graph-node-type">{objectMapTypeLabel(data.object)}</span>
        <strong>{data.object.name}</strong>
        {summary ? <span className="venture-graph-node-summary">{summary}</span> : null}
        <span className="venture-graph-node-foot">
          {data.connectionCount ? `${data.connectionCount} ${data.connectionCount === 1 ? "link" : "links"}` : "Not connected"}
          {data.object.assertion === "tentative" ? <i>Working read</i> : null}
        </span>
      </button>
      <Handle className="venture-graph-handle" type="source" position={Position.Right} />
    </article>
  );
}

export const VentureGraphNode = memo(VentureGraphNodeView);
