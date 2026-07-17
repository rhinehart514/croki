// Way-to-reach-people archetype.
import type { NodeProps } from "@xyflow/react";
import { ArchetypeCard } from "./ArchetypeCard";
import type { AtlasNode } from "@/components/atlas/atlasTypes";

export function MotionNode({ id, data }: NodeProps<AtlasNode>) {
  return <ArchetypeCard id={id} data={data} kicker="A way to reach people" />;
}
