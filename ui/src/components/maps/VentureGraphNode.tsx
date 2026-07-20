import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { WorkIndexOutlineObject } from "@/api";
import type { SystemWorkState } from "@/components/system-mode/systemWorkState";
import { objectMapSummary, objectMapTypeLabel } from "./ventureMapModel";

export type VentureGraphNodeData = Record<string, unknown> & {
  object: WorkIndexOutlineObject;
  connectionCount: number;
  selected: boolean;
  quiet: boolean;
  workState: SystemWorkState | null;
  onSelect: (id: string) => void;
};

export type VentureGraphFlowNode = Node<VentureGraphNodeData>;

function VentureGraphNodeView({ data }: NodeProps<VentureGraphFlowNode>) {
  const type = data.object.type.toLowerCase();
  const returned = type === "return";
  const summary = objectMapSummary(data.object);
  return (
    <article
      className="venture-graph-node"
      data-kind={type}
      data-territory={data.object.territory ?? "context"}
      data-selected={data.selected ? "true" : "false"}
      data-quiet={data.quiet ? "true" : "false"}
      data-gap={data.connectionCount === 0 ? "true" : "false"}
      data-work-state={data.workState ?? "none"}
    >
      <Handle className="venture-graph-handle" type="target" position={returned ? Position.Right : Position.Left} />
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
          <span>{data.connectionCount ? `${data.connectionCount} ${data.connectionCount === 1 ? "link" : "links"}` : "Not connected"}</span>
          {data.workState ? <i className="venture-graph-node-work" data-state={data.workState}>{workLabel(data.workState)}</i> : null}
          {data.object.assertion === "tentative" ? <i>Working read</i> : null}
        </span>
      </button>
      <Handle className="venture-graph-handle" type="source" position={returned ? Position.Left : Position.Right} />
    </article>
  );
}

export const VentureGraphNode = memo(VentureGraphNodeView);

function workLabel(state: SystemWorkState) {
  if (state === "needs-review") return "Needs review";
  if (state === "working") return "Working";
  if (state === "failed") return "Failed";
  return "Completed";
}
