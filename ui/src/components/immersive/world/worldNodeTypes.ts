// nodeTypes registry for the immersive world. Keyed by the React Flow `type` string that projectAtlas
// stamps (atlasIntent / atlasBet / atlasCrew / atlasCapability / founderWall / architectureElement),
// so the world consumes the SAME projected scene the legacy triptych does — no re-projection, no new
// data shape. Semantic-layer + working-theory nodes all carry type "architectureElement" and encode
// their archetype role in data.kind, so one dispatcher maps kind → archetype card for that type.
import type { NodeProps, NodeTypes } from "@xyflow/react";
import { EffortNode } from "../nodes/EffortNode";
import { IntentNode } from "../nodes/IntentNode";
import { TeammateNode } from "../nodes/TeammateNode";
import { CapabilityNode } from "../nodes/CapabilityNode";
import { WallNode } from "../nodes/WallNode";
import { ConceptNode } from "../nodes/ConceptNode";
import { SystemNode } from "../nodes/SystemNode";
import { MotionNode } from "../nodes/MotionNode";
import { CampaignNode } from "../nodes/CampaignNode";
import { RecordNode } from "../nodes/RecordNode";
import type { AtlasNode } from "@/components/atlas/atlasTypes";

// architectureElement carries every semantic-layer + theory role; dispatch on data.kind. Unknown kinds
// fall back to the concept card (the neutral paper card) rather than crashing on new roles.
function ArchitectureElementNode(props: NodeProps<AtlasNode>) {
  switch (props.data.kind) {
    case "system":
    case "product-loop":
      return SystemNode(props);
    case "motion":
      return MotionNode(props);
    case "campaign":
      return CampaignNode(props);
    case "outcome":
      return RecordNode(props);
    case "concept":
    case "theory":
    case "intent":
    default:
      return ConceptNode(props);
  }
}

export const WORLD_NODE_TYPES: NodeTypes = {
  atlasIntent: IntentNode,
  atlasBet: EffortNode,
  atlasCrew: TeammateNode,
  atlasCapability: CapabilityNode,
  founderWall: WallNode,
  architectureElement: ArchitectureElementNode,
};
