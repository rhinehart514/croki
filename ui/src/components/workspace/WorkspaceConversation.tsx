import {
  deleteThread,
  setThreadName,
  setThreadPinned,
  type FirmActiveDrive,
  type FirmVenture,
  type SystemIndex,
  type SystemIndexObject,
  type VisualReference,
  type WorkIndex,
  type WorkIndexItem,
} from "@/api";
import type { FirmLens } from "@/types";
import type { ArtifactSectionFocus } from "@/components/review/artifactSectionFocus";
import { adoptedWorkflowVersions, adoptWorkflowSketch } from "@/components/product-gtm/workflowAdoption";
import type { ProductGtmWalkthroughStep } from "@/components/product-gtm/productGtmWorkflow";
import { ThreadConversation } from "@/components/thread/ThreadConversation";
import type { useThreadTimeline } from "@/components/thread/useThreadTimeline";
import type { WorkflowSketch } from "@/components/work-mode/workflowSketch";
import type { FirmConnectionState } from "@/hooks/use-firm-connection";
import type { WorkspaceMode } from "@/lib/venture-session";
import { ROOT_THREAD_REF } from "./useWorkspaceConversation";

export function WorkspaceConversation({
  venture, mode, item, timeline, lens, connection, activeDrives, activeDraft, draftSession,
  draftSubjectRef, draftRelatedRefs, workflowStep, selectedObject, selectedAgentRef,
  artifactFocus, artifactFocusRequest, systemIndex, resolvedThreadRef, scrolls,
  onArtifactFocus, onScrollChange, onOpenVisual, onOpenThread, onWorkIndex,
  onRefresh, onDriven, onWorkRouted, onWorkflowAdopted,
  onReviewModelBranch, onThreadDeleted,
}: {
  venture: FirmVenture;
  mode: WorkspaceMode;
  item: WorkIndexItem | null;
  timeline: ReturnType<typeof useThreadTimeline>;
  lens: FirmLens | null;
  connection: FirmConnectionState;
  activeDrives: FirmActiveDrive[];
  activeDraft: boolean;
  draftSession: number;
  draftSubjectRef: string | null;
  draftRelatedRefs: string[];
  workflowStep: ProductGtmWalkthroughStep | null;
  selectedObject: SystemIndexObject | null;
  selectedAgentRef: string | null;
  artifactFocus: ArtifactSectionFocus | null;
  artifactFocusRequest: number;
  systemIndex: SystemIndex | null;
  resolvedThreadRef: string | null;
  scrolls: Record<string, number>;
  onArtifactFocus: (focus: ArtifactSectionFocus | null) => void;
  onScrollChange: (ref: string, top: number) => void;
  onOpenVisual: (visual: VisualReference, source: HTMLElement) => void;
  onOpenThread: (ref: string) => void;
  onWorkIndex: (index: WorkIndex) => void;
  onRefresh: () => void;
  onDriven: () => void;
  onWorkRouted: (ref: string) => void;
  onWorkflowAdopted: (result: { systemIndex: SystemIndex; objectRef: string }) => void;
  onReviewModelBranch: (branchRef: string) => void;
  onThreadDeleted: () => void;
}) {
  const workflowVersions = adoptedWorkflowVersions(systemIndex);
  const adoptWorkflow = async (sketch: WorkflowSketch) => {
    if (!systemIndex) throw new Error("Product / GTM is still loading. Try again when the canvas is current.");
    onWorkflowAdopted(await adoptWorkflowSketch(venture.id, systemIndex, sketch));
  };
  return (
    <ThreadConversation
      ventureId={venture.id}
      ventureName={venture.name}
      repository={venture.repository}
      surface={mode === "work" ? "work" : "context"}
      contextKind={mode === "product-gtm" ? "product-gtm" : null}
      item={item}
      timeline={timeline.timeline}
      lens={lens}
      connection={connection}
      loading={timeline.loading}
      error={timeline.error}
      draft={activeDraft}
      draftSession={draftSession}
      subjectRefs={activeDraft && draftSubjectRef ? [draftSubjectRef, ...draftRelatedRefs] : []}
      workflowStep={workflowStep}
      scopeLabel={draftSubjectRef === selectedObject?.objectRef ? selectedObject.name : null}
      targetAgentRef={activeDraft ? selectedAgentRef : null}
      artifactFocus={artifactFocus}
      artifactFocusRequest={artifactFocusRequest}
      onClearArtifactFocus={() => onArtifactFocus(null)}
      adoptedWorkflowVersions={workflowVersions}
      activeDrives={activeDrives}
      initialScrollTop={resolvedThreadRef ? (scrolls[resolvedThreadRef] ?? null) : null}
      onScrollChange={onScrollChange}
      onOpenVisual={onOpenVisual}
      onOpenThread={onOpenThread}
      onTogglePin={() => {
        if (!item || item.threadRef === ROOT_THREAD_REF) return;
        void setThreadPinned(venture.id, item.threadRef, !item.pinnedAt)
          .then((response) => onWorkIndex(response.workIndex)).catch(onRefresh);
      }}
      onRename={async (name) => {
        if (!item || item.threadRef === ROOT_THREAD_REF) return;
        const response = await setThreadName(venture.id, item.threadRef, name);
        onWorkIndex(response.workIndex);
      }}
      onDelete={async () => {
        if (!item || item.threadRef === ROOT_THREAD_REF) return;
        const response = await deleteThread(venture.id, item.threadRef);
        onWorkIndex(response.workIndex);
        onOpenThread(ROOT_THREAD_REF);
        onThreadDeleted();
      }}
      renameDisabledReason={["stale", "offline", "read-only"].includes(connection.phase) ? (connection.message ?? "Thread changes are unavailable until Drover reconnects.") : null}
      onDriven={onDriven}
      onWorkRouted={onWorkRouted}
      onAdoptWorkflow={adoptWorkflow}
      onReviewModelBranch={onReviewModelBranch}
    />
  );
}
