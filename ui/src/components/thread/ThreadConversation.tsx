import { useLayoutEffect, useMemo, useRef, useState } from "react";
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
import type { WorkChatMode } from "@/components/work-mode/WorkComposerBar";
import type { ArtifactSectionFocus } from "@/components/review/artifactSectionFocus";

function initialWorkChatMode(ventureId: string): WorkChatMode {
  try { return localStorage.getItem(`drover:work-chat-mode:${ventureId}`) === "product-gtm" ? "product-gtm" : "code"; }
  catch { return "code"; }
}

export function ThreadConversation({ ventureId, ventureName, repository, surface = "context", contextKind = null, item, timeline, lens, connection, loading, error, draft, subjectRefs = [], scopeLabel, targetAgentRef = null, artifactFocus = null, artifactFocusRequest = 0, onClearArtifactFocus, adoptedWorkflowVersions, initialScrollTop, onScrollChange, onOpenVisual, onOpenThread, onTogglePin, onDriven, onWorkRouted, onAdoptWorkflow }: {
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
  onDriven: () => void;
  onWorkRouted?: (threadRef: string) => void;
  onAdoptWorkflow?: (sketch: WorkflowSketch) => Promise<void>;
}) {
  const conversation = useRef<StickToBottomContext | null>(null);
  const readOnly = connection.phase === "stale" || connection.phase === "offline" || connection.phase === "read-only";
  const readOnlyReason = connection.phase === "offline" ? "Offline. The last coherent conversation stays readable, but consequential actions are held." : connection.message;
  const isHome = item?.threadRef === "thread:venture-root";
  const currentRef = item?.threadRef ?? null;
  const hasTranscript = surface === "work" || Boolean(timeline?.items.length || error);
  const workflowSketch = useMemo(() => surface === "work" ? workflowSketchFromTimeline(timeline) : null, [surface, timeline]);
  const adoptedVersion = workflowSketch ? adoptedWorkflowVersions?.get(workflowSketch.workRef) : undefined;
  const adoptionState = adoptedVersion === undefined ? "new" : adoptedVersion === workflowSketch?.item.at ? "current" : "changed";
  const [adopting, setAdopting] = useState(false);
  const [adoptionError, setAdoptionError] = useState<string | null>(null);
  const [workChatMode, setWorkChatMode] = useState<WorkChatMode>(() => initialWorkChatMode(ventureId));
  const [pendingFounderTurn, setPendingFounderTurn] = useState<{
    id: string;
    threadRef: string | null;
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
    setPendingFounderTurn({ id: `pending-founder-${Date.now()}`, threadRef: currentRef, content, knownMessageIds });
  };
  const failFounderTurn = (content: string) => {
    setPendingFounderTurn((current) => current?.content === content ? null : current);
  };
  const visiblePendingFounderTurn = pendingFounderTurn?.threadRef === currentRef && !timeline?.items.some((entry) => (
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
  return (
    <section className="thread-conversation" data-surface={surface} data-chat-mode={surface === "work" ? workChatMode : undefined} data-has-transcript={hasTranscript ? "true" : "false"} aria-label={item?.founderIntent ?? (draft ? "New thread" : "Venture conversation")}>
      {surface === "work" ? <ThreadHeader item={draft ? null : item} timeline={timeline} onOpenVisual={onOpenVisual} onTogglePin={onTogglePin} /> : null}
      <FirmFreshness connection={connection} onRetry={onDriven} />
      {surface === "context" && !draft && !timeline && loading ? <div className="thread-context-status" role="status">Connecting to Work…</div> : null}
      {hasTranscript ? <Conversation className="thread-log" contextRef={conversation} initial={surface === "work" ? "instant" : "smooth"}>
        <ConversationContent className="thread-log-content" scrollClassName="thread-log-scroll">
          {surface === "work" && (draft || (isHome && !timeline)) ? <ThreadHome attention={0} active={0} /> : null}
          {!draft && !timeline && loading ? <div className="thread-loading" role="status">Restoring this thread…</div> : null}
          {!draft && error ? <div className="thread-stale" role="status">{error} The last coherent thread remains unchanged.</div> : null}
          {surface === "work" && !draft && timeline?.items.length === 0 ? <ThreadHome attention={0} active={timeline.agents.length} /> : null}
          {timeline?.items.map((timelineItem) => <ThreadMessage key={timelineItem.id} item={timelineItem} surface={surface} chatMode={surface === "work" ? workChatMode : undefined} onOpenVisual={onOpenVisual} onOpenThread={onOpenThread} />)}
          {surface === "work" && visiblePendingFounderTurn ? (
            <article className="thread-message thread-message-pending" data-role="founder" data-pending="true">
              <header>You</header>
              <div className="thread-message-body"><p>{visiblePendingFounderTurn.content}</p></div>
            </article>
          ) : null}
        </ConversationContent>
        <ConversationScrollButton aria-label="Scroll to newest message" />
      </Conversation> : null}
      {workflowSketch ? <WorkGraphSketch sketch={workflowSketch} adoptionState={adoptionState} busy={adopting} error={adoptionError} onOpen={onOpenVisual} onAdopt={() => void adoptWorkflow()} /> : null}
      <ThreadComposer ventureId={ventureId} ventureName={ventureName} repository={repository} surface={surface} contextKind={contextKind} item={item} lens={lens} draft={draft} isHome={isHome} readOnly={readOnly} readOnlyReason={readOnlyReason} subjectRefs={subjectRefs} scopeLabel={scopeLabel} targetAgentRef={targetAgentRef} workRef={workflowSketch?.workId ?? null} workflowSketch={Boolean(workflowSketch)} artifactFocus={artifactFocus} artifactFocusRequest={artifactFocusRequest} onClearArtifactFocus={onClearArtifactFocus} workChatMode={workChatMode} onWorkChatModeChange={chooseWorkChatMode} onSubmitStart={surface === "work" ? beginFounderTurn : undefined} onSubmitFailed={surface === "work" ? failFounderTurn : undefined} onDriven={onDriven} onWorkRouted={onWorkRouted} />
    </section>
  );
}
