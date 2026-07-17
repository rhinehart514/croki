// Live-push / campaign archetype (efforts, drafts, and the gate roll up here).
import type { NodeProps } from "@xyflow/react";
import { ArchetypeCard } from "./ArchetypeCard";
import type { AtlasNode } from "@/components/atlas/atlasTypes";

export function CampaignNode({ id, data }: NodeProps<AtlasNode>) {
  return <ArchetypeCard id={id} data={data} kicker="A live campaign" />;
}
