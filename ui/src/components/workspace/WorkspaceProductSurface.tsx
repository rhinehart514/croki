import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Footprints, LoaderCircle, Map, Play } from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useEffect, useMemo, useState, type ComponentProps, type ReactNode, type RefObject } from "react";
import { getJourneyMappingProposals, getJourneyObservations, getMarketMovement, replyInConversation, type JourneyMappingProposalRecord, type JourneyObservationSnapshot, type SystemIndex, type WorkIndex } from "@/api";
import type { FirmPlacement, MarketMovementIndex } from "@/types";
import { JourneyMappingReview } from "@/components/product-gtm/JourneyMappingReview";
import { ProductGtmSurface } from "@/components/product-gtm/ProductGtmSurface";
import { deriveWorkflowRegister, parseProductGtmWorkflowNodeId, playRunStates, productGtmWorkflowGraph, productGtmWorkflowNodeId, walkthroughStepFor, type ProductGtmWalkthroughStep } from "@/components/product-gtm/productGtmWorkflow";
import type { WorkModelChoice } from "@/components/work-mode/WorkComposerBar";
import { WORK_MODELS } from "@/components/work-mode/work-models";
import type { WorkspaceResource } from "./useWorkspaceResources";

function ResourceNotice({ resource }: { resource: WorkspaceResource<unknown> }) {
  if (!resource.error) return null;
  return (
    <div className="workspace-resource-notice" role={resource.status === "error" ? "alert" : "status"}>
      <strong>{resource.status === "stale" ? "Showing the last current view." : "This view could not load."}</strong>
      <span>{resource.status === "stale" ? "Your last current venture model is still visible while Croki reconnects." : "The local venture model is unavailable. Reopen the Product or restart Croki; no Product truth was changed."}</span>
    </div>
  );
}

export function WorkspaceProductSurface({
  ventureId, motionProps, conversation, contextualChatOpen, openerRef,
  systemIndex, workIndex, selectedRef, camera, placement, modelChoice, threadRef, readOnlyReason, systemResource,
  onCameraChange, onFocus, onUseAgent, onOpenWork, onBeginScopedThread, onNewThread,
  onChanged, onContextualChatOpen, onWalkthroughStep,
}: {
  ventureId: string;
  motionProps: ComponentProps<typeof motion.div>;
  conversation: ReactNode;
  contextualChatOpen: boolean;
  openerRef: RefObject<HTMLElement | null>;
  systemIndex: SystemIndex | null;
  workIndex: WorkIndex | null;
  selectedRef: string | null;
  camera: import("@xyflow/react").Viewport | null;
  placement: FirmPlacement;
  modelChoice: WorkModelChoice;
  threadRef?: string | null;
  readOnlyReason: string | null;
  systemResource: WorkspaceResource<SystemIndex>;
  onCameraChange: (camera: import("@xyflow/react").Viewport) => void;
  onFocus: (ref: string | null) => void;
  onUseAgent: (agentRef: string, subjectRef?: string) => void;
  onOpenWork: (ref: string) => void;
  onBeginScopedThread: (subjectRef: string, relatedRefs?: string[]) => void;
  onNewThread: () => void;
  onChanged: () => void;
  onContextualChatOpen: (open: boolean) => void;
  onWalkthroughStep: (step: ProductGtmWalkthroughStep | null) => void;
}) {
  const [playAction, setPlayAction] = useState<"run" | null>(null);
  const [mappingProduct, setMappingProduct] = useState(false);
  const [playError, setPlayError] = useState<string | null>(null);
  const [journeyObservations, setJourneyObservations] = useState<JourneyObservationSnapshot[]>([]);
  const [journeyProposals, setJourneyProposals] = useState<JourneyMappingProposalRecord[]>([]);
  const [adoptedJourneyImportRefs, setAdoptedJourneyImportRefs] = useState<string[]>([]);
  const selectedSdkLabel = WORK_MODELS.find(
    (option) => option.runtime === modelChoice.runtime && option.model === modelChoice.model,
  )?.label ?? (modelChoice.runtime === "codex" ? "Codex" : "Claude Code");
  const askAgent = useCallback((subjectRef?: string, relatedRefs?: string[]) => {
    if (subjectRef) onBeginScopedThread(subjectRef, relatedRefs);
    else onNewThread();
    onContextualChatOpen(true);
  }, [onBeginScopedThread, onContextualChatOpen, onNewThread]);
  const selectedPlay = useMemo(() => {
    const workflowNode = parseProductGtmWorkflowNodeId(selectedRef);
    const selectedId = workflowNode?.ownerId ?? selectedRef?.replace(/^object:/, "");
    const object = systemIndex?.objects.find((entry) => entry.id === selectedId) ?? null;
    return object && productGtmWorkflowGraph(object.properties) ? object : null;
  }, [selectedRef, systemIndex]);
  // The dock's play action must speak the play's real register. Register derives from physics — canonical
  // AND actually run — so it needs the movement index; while that is unknown the safe register is drafted:
  // a draft must never present as established, the reverse costs one honest extra step.
  const [movement, setMovement] = useState<MarketMovementIndex | null>(null);
  useEffect(() => {
    let live = true;
    void getMarketMovement(ventureId)
      .then((market) => { if (live) setMovement(market.marketMovement); })
      .catch(() => { if (live) setMovement(null); });
    void getJourneyObservations(ventureId)
      .then((journey) => {
        if (!live) return;
        setJourneyObservations(journey.observations);
        setAdoptedJourneyImportRefs(journey.receipts.map((receipt) => receipt.importRef));
      })
      .catch(() => { /* preserve the last coherent aggregate overlay */ });
    void getJourneyMappingProposals(ventureId)
      .then((journey) => { if (live) setJourneyProposals(journey.proposals); })
      .catch(() => { /* preserve the last coherent proposal while the Brain reconnects */ });
    return () => { live = false; };
  }, [ventureId, systemIndex?.revision]);
  const journeyProposal = useMemo(() => (
    threadRef
      ? journeyProposals.find((proposal) => (
        proposal.threadRef === threadRef && !adoptedJourneyImportRefs.includes(proposal.importRef)
      )) ?? null
      : null
  ), [adoptedJourneyImportRefs, journeyProposals, threadRef]);
  const journeyProposalImportRef = journeyProposal?.importRef ?? null;
  const adoptJourneyObservation = useCallback((snapshot: JourneyObservationSnapshot) => {
    setJourneyObservations((current) => [snapshot, ...current.filter((entry) => entry.id !== snapshot.id)]);
    if (journeyProposalImportRef) {
      setAdoptedJourneyImportRefs((current) => (
        current.includes(journeyProposalImportRef) ? current : [...current, journeyProposalImportRef]
      ));
    }
    setJourneyProposals((current) => current.filter((proposal) => proposal.importRef !== journeyProposalImportRef));
    onChanged();
  }, [journeyProposalImportRef, onChanged]);
  const playRegister = useMemo(() => selectedPlay
    ? deriveWorkflowRegister(selectedPlay.assertion, playRunStates(movement).get(selectedPlay.id))
    : null, [movement, selectedPlay]);
  // The walkthrough is not a mode: focusing a step IS canvas selection, so framing, click-to-jump, and
  // session persistence are the existing selection physics. The focused step is reported upward so a
  // correction composed in the play's contextual conversation carries that exact step, never the whole play.
  const playGraph = useMemo(() => selectedPlay ? productGtmWorkflowGraph(selectedPlay.properties) : null, [selectedPlay]);
  const walkStep = useMemo(() => walkthroughStepFor(selectedRef, selectedPlay, playRegister), [playRegister, selectedPlay, selectedRef]);
  useEffect(() => {
    onWalkthroughStep(walkStep);
    return () => onWalkthroughStep(null);
  }, [onWalkthroughStep, walkStep]);
  const focusStep = useCallback((index: number) => {
    const step = playGraph?.steps[index];
    if (selectedPlay && step) onFocus(productGtmWorkflowNodeId(selectedPlay.id, step.id));
  }, [onFocus, playGraph, selectedPlay]);
  const walkThroughPlay = useCallback(() => {
    if (!selectedPlay) return;
    focusStep(0);
    askAgent(selectedPlay.objectRef);
  }, [askAgent, focusStep, selectedPlay]);
  const directPlay = useCallback(async () => {
    if (!selectedPlay || playAction || readOnlyReason) return;
    setPlayAction("run"); setPlayError(null);
    try {
      const message = `Run “${selectedPlay.name}” again from its current canonical definition. Preserve every conditional branch and founder gate, use current venture context, and record the exact outcomes and evidence on this play.`;
      const result = await replyInConversation(ventureId, {
        message, subjectRefs: [selectedPlay.objectRef], mode: "work",
        runtime: modelChoice.runtime, model: modelChoice.model, effort: modelChoice.effort,
        productGtmView: true, workflowSketch: true,
      });
      onChanged();
      if (result.accepted && result.threadRef) onOpenWork(result.threadRef);
      else setPlayError("The agent answered without opening work. Nothing on the play changed.");
    } catch (cause) {
      setPlayError(cause instanceof Error ? cause.message : "The play action could not start.");
    } finally { setPlayAction(null); }
  }, [modelChoice, onChanged, onOpenWork, playAction, readOnlyReason, selectedPlay, ventureId]);
  const mapProduct = useCallback(async () => {
    if (mappingProduct || readOnlyReason) return;
    setMappingProduct(true); setPlayError(null);
    try {
      const result = await replyInConversation(ventureId, {
        message: "Map the product from the current codebase as the actual pages a user walks through. Read the routes and source, preserve exact citations, connect the proven page-to-page journey, and return an adoptable Product / GTM view. Do not invent pages or behavior the repository does not prove.",
        mode: "work", runtime: modelChoice.runtime, model: modelChoice.model,
        effort: modelChoice.effort, productGtmView: true,
      });
      onChanged();
      if (result.accepted && result.threadRef) onOpenWork(result.threadRef);
      else setPlayError("Product mapping could not start. Nothing on the canvas changed.");
    } catch (cause) {
      setPlayError(cause instanceof Error ? cause.message : "Product mapping could not start.");
    } finally { setMappingProduct(false); }
  }, [mappingProduct, modelChoice, onChanged, onOpenWork, readOnlyReason, ventureId]);
  return <>
    <motion.div className="workspace-primary" {...motionProps}>
      <ResourceNotice resource={systemResource} />
      <ProductGtmSurface
        index={systemIndex}
        ventureId={ventureId}
        workIndex={workIndex}
        selectedRef={selectedRef}
        camera={camera}
        placement={placement}
        journeyObservations={journeyObservations}
        readOnlyReason={readOnlyReason}
        onCameraChange={onCameraChange}
        onFocus={onFocus}
        onUseAgent={onUseAgent}
        onOpenWork={onOpenWork}
        onAskAgent={askAgent}
        onChanged={onChanged}
      />
    </motion.div>
    <aside className="workspace-canvas-dock" data-expanded={contextualChatOpen ? "true" : "false"} aria-label="Product and GTM canvas dock">
      <header className="workspace-canvas-dock-bar">
        <div className="workspace-canvas-dock-scope">
          <span>{walkStep ? `Drafted play · Step ${walkStep.position} of ${walkStep.count}` : contextualChatOpen ? "Work Thread" : selectedPlay ? (playRegister === "established" ? "Established play" : "Drafted play") : "Product / GTM"}</span>
          <strong>{walkStep ? walkStep.label : contextualChatOpen ? `${selectedSdkLabel} continues this Thread here.` : selectedPlay?.name ?? "Whole venture"}</strong>
        </div>
        {walkStep ? <div className="workspace-canvas-dock-steps" role="group" aria-label={`Step focus in ${selectedPlay?.name ?? "this play"}`}>
          <button type="button" aria-label="Previous step" disabled={walkStep.position <= 1} onClick={() => focusStep(walkStep.position - 2)}><ChevronLeft aria-hidden="true" /></button>
          <button type="button" aria-label="Next step" disabled={walkStep.position >= walkStep.count} onClick={() => focusStep(walkStep.position)}><ChevronRight aria-hidden="true" /></button>
        </div> : null}
        {!contextualChatOpen ? <div className="workspace-canvas-dock-actions" aria-label={selectedPlay ? "Selected play and canvas actions" : "Canvas actions"}>
          {selectedPlay && !walkStep ? (playRegister === "established"
            ? <button type="button" data-weight="primary" disabled={Boolean(playAction || readOnlyReason)} onClick={() => void directPlay()}>{playAction === "run" ? <LoaderCircle className="is-spinner" aria-hidden="true" /> : <Play aria-hidden="true" />}Run again</button>
            // A drafted play has never moved, so a run verb would be dishonest. Talk-first: the walk-through
            // focuses the play's first step and opens the play-scoped conversation; the agent steps the
            // founder through the sequence and corrections land on the focused step.
            : <button type="button" data-weight="primary" disabled={Boolean(readOnlyReason)} onClick={walkThroughPlay}><Footprints aria-hidden="true" />Walk through this play</button>) : null}
          <button type="button" data-weight="quiet" disabled={mappingProduct || Boolean(readOnlyReason)} onClick={() => void mapProduct()}>{mappingProduct ? <LoaderCircle className="is-spinner" aria-hidden="true" /> : <Map aria-hidden="true" />}Map product</button>
        </div> : null}
        <button ref={openerRef as RefObject<HTMLButtonElement | null>} type="button" className="workspace-canvas-dock-toggle" aria-expanded={contextualChatOpen} aria-label={contextualChatOpen ? "Collapse Work Thread" : "Open Work Thread on canvas"} onClick={() => onContextualChatOpen(!contextualChatOpen)}>
          <span><b>{contextualChatOpen ? "Done" : "Ask"}</b>{!contextualChatOpen ? <small>Thread · {selectedSdkLabel}</small> : null}</span>{contextualChatOpen ? <ChevronDown aria-hidden="true" /> : <ChevronUp aria-hidden="true" />}
        </button>
      </header>
      {playError ? <p className="workspace-canvas-dock-error" role="status">{playError}</p> : null}
      {contextualChatOpen && journeyProposal ? <JourneyMappingReview
        ventureId={ventureId}
        proposal={journeyProposal}
        readOnlyReason={readOnlyReason}
        onAdopted={adoptJourneyObservation}
      /> : null}
      <div className="workspace-canvas-dock-conversation">{conversation}</div>
    </aside>
  </>;
}
