import { Check, Copy, FileChartColumnIncreasing } from "lucide-react";
import { useEffect, useMemo, useState, type ComponentPropsWithoutRef } from "react";
import type { ThreadTimelineItem, VisualReference } from "@/api";
import { MessageResponse } from "@/components/ai-elements/message";
import {
  ArtifactMessage,
  ComparisonMessage,
  ConsequenceMessage,
  EvidenceMessage,
} from "./RichThreadItems";
import { ThreadAgentUpdate } from "./ThreadAgentUpdate";
import { ThreadImage } from "./ThreadImage";
import { ThreadMarkdownLink } from "./ThreadMarkdownLink";
import { openTerminalReference, terminalReferenceIn } from "@/components/work-mode/terminalReference";

type Props = {
  item: ThreadTimelineItem;
  surface?: "work" | "context";
  repository?: string;
  threadRef?: string | null;
  onOpenVisual: (visual: VisualReference, origin: HTMLElement) => void;
  onOpenThread: (threadRef: string) => void;
};

const text = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;

// A founder brain-dump longer than this collapses behind a fade so the transcript keeps its rhythm;
// the full message is one click away and nothing is truncated in the durable record.
const MAX_COLLAPSED_FOUNDER_CHARS = 600;
const MAX_COLLAPSED_FOUNDER_LINES = 8;

function FounderMessageBody({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);
  const parsed = terminalReferenceIn(content);
  const visible = parsed.content;
  const reference = parsed.reference;
  const source = reference ? <button type="button" className="thread-terminal-reference" onClick={() => openTerminalReference(reference)}>
    {reference.terminalName} · selected terminal output
  </button> : null;
  const collapsible = visible.length > MAX_COLLAPSED_FOUNDER_CHARS || visible.split("\n").length > MAX_COLLAPSED_FOUNDER_LINES;
  if (!collapsible) return <>{source}<p>{visible}</p></>;
  return (
    <div className="thread-founder-collapse" data-expanded={expanded ? "true" : undefined}>
      {source}<p>{visible}</p>
      <button type="button" className="thread-message-expand" aria-expanded={expanded} onClick={() => setExpanded((open) => !open)}>
        {expanded ? "Show less" : "Show full message"}
      </button>
    </div>
  );
}

function CopyTurnButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), 1_000);
    return () => window.clearTimeout(timer);
  }, [copied]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
    } catch { /* Clipboard unavailable: the button simply does not confirm. */ }
  };
  return (
    <button type="button" className="thread-message-copy" aria-label={copied ? "Copied" : "Copy message as Markdown"} title="Copy as Markdown" onClick={() => void copy()}>
      {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
    </button>
  );
}

function AgentMessageBody({ content, repository, streaming, threadRef }: {
  content: string;
  repository?: string;
  streaming: boolean;
  threadRef?: string | null;
}) {
  const components = useMemo(() => ({
    a: (value: ComponentPropsWithoutRef<"a"> & { node?: unknown }) => {
      const { node, ...props } = value;
      void node;
      return <ThreadMarkdownLink {...props} repository={repository} threadRef={threadRef} />;
    },
  }), [repository, threadRef]);
  return <MessageResponse components={components} isAnimating={streaming}>{content}</MessageResponse>;
}

export function ThreadMessage({ item, surface = "context", repository, threadRef, onOpenVisual, onOpenThread }: Props) {
  if (item.kind === "artifact") return <ArtifactMessage item={item} onOpenVisual={onOpenVisual} />;
  if (item.kind === "comparison") return <ComparisonMessage item={item} onOpenVisual={onOpenVisual} />;
  if (item.kind === "evidence") return <EvidenceMessage item={item} onOpenVisual={onOpenVisual} />;
  if (item.kind === "consequence") return <ConsequenceMessage item={item} onOpenVisual={onOpenVisual} />;
  if (item.kind === "activity-summary") return null;

  if (item.kind === "agent-status") {
    return <ThreadAgentUpdate item={item} surface={surface} />;
  }

  if (item.kind === "message" && item.messageKind === "handoff") {
    const participant = text(item.participantLabel, text(item.participantRef, "Croki"));
    const content = text(item.content);
    const detail = content.toLocaleLowerCase().startsWith(`${participant.toLocaleLowerCase()} `)
      ? content.slice(participant.length + 1)
      : content;
    return (
      <article className="thread-handoff" aria-label={`${participant} accepted this direction`}>
        <span className="thread-handoff-mark" aria-hidden="true" />
        <strong>{participant}</strong>
        <p>{detail}</p>
      </article>
    );
  }

  if (item.kind === "return-summary") {
    const counts = item.counts as Record<string, number> | undefined;
    const actions = Array.isArray(item.actions) ? item.actions as Array<Record<string, unknown>> : [];
    return (
      <section className="thread-home-summary">
        <span>Croki</span>
        <h2>Since you left</h2>
        <p>{counts?.attention ? `${counts.attention} ${counts.attention === 1 ? "thread needs" : "threads need"} your judgment.` : counts?.active ? `${counts.active} ${counts.active === 1 ? "agent is" : "agents are"} still working.` : "There are no new consequences waiting for review."}</p>
        {actions.length ? <div>{actions.map((action) => <button type="button" key={text(action.threadRef)} onClick={() => onOpenThread(text(action.threadRef))}>{text(action.label, "Review thread")}</button>)}</div> : <p>Ask Croki what matters most, or start a new direction.</p>}
        <h3>What do you want to build?</h3>
      </section>
    );
  }

  const role = text(item.role, "teammate");
  const participantRef = text(item.participantRef);
  const participant = role === "founder" ? "You" : text(item.participantLabel, text(item.participantRef, "Croki"));
  const content = text(item.content);
  const attachments = Array.isArray(item.attachments) ? item.attachments.filter((attachment): attachment is { id: string; name: string } => (
    Boolean(attachment && typeof attachment === "object" && typeof (attachment as Record<string, unknown>).id === "string" && typeof (attachment as Record<string, unknown>).name === "string")
  )) : [];
  const journeyAttachments = Array.isArray(item.attachments) ? item.attachments.filter((attachment): attachment is { kind: "journey-import"; importRef: string; name: string } => {
    if (!attachment || typeof attachment !== "object") return false;
    const value = attachment as Record<string, unknown>;
    return value.kind === "journey-import" && typeof value.importRef === "string" && typeof value.name === "string";
  }) : [];
  if (surface === "work" && role !== "founder" && content.trim().toLocaleLowerCase() === `${participant.toLocaleLowerCase()} is taking this one.`) return null;
  // Older direct-SDK turns persisted a provider acknowledgement before every real response. The
  // selected model and factual activity already carry that state, so keep existing Threads as quiet
  // as new ones without rewriting their durable conversation records.
  if (surface === "work" && role !== "founder" && ["codex", "claude-code"].includes(participantRef) && /^continuing with (?:codex|claude code)\.?$/i.test(content.trim())) return null;
  const streaming = role !== "founder" && Boolean(item.streaming);
  return (
    <article className="thread-message" data-role={role} data-streaming={streaming ? "true" : undefined}>
      <header>{participant}</header>
      <div className="thread-message-body">
        {attachments.length ? <div className="thread-message-images">
          {attachments.map((attachment) => <ThreadImage key={attachment.id} ventureId={String(item.ventureId ?? "")} imageId={attachment.id} name={attachment.name} />)}
        </div> : null}
        {journeyAttachments.length ? <div className="thread-message-journeys">
          {journeyAttachments.map((attachment) => <span key={attachment.importRef}><FileChartColumnIncreasing aria-hidden="true" /><span><strong>{attachment.name}</strong><small>Observed journey source · mapping in this Thread</small></span></span>)}
        </div> : null}
        {role === "founder"
          ? <FounderMessageBody content={content} />
          : <AgentMessageBody content={content} repository={repository} streaming={streaming} threadRef={threadRef} />}
        {streaming ? <span className="thread-message-caret" aria-label="Responding…" /> : null}
      </div>
      {!streaming && content.trim() ? <CopyTurnButton content={content} /> : null}
    </article>
  );
}
