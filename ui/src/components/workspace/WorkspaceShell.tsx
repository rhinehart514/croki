import { AnimatePresence } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { type FirmVenture } from "@/api";
import { directionsFromWorkIndex } from "@/components/workspace/workIndexModel";
import type { ProductGtmWalkthroughStep } from "@/components/product-gtm/productGtmWorkflow";
import { readWorkModelChoice, type WorkModelChoice } from "@/components/work-mode/work-models";
import {
  WORK_REVIEW_REQUEST_EVENT,
  type WorkReviewRequest,
} from "@/components/work-mode/previewPresentation";
import {
  readWorkspaceSession,
  readWorkspaceThreadPresentation,
  rememberWorkspaceSession,
} from "@/lib/venture-session";
import { finishWarmReturn } from "@/lib/warm-return";
import { recordUxMetric } from "@/lib/ux-metrics";
import { surfaceMotion } from "@/lib/motion";
import { useWorkspaceResources } from "./useWorkspaceResources";
import { WorkspaceCanvasPanel } from "./WorkspaceCanvasPanel";
import { WorkspaceWorkSurface } from "./WorkspaceWorkSurface";
import { WorkspaceConversation } from "./WorkspaceConversation";
import { WorkspaceRailPanel } from "./WorkspaceRailPanel";
import { WorkspaceOverlays } from "./WorkspaceOverlays";
import { CommandSearch } from "./CommandSearch";
import { useWorkspaceConversation } from "./useWorkspaceConversation";
import { useWorkspaceNavigation } from "./useWorkspaceNavigation";
import { useWorkspaceVisuals } from "./useWorkspaceVisuals";
import { workflowCapabilities } from "./workflowCapabilities";
import "./workspace-shell.css";

const EMPTY_PLACEMENT = { positions: {}, revision: 0 } as const;
const DEFAULT_CONFIGURATION = {
  id: "firm", schemaVersion: 1 as const, revision: 1,
  presentation: { participant: "specialist" as const, participantLabel: "agent", collectiveLabel: "agents" },
  defaults: { runtime: null, model: null, maxSteps: 24 },
  organization: { shape: "flat" as const, instructions: null, relationships: [] },
  coordination: { mode: "adaptive" as const, coordinatorRef: null, protocols: [], stopWhen: [] },
  authority: { outwardEffects: "wall" as const, configurationChanges: "founder" as const }, agents: [],
};

export function WorkspaceShell({ venture, onOpenVenture }: { venture: FirmVenture; onOpenVenture: (venture: FirmVenture) => void }) {
  const initial = useMemo(() => readWorkspaceSession(venture.id), [venture.id]);
  const [canvasOpen, setCanvasOpen] = useState(initial.canvasOpen);
  const [canvasMotion, setCanvasMotion] = useState({ animate: false, direction: 1 });
  const [railWidth, setRailWidth] = useState(initial.railWidth);
  const [railOpen, setRailOpen] = useState(false);
  const [settingsConnection, setSettingsConnection] = useState<"gmail" | null | undefined>(undefined);
  const [systemSelection, setSystemSelection] = useState(initial.selectedObjectRef);
  const [systemCamera, setSystemCamera] = useState(initial.systemCamera);
  const [search, setSearch] = useState("");
  const [modelChoice, setModelChoice] = useState<WorkModelChoice>(() => readWorkModelChoice(venture.id, initial.selectedThreadRef ?? "draft"));
  // The play step the Canvas focuses. Held so the spine composer can carry that exact step as a correction.
  const [walkthroughStep, setWalkthroughStep] = useState<ProductGtmWalkthroughStep | null>(null);
  const {
    lens, workIndex, connection, activeDrives, refresh, setWorkIndex,
    systemResource, setSystemIndex, reloadSystem,
    searchWork, searchStatus, ventures, credentials, capabilities: capabilityInventory,
  } = useWorkspaceResources({ venture, search, settingsConnection });
  const workLoading = !search.trim() && workIndex == null && !["stale", "offline", "read-only"].includes(connection.phase);
  const systemIndexAll = systemResource.data;
  const {
    selectedAgentRef, setSelectedAgentRef, draftSubjectRef, draftRelatedRefs,
    stage, setStage, artifactFocus, setArtifactFocus, artifactFocusRequest, setArtifactFocusRequest, scrolls,
    openerRef, draftStartedAtRef, activeDraft, draftSession, resolvedThreadRef, timeline, selectedItem,
    openThread: openConversationThread,
    acceptThread: acceptConversationThread,
    beginScopedThread: beginConversationThread,
    newThread: beginNewConversation,
    rememberThreadScroll,
  } = useWorkspaceConversation({ ventureId: venture.id, initialThreadRef: initial.selectedThreadRef, initialScrolls: initial.chatScrollByThread, workIndex, systemIndex: systemIndexAll });
  const openThread = useCallback((ref: string) => {
    const remembered = readWorkspaceThreadPresentation(venture.id, ref);
    setCanvasOpen(remembered?.canvasOpen ?? false);
    setSystemSelection(remembered?.selectedObjectRef ?? null);
    setSystemCamera(remembered?.systemCamera ?? null);
    openConversationThread(ref);
    setRailOpen(false);
  }, [openConversationThread, venture.id]);
  const beginScopedThread = useCallback((ref: string, related: string[] = []) => { beginConversationThread(ref, related); setRailOpen(false); }, [beginConversationThread]);
  const newThread = useCallback(() => { beginNewConversation(); setRailOpen(false); }, [beginNewConversation]);
  // The Canvas and an opened review both claim the pane beside the spine. Standing them side by side
  // splits the body a third time and leaves the graph an unreadable sliver, so the pane holds one thing:
  // showing the Canvas closes the open review, and opening exact material hides the Canvas. This is the
  // exclusivity useWorkspaceVisuals already applies when a map visual arrives; it now holds everywhere.
  const showCanvas = useCallback((open: boolean) => {
    setCanvasMotion({ animate: true, direction: 1 });
    if (open) setStage(null);
    setCanvasOpen(open);
  }, [setStage]);
  useEffect(() => {
    const openRepositoryReview = (event: Event) => {
      const request = (event as CustomEvent<WorkReviewRequest>).detail;
      if (request?.target !== "repository" || !request.threadRef || request.threadRef !== resolvedThreadRef) return;
      // Canvas, a staged overlay, and exact Review all claim the pane beside the conversation spine.
      // The citation's direct reference wins without changing Thread identity or durable selection.
      setStage(null);
      setCanvasOpen(false);
    };
    window.addEventListener(WORK_REVIEW_REQUEST_EVENT, openRepositoryReview);
    return () => window.removeEventListener(WORK_REVIEW_REQUEST_EVENT, openRepositoryReview);
  }, [resolvedThreadRef, setStage]);
  const openCanvas = useCallback(() => showCanvas(true), [showCanvas]);
  const toggleCanvas = useCallback((source?: HTMLElement) => {
    openerRef.current = source ?? null;
    showCanvas(!canvasOpen);
  }, [canvasOpen, openerRef, showCanvas]);
  const restoredThreadMissing = Boolean(
    workIndex
    && initial.selectedThreadRef
    && initial.selectedThreadRef !== "thread:venture-root"
    && !workIndex.items.some((entry) => entry.threadRef === initial.selectedThreadRef),
  );
  const restoredObjectMissing = Boolean(
    systemIndexAll
    && systemSelection
    && systemSelection.startsWith("object:")
    && !systemIndexAll.objects.some((entry) => entry.objectRef === systemSelection),
  );
  const validSystemSelection = restoredObjectMissing ? null : systemSelection;
  const validSystemCamera = restoredObjectMissing ? null : systemCamera;
  const restoreNotice = restoredObjectMissing
    ? "Canvas return · The saved Canvas item is no longer available. The Thread and its draft were kept."
    : restoredThreadMissing
      ? "Thread return · The saved Thread is no longer available. Croki opened the nearest current Thread."
      : null;
  const directions = useMemo(() => (workIndex && lens ? directionsFromWorkIndex(workIndex, lens) : []), [lens, workIndex]);
  const selectedObject = systemIndexAll?.objects.find((entry) => entry.objectRef === validSystemSelection) ?? null;
  const configuration = lens?.configuration ?? DEFAULT_CONFIGURATION;
  const canvasCapabilities = useMemo(() => workflowCapabilities(credentials, lens?.configuration?.agents ?? [], capabilityInventory), [capabilityInventory, credentials, lens?.configuration?.agents]);
  const readOnly = ["stale", "offline", "read-only"].includes(connection.phase);
  const readOnlyReason = connection.phase === "offline"
    ? "Offline. Nothing consequential can change until Croki is current again."
    : (connection.message ?? "Croki is reconnecting.");

  useEffect(() => rememberWorkspaceSession(venture.id, {
    railWidth, canvasOpen,
    selectedThreadRef: resolvedThreadRef, selectedObjectRef: validSystemSelection,
    systemCamera: validSystemCamera, chatScrollByThread: scrolls,
  }), [canvasOpen, railWidth, resolvedThreadRef, scrolls, validSystemCamera, validSystemSelection, venture.id]);

  useEffect(() => {
    const duration = finishWarmReturn(venture.id);
    if (duration != null) recordUxMetric("warm_destination_painted", venture.id, duration);
  }, [venture.id]);

  const { selectThread, selectObject, assignAgentInSystem } = useWorkspaceNavigation({
    ventureId: venture.id, workIndex, selectedObject, readOnly, openerRef, stage,
    openThread, beginScopedThread, newThread, refresh, setWorkIndex,
    setSystemSelection, setCanvasOpen: openCanvas, setSelectedAgentRef, setStage,
  });
  const afterMutation = useCallback(async () => { await reloadSystem(); refresh(); }, [refresh, reloadSystem]);
  const openVisual = useWorkspaceVisuals({ timeline: timeline.timeline, openerRef, setCanvasOpen: showCanvas, setStage, setArtifactFocus });

  const conversation = <WorkspaceConversation
    venture={venture} item={selectedItem}
    timeline={timeline} lens={lens} connection={connection} activeDrives={activeDrives} activeDraft={activeDraft} draftSession={draftSession}
    draftSubjectRef={draftSubjectRef} draftRelatedRefs={draftRelatedRefs}
    workflowStep={canvasOpen ? walkthroughStep : null}
    selectedObject={selectedObject}
    selectedAgentRef={selectedAgentRef} artifactFocus={artifactFocus}
    artifactFocusRequest={artifactFocusRequest} systemIndex={systemIndexAll}
    resolvedThreadRef={resolvedThreadRef} scrolls={scrolls}
    modelChoice={modelChoice}
    canvasOpen={canvasOpen} canvasAttention={systemIndexAll?.counts.attention ?? 0}
    onCanvasOpenChange={showCanvas}
    onArtifactFocus={setArtifactFocus} onScrollChange={rememberThreadScroll}
    onOpenVisual={openVisual} onOpenThread={openThread} onWorkIndex={setWorkIndex}
    onRefresh={refresh}
    onDriven={() => { draftStartedAtRef.current = activeDraft ? Date.now() : null; refresh(); void timeline.refresh(); }}
    onThreadAccepted={acceptConversationThread}
    onModelChoice={setModelChoice}
    onWorkRouted={openThread}
    onWorkflowAdopted={(result) => { setSystemIndex(result.systemIndex); setSystemSelection(result.objectRef); setStage(null); openCanvas(); refresh(); }}
    onReviewModelBranch={(branchRef) => { setSystemSelection(branchRef); setStage(null); openCanvas(); refresh(); }}
    onThreadDeleted={() => { setStage(null); refresh(); void reloadSystem(); }}
  />;

  return (
    <div
      className="workspace-shell"
      data-desktop-platform={window.droverDesktop?.platform}
      data-canvas-open={canvasOpen ? "true" : undefined}
      data-stage-open={stage ? "true" : undefined}
      data-rail-open={railOpen ? "true" : undefined}
      style={{ "--thread-rail-width": `${railWidth}px` } as React.CSSProperties}
    >
      <WorkspaceRailPanel
        venture={venture} ventures={ventures}
        railOpen={railOpen} railWidth={railWidth} search={search}
        selectedThread={resolvedThreadRef}
        workIndex={searchWork ?? workIndex} workLoading={workLoading} searchStatus={searchStatus}
        onRailOpen={setRailOpen} onSearch={setSearch}
        onSelectThread={selectThread} onNew={newThread}
        onOpenVenture={onOpenVenture} onResize={setRailWidth}
        onSettings={() => setSettingsConnection(null)}
      />
      <div className="workspace-body">
        {restoreNotice ? <div className="workspace-return-break" role="status">{restoreNotice}</div> : null}
        <WorkspaceWorkSurface
          ventureId={venture.id}
          timeline={timeline.timeline}
          conversation={conversation}
          readOnlyReason={readOnly ? readOnlyReason : null}
          motionProps={{}}
          onChanged={() => { refresh(); void timeline.refresh(); void reloadSystem(); }}
        />
        <AnimatePresence initial={false}>
          {canvasOpen ? (
            <WorkspaceCanvasPanel
              key="canvas"
              ventureId={venture.id}
              motionProps={surfaceMotion(canvasMotion)}
              systemIndex={systemIndexAll}
              workIndex={workIndex}
              selectedRef={validSystemSelection}
              selectedObject={selectedObject}
              camera={validSystemCamera}
              placement={lens?.placement ?? EMPTY_PLACEMENT}
              modelChoice={modelChoice}
              threadRef={resolvedThreadRef}
              readOnlyReason={readOnly ? readOnlyReason : null}
              systemResource={systemResource}
              crew={lens?.crew ?? []}
              configuration={configuration}
              capabilities={canvasCapabilities}
              onCameraChange={setSystemCamera}
              onFocus={setSystemSelection}
              onUseAgent={assignAgentInSystem}
              onOpenWork={openThread}
              onBeginScopedThread={beginScopedThread}
              onNewThread={newThread}
              onChanged={afterMutation}
              onClose={() => setCanvasOpen(false)}
              onWalkthroughStep={setWalkthroughStep}
              onConfigurationChanged={refresh}
            />
          ) : null}
        </AnimatePresence>
      </div>
      <WorkspaceOverlays
        venture={venture} stage={stage} timeline={timeline.timeline} workIndex={workIndex}
        directions={directions} lens={lens} readOnly={readOnly} readOnlyReason={readOnlyReason}
        artifactFocus={artifactFocus} settingsConnection={settingsConnection} openerRef={openerRef}
        onArtifactFocus={(focus) => { setArtifactFocus(focus); setArtifactFocusRequest((value) => value + 1); }}
        onStage={setStage}
        onOpenThread={openThread} onChanged={() => { refresh(); void timeline.refresh(); }}
        onSettingsConnection={setSettingsConnection}
        onCapabilitiesChanged={refresh}
      />
      <CommandSearch
        canvasOpen={canvasOpen} workIndex={workIndex} systemIndex={systemIndexAll}
        onSelectThread={selectThread} onSelectObject={selectObject}
        onToggleCanvas={() => toggleCanvas()} onNewThread={newThread}
      />
    </div>
  );
}
