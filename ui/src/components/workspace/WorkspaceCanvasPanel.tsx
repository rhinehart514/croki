import { ChevronLeft, ChevronRight, Footprints, LoaderCircle, Map, Play, X } from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useEffect, useMemo, useState, type ComponentProps } from "react";
import { getJourneyMappingProposals, getJourneyObservations, getMarketMovement, replyInConversation, type JourneyMappingProposalRecord, type JourneyObservationSnapshot, type SystemIndex, type SystemIndexObject, type WorkIndex } from "@/api";
import type { FirmPlacement, MarketMovementIndex } from "@/types";
import type { FirmConfiguration, FirmCrewMember } from "@/types";
import { JourneyMappingReview } from "@/components/product-gtm/JourneyMappingReview";
import { ProductGtmSurface } from "@/components/product-gtm/ProductGtmSurface";
import { parseProductGtmWorkflowNodeId, playRunStates, productGtmWorkflowGraph, productGtmWorkflowNodeId, deriveWorkflowRegister, walkthroughStepFor, type ProductGtmWalkthroughStep } from "@/components/product-gtm/productGtmWorkflow";
import type { WorkModelChoice } from "@/components/work-mode/WorkComposerBar";
import { ProductPalette } from "./ProductPalette";
import type { WorkspaceResource } from "./useWorkspaceResources";
import type { WorkflowCapability } from "./workflowCapabilities";

function ResourceNotice({ resource }: { resource: WorkspaceResource<unknown> }) {
  if (!resource.error) return null;
  return (
    <div className="workspace-resource-notice" role={resource.status === "error" ? "alert" : "status"}>
      <strong>{resource.status === "stale" ? "Showing the last current view." : "This view could not load."}</strong>
      <span>{resource.status === "stale" ? "Your last current venture model is still visible while Croki reconnects." : "The local venture model is unavailable. Reopen the Product or restart Croki; no Product truth was changed."}</span>
    </div>
  );
}

// The Canvas: the venture graph beside the always-present conversation spine. It carries the graph, the
// exact actions the current selection supports, and the agent/capability palette that drops onto nodes.
// It never embeds a conversation of its own — direction happens in the spine and stays in place.
export function WorkspaceCanvasPanel({
  ventureId, motionProps, systemIndex, workIndex, selectedRef, selectedObject, camera, placement, modelChoice, threadRef, readOnlyReason, systemResource,
  crew, configuration, capabilities,
  onCameraChange, onFocus, onUseAgent, onOpenWork, onBeginScopedThread, onNewThread,
  onChanged, onClose, onWalkthroughStep, onConfigurationChanged,
}: {
  ventureId: string;
  motionProps: ComponentProps<typeof motion.aside>;
  systemIndex: SystemIndex | null;
  workIndex: WorkIndex | null;
  selectedRef: string | null;
  selectedObject: SystemIndexObject | null;
  camera: import("@xyflow/react").Viewport | null;
  placement: FirmPlacement;
  modelChoice: WorkModelChoice;
  threadRef?: string | null;
  readOnlyReason: string | null;
  systemResource: WorkspaceResource<SystemIndex>;
  crew: FirmCrewMember[];
  configuration: FirmConfiguration;
  capabilities: WorkflowCapability[];
  onCameraChange: (camera: import("@xyflow/react").Viewport) => void;
  onFocus: (ref: string | null) => void;
  onUseAgent: (agentRef: string, subjectRef?: string) => void;
  onOpenWork: (ref: string) => void;
  onBeginScopedThread: (subjectRef: string, relatedRefs?: string[]) => void;
  onNewThread: () => void;
  onChanged: () => void;
  onClose: () => void;
  onWalkthroughStep: (step: ProductGtmWalkthroughStep | null) => void;
  onConfigurationChanged: () => void;
}) {
  const [playAction, setPlayAction] = useState<"run" | null>(null);
  const [mappingProduct, setMappingProduct] = useState(false);
  const [playError, setPlayError] = useState<string | null>(null);
  const [journeyObservations, setJourneyObservations] = useState<JourneyObservationSnapshot[]>([]);
  const [journeyProposals, setJourneyProposals] = useState<JourneyMappingProposalRecord[]>([]);
  const [adoptedJourneyImportRefs, setAdoptedJourneyImportRefs] = useState<string[]>([]);
  // Direction always lands in the conversation spine; the Canvas only scopes the subject.
  const askAgent = useCallback((subjectRef?: string, relatedRefs?: string[]) => {
    if (subjectRef) onBeginScopedThread(subjectRef, relatedRefs);
    else onNewThread();
  }, [onBeginScopedThread, onNewThread]);
  const selectedPlay = useMemo(() => {
    const workflowNode = parseProductGtmWorkflowNodeId(selectedRef);
    const selectedId = workflowNode?.ownerId ?? selectedRef?.replace(/^object:/, "");
    const object = systemIndex?.objects.find((entry) => entry.id === selectedId) ?? null;
    return object && productGtmWorkflowGraph(object.properties) ? object : null;
  }, [selectedRef, systemIndex]);
  // The action must speak the play's real register. Register derives from physics — canonical AND actually
  // run — so it needs the movement index; while that is unknown the safe register is drafted.
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
  // The canvas's two standing directions have identical physics: send one exact instruction, open the
  // Thread it returns, and say plainly when nothing started. Drafting a play used to open an empty Thread
  // instead, so a button that promised an agent would write the sequence handed the founder a blank box.
  const directCanvas = useCallback(async (message: string, failure: string, sketch?: boolean) => {
    if (mappingProduct || readOnlyReason) return;
    setMappingProduct(true); setPlayError(null);
    try {
      const result = await replyInConversation(ventureId, {
        message, mode: "work", runtime: modelChoice.runtime, model: modelChoice.model,
        effort: modelChoice.effort, productGtmView: true, workflowSketch: sketch,
      });
      onChanged();
      if (result.accepted && result.threadRef) onOpenWork(result.threadRef);
      else setPlayError(failure);
    } catch (cause) {
      setPlayError(cause instanceof Error ? cause.message : failure);
    } finally { setMappingProduct(false); }
  }, [mappingProduct, modelChoice, onChanged, onOpenWork, readOnlyReason, ventureId]);
  const mapProduct = useCallback(() => directCanvas(
    "Map the product from the current codebase as the actual pages a user walks through. Read the routes and source, preserve exact citations, connect the proven page-to-page journey, and return an adoptable venture map. Do not invent pages or behavior the repository does not prove.",
    "Product mapping could not start. Nothing on the canvas changed.",
  ), [directCanvas]);
  const draftPlay = useCallback(() => directCanvas(
    "Draft one new go-to-market play for this venture as a complete workflow. Read the plays and motions already on this canvas so the new one does not repeat them, ground it in current product truth, and write the full sequence — every trigger, branch, founder gate, agent, capability, and evidence path — rather than a summary. Return it as an adoptable drafted play and walk me through it step by step. Nothing has run yet, so do not present it as established.",
    "The play draft could not start. Nothing on the canvas changed.",
    true,
  ), [directCanvas]);
  const scope = walkStep ? `Drafted play · Step ${walkStep.position} of ${walkStep.count}` : selectedPlay ? (playRegister === "established" ? "Established play" : "Drafted play") : "Canvas";
  const title = walkStep ? walkStep.label : selectedPlay?.name ?? "Whole venture";
  return <motion.aside className="workspace-canvas" aria-label="Venture Canvas" {...motionProps}>
    <header className="workspace-canvas-bar">
      <div className="workspace-canvas-scope"><span>{scope}</span><strong>{title}</strong></div>
      {walkStep ? <div className="workspace-canvas-steps" role="group" aria-label={`Step focus in ${selectedPlay?.name ?? "this play"}`}>
        <button type="button" aria-label="Previous step" disabled={walkStep.position <= 1} onClick={() => focusStep(walkStep.position - 2)}><ChevronLeft aria-hidden="true" /></button>
        <button type="button" aria-label="Next step" disabled={walkStep.position >= walkStep.count} onClick={() => focusStep(walkStep.position)}><ChevronRight aria-hidden="true" /></button>
      </div> : null}
      <div className="workspace-canvas-actions" aria-label={selectedPlay ? "Selected play and canvas actions" : "Canvas actions"}>
        {selectedPlay && !walkStep ? (playRegister === "established"
          ? <button type="button" data-weight="primary" disabled={Boolean(playAction || readOnlyReason)} onClick={() => void directPlay()}>{playAction === "run" ? <LoaderCircle className="is-spinner" aria-hidden="true" /> : <Play aria-hidden="true" />}Run again</button>
          : <button type="button" data-weight="primary" disabled={Boolean(readOnlyReason)} onClick={walkThroughPlay}><Footprints aria-hidden="true" />Walk through this play</button>) : null}
        <button type="button" data-weight="quiet" disabled={mappingProduct || Boolean(readOnlyReason)} onClick={() => void mapProduct()}>{mappingProduct ? <LoaderCircle className="is-spinner" aria-hidden="true" /> : <Map aria-hidden="true" />}Map product</button>
      </div>
      <button type="button" className="workspace-canvas-close" aria-label="Hide Canvas" title="Hide Canvas" onClick={onClose}><X aria-hidden="true" /></button>
    </header>
    {playError ? <p className="workspace-canvas-error" role="status">{playError}</p> : null}
    {journeyProposal ? <JourneyMappingReview ventureId={ventureId} proposal={journeyProposal} readOnlyReason={readOnlyReason} onAdopted={adoptJourneyObservation} /> : null}
    <div className="workspace-canvas-graph">
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
        onDraftPlay={draftPlay}
        onChanged={onChanged}
      />
      <ProductPalette ventureId={ventureId} objects={systemIndex?.objects ?? []} crew={crew} configuration={configuration} capabilities={capabilities} selectedObject={selectedObject} readOnlyReason={readOnlyReason} onUseAgent={onUseAgent} onConfigurationChanged={onConfigurationChanged} />
    </div>
  </motion.aside>;
}
