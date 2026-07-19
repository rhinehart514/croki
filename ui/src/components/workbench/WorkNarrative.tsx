import { Clock3, CornerDownRight, Radio } from "lucide-react";
import type { FirmConversationMessage, FirmLens } from "@/types";
import { conversationBetIds, focusedConversationMessages } from "@/components/firm/conversationProjection";
import type { StageContext } from "@/components/stage/projectStageContext";

const MESSAGE_TIME = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

function messageTime(value: string): string | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : MESSAGE_TIME.format(date);
}

function speaker(message: FirmConversationMessage): string {
  if (message.role === "founder") return "You";
  if (message.role === "system") return "System";
  return "Drover";
}

function isRunDetail(message: FirmConversationMessage): boolean {
  return message.role === "system"
    || message.kind === "handoff"
    || message.kind === "configuration-proposal"
    || message.kind === "configuration-receipt"
    || Boolean(message.coordination);
}

function actLabel(message: FirmConversationMessage): string | null {
  if (message.outcomeReport) return "The market answered";
  if (message.kind === "handoff") return "Work handed off";
  if (message.kind === "configuration-proposal") return "Configuration proposed";
  if (message.kind === "configuration-receipt") return "Configuration changed";
  if (message.coordination) return "Evidence requested";
  return null;
}

export function WorkNarrative({
  stage,
  lens,
  messages,
}: {
  stage: StageContext;
  lens: FirmLens;
  messages: FirmConversationMessage[];
}) {
  const betIds = conversationBetIds(lens, stage.selection);
  // The direction title is itself the opening founder message. T3 keeps the thread title and timeline
  // distinct; do the same here instead of rendering the founder sentence twice in one working view.
  const focused = focusedConversationMessages(messages, lens, stage.selection, new Set(betIds))
    .filter((message) => message.id !== stage.direction?.id);
  const scopedMessages = focused.filter((message) => !isRunDetail(message));
  const runDetails = focused.filter((message) => isRunDetail(message) || Boolean(message.runtime?.label));
  const state = stage.waiting.length
    ? { label: "Waiting for your decision", tone: "attention" }
    : stage.ctx?.drives.length
      ? { label: "Drover is working", tone: "working" }
      : stage.direction?.state === "from-market"
        ? { label: "The market answered", tone: "returned" }
        : { label: "Ready to continue", tone: "quiet" };

  return (
    <section className="work-narrative" aria-label="Work stream">
      <header className="work-narrative-head">
        <div>
          <span className="work-narrative-kicker">Work stream</span>
          <h2>{stage.direction?.sentence ?? stage.focusLabel ?? "Selected work"}</h2>
        </div>
        <span className="work-narrative-state" data-tone={state.tone}>
          <span aria-hidden="true" />{state.label}
        </span>
      </header>

      {stage.direction?.understanding ? (
        <p className="work-narrative-understanding">{stage.direction.understanding}</p>
      ) : null}

      <div className="work-narrative-scroll">
        {scopedMessages.length ? (
          <ol className="work-timeline" aria-label="Conversation for this work">
            {scopedMessages.map((message) => {
              const time = messageTime(message.createdAt);
              const act = actLabel(message);
              return (
                <li key={message.id} className="work-timeline-entry" data-role={message.role}>
                  <span className="work-timeline-rail" aria-hidden="true">
                    <span>{message.role === "founder" ? "Y" : message.outcomeReport ? <Radio /> : "D"}</span>
                  </span>
                  <article>
                    <header>
                      <strong>{speaker(message)}</strong>
                      {act ? <span className="work-timeline-act">{act}</span> : null}
                      {time ? <time dateTime={message.createdAt}>{time}</time> : null}
                    </header>
                    <p>{message.content}</p>
                  </article>
                </li>
              );
            })}
          </ol>
        ) : (
          <div className="work-timeline-empty" role="status">
            <CornerDownRight aria-hidden="true" />
            <div>
              <strong>No conversation for this exact work yet</strong>
              <p>Continue below and Drover will keep the direction attached here.</p>
            </div>
          </div>
        )}

        {runDetails.length ? (
          <details className="work-run-details">
            <summary>Run details</summary>
            <ul>
              {runDetails.map((message) => {
                const time = messageTime(message.createdAt);
                return (
                  <li key={message.id}>
                    <Clock3 aria-hidden="true" />
                    <span>{actLabel(message) ?? message.runtime?.label ?? "Run activity"}</span>
                    {message.runtime?.model ? <code>{message.runtime.model}</code> : null}
                    {time ? <time dateTime={message.createdAt}>{time}</time> : null}
                  </li>
                );
              })}
            </ul>
          </details>
        ) : null}
      </div>
    </section>
  );
}
