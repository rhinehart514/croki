// The gate object on the stage — where outward acts stop for the founder's hand. Amber ONLY when
// something is actually waiting (data.active). Clicking opens the wall (Phase 2 renders the staged
// payload as a descend reading; Phase 1 routes through the existing onOpenWall seam).
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { NodeChrome } from "./nodeChrome";
import type { AtlasNode } from "@/components/atlas/atlasTypes";

export function WallNode({ data }: NodeProps<AtlasNode>) {
  const active = Boolean(data.active);
  return (
    <NodeChrome data={data}>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <button
        type="button"
        className="iw-wall"
        data-active={active ? "true" : "false"}
        onClick={() => data.onOpenWall()}
        aria-label={data.title}
      >
        <div className="iw-wall-k">{active ? "Needs your hand" : "The gate"}</div>
        <div className="iw-wall-t">{data.title}</div>
        {data.statement ? <div className="iw-wall-b">{data.statement}</div> : null}
      </button>
    </NodeChrome>
  );
}
