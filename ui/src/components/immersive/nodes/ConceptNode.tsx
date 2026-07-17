// Who-it-helps / product-vision archetype.
import type { NodeProps } from "@xyflow/react";
import { ArchetypeCard } from "./ArchetypeCard";
import type { AtlasNode } from "@/components/atlas/atlasTypes";

export function ConceptNode({ id, data }: NodeProps<AtlasNode>) {
  return <ArchetypeCard id={id} data={data} kicker="Who it helps" />;
}
