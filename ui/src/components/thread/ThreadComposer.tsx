import { motion } from "motion/react";
import type { ConversationReplyResult, FirmActiveDrive, WorkIndexItem } from "@/api";
import type { FirmLens } from "@/types";
import { morphMotion } from "@/lib/motion";
import type { CanvasSelection } from "@/components/firm/directionTarget";
import { NowComposer } from "@/components/now/NowComposer";
import type { ProductGtmWalkthroughStep } from "@/components/product-gtm/productGtmWorkflow";
import { useRepositoryFiles } from "@/components/now/useRepositoryFiles";
import { WorkComposerBar, type WorkChatMode, type WorkModelChoice } from "@/components/work-mode/WorkComposerBar";
import type { ArtifactSectionFocus } from "@/components/review/artifactSectionFocus";

export function ThreadComposer({ ventureId, ventureName, repository, surface = "context", contextKind = null, item, lens, draft, isHome, readOnly, readOnlyReason, subjectRefs = [], scopeLabel, targetAgentRef = null, workflowStep = null, workRef = null, productGtmView = false, workflowSketch = false, modelBranchRef = null, artifactFocus = null, artifactFocusRequest = 0, onClearArtifactFocus, workChatMode = "code", canvasAttention = 0, onWorkChatModeChange = () => undefined, modelChoice, onModelChoice, activeDrives = [], onSubmitStart, onSubmitAccepted, onSubmitFailed, onDriven, onWorkRouted }: {
  ventureId: string; ventureName: string; item: WorkIndexItem | null; lens: FirmLens | null; draft: boolean; isHome: boolean;
  repository?: string; surface?: "work" | "context"; contextKind?: "product-gtm" | null; readOnly: boolean; readOnlyReason: string | null; subjectRefs?: string[]; scopeLabel?: string | null; targetAgentRef?: string | null; workflowStep?: ProductGtmWalkthroughStep | null; workRef?: string | null; productGtmView?: boolean; workflowSketch?: boolean; modelBranchRef?: string | null; artifactFocus?: ArtifactSectionFocus | null; artifactFocusRequest?: number; onClearArtifactFocus?: () => void; workChatMode?: WorkChatMode; canvasAttention?: number; onWorkChatModeChange?: (mode: WorkChatMode) => void; modelChoice: WorkModelChoice; onModelChoice: (choice: WorkModelChoice) => void; activeDrives?: FirmActiveDrive[]; onSubmitStart?: (message: string) => void; onSubmitAccepted?: (message: string, result: ConversationReplyResult) => void; onSubmitFailed?: (message: string) => void; onDriven: () => void; onWorkRouted?: (threadRef: string) => void;
}) {
  const betId = item?.subjectRefs.find((ref) => ref.startsWith("bet:"))?.replace(/^bet:/, "") ?? null;
  const productGtmContext = surface === "context" && contextKind === "product-gtm";
  const contextualAgentRef = surface !== "work" && !productGtmContext ? targetAgentRef : null;
  const targetedWorkRef = artifactFocus?.artifactRef.replace(/^work:/, "") ?? workRef;
  const selection: CanvasSelection = contextualAgentRef
    ? { betId: null, workRef: null, teammateRefs: [contextualAgentRef] }
    : item && !isHome ? { betId, workRef: targetedWorkRef, teammateRefs: [], ...(item.threadRef.startsWith("thread:legacy-") ? {} : { threadRef: item.threadRef }) } : null;
  const threadKey = item?.threadRef ?? (subjectRefs.length ? `subjects:${subjectRefs.join("|")}` : "draft");
  const targetAgent = contextualAgentRef ? lens?.configuration?.agents.find((agent) => agent.ref === contextualAgentRef) : null;
  const agentChat = surface === "work" && workChatMode === "product-gtm";
  // `@`-file scoping is a code-mode affordance: the founder names an exact repo path for the coding
  // agent. Off in Product / GTM and in contextual conversation, where the repository is not the subject.
  const codeChat = surface === "work" && workChatMode === "code";
  const repositoryFiles = useRepositoryFiles(ventureId, codeChat);
  // The drive running on this exact Thread — matched by its bet so the Stop affordance is never
  // mis-attributed to a fresh, not-yet-anchored drive. Interrupt belongs to code work, not agent chat.
  const activeDrive = codeChat && betId ? activeDrives.find((drive) => drive.betId === betId) ?? null : null;
  const controls = surface === "work" && repository ? <WorkComposerBar key={threadKey} ventureId={ventureId} threadKey={threadKey} repository={repository} disabled={readOnly} mode={workChatMode} attention={canvasAttention} onModeChange={onWorkChatModeChange} onChange={onModelChoice} /> : null;
  const placeholder = targetAgent
    ? `Direct ${targetAgent.name}…`
    // Short enough to hold one line: this register only appears with the Canvas open, which is exactly
    // when the composer column is at its narrowest, and the Canvas beside it already shows the venture.
    : agentChat ? "Direct Product / GTM…"
    : artifactFocus ? `Change “${artifactFocus.sectionTitle}”…`
    // Walking a play, the founder is standing on one named step. Corrections land there, so the composer
    // says which step it is rather than asking again for the whole mechanism.
    : workflowStep ? `Correct “${workflowStep.label}”…`
    : surface === "work" ? draft || isHome ? "Describe what you want to build…" : productGtmView ? "Correct this Product / GTM view…" : workflowSketch ? "Correct this workflow…" : "Ask for a change…" : contextKind === "product-gtm" ? "Describe the Product or go-to-market mechanism…" : "Ask about this…";
  const submissionMode = productGtmContext ? "work" : agentChat ? "product-gtm" : surface === "work" ? "work" : targetAgent ? "auto" : "conversation";
  const directSdk = productGtmContext || (surface === "work" && !agentChat);
  // In Work the composer is one continuous element across the rest↔docked flip; the
  // shared layoutId morphs it between anchors instead of hard-cutting. Contextual
  // composers never re-anchor, so they stay plain.
  return <motion.div className="thread-composer" data-chat-mode={surface === "work" ? workChatMode : undefined} {...(surface === "work" ? morphMotion(`thread-composer:${ventureId}`) : {})}><NowComposer ventureId={ventureId} ventureName={ventureName} selection={selection} subjectRefs={subjectRefs} scopeLabel={targetAgent?.name ?? scopeLabel ?? (draft || isHome ? null : item?.founderIntent ?? null)} hasWork={Boolean(lens?.bets.length)} variant="dock" submissionMode={submissionMode} readOnly={readOnly} readOnlyReason={readOnlyReason} autoFocus={draft} focusRequest={artifactFocusRequest} placeholder={placeholder} runtimeOverride={directSdk ? modelChoice.runtime : targetAgent?.runtime.provider ?? null} modelOverride={directSdk ? modelChoice.model : targetAgent?.runtime.model ?? null} effortOverride={directSdk ? modelChoice.effort : agentChat ? "medium" : null} composerControls={controls} configuration={productGtmContext ? null : lens?.configuration ?? null} productGtmView={agentChat || productGtmView || contextKind === "product-gtm"} workflowSketch={workflowSketch} workflowStep={workflowStep} modelBranchRef={modelBranchRef} artifactSection={artifactFocus} onClearArtifactSection={onClearArtifactFocus} repositoryFiles={repositoryFiles} activeDrive={activeDrive} journeyImportEnabled={productGtmContext} onSubmitStart={onSubmitStart} onSubmitAccepted={onSubmitAccepted} onSubmitFailed={onSubmitFailed} onDriven={onDriven} onWorkRouted={onWorkRouted} /></motion.div>;
}
