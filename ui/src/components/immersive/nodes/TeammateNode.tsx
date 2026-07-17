// Crew face + current-work claim. Presence tone (working / asking / idle) and the "now doing" line
// come from crewActivity in projectAtlas — deterministic, never a model call. Amber is not used here;
// a teammate awaiting the founder reads as "asking" but the amber signal lives on the effort/gate.
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { NodeChrome } from "./nodeChrome";
import { crewColor, initialFor } from "./nodeCrew";
import type { AtlasNode } from "@/components/atlas/atlasTypes";

export function TeammateNode({ id, data }: NodeProps<AtlasNode>) {
  const color = crewColor(data.agentRef);
  const working = data.crewPresence === "working" || data.crewPresence === "asking";
  return (
    <NodeChrome data={data}>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <button
        type="button"
        className="iw-mate"
        style={{ ["--crew" as string]: color }}
        onClick={() => data.onSelect(id)}
        aria-label={`${data.title}`}
      >
        <div className="iw-mate-head">
          <span className="iw-mate-face">{initialFor(data.title)}</span>
          <div>
            <div className="iw-mate-name">{data.title}</div>
            {data.motionLabel ? <div className="iw-mate-role">{data.motionLabel}</div> : null}
          </div>
        </div>
        <div className="iw-mate-doing" data-idle={working ? "false" : "true"}>
          {working ? <span className="iw-work-pulse" /> : null}
          {data.crewDoing ?? "standing by"}
        </div>
      </button>
    </NodeChrome>
  );
}
