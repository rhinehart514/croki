// The venture's question at the center — the hub. Circular, hub-shadowed. Non-selectable in the
// projection, so it renders only the standing question / named intent.
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { NodeChrome } from "./nodeChrome";
import type { AtlasNode } from "@/components/atlas/atlasTypes";

export function IntentNode({ data }: NodeProps<AtlasNode>) {
  const named = Boolean(data.intentNamed);
  return (
    <NodeChrome data={data}>
      <div className="iw-hub">
        <div className="iw-hub-k">{named ? "Now driving" : "This venture"}</div>
        <div className="iw-hub-t">{data.title}</div>
        <div className="iw-hub-sub">{named ? "a working theory" : "say what should change"}</div>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </NodeChrome>
  );
}
