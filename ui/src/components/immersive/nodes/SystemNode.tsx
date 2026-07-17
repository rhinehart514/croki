// Durable machinery archetype.
import type { NodeProps } from "@xyflow/react";
import { ArchetypeCard } from "./ArchetypeCard";
import type { AtlasNode } from "@/components/atlas/atlasTypes";

export function SystemNode({ id, data }: NodeProps<AtlasNode>) {
  return <ArchetypeCard id={id} data={data} kicker="How it works" />;
}
