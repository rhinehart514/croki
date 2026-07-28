import { forwardRef, useEffect, useMemo, useRef, useState, type HTMLAttributes, type ReactNode } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { ArrowDownIcon } from "lucide-react";
import type { ThreadTimelineItem, VisualReference } from "@/api";
import { Button } from "@/components/ui/button";
import { ThreadMessage } from "./ThreadMessage";

// ThreadTranscript — the Work transcript's single scroll owner, virtualized.
//
// A long thread must scroll and stream at native-client cost: only the turns near the viewport are
// mounted, appended turns keep the reader's position, and following the newest output remains the
// default whenever the reader is already at the bottom. The geometry classes are split so the list
// element itself stays free of padding — Virtuoso projects off-screen turns as inline top/bottom
// padding, so any stylesheet padding on it would corrupt scroll positions.

type TranscriptRow =
  | { key: string; kind: "item"; item: ThreadTimelineItem }
  | { key: string; kind: "pending"; content: string };

type TranscriptContext = { lead: ReactNode };

const TranscriptHeader = ({ context }: { context?: TranscriptContext }) => (
  <div className="thread-log-lead">{context?.lead}</div>
);

const TranscriptFooter = () => <div className="thread-log-tail" aria-hidden="true" />;

// The wrapper, not the message, is what Virtuoso measures. `flow-root` (set in CSS) keeps each
// message's own margins inside the measured height instead of collapsing out of it. Virtuoso hands
// its row object and context to every custom component; both are consumed here so they never land
// on the DOM element.
const TranscriptItem = ({ item, context, ...rest }: HTMLAttributes<HTMLDivElement> & { item: TranscriptRow; context?: TranscriptContext }) => {
  void item; void context;
  return <div {...rest} className="thread-log-item" />;
};

const TranscriptScroller = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement> & { context?: TranscriptContext }>(function TranscriptScroller({ context, ...rest }, ref) {
  void context;
  return <div {...rest} ref={ref} className="thread-log-scroll" role="log" />;
});

const COMPONENTS = { Header: TranscriptHeader, Footer: TranscriptFooter, Item: TranscriptItem, Scroller: TranscriptScroller };

export function ThreadTranscript({ threadRef, repository, items, pendingContent, lead, initialScrollTop, onScrollChange, onOpenVisual, onOpenThread }: {
  threadRef: string | null;
  repository?: string;
  items: ThreadTimelineItem[];
  pendingContent: string | null;
  lead: ReactNode;
  initialScrollTop: number | null;
  onScrollChange: (threadRef: string, scrollTop: number) => void;
  onOpenVisual: (visual: VisualReference, origin: HTMLElement) => void;
  onOpenThread: (threadRef: string) => void;
}) {
  const handle = useRef<VirtuosoHandle | null>(null);
  const scroller = useRef<HTMLElement | Window | null>(null);
  // A restored mid-thread position must not count as "at bottom" before the first real scroll
  // measurement, or the streaming follow below would yank the reader away from where they left off.
  const [atBottom, setAtBottom] = useState(initialScrollTop == null);
  const atBottomRef = useRef(atBottom);
  const rows = useMemo<TranscriptRow[]>(() => {
    const list: TranscriptRow[] = items.map((item) => ({ key: item.id, kind: "item", item }));
    if (pendingContent != null) list.push({ key: "pending-founder-turn", kind: "pending", content: pendingContent });
    return list;
  }, [items, pendingContent]);
  const context = useMemo<TranscriptContext>(() => ({ lead }), [lead]);
  // The exact scroll offset is this thread's return address. It persists on unmount — thread
  // switches remount this component — so returning lands on the same turn, not the top or bottom.
  useEffect(() => () => {
    const element = scroller.current;
    if (threadRef && element instanceof HTMLElement) onScrollChange(threadRef, element.scrollTop);
  }, [onScrollChange, threadRef]);
  return (
    <div className="thread-log">
      <Virtuoso<TranscriptRow, TranscriptContext>
        // jsdom cannot measure a viewport, so rows appended after mount would never render there;
        // remounting on row-count changes re-applies initialItemCount. Stable in the product.
        key={import.meta.env.MODE === "test" ? `rows-${rows.length}` : "transcript"}
        ref={handle}
        style={{ height: "100%" }}
        // A conversation rises out of its composer. Top-aligning a short thread leaves the dead band
        // between the last turn and the anchored composer that a native coding client never shows —
        // the newest turn must sit against the composer whether the thread is two turns or two hundred.
        alignToBottom
        data={rows}
        context={context}
        components={COMPONENTS}
        computeItemKey={(_, row) => row.key}
        // New rows follow smoothly only when the reader is already at the bottom; a reader scrolled
        // back into history is never moved.
        followOutput={(bottom) => (bottom ? "smooth" : false)}
        atBottomThreshold={60}
        atBottomStateChange={(bottom) => {
          atBottomRef.current = bottom;
          setAtBottom(bottom);
        }}
        // A streaming reply grows the last row without adding one, which followOutput cannot see.
        // Total-height changes while at the bottom re-pin the bottom instantly, so tokens never
        // slide below the fold mid-stream.
        totalListHeightChanged={() => {
          if (atBottomRef.current && rows.length) handle.current?.scrollToIndex({ index: rows.length - 1, align: "end" });
        }}
        scrollerRef={(element) => { scroller.current = element; }}
        // jsdom reports zero heights, so tests render every row from the top instead; combining
        // initialItemCount with a non-zero start index would ask for rows past the end of the data.
        {...(import.meta.env.MODE === "test"
          ? rows.length ? { initialItemCount: rows.length } : {}
          : initialScrollTop != null
            ? { initialScrollTop }
            : rows.length ? { initialTopMostItemIndex: rows.length - 1 } : {})}
        itemContent={(_, row) => row.kind === "item"
          ? <ThreadMessage item={row.item} surface="work" repository={repository} threadRef={threadRef} onOpenVisual={onOpenVisual} onOpenThread={onOpenThread} />
          : (
            <article className="thread-message thread-message-pending" data-role="founder" data-pending="true">
              <header>You</header>
              <div className="thread-message-body"><p>{row.content}</p></div>
            </article>
          )}
      />
      {!atBottom && rows.length ? (
        <Button
          aria-label="Scroll to newest message"
          className="absolute bottom-4 left-[50%] translate-x-[-50%] rounded-full dark:bg-background dark:hover:bg-muted"
          onClick={() => handle.current?.scrollToIndex({ index: rows.length - 1, align: "end", behavior: "smooth" })}
          size="icon"
          type="button"
          variant="outline"
        >
          <ArrowDownIcon className="size-4" />
        </Button>
      ) : null}
    </div>
  );
}
