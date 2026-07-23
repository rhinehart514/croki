import type { ThreadTimelineItem, VisualReference } from "@/api";
import { MessageResponse } from "@/components/ai-elements/message";
import {
  ArtifactMessage,
  ComparisonMessage,
  ConsequenceMessage,
  EvidenceMessage,
} from "./RichThreadItems";
import { ThreadAgentUpdate } from "./ThreadAgentUpdate";
import type { WorkChatMode } from "@/components/work-mode/WorkComposerBar";
import { ThreadImage } from "./ThreadImage";

type Props = {
  item: ThreadTimelineItem;
  surface?: "work" | "context";
  chatMode?: WorkChatMode;
  onOpenVisual: (visual: VisualReference, origin: HTMLElement) => void;
  onOpenThread: (threadRef: string) => void;
};

const text = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;

export function ThreadMessage({ item, surface = "context", chatMode = "code", onOpenVisual, onOpenThread }: Props) {
  if (item.kind === "artifact") return <ArtifactMessage item={item} onOpenVisual={onOpenVisual} />;
  if (item.kind === "comparison") return <ComparisonMessage item={item} onOpenVisual={onOpenVisual} />;
  if (item.kind === "evidence") return <EvidenceMessage item={item} onOpenVisual={onOpenVisual} />;
  if (item.kind === "consequence") return <ConsequenceMessage item={item} onOpenVisual={onOpenVisual} />;
  if (item.kind === "activity-summary") return null;

  if (item.kind === "agent-status") {
    return <ThreadAgentUpdate item={item} surface={surface} chatMode={chatMode} />;
  }

  if (item.kind === "message" && item.messageKind === "handoff") {
    const participant = text(item.participantLabel, text(item.participantRef, "Drover"));
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
        <span>Drover</span>
        <h2>Since you left</h2>
        <p>{counts?.attention ? `${counts.attention} ${counts.attention === 1 ? "thread needs" : "threads need"} your judgment.` : counts?.active ? `${counts.active} ${counts.active === 1 ? "agent is" : "agents are"} still working.` : "There are no new consequences waiting for review."}</p>
        {actions.length ? <div>{actions.map((action) => <button type="button" key={text(action.threadRef)} onClick={() => onOpenThread(text(action.threadRef))}>{text(action.label, "Review thread")}</button>)}</div> : <p>Ask Drover what matters most, or start a new direction.</p>}
        <h3>What do you want to work on?</h3>
      </section>
    );
  }

  const role = text(item.role, "teammate");
  const participantRef = text(item.participantRef);
  const participant = role === "founder" ? "You" : text(item.participantLabel, text(item.participantRef, "Drover"));
  const content = text(item.content);
  const attachments = Array.isArray(item.attachments) ? item.attachments.filter((attachment): attachment is { id: string; name: string } => (
    Boolean(attachment && typeof attachment === "object" && typeof (attachment as Record<string, unknown>).id === "string" && typeof (attachment as Record<string, unknown>).name === "string")
  )) : [];
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
        {role === "founder"
          ? <p>{content}</p>
          : <MessageResponse>{content}</MessageResponse>}
        {streaming ? <span className="thread-message-caret" aria-label="Responding…" /> : null}
      </div>
    </article>
  );
}
