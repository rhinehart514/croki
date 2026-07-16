import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import type { AtlasNode } from "./atlasTypes";

function AtlasIntentNodeView({ data }: NodeProps<AtlasNode>) {
  return (
    <article className="atlas-intent-node" data-atlas-kind="intent">
      <span>{data.provisional ? "Drover’s current read" : "What should change"}</span>
      <strong>{data.title}</strong>
      <small>{data.betCount} concrete {data.betCount === 1 ? "line" : "lines"} underway{data.provisional ? " · provisional" : ""}</small>
      {!data.intentNamed ? <p>{data.betCount ? "Current work remains visible while the wider direction is still open." : "Tell Drover what should change. It will read the venture, show its current understanding, and begin useful inward work."}</p> : null}
    </article>
  );
}

export const AtlasIntentNode = memo(AtlasIntentNodeView);
