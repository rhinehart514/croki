// What the market said (outcome / returned reality) archetype.
import type { NodeProps } from "@xyflow/react";
import { ArchetypeCard } from "./ArchetypeCard";
import type { AtlasNode } from "@/components/atlas/atlasTypes";

export function RecordNode({ id, data }: NodeProps<AtlasNode>) {
  return <ArchetypeCard id={id} data={data} kicker="What came back" />;
}
