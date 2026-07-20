import { useLayoutEffect, useRef } from "react";
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

export function ThreadConversation({ ventureId, ventureName, repository, surface = "context", item, timeline, lens, connection, loading, error, draft, subjectRefs = [], scopeLabel, initialScrollTop, onScrollChange, onOpenVisual, onOpenThread, onTogglePin, onDriven }: {
  ventureId: string;
  ventureName: string;
  repository?: string;
  surface?: "work" | "context";
  item: WorkIndexItem | null;
  timeline: ThreadTimeline | null;
  lens: FirmLens | null;
  connection: FirmConnectionState;
  loading: boolean;
  error: string | null;
  draft: boolean;
  subjectRefs?: string[];
  scopeLabel?: string | null;
  initialScrollTop: number | null;
  onScrollChange: (threadRef: string, scrollTop: number) => void;
  onOpenVisual: (visual: VisualReference, origin: HTMLElement) => void;
  onOpenThread: (threadRef: string) => void;
  onTogglePin: () => void;
  onDriven: () => void;
}) {
  const conversation = useRef<StickToBottomContext | null>(null);
  const readOnly = connection.phase === "stale" || connection.phase === "offline" || connection.phase === "read-only";
  const readOnlyReason = connection.phase === "offline" ? "Offline. The last coherent conversation stays readable, but consequential actions are held." : connection.message;
  const isHome = item?.threadRef === "thread:venture-root";
  const currentRef = item?.threadRef ?? null;
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
    <section className="thread-conversation" data-surface={surface} aria-label={item?.founderIntent ?? (draft ? "New thread" : "Venture conversation")}>
      <ThreadHeader item={draft ? null : item} timeline={timeline} onOpenVisual={onOpenVisual} onTogglePin={onTogglePin} />
      <FirmFreshness connection={connection} onRetry={onDriven} />
      <Conversation className="thread-log" contextRef={conversation} initial={surface === "work" ? "instant" : "smooth"}>
        <ConversationContent className="thread-log-content" scrollClassName="thread-log-scroll">
          {draft || (isHome && !timeline) ? <ThreadHome attention={0} active={0} /> : null}
          {!draft && !timeline && loading ? <div className="thread-loading" role="status">Restoring this thread…</div> : null}
          {!draft && error ? <div className="thread-stale" role="status">{error} The last coherent thread remains unchanged.</div> : null}
          {!draft && timeline?.items.length === 0 ? <ThreadHome attention={0} active={timeline.agents.length} /> : null}
          {timeline?.items.map((timelineItem) => <ThreadMessage key={timelineItem.id} item={timelineItem} surface={surface} onOpenVisual={onOpenVisual} onOpenThread={onOpenThread} />)}
        </ConversationContent>
        <ConversationScrollButton aria-label="Scroll to newest message" />
      </Conversation>
      <ThreadComposer ventureId={ventureId} ventureName={ventureName} repository={repository} surface={surface} item={item} lens={lens} draft={draft} isHome={isHome} readOnly={readOnly} readOnlyReason={readOnlyReason} subjectRefs={subjectRefs} scopeLabel={scopeLabel} onDriven={onDriven} />
    </section>
  );
}
