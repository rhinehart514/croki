import { useCallback, useState } from "react";
import type { WorkIndexItem } from "@/api";
import type { FirmLens } from "@/types";
import type { CanvasSelection } from "@/components/firm/directionTarget";
import { NowComposer } from "@/components/now/NowComposer";
import { WorkComposerBar, type WorkChatMode, type WorkModelChoice } from "@/components/work-mode/WorkComposerBar";
import type { ArtifactSectionFocus } from "@/components/review/artifactSectionFocus";

export function ThreadComposer({ ventureId, ventureName, repository, surface = "context", contextKind = null, item, lens, draft, isHome, readOnly, readOnlyReason, subjectRefs = [], scopeLabel, targetAgentRef = null, workRef = null, productGtmView = false, workflowSketch = false, modelBranchRef = null, artifactFocus = null, artifactFocusRequest = 0, onClearArtifactFocus, workChatMode = "code", onWorkChatModeChange = () => undefined, onSubmitStart, onSubmitFailed, onDriven, onWorkRouted }: {
  ventureId: string; ventureName: string; item: WorkIndexItem | null; lens: FirmLens | null; draft: boolean; isHome: boolean;
  repository?: string; surface?: "work" | "context"; contextKind?: "product-gtm" | "release" | null; readOnly: boolean; readOnlyReason: string | null; subjectRefs?: string[]; scopeLabel?: string | null; targetAgentRef?: string | null; workRef?: string | null; productGtmView?: boolean; workflowSketch?: boolean; modelBranchRef?: string | null; artifactFocus?: ArtifactSectionFocus | null; artifactFocusRequest?: number; onClearArtifactFocus?: () => void; workChatMode?: WorkChatMode; onWorkChatModeChange?: (mode: WorkChatMode) => void; onSubmitStart?: (message: string) => void; onSubmitFailed?: (message: string) => void; onDriven: () => void; onWorkRouted?: (threadRef: string) => void;
}) {
  const [modelChoice, setModelChoice] = useState<WorkModelChoice>({ runtime: null, model: null, effort: "high" });
  const chooseModel = useCallback((choice: WorkModelChoice) => setModelChoice((current) => current.runtime === choice.runtime && current.model === choice.model && current.effort === choice.effort ? current : choice), []);
  const betId = item?.subjectRefs.find((ref) => ref.startsWith("bet:"))?.replace(/^bet:/, "") ?? null;
  const contextualAgentRef = surface !== "work" ? targetAgentRef : null;
  const targetedWorkRef = artifactFocus?.artifactRef.replace(/^work:/, "") ?? workRef;
  const selection: CanvasSelection = contextualAgentRef
    ? { betId: null, workRef: null, teammateRefs: [contextualAgentRef] }
    : item && !isHome ? { betId, workRef: targetedWorkRef, teammateRefs: [], ...(item.threadRef.startsWith("thread:legacy-") ? {} : { threadRef: item.threadRef }) } : null;
  const threadKey = item?.threadRef ?? (subjectRefs.length ? `subjects:${subjectRefs.join("|")}` : "draft");
  const targetAgent = contextualAgentRef ? lens?.configuration?.agents.find((agent) => agent.ref === contextualAgentRef) : null;
  const agentChat = surface === "work" && workChatMode === "product-gtm";
  const controls = surface === "work" && repository ? <WorkComposerBar key={threadKey} ventureId={ventureId} threadKey={threadKey} repository={repository} disabled={readOnly} mode={workChatMode} onModeChange={onWorkChatModeChange} onChange={chooseModel} /> : null;
  const placeholder = targetAgent
    ? `Direct ${targetAgent.name}…`
    : agentChat ? "Explore Product / GTM visually…"
    : artifactFocus ? `Change “${artifactFocus.sectionTitle}”…`
    : surface === "work" ? draft || isHome ? "Describe what you want to build…" : productGtmView ? "Correct this Product / GTM view…" : workflowSketch ? "Correct this workflow…" : "Ask for a change…" : contextKind === "product-gtm" ? "Describe the Product or go-to-market mechanism…" : "Ask about this…";
  const submissionMode = agentChat ? "product-gtm" : surface === "work" ? "work" : targetAgent ? "auto" : "conversation";
  return <div className="thread-composer" data-chat-mode={surface === "work" ? workChatMode : undefined}><NowComposer ventureId={ventureId} ventureName={ventureName} selection={selection} subjectRefs={subjectRefs} scopeLabel={targetAgent?.name ?? scopeLabel ?? (draft || isHome ? null : item?.founderIntent ?? null)} hasWork={Boolean(lens?.bets.length)} variant="dock" submissionMode={submissionMode} readOnly={readOnly} readOnlyReason={readOnlyReason} autoFocus={draft} focusRequest={artifactFocusRequest} placeholder={placeholder} runtimeOverride={agentChat ? null : targetAgent?.runtime.provider ?? modelChoice.runtime} modelOverride={agentChat ? null : targetAgent?.runtime.model ?? modelChoice.model} effortOverride={agentChat ? "medium" : controls ? modelChoice.effort : null} composerControls={controls} configuration={lens?.configuration ?? null} productGtmView={agentChat || productGtmView || contextKind === "product-gtm"} workflowSketch={workflowSketch} modelBranchRef={modelBranchRef} artifactSection={artifactFocus} onClearArtifactSection={onClearArtifactFocus} onSubmitStart={onSubmitStart} onSubmitFailed={onSubmitFailed} onDriven={onDriven} onWorkRouted={onWorkRouted} /></div>;
}
