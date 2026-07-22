import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { StickToBottomContext } from "use-stick-to-bottom";
import type { FirmLens } from "@/types";
import type { ThreadTimeline, VisualReference, WorkIndexItem } from "@/api";
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { FirmFreshness } from "@/components/FirmFreshness";
import type { FirmConnectionState } from "@/hooks/use-firm-connection";
import { ThreadHeader } from "./ThreadHeader";
import { ThreadHome } from "./ThreadHome";
import { ThreadMessage } from "./ThreadMessage";
import { ThreadComposer } from "./ThreadComposer";
import { WorkGraphSketch } from "@/components/work-mode/WorkGraphSketch";
import { workflowSketchFromTimeline, type WorkflowSketch } from "@/components/work-mode/workflowSketch";
import { WorkProductGtmView } from "@/components/work-mode/WorkProductGtmView";
import { productGtmViewFromTimeline } from "@/components/work-mode/productGtmView";
import type { WorkChatMode } from "@/components/work-mode/WorkComposerBar";
import type { ArtifactSectionFocus } from "@/components/review/artifactSectionFocus";

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

function initialWorkChatMode(ventureId: string): WorkChatMode {
  try { return localStorage.getItem(`drover:work-chat-mode:${ventureId}`) === "product-gtm" ? "product-gtm" : "code"; }
  catch { return "code"; }
}

export function ThreadConversation({ ventureId, ventureName, repository, surface = "context", contextKind = null, item, timeline, lens, connection, loading, error, draft, draftSession, subjectRefs = [], scopeLabel, targetAgentRef = null, artifactFocus = null, artifactFocusRequest = 0, onClearArtifactFocus, adoptedWorkflowVersions, initialScrollTop, onScrollChange, onOpenVisual, onOpenThread, onTogglePin, onRename, onDelete, renameDisabledReason = null, onDriven, onWorkRouted, onAdoptWorkflow, onReviewModelBranch }: {
  ventureId: string;
  ventureName: string;
  repository?: string;
  surface?: "work" | "context";
  contextKind?: "product-gtm" | "release" | null;
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
  artifactFocus?: ArtifactSectionFocus | null;
  artifactFocusRequest?: number;
  onClearArtifactFocus?: () => void;
  adoptedWorkflowVersions?: ReadonlyMap<string, string | null>;
  initialScrollTop: number | null;
  onScrollChange: (threadRef: string, scrollTop: number) => void;
  onOpenVisual: (visual: VisualReference, origin: HTMLElement) => void;
  onOpenThread: (threadRef: string) => void;
  onTogglePin: () => void;
  onRename: (name: string) => Promise<void>;
  onDelete: () => Promise<void>;
  renameDisabledReason?: string | null;
  onDriven: () => void;
  onWorkRouted?: (threadRef: string) => void;
  onAdoptWorkflow?: (sketch: WorkflowSketch) => Promise<void>;
  onReviewModelBranch?: (branchRef: string) => void;
}) {
  const conversation = useRef<StickToBottomContext | null>(null);
  const contextualSubmission = useRef<{
    draftSession: number;
    threadRef: string | null;
    knownWorkHandoffIds: Set<string>;
  } | null>(null);
  const readOnly = connection.phase === "stale" || connection.phase === "offline" || connection.phase === "read-only";
  const readOnlyReason = connection.phase === "offline" ? "Offline. The last coherent conversation stays readable, but consequential actions are held." : connection.message;
  const isHome = item?.threadRef === "thread:venture-root";
  const currentRef = item?.threadRef ?? null;
  const pendingOwner = draft ? `draft:${draftSession}` : currentRef ? `thread:${currentRef}` : null;
  const hasTranscript = surface === "work";
  // Product / GTM and Releases never accumulate a transcript. A clear contextual question answers
  // in place with one dissolvable reply; substantive direction leaves for its Work Thread instead.
  const contextAnswer = surface === "context"
    ? [...(timeline?.items ?? [])].reverse().find((entry) => entry.kind === "agent-status" || (entry.kind === "message" && entry.role !== "founder")) ?? null
    : null;
  const productGtmView = useMemo(() => surface === "work" ? productGtmViewFromTimeline(timeline) : null, [surface, timeline]);
  const workflowSketch = useMemo(() => surface === "work" && !productGtmView ? workflowSketchFromTimeline(timeline) : null, [productGtmView, surface, timeline]);
  const adoptedVersion = workflowSketch ? adoptedWorkflowVersions?.get(workflowSketch.workRef) : undefined;
  const adoptionState = adoptedVersion === undefined ? "new" : adoptedVersion === workflowSketch?.item.at ? "current" : "changed";
  const [adopting, setAdopting] = useState(false);
  const [adoptionError, setAdoptionError] = useState<string | null>(null);
  const [workChatMode, setWorkChatMode] = useState<WorkChatMode>(() => initialWorkChatMode(ventureId));
  const [pendingFounderTurn, setPendingFounderTurn] = useState<{
    id: string;
    owner: string | null;
    content: string;
    knownMessageIds: string[];
  } | null>(null);
  const chooseWorkChatMode = (mode: WorkChatMode) => {
    setWorkChatMode(mode);
    try { localStorage.setItem(`drover:work-chat-mode:${ventureId}`, mode); } catch { /* presentation preference only */ }
  };
  const beginFounderTurn = (content: string) => {
    const knownMessageIds = timeline?.items
      .filter((entry) => entry.kind === "message" && entry.role === "founder")
      .map((entry) => entry.id) ?? [];
    setPendingFounderTurn({ id: `pending-founder-${Date.now()}`, owner: pendingOwner, content, knownMessageIds });
  };
  const failFounderTurn = (content: string) => {
    setPendingFounderTurn((current) => current?.content === content ? null : current);
  };
  const beginContextTurn = () => {
    contextualSubmission.current = {
      draftSession,
      threadRef: currentRef,
      knownWorkHandoffIds: new Set(workHandoffIds(timeline)),
    };
  };
  const failContextTurn = () => {
    contextualSubmission.current = null;
  };
  const visiblePendingFounderTurn = pendingFounderTurn?.owner === pendingOwner && !timeline?.items.some((entry) => (
      entry.kind === "message"
      && entry.role === "founder"
      && !pendingFounderTurn.knownMessageIds.includes(entry.id)
      && typeof entry.content === "string"
      && entry.content.trim() === pendingFounderTurn.content
    )) ? pendingFounderTurn : null;
  const adoptWorkflow = async () => {
    if (!workflowSketch || !onAdoptWorkflow || adopting) return;
    setAdopting(true); setAdoptionError(null);
    try { await onAdoptWorkflow(workflowSketch); }
    catch (cause) { setAdoptionError(cause instanceof Error ? cause.message : "The workflow could not be adopted."); }
    finally { setAdopting(false); }
  };
  useLayoutEffect(() => {
    const context = conversation.current;
    const frame = window.requestAnimationFrame(() => {
      const scroller = context?.scrollRef.current;
      if (scroller && initialScrollTop != null) scroller.scrollTop = initialScrollTop;
    });
    return () => {
      window.cancelAnimationFrame(frame);
      const scroller = context?.scrollRef.current;
      if (currentRef && scroller) onScrollChange(currentRef, scroller.scrollTop);
    };
  }, [currentRef, initialScrollTop, onScrollChange]);
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
    if (!newWorkHandoff) return;
    contextualSubmission.current = null;
    onWorkRouted(currentRef);
  }, [currentRef, draftSession, onWorkRouted, surface, timeline]);
  return (
    <section className="thread-conversation" data-surface={surface} data-chat-mode={surface === "work" ? workChatMode : undefined} data-has-transcript={hasTranscript ? "true" : "false"} aria-label={item?.founderIntent ?? (draft ? "New thread" : "Venture conversation")}>
      {surface === "work" ? <ThreadHeader item={draft ? null : item} timeline={timeline} onOpenVisual={onOpenVisual} onTogglePin={onTogglePin} onRename={onRename} onDelete={onDelete} renameDisabledReason={renameDisabledReason} /> : null}
      <FirmFreshness connection={connection} onRetry={onDriven} />
      {hasTranscript ? <Conversation className="thread-log" contextRef={conversation} initial="instant">
        <ConversationContent className="thread-log-content" scrollClassName="thread-log-scroll">
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
          {!draft && error ? <div className="thread-stale" role="status">{error} The last coherent thread remains unchanged.</div> : null}
          {!draft && timeline?.items.length === 0 ? <ThreadHome attention={0} active={timeline.agents.length} /> : null}
          {timeline?.items.map((timelineItem) => <ThreadMessage key={timelineItem.id} item={timelineItem} surface={surface} chatMode={workChatMode} onOpenVisual={onOpenVisual} onOpenThread={onOpenThread} />)}
          {visiblePendingFounderTurn ? (
            <article className="thread-message thread-message-pending" data-role="founder" data-pending="true">
              <header>You</header>
              <div className="thread-message-body"><p>{visiblePendingFounderTurn.content}</p></div>
            </article>
          ) : null}
        </ConversationContent>
        <ConversationScrollButton aria-label="Scroll to newest message" />
      </Conversation> : null}
      {surface === "context" && !draft ? (
        (!timeline && loading) ? (
          <div className="thread-context-answer" role="status"><p className="thread-context-note">Connecting to Work…</p></div>
        ) : error ? (
          <div className="thread-context-answer" role="alert"><p className="thread-context-note">{error} The last coherent reply remains unchanged.</p></div>
        ) : contextAnswer ? (
          <div className="thread-context-answer"><ThreadMessage item={contextAnswer} surface="context" onOpenVisual={onOpenVisual} onOpenThread={onOpenThread} /></div>
        ) : null
      ) : null}
      {productGtmView ? <WorkProductGtmView view={productGtmView} error={null} onOpen={onOpenVisual} onReview={(branchRef) => onReviewModelBranch?.(branchRef)} /> : null}
      {workflowSketch ? <WorkGraphSketch sketch={workflowSketch} adoptionState={adoptionState} busy={adopting} error={adoptionError} onOpen={onOpenVisual} onAdopt={() => void adoptWorkflow()} /> : null}
      <ThreadComposer ventureId={ventureId} ventureName={ventureName} repository={repository} surface={surface} contextKind={contextKind} item={item} lens={lens} draft={draft} isHome={isHome} readOnly={readOnly} readOnlyReason={readOnlyReason} subjectRefs={subjectRefs} scopeLabel={scopeLabel} targetAgentRef={targetAgentRef} workRef={productGtmView?.workId ?? workflowSketch?.workId ?? null} productGtmView={Boolean(productGtmView)} workflowSketch={Boolean(workflowSketch)} modelBranchRef={productGtmView?.branchRef ?? null} artifactFocus={artifactFocus} artifactFocusRequest={artifactFocusRequest} onClearArtifactFocus={onClearArtifactFocus} workChatMode={workChatMode} onWorkChatModeChange={chooseWorkChatMode} onSubmitStart={surface === "work" ? beginFounderTurn : beginContextTurn} onSubmitFailed={surface === "work" ? failFounderTurn : failContextTurn} onDriven={onDriven} onWorkRouted={onWorkRouted} />
    </section>
  );
}
