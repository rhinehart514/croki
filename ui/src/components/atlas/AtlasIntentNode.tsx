import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { EpistemicToken } from "./EpistemicToken";
import type { AtlasNode } from "./atlasTypes";

function AtlasIntentNodeView({ data }: NodeProps<AtlasNode>) {
  return (
    <article className="atlas-intent-node" data-atlas-kind="intent" data-epi-state={data.epistemic ?? "empty"}>
      {/* Reserved epistemic corner slot (Law 11), hollow for the hub — the venture question establishes
          nothing on its own; a working-theory hub reads Drover's provisional read. */}
      <EpistemicToken state={data.provisional ? "drovers-read" : (data.epistemic ?? null)} />
      {/* Hidden, centered handles so the hub's spoke edges route to its center. The hub is the
          source of every effort spoke and the anchor for theory anchors. */}
      <Handle type="source" position={Position.Right} className="atlas-hidden-handle" isConnectable={false} />
      <Handle type="target" position={Position.Left} className="atlas-hidden-handle" isConnectable={false} />
      <span>{data.provisional ? "Drover’s current read" : "the venture"}</span>
      <strong>{data.title}</strong>
      <small>{data.betCount} {data.betCount === 1 ? "effort" : "efforts"} underway{data.provisional ? " · provisional" : ""}</small>
      {!data.intentNamed ? <p>{data.betCount ? "Current work stays visible while the wider direction is still open." : "Tell Drover what should change. It will read the venture, show its current understanding, and begin useful inward work."}</p> : null}
    </article>
  );
}

export const AtlasIntentNode = memo(AtlasIntentNodeView);
