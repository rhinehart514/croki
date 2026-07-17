import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { ShieldCheck } from "lucide-react";
import { EpistemicToken } from "./EpistemicToken";
import type { AtlasNode } from "./atlasTypes";

function FounderWallView({ data }: NodeProps<AtlasNode>) {
  return (
    <button type="button" className="atlas-wall" data-active={data.active ? "true" : "false"} data-atlas-kind="wall" data-atlas-id="atlas:wall" data-epi-state="empty" onClick={() => data.onOpenWall()}>
      {/* Reserved epistemic corner slot (Law 11), hollow — the wall is a founder-consequence boundary
          (amber --gap), never an epistemic object; its slot stays a visible "nothing establishes this". */}
      <EpistemicToken state={null} />
      <span aria-hidden="true"><i /><ShieldCheck /></span>
      <strong>{data.title}</strong>
      <small>{data.statement}</small>
      {data.active ? <em>Review the exact outward act</em> : null}
    </button>
  );
}

export const FounderWall = memo(FounderWallView);
