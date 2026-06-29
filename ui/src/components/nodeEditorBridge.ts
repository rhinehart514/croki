import type {
  EngineSubsystem, GateDecision, GTMGraph, GTMRunResult,
} from "@/types";

// The node editor's dependency bag — everything the channel graph's step editor needs that the
// canvas doesn't already hold. The right zone of the canvas shows this editor whenever a node is
// selected.
export type NodeEditorBridge = {
  flowRuns: GTMRunResult[];
  subsystem: EngineSubsystem | null;
  onApproveGate: (id: string) => void;
  onSubmitReview: (id: string, decisions: Record<string, GateDecision>) => void;
  onRunNode: (id: string) => void;
  onUpdateGraph: (graph: GTMGraph) => void;
  onOpenArtifact: (type: "agent" | "skill", ref: string) => void;
  onDeleteNode: (id: string) => void;
  onClose: () => void;
};
