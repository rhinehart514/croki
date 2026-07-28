import { useEffect, useMemo, useRef, useState } from "react";
import type { FirmLens } from "@/types";
import type { ConversationReplyResult, FirmActiveDrive, ThreadTimeline, VisualReference, WorkIndexItem } from "@/api";
import { FirmFreshness } from "@/components/FirmFreshness";
import type { FirmConnectionState } from "@/hooks/use-firm-connection";
import { ThreadHeader } from "./ThreadHeader";
import { ThreadHome } from "./ThreadHome";
import { ThreadMessage } from "./ThreadMessage";
import { ThreadTranscript } from "./ThreadTranscript";
import { ThreadComposer } from "./ThreadComposer";
import { WorkGraphSketch } from "@/components/work-mode/WorkGraphSketch";
import { workflowSketchFromTimeline, type WorkflowSketch } from "@/components/work-mode/workflowSketch";
import { WorkProductGtmView } from "@/components/work-mode/WorkProductGtmView";
import { productGtmViewFromTimeline } from "@/components/work-mode/productGtmView";
import type { WorkModelChoice } from "@/components/work-mode/WorkComposerBar";
import type { ArtifactSectionFocus } from "@/components/review/artifactSectionFocus";
import type { ProductGtmWalkthroughStep } from "@/components/product-gtm/productGtmWorkflow";
import { recordUxMetric } from "@/lib/ux-metrics";
import { recoveryPresentation } from "@/lib/recovery-presentation";

function workHandoffIds(timeline: ThreadTimeline | null): string[] {
  return (timeline?.items ?? []).filter((entry) => {
    if (entry.kind !== "message" || entry.messageKind !== "handoff") return false;
    const changes = entry.changes && typeof entry.changes === "object"
      ? entry.changes as Record<string, unknown>
      : null;
    return changes && ["openedBetIds", "stagedBetIds", "wallBetIds"]
      .some((key) => Array.isArray(changes[key]) && changes[key].length > 0);
  }).map((entry) => entry.id);
}

// A live coding/investigation drive belongs in Work, never rendered with coding geometry inside the
// Product / GTM dock. A quick answer settles into a message or a done reply; a real running drive stays
// working/stopping, and that is the signal that this contextual turn became substantive Work.
function activeDriveIds(timeline: ThreadTimeline | null): string[] {
  return (timeline?.items ?? [])
    .filter((entry) => entry.kind === "agent-status"
      && (entry.state === "working" || entry.state === "stopping"))
    .map((entry) => entry.id);
}

export function ThreadConversation({ ventureId, ventureName, repository, surface = "context", contextKind = null, item, timeline, lens, connection, loading, error, draft, draftSession, subjectRefs = [], scopeLabel, targetAgentRef = null, workflowStep = null, artifactFocus = null, artifactFocusRequest = 0, onClearArtifactFocus, adoptedWorkflowVersions, activeDrives = [], modelChoice, canvasOpen = false, canvasSubjectContext = false, canvasAttention = 0, onCanvasOpenChange, initialScrollTop, onScrollChange, onOpenVisual, onOpenThread, onTogglePin, onRename, onDelete, renameDisabledReason = null, onDriven, onThreadAccepted, onModelChoice, onWorkRouted, onAdoptWorkflow, onReviewModelBranch }: {
  ventureId: string;
  ventureName: string;
  repository?: string;
  surface?: "work" | "context";
  contextKind?: "product-gtm" | null;
  item: WorkIndexItem | null;
  timeline: ThreadTimeline | null;
  lens: FirmLens | null;
  connection: FirmConnectionState;
  loading: boolean;
  error: string | null;
  draft: boolean;
  draftSession: number;
  subjectRefs?: string[];
  scopeLabel?: string | null;
  targetAgentRef?: string | null;
  workflowStep?: ProductGtmWalkthroughStep | null;
  artifactFocus?: ArtifactSectionFocus | null;
  artifactFocusRequest?: number;
  onClearArtifactFocus?: () => void;
  adoptedWorkflowVersions?: ReadonlyMap<string, string | null>;
  activeDrives?: FirmActiveDrive[];
  modelChoice: WorkModelChoice;
  canvasOpen?: boolean;
  canvasSubjectContext?: boolean;
  canvasAttention?: number;
  onCanvasOpenChange?: (open: boolean) => void;
  initialScrollTop: number | null;
  onScrollChange: (threadRef: string, scrollTop: number) => void;
  onOpenVisual: (visual: VisualReference, origin: HTMLElement) => void;
  onOpenThread: (threadRef: string) => void;
  onTogglePin: () => void;
  onRename: (name: string) => Promise<void>;
  onDelete: () => Promise<void>;
  renameDisabledReason?: string | null;
  onDriven: () => void;
  onThreadAccepted?: (threadRef: string) => void;
  onModelChoice: (choice: WorkModelChoice) => void;
  onWorkRouted?: (threadRef: string) => void;
  onAdoptWorkflow?: (sketch: WorkflowSketch) => Promise<void>;
  onReviewModelBranch?: (branchRef: string) => void;
}) {
  const contextualSubmission = useRef<{
    draftSession: number;
    threadRef: string | null;
    knownWorkHandoffIds: Set<string>;
    knownDriveIds: Set<string>;
  } | null>(null);
  const readOnly = connection.phase === "stale" || connection.phase === "offline" || connection.phase === "read-only";
  const readOnlyReason = connection.phase === "offline" ? "Offline. The last coherent conversation stays readable, but consequential actions are held." : connection.message;
  const isHome = item?.threadRef === "thread:venture-root";
  const currentRef = item?.threadRef ?? null;
  const pendingOwner = draft ? `draft:${draftSession}` : currentRef ? `thread:${currentRef}` : null;
  const hasTranscript = surface === "work";
  // Contextual Canvas conversation never accumulates a competing transcript. A clear question answers
  // in place with one dissolvable reply; substantive direction follows its exact Thread into the spine.
  const contextAnswer = surface === "context"
    ? [...(timeline?.items ?? [])].reverse().find((entry) => entry.kind === "agent-status" || (entry.kind === "message" && entry.role !== "founder")) ?? null
    : null;
  const productGtmView = useMemo(() => surface === "work" ? productGtmViewFromTimeline(timeline) : null, [surface, timeline]);
  const workflowSketch = useMemo(() => surface === "work" && !productGtmView ? workflowSketchFromTimeline(timeline) : null, [productGtmView, surface, timeline]);
  const adoptedVersion = workflowSketch ? adoptedWorkflowVersions?.get(workflowSketch.workRef) : undefined;
  const adoptionState = adoptedVersion === undefined ? "new" : adoptedVersion === workflowSketch?.item.at ? "current" : "changed";
  const [adopting, setAdopting] = useState(false);
  const [adoptionError, setAdoptionError] = useState<string | null>(null);
  const [pendingFounderTurn, setPendingFounderTurn] = useState<{
    id: string;
    owner: string | null;
    messageId: string | null;
    content: string;
    knownMessageIds: string[];
  } | null>(null);
  const founderTurnStartedAt = useRef<{ id: string; at: number } | null>(null);
  const beginFounderTurn = (content: string) => {
    const knownMessageIds = timeline?.items
      .filter((entry) => entry.kind === "message" && entry.role === "founder")
      .map((entry) => entry.id) ?? [];
    const id = `pending-founder-${Date.now()}`;
    founderTurnStartedAt.current = { id, at: performance.now() };
    setPendingFounderTurn({ id, owner: pendingOwner, messageId: null, content, knownMessageIds });
  };
  const acceptFounderTurn = (content: string, result: ConversationReplyResult) => {
    if (!result.threadRef) return;
    setPendingFounderTurn((current) => current?.content === content
      ? {
          ...current,
          owner: `thread:${result.threadRef}`,
          messageId: result.messageId ?? null,
        }
      : current);
    onThreadAccepted?.(result.threadRef);
  };
  const failFounderTurn = (content: string) => {
    setPendingFounderTurn((current) => current?.content === content ? null : current);
  };
  const beginContextTurn = (content: string) => {
    beginFounderTurn(content);
    contextualSubmission.current = {
      draftSession,
      threadRef: currentRef,
      knownWorkHandoffIds: new Set(workHandoffIds(timeline)),
      knownDriveIds: new Set(activeDriveIds(timeline)),
    };
  };
  const acceptContextTurn = (content: string, result: ConversationReplyResult) => {
    acceptFounderTurn(content, result);
    if (result.act !== "new-direction" || !result.threadRef) return;
    contextualSubmission.current = null;
    onWorkRouted?.(result.threadRef);
  };
  const failContextTurn = (content: string) => {
    failFounderTurn(content);
    contextualSubmission.current = null;
  };
  const visiblePendingFounderTurn = pendingFounderTurn?.owner === pendingOwner && !timeline?.items.some((entry) => {
    if (entry.kind !== "message" || entry.role !== "founder") return false;
    if (pendingFounderTurn.messageId && entry.id === pendingFounderTurn.messageId) return true;
    return !pendingFounderTurn.knownMessageIds.includes(entry.id)
      && typeof entry.content === "string"
      && entry.content.trim() === pendingFounderTurn.content;
  }) ? pendingFounderTurn : null;
  useEffect(() => {
    const started = founderTurnStartedAt.current;
    if (!visiblePendingFounderTurn || started?.id !== visiblePendingFounderTurn.id) return;
    founderTurnStartedAt.current = null;
    recordUxMetric("founder_turn_acknowledged", ventureId, performance.now() - started.at);
  }, [ventureId, visiblePendingFounderTurn]);
  const adoptWorkflow = async () => {
    if (!workflowSketch || !onAdoptWorkflow || adopting) return;
    setAdopting(true); setAdoptionError(null);
    try { await onAdoptWorkflow(workflowSketch); }
    catch (cause) { setAdoptionError(cause instanceof Error ? cause.message : "The workflow could not be adopted."); }
    finally { setAdopting(false); }
  };
  useEffect(() => {
    if (surface !== "context" || !onWorkRouted) return;
    const submitted = contextualSubmission.current;
    if (!submitted) return;
    if (submitted.draftSession !== draftSession) {
      contextualSubmission.current = null;
      return;
    }
    if (!submitted.threadRef && currentRef) submitted.threadRef = currentRef;
    if (!currentRef || submitted.threadRef !== currentRef) {
      if (submitted.threadRef && currentRef !== submitted.threadRef) contextualSubmission.current = null;
      return;
    }
    const newWorkHandoff = workHandoffIds(timeline)
      .find((id) => !submitted.knownWorkHandoffIds.has(id));
    const newDrive = activeDriveIds(timeline)
      .find((id) => !submitted.knownDriveIds.has(id));
    if (!newWorkHandoff && !newDrive) return;
    contextualSubmission.current = null;
    onWorkRouted(currentRef);
  }, [currentRef, draftSession, onWorkRouted, surface, timeline]);
  // At rest — a fresh or empty Work Thread with nothing yet to judge — conversation and its composer own
  // the center. The greeting and composer sit together as one centered block; a real transcript, staged
  // graph, loading skeleton, or error drops back to the anchored bottom composer.
  const workEmpty = draft || (timeline ? timeline.items.length === 0 : isHome);
  const workAtRest = surface === "work" && workEmpty && !error && !productGtmView && !workflowSketch
    && !visiblePendingFounderTurn && (Boolean(draft) || !loading);
  const composer = <ThreadComposer ventureId={ventureId} ventureName={ventureName} repository={repository} surface={surface} contextKind={contextKind} item={item} timeline={timeline} lens={lens} draft={draft} isHome={isHome} readOnly={readOnly} readOnlyReason={readOnlyReason} subjectRefs={subjectRefs} scopeLabel={scopeLabel} targetAgentRef={targetAgentRef} workflowStep={workflowStep} workRef={productGtmView?.workId ?? workflowSketch?.workId ?? null} productGtmView={Boolean(productGtmView)} canvasSubjectContext={canvasSubjectContext} workflowSketch={Boolean(workflowSketch)} modelBranchRef={productGtmView?.branchRef ?? null} artifactFocus={artifactFocus} artifactFocusRequest={artifactFocusRequest} onClearArtifactFocus={onClearArtifactFocus} canvasOpen={canvasOpen} canvasAttention={canvasAttention} onCanvasOpenChange={onCanvasOpenChange} modelChoice={modelChoice} onModelChoice={onModelChoice} activeDrives={activeDrives} onSubmitStart={surface === "work" ? beginFounderTurn : beginContextTurn} onSubmitAccepted={surface === "work" ? acceptFounderTurn : acceptContextTurn} onSubmitFailed={surface === "work" ? failFounderTurn : failContextTurn} onDriven={onDriven} onWorkRouted={onWorkRouted} />;
  const threadRecovery = recoveryPresentation("thread-sync");
  return (
    <section className="thread-conversation" data-surface={surface} data-has-transcript={hasTranscript ? "true" : "false"} data-rest={workAtRest ? "true" : "false"} aria-label={item?.founderIntent ?? (draft ? "New thread" : "Venture conversation")}>
      {surface === "work" ? <ThreadHeader item={draft ? null : item} ventureName={ventureName} timeline={timeline} onTogglePin={onTogglePin} onRename={onRename} onDelete={onDelete} renameDisabledReason={renameDisabledReason} /> : null}
      <FirmFreshness connection={connection} onRetry={onDriven} />
      {workAtRest ? (
        <div className="thread-rest">
          <ThreadHome attention={0} active={timeline?.agents.length ?? 0} />
          {composer}
        </div>
      ) : (<>
      {hasTranscript ? <ThreadTranscript
        key={currentRef ?? `draft:${draftSession}`}
        threadRef={currentRef}
        repository={repository}
        items={timeline?.items ?? []}
        pendingContent={visiblePendingFounderTurn?.content ?? null}
        initialScrollTop={initialScrollTop}
        onScrollChange={onScrollChange}
        onOpenVisual={onOpenVisual}
        onOpenThread={onOpenThread}
        lead={<>
          {draft || (isHome && !timeline) ? <ThreadHome attention={0} active={0} /> : null}
          {!draft && !timeline && loading ? (
            <div className="thread-loading" role="status" aria-label="Restoring this thread">
              <div className="thread-skeleton" aria-hidden="true">
                <div className="thread-skeleton-turn" data-role="founder"><span style={{ width: "52%" }} /></div>
                <div className="thread-skeleton-turn" data-role="agent"><span style={{ width: "94%" }} /><span style={{ width: "98%" }} /><span style={{ width: "66%" }} /></div>
                <div className="thread-skeleton-turn" data-role="founder"><span style={{ width: "38%" }} /></div>
                <div className="thread-skeleton-turn" data-role="agent"><span style={{ width: "88%" }} /><span style={{ width: "52%" }} /></div>
              </div>
            </div>
          ) : null}
          {!draft && error ? <div className="thread-stale" role="status"><strong>{threadRecovery.title}</strong> {threadRecovery.retained}</div> : null}
          {!draft && timeline?.items.length === 0 ? <ThreadHome attention={0} active={timeline.agents.length} /> : null}
        </>}
      /> : null}
      {surface === "context" && !draft ? (
        (!timeline && loading) ? (
          <div className="thread-context-answer" role="status"><p className="thread-context-note">Connecting to Work…</p></div>
        ) : error ? (
          <div className="thread-context-answer" role="alert"><p className="thread-context-note">{threadRecovery.title}. The last coherent reply remains unchanged.</p></div>
        ) : contextAnswer ? (
          <div className="thread-context-answer"><ThreadMessage item={contextAnswer} surface="context" repository={repository} threadRef={currentRef} onOpenVisual={onOpenVisual} onOpenThread={onOpenThread} /></div>
        ) : null
      ) : null}
      {productGtmView ? <WorkProductGtmView view={productGtmView} onOpen={onOpenVisual} onReview={(branchRef) => onReviewModelBranch?.(branchRef)} /> : null}
      {workflowSketch ? <WorkGraphSketch sketch={workflowSketch} adoptionState={adoptionState} busy={adopting} error={adoptionError} onOpen={onOpenVisual} onAdopt={() => void adoptWorkflow()} /> : null}
      {composer}
      </>)}
    </section>
  );
}
