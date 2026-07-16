import type { CanvasSelection } from "./directionTarget";
import type { FirmArchitectureElement, FirmBet, FirmConfiguration, FirmCrewMember, FirmStagedArtifact } from "@/types";
import { configuredParticipantName } from "./teammateDisplay";

export type ComposerTarget = {
  key: string;
  teammateRef: string | null;
  teammateRefs: string[];
  teammateName: string;
  teammateNames: string[];
  betId: string | null;
  betLabel: string | null;
  workRef: string | null;
  workLabel: string | null;
  position: FirmBet["position"] | null;
  title: string;
  prompt: string;
  consequence: string;
  buttonLabel: string;
  architectureId?: string | null;
  architectureStepId?: string | null;
  architectureRevision?: number | null;
  architectureLabel?: string | null;
  architectureRole?: FirmArchitectureElement["role"] | null;
  theoryId?: string | null;
  theorySubjectId?: string | null;
  theoryRevision?: number | null;
  theoryLabel?: string | null;
};

function artifactTitle(artifact: FirmStagedArtifact | undefined): string | null {
  if (!artifact) return null;
  for (const value of [artifact.title, artifact.summary, artifact.claim, artifact.label, artifact.path]) {
    const title = String(value ?? "").trim();
    if (title) return title;
  }
  return "Exact work";
}

export function targetForComposer(
  crew: FirmCrewMember[],
  bets: FirmBet[],
  selection: CanvasSelection,
  configuration: FirmConfiguration,
  firstUse: boolean,
  architectureElements: FirmArchitectureElement[] = [],
): ComposerTarget {
  const selectedBet = selection?.betId ? bets.find((bet) => bet.id === selection.betId) : undefined;
  const teammateRefs = selection?.teammateRefs ?? [];
  const selectedMembers = teammateRefs.map((ref) => crew.find((member) => member.ref === ref));
  const teammateNames = teammateRefs.map((ref, index) => configuredParticipantName(configuration, ref, selectedMembers[index], ref));
  const betOwner = selectedBet ? crew.find((member) => member.ref === selectedBet.teammateRef) : undefined;
  const teammateRef = teammateRefs[0] ?? selectedBet?.teammateRef ?? null;
  const teammate = crew.find((member) => member.ref === teammateRef) ?? betOwner;
  const name = configuredParticipantName(configuration, teammateRef, teammate, "Drover");
  const workRef = selectedBet && selection?.workRef ? selection.workRef : null;
  const workLabel = workRef
    ? artifactTitle(selectedBet?.staged.find((artifact) => artifact.id === workRef)) ?? "Exact work"
    : null;
  const architectureElement = selection?.architectureId
    ? architectureElements.find((element) => element.id === selection.architectureId)
    : undefined;

  if (selection?.theoryId && selection.theorySubjectId) {
    const theoryLabel = selection.theoryLabel || "Drover’s current read";
    return {
      key: `theory:${selection.theoryId}:${selection.theorySubjectId}:${selection.theoryRevision ?? "current"}`,
      teammateRef: null,
      teammateRefs: [],
      teammateName: "Drover",
      teammateNames: [],
      betId: null,
      betLabel: null,
      workRef: null,
      workLabel: null,
      position: null,
      title: `Correct ${theoryLabel}`,
      prompt: "What should Drover understand differently?",
      consequence: "Your correction will replace this provisional read while keeping connected work intact.",
      buttonLabel: "Correct this read",
      theoryId: selection.theoryId,
      theorySubjectId: selection.theorySubjectId,
      theoryRevision: selection.theoryRevision ?? null,
      theoryLabel,
    };
  }

  if (architectureElement) {
    const step = selection?.architectureStepId && architectureElement.role === "product-loop"
      ? architectureElement.steps?.find((candidate) => candidate.id === selection.architectureStepId)
      : null;
    const architectureLabel = step?.label ?? architectureElement.name;
    const roleLabel = architectureElement.role === "concept"
      ? "thought"
      : architectureElement.role.replace("-", " ");
    return {
      key: `architecture:${architectureElement.id}:${step?.id ?? "all"}:${selection?.architectureRevision ?? "current"}`,
      teammateRef: null,
      teammateRefs: [],
      teammateName: "Drover",
      teammateNames: [],
      betId: null,
      betLabel: null,
      workRef: null,
      workLabel: null,
      position: null,
      architectureId: architectureElement.id,
      architectureStepId: step?.id ?? null,
      architectureRevision: selection?.architectureRevision ?? null,
      architectureLabel,
      architectureRole: architectureElement.role,
      title: `Direct ${architectureLabel}`,
      prompt: architectureElement.role === "concept"
        ? "What should Drover understand about this thought?"
        : `What should change about this ${roleLabel}?`,
      consequence: architectureElement.role === "concept"
        ? "This adds context; it will not change what Drover does unless you make it reusable."
        : `Drover will carry this ${roleLabel} and its bounded trace into the next work it prepares.`,
      buttonLabel: `Direct this ${roleLabel}`,
    };
  }

  if (selectedBet) {
    const shared = {
      teammateRef,
      teammateRefs,
      teammateName: name,
      teammateNames,
      betId: selectedBet.id,
      betLabel: selectedBet.intent,
      workRef,
      workLabel,
      position: selectedBet.position,
    };
    if (selectedBet.position === "ended") return {
      ...shared,
      key: `bet:${selectedBet.id}:${workRef ?? "all"}:ended:${teammateRefs.join(",")}`,
      title: "This direction has ended",
      prompt: selectedBet.intent,
      consequence: "Choose current work to keep directing the venture.",
      buttonLabel: "Direction ended",
    };
    if (workRef) return {
      ...shared,
      key: `work:${selectedBet.id}:${workRef}:${teammateRefs.join(",")}`,
      title: `Direct ${workLabel}`,
      prompt: selectedBet.position === "at-wall"
        ? "Refine or redirect this exact work while its outward act waits…"
        : "What should change about this exact work?",
      consequence: `Your direction stays attached to “${workLabel}.”`,
      buttonLabel: "Direct this work",
    };
    return {
      ...shared,
      key: `bet:${selectedBet.id}:live:${teammateRefs.join(",")}`,
      title: selectedBet.position === "at-wall" ? "Direct this held work" : `Direct ${selectedBet.intent}`,
      prompt: selectedBet.position === "at-wall"
        ? "Refine or redirect the inward work while the exact outward act waits…"
        : "What should change here?",
      consequence: `Your direction stays with “${selectedBet.intent}.”`,
      buttonLabel: "Direct this work",
    };
  }

  if (teammateRefs.length) {
    const label = teammateNames.join(" + ");
    return {
      key: `teammates:${teammateRefs.join(",")}`,
      teammateRef,
      teammateRefs,
      teammateName: name,
      teammateNames,
      betId: null,
      betLabel: null,
      workRef: null,
      workLabel: null,
      position: null,
      title: teammateRefs.length === 1 ? `Direct ${name}` : `Direct ${label}`,
      prompt: teammateRefs.length === 1 ? "What should change?" : "What should they work through together?",
      consequence: `${label} will turn this direction into visible, attributable work.`,
      buttonLabel: teammateRefs.length === 1 ? `Direct ${name}` : "Direct selected teammates",
    };
  }

  if (firstUse) return {
    key: `firm:${configuration.revision}:first-use`, teammateRef: null, teammateRefs: [], teammateName: "Drover", teammateNames: [],
    betId: null, betLabel: null, workRef: null, workLabel: null, position: null,
    title: "Start with the bound product", prompt: "What should this venture accomplish first?",
    consequence: "Drover will read the bound repository, show its current understanding, and begin useful inward work.", buttonLabel: "Send to Drover",
  };

  return {
    key: `firm:${configuration.revision}`, teammateRef: null, teammateRefs: [], teammateName: "Drover", teammateNames: [],
    betId: null, betLabel: null, workRef: null, workLabel: null, position: null,
    title: "What should change?", prompt: "Tell Drover what you want to change…",
    consequence: "Drover will show its current understanding and begin safe, inspectable work.",
    buttonLabel: "Send to Drover",
  };
}
