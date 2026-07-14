// CrewNode.tsx — one teammate's working position on the lens. CrewFace is the only teammate portrait
// door (DESIGN.md); this card feeds it the ref and nothing else — no card-inside-card, a hairline and
// the face carry the whole identity.

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { CrewFace } from "@/components/crew/CrewFace";
import type { FirmCrewMember } from "@/types";

export type CrewNodeData = { crew: FirmCrewMember; working: boolean };

export function CrewNode({ data }: NodeProps & { data: CrewNodeData }) {
  const { crew, working } = data;
  const name = crew.soul?.name && typeof crew.soul.name === "string" ? crew.soul.name : crew.ref;
  return (
    <div className="firm-lens-crew-node">
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      <CrewFace agentRef={crew.ref} size={40} state={working ? "working" : "idle"} />
      <span className="firm-lens-crew-node-name">{name}</span>
    </div>
  );
}
