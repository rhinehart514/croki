import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { ShieldCheck } from "lucide-react";
import type { AtlasNode } from "./atlasTypes";

function FounderWallView({ data }: NodeProps<AtlasNode>) {
  return (
    <button type="button" className="atlas-wall" data-active={data.active ? "true" : "false"} data-atlas-kind="wall" data-atlas-id="atlas:wall" onClick={() => data.onOpenWall()}>
      <span aria-hidden="true"><i /><ShieldCheck /></span>
      <strong>{data.title}</strong>
      <small>{data.statement}</small>
      {data.active ? <em>Review the exact outward act</em> : null}
    </button>
  );
}

export const FounderWall = memo(FounderWallView);
