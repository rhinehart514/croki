import type { Edge, Node } from "@xyflow/react";
import type {
  ArchitectureRole,
  FirmArchitectureElement,
  FirmArchitectureJoin,
  FirmArchitecturePressure,
  FirmWorkingTheorySubject,
  FirmBet,
  FirmOutcome,
  FirmWorkflowStage,
} from "@/types";

export type AtlasAltitude = "venture" | "architecture" | "detail";
export type AtlasVisualKind = ArchitectureRole | "theory" | "intent" | "group" | "bet" | "work" | "outcome" | "wall" | "teammate" | "capability";

export type AtlasDecisionBand = "near-intent" | "drifting" | "approaching-wall" | "settled";

export type AtlasWorkflowStage = FirmWorkflowStage;

export type AtlasNodeData = Record<string, unknown> & {
  kind: AtlasVisualKind;
  title: string;
  statement?: string | null;
  element?: FirmArchitectureElement;
  theorySubject?: FirmWorkingTheorySubject;
  theoryId?: string;
  theoryRevision?: number;
  sourceRefs?: string[];
  conversationRefs?: string[];
  provisional?: boolean;
  arrivalReceiptId?: string;
  bet?: FirmBet;
  effortKicker?: string;
  effortTone?: "underway" | "needs" | "settled";
  draftCount?: number;
  draftTitle?: string | null;
  outcome?: FirmOutcome;
  join?: FirmArchitectureJoin;
  active?: boolean;
  atWall?: boolean;
  stateLabel?: string;
  outputLabel?: string;
  verbLabel?: string;
  workKind?: "product-change" | "draft";
  teammates?: Array<{ ref: string; name: string }>;
  continuation?: string | null;
  agentRef?: string;
  authority?: "read" | "wall";
  crewPresence?: "working" | "asking" | "idle";
  crewDoing?: string;
  capabilityConnected?: boolean;
  capabilityKind?: string;
  decisionBand?: AtlasDecisionBand;
  orbitSide?: "left" | "right";
  motionLabel?: string;
  memberRefs?: string[];
  workflow?: AtlasWorkflowStage[];
  machineryCounts?: Array<{ label: string; count: number }>;
  expanded?: boolean;
  materializing?: boolean;
  betCount?: number;
  revision?: number;
  intentNamed?: boolean;
  pressure: FirmArchitecturePressure[];
  // Slice 3: the derived epistemic state for this node's token (deriveEpistemicState), or null when the
  // node carries no epistemic claim of its own (the slot renders as the reserved hollow placeholder).
  epistemic?: import("./deriveEpistemicState").EpistemicState | null;
  altitude: AtlasAltitude;
  focusRole: "focus" | "related" | "context";
  selected: boolean;
  readOnly: boolean;
  onSelect: (id: string) => void;
  onFocus: (id: string) => void;
  onPromote: (element: FirmArchitectureElement) => void;
  onActivateMotion: (element: FirmArchitectureElement) => void;
  onBeginConnection: (id: string) => void;
  onOpenWall: (itemId?: string) => void;
  onRevealMachinery: (id: string) => void;
  onFold?: () => void;
  onDive?: (id: string) => void;
};

export type AtlasNode = Node<AtlasNodeData>;
export type AtlasEdge = Edge;

export type AtlasScene = {
  nodes: AtlasNode[];
  edges: AtlasEdge[];
  related: Map<string, Set<string>>;
};
