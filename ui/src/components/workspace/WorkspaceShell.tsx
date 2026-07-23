import { AnimatePresence, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type FirmVenture,
} from "@/api";
import { directionsFromWorkIndex } from "@/components/workspace/workIndexModel";
import type { ProductGtmWalkthroughStep } from "@/components/product-gtm/productGtmWorkflow";
import {
  readWorkspaceSession,
  rememberWorkspaceSession,
  type WorkspaceMode,
} from "@/lib/venture-session";
import { useWorkspaceResources } from "./useWorkspaceResources";
import { WorkspaceProductSurface } from "./WorkspaceProductSurface";
import { WorkspaceWorkSurface } from "./WorkspaceWorkSurface";
import { WorkspaceConversation } from "./WorkspaceConversation";
import { WorkspaceRailPanel } from "./WorkspaceRailPanel";
import { WorkspaceOverlays } from "./WorkspaceOverlays";
import { useWorkspaceConversation } from "./useWorkspaceConversation";
import { useWorkspaceNavigation } from "./useWorkspaceNavigation";
import { useWorkspaceVisuals } from "./useWorkspaceVisuals";
import "./workspace-shell.css";

const MODE_EASE = [0.22, 1, 0.36, 1] as const;
const EMPTY_PLACEMENT = { positions: {}, revision: 0 } as const;

function modeSurfaceMotion({ animate, direction }: { animate: boolean; direction: number }) {
  const move = animate ? direction * 10 : 0;
  return {
    initial: move ? { opacity: 0, y: move } : false,
    animate: { opacity: 1, y: 0 },
    exit: move ? { opacity: 0, y: move * -0.4 } : { opacity: 0 },
    transition: { duration: move ? 0.18 : 0, ease: MODE_EASE },
  };
}
export function WorkspaceShell({
  venture,
  onOpenVenture,
}: {
  venture: FirmVenture;
  onOpenVenture: (venture: FirmVenture) => void;
}) {
  const initial = useMemo(() => readWorkspaceSession(venture.id), [venture.id]);
  const [mode, setMode] = useState<WorkspaceMode>(initial.mode);
  const [modeMotion, setModeMotion] = useState({ animate: false, direction: 0 });
  const reducedMotion = useReducedMotion();
  const [railWidth, setRailWidth] = useState(initial.railWidth);
  const [railOpen, setRailOpen] = useState(false);
  const [settingsConnection, setSettingsConnection] = useState<
    "gmail" | null | undefined
  >(undefined);
  const [systemSelection, setSystemSelection] = useState(
    initial.selectedObjectRef,
  );
  const [systemCamera, setSystemCamera] = useState(initial.systemCamera);
  const [search, setSearch] = useState("");
  // The drafted-play step the Product / GTM dock currently focuses. Held here only so the contextual
  // composer can carry that exact step as the subject of a correction; the surface owns the derivation.
  const [walkthroughStep, setWalkthroughStep] = useState<ProductGtmWalkthroughStep | null>(null);
  const {
    lens, workIndex, connection, activeDrives, refresh, setWorkIndex,
    systemResource,
    setSystemIndex,
    reloadSystem,
    searchWork, ventures, credentials, capabilities,
  } = useWorkspaceResources({ venture, mode, search, settingsConnection });
  const systemIndexAll = systemResource.data;
  const {
    selectedAgentRef, setSelectedAgentRef, draftSubjectRef, draftRelatedRefs,
    stage, setStage, artifactFocus, setArtifactFocus, artifactFocusRequest,
    setArtifactFocusRequest, contextualChatOpen, setContextualChatOpen, scrolls,
    openerRef, draftStartedAtRef, activeDraft, draftSession, resolvedThreadRef, timeline, selectedItem,
    openThread: openConversationThread,
    beginScopedThread: beginConversationThread,
    newThread: beginNewConversation,
    rememberThreadScroll,
  } = useWorkspaceConversation({
    ventureId: venture.id,
    initialThreadRef: initial.selectedThreadRef,
    initialContextualChatOpen: initial.contextualChatOpen,
    initialScrolls: initial.chatScrollByThread,
    workIndex,
    systemIndex: systemIndexAll,
  });
  const openThread = useCallback((ref: string) => {
    openConversationThread(ref);
    setRailOpen(false);
  }, [openConversationThread]);
  const beginScopedThread = useCallback((ref: string, related: string[] = []) => {
    beginConversationThread(ref, related);
    setRailOpen(false);
  }, [beginConversationThread]);
  const newThread = useCallback(() => {
    beginNewConversation();
    setRailOpen(false);
  }, [beginNewConversation]);

  const directions = useMemo(
    () => (workIndex && lens ? directionsFromWorkIndex(workIndex, lens) : []),
    [lens, workIndex],
  );
  const selectedObject =
    systemIndexAll?.objects.find(
      (entry) => entry.objectRef === systemSelection,
    ) ?? null;
  const readOnly = ["stale", "offline", "read-only"].includes(connection.phase);
  const readOnlyReason =
    connection.phase === "offline"
      ? "Offline. Nothing consequential can change until Drover is current again."
      : (connection.message ?? "Drover is reconnecting.");

  useEffect(
    () =>
      rememberWorkspaceSession(venture.id, {
        mode,
        railWidth,
        contextualChatOpen,
        selectedThreadRef: resolvedThreadRef,
        selectedObjectRef: systemSelection,
        systemCamera,
        chatScrollByThread: scrolls,
      }),
    [
      contextualChatOpen,
      mode,
      railWidth,
      resolvedThreadRef,
      scrolls,
      systemCamera,
      systemSelection,
      venture.id,
    ],
  );

  const { selectThread, selectObject, changeMode, assignAgentInSystem } =
    useWorkspaceNavigation({
      ventureId: venture.id, mode, reducedMotion, resolvedThreadRef, workIndex,
      systemIndex: systemIndexAll, systemSelection, selectedObject,
      readOnly, openerRef, contextualChatOpen, stage, openThread, beginScopedThread,
      newThread, refresh, setWorkIndex, setMode, setModeMotion,
      setSystemSelection, setSelectedAgentRef,
      setSearch, setRailOpen, setStage, setContextualChatOpen,
    });
  const afterMutation = useCallback(async () => {
    await reloadSystem();
    refresh();
  }, [refresh, reloadSystem]);
  const openProductWork = useCallback((ref: string) => {
    openThread(ref);
    setMode("work");
  }, [openThread]);

  const openVisual = useWorkspaceVisuals({
    mode, timeline: timeline.timeline, openerRef, setMode, setStage, setArtifactFocus,
  });

  const conversation = <WorkspaceConversation
    venture={venture} mode={mode} item={selectedItem}
    timeline={timeline} lens={lens} connection={connection} activeDrives={activeDrives} activeDraft={activeDraft} draftSession={draftSession}
    draftSubjectRef={draftSubjectRef} draftRelatedRefs={draftRelatedRefs}
    workflowStep={mode === "product-gtm" ? walkthroughStep : null}
    selectedObject={selectedObject}
    selectedAgentRef={selectedAgentRef} artifactFocus={artifactFocus}
    artifactFocusRequest={artifactFocusRequest} systemIndex={systemIndexAll}
    resolvedThreadRef={resolvedThreadRef} scrolls={scrolls}
    onArtifactFocus={setArtifactFocus} onScrollChange={rememberThreadScroll}
    onOpenVisual={openVisual} onOpenThread={openThread} onWorkIndex={setWorkIndex}
    onRefresh={refresh}
    onDriven={() => { draftStartedAtRef.current = activeDraft ? Date.now() : null; refresh(); void timeline.refresh(); }}
    onWorkRouted={(ref) => { openThread(ref); setContextualChatOpen(false); setMode("work"); }}
    onWorkflowAdopted={(result) => {
      setSystemIndex(result.systemIndex); setSystemSelection(result.objectRef);
      setContextualChatOpen(false); setStage(null);
      setMode("product-gtm"); refresh();
    }}
    onReviewModelBranch={(branchRef) => {
      setSystemSelection(branchRef);
      setContextualChatOpen(false); setStage(null);
      setMode("product-gtm"); refresh();
    }}
    onThreadDeleted={() => {
      setStage(null);
      refresh();
      void reloadSystem();
    }}
  />;

  return (
    <div
      className="workspace-shell"
      data-desktop-platform={window.droverDesktop?.platform}
      data-mode={mode}
      data-stage-open={stage ? "true" : undefined}
      data-chat-open={
        mode !== "work" && contextualChatOpen ? "true" : undefined
      }
      data-rail-open={railOpen ? "true" : undefined}
      style={{ "--thread-rail-width": `${railWidth}px` } as React.CSSProperties}
    >
      <WorkspaceRailPanel
        venture={venture} ventures={ventures} mode={mode} modeMotion={modeMotion}
        railOpen={railOpen} railWidth={railWidth} search={search}
        selectedThread={resolvedThreadRef} lens={lens} credentials={credentials}
        capabilityInventory={capabilities}
        workIndex={searchWork ?? workIndex} systemIndex={systemIndexAll}
        systemSelection={systemSelection}
        readOnlyReason={readOnly ? readOnlyReason : null}
        onRailOpen={setRailOpen} onMode={changeMode} onSearch={setSearch}
        onUseAgent={assignAgentInSystem} onSelectThread={selectThread}
        onSelectObject={selectObject}
        onNew={newThread}
        onOpenVenture={onOpenVenture} onResize={setRailWidth}
        onSettings={() => setSettingsConnection(null)} onConfigurationChanged={refresh}
      />
      <AnimatePresence initial={false} mode="popLayout">
      {mode === "work" ? (
        <WorkspaceWorkSurface
          key="work"
          ventureId={venture.id}
          timeline={timeline.timeline}
          conversation={conversation}
          readOnlyReason={readOnly ? readOnlyReason : null}
          motionProps={modeSurfaceMotion(modeMotion)}
          onChanged={() => {
            refresh();
            void timeline.refresh();
            void reloadSystem();
          }}
        />
      ) : (
        <WorkspaceProductSurface
          key={mode}
          ventureId={venture.id}
          motionProps={modeSurfaceMotion(modeMotion)}
          conversation={conversation}
          contextualChatOpen={contextualChatOpen}
          openerRef={openerRef}
          systemIndex={systemIndexAll}
          workIndex={workIndex}
          readOnlyReason={readOnly ? readOnlyReason : null}
          systemResource={systemResource}
          selectedRef={systemSelection}
          camera={systemCamera}
          placement={lens?.placement ?? EMPTY_PLACEMENT}
          onCameraChange={setSystemCamera}
          onFocus={setSystemSelection}
          onUseAgent={assignAgentInSystem}
          onOpenWork={openProductWork}
          onBeginScopedThread={beginScopedThread}
          onNewThread={newThread}
          onChanged={afterMutation}
          onContextualChatOpen={setContextualChatOpen}
          onWalkthroughStep={setWalkthroughStep}
        />
      )}
      </AnimatePresence>
      <WorkspaceOverlays
        venture={venture} stage={stage} timeline={timeline.timeline} workIndex={workIndex}
        directions={directions} lens={lens} readOnly={readOnly} readOnlyReason={readOnlyReason}
        artifactFocus={artifactFocus} settingsConnection={settingsConnection} openerRef={openerRef}
        onArtifactFocus={(focus) => {
          setArtifactFocus(focus); setArtifactFocusRequest((value) => value + 1);
        }}
        onContextualChatOpen={setContextualChatOpen} onStage={setStage}
        onOpenThread={openThread} onChanged={() => { refresh(); void timeline.refresh(); }}
        onSettingsConnection={setSettingsConnection}
        onCapabilitiesChanged={refresh}
      />
    </div>
  );
}
