import { useEffect, useRef } from "react";
import { GitBranch } from "lucide-react";
import type { FirmConversationMessage, FirmLens } from "@/types";
import { CrewFace } from "@/components/crew/CrewFace";
import { MessageResponse } from "@/components/ai-elements/message";
import { EventFeed } from "./EventFeed";
import { visibleActivity } from "./event-feed-model";
import { ConversationHandoff } from "./ConversationHandoff";
import { ConfigurationMessage } from "./ConfigurationMessage";
import type { CanvasSelection, DriveState } from "./GoalComposer";
import { configuredParticipantName } from "./teammateDisplay";
import { configurationForLens } from "@/lib/firmConfiguration";
import { conversationBetIds, focusedConversationMessages } from "./conversationProjection";
import { ActiveWorkReceipt, type FirmActiveWork } from "./ActiveWorkReceipt";
import { PendingDriveReceipt } from "./PendingDriveReceipt";

type ConversationFeedProps = {
  lens: FirmLens;
  messages: FirmConversationMessage[];
  selection: CanvasSelection;
  driving: DriveState | null;
  activeWork?: readonly FirmActiveWork[];
  onStopActiveWork?: (workId: string) => void | Promise<void>;
  onSelectBet: (betId: string) => void;
  onOpenWall: () => void;
  onConfigurationChanged: () => void;
  onRetryBet?: (betId: string) => void;
  onRedirectBet?: (betId: string) => void;
  readOnly?: boolean;
  readOnlyReason?: string;
};

const MESSAGE_TIME = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

function teammateName(lens: FirmLens, ref: string | null) {
  const member = lens.crew.find((candidate) => candidate.ref === ref);
  return configuredParticipantName(configurationForLens(lens), ref, member, "The agents");
}

function messageContext(message: FirmConversationMessage, lens: FirmLens) {
  const bet = lens.bets.find((candidate) => candidate.id === message.betId);
  if (message.role === "founder") {
    return `to ${message.teammateRef ? teammateName(lens, message.teammateRef) : "whole firm"}${bet ? ` · ${bet.intent}` : ""}`;
  }
  if (message.coordination) {
    return `${message.coordination.protocol.replaceAll("-", " ")} · asked by ${teammateName(lens, message.coordination.requestedBy)}`;
  }
  return bet?.intent ?? null;
}

function timeLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return MESSAGE_TIME.format(date);
}

function teammateAct(message: FirmConversationMessage) {
  if (message.coordination) return "Review evidence";
  if (message.target?.workRef) return "Refine exact work";
  if (message.target?.architectureId) return "Refine venture architecture";
  if (message.betId) return "Refine this direction";
  return "Direct the venture";
}

function withLegacySpeech(lens: FirmLens, messages: FirmConversationMessage[]) {
  const legacy = lens.bets.flatMap((bet) => (bet.events ?? []).flatMap((event, index) => {
    if (event.type !== "speak" || !event.detail?.trim()) return [];
    const duplicate = messages.some((message) => (
      message.role === "teammate"
      && message.betId === bet.id
      && message.content === event.detail
      && Math.abs(new Date(message.createdAt).getTime() - new Date(event.at).getTime()) < 5_000
    ));
    if (duplicate) return [];
    return [{
      id: `legacy-speak:${bet.id}:${index}`,
      ventureId: lens.ventureId,
      role: "teammate" as const,
      kind: "message" as const,
      content: event.detail,
      teammateRef: bet.teammateRef,
      betId: bet.id,
      changes: null,
      createdAt: event.at,
    }];
  }));
  return [...messages, ...legacy]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

export function ConversationFeed({
  lens,
  messages,
  selection,
  driving,
  activeWork = [],
  onStopActiveWork,
  onSelectBet,
  onOpenWall,
  onConfigurationChanged,
  onRetryBet,
  onRedirectBet,
  readOnly = false,
  readOnlyReason,
}: ConversationFeedProps) {
  const scopedBetIds = conversationBetIds(lens, selection);
  const scopedBetIdSet = new Set(scopedBetIds);
  const displayMessages = focusedConversationMessages(
    withLegacySpeech(lens, messages),
    lens,
    selection,
    scopedBetIdSet,
  );
  const latestMessageId = displayMessages.at(-1)?.id ?? null;
  const firstUse = !selection && lens.bets.length === 0 && messages.length === 0;
  const endRef = useRef<HTMLSpanElement | null>(null);
  const activityCount = selection?.workRef ? 0 : lens.bets.filter((bet) => scopedBetIdSet.has(bet.id)).reduce(
    (count, bet) => count + visibleActivity(bet).filter((event) => !event.voice).length,
    0,
  );
  const selectedMember = selection && !selection.betId && selection.teammateRefs.length === 1
    ? lens.crew.find((member) => member.ref === selection.teammateRefs[0])
    : null;
  const focusedActiveWork = activeWork.filter((work) => {
    if (!selection) return true;
    // Active-drive receipts do not yet carry a durable workRef. Showing a
    // bet-level receipt here would falsely attach it to the selected work.
    if (selection.workRef) return false;
    if (selection.betId) return work.betId === selection.betId;
    return selection.teammateRefs.includes(work.teammateRef);
  });
  const drivingInFocus = Boolean(driving && (
    !selection
    || (selection.betId === driving.betId && (!selection.workRef || selection.workRef === driving.workRef))
    || (!selection.betId && selection.teammateRefs.some((ref) => (
      driving.teammateRefs.includes(ref) || driving.teammateRef === ref
    )))
  ));
  const showOptimisticDrive = Boolean(drivingInFocus && driving && !focusedActiveWork.some((work) => (
    work.betId === driving.betId
    && (!driving.teammateRef || work.teammateRef === driving.teammateRef)
  )));

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [latestMessageId]);

  return (
    <div className="firm-app-conversation">
      {displayMessages.length ? (
        <ol className="firm-app-messages" aria-label="Conversation messages">
          {displayMessages.map((message) => {
            if (message.kind === "handoff") {
              return (
                <li id={`firm-message:${message.id}`} key={message.id} className="firm-app-message-handoff" data-message-id={message.id} tabIndex={-1}>
                  <ConversationHandoff message={message} lens={lens} onSelectBet={onSelectBet} onOpenWall={onOpenWall} />
                </li>
              );
            }
            if (message.kind === "configuration-proposal" || message.kind === "configuration-receipt") {
              return (
                <li id={`firm-message:${message.id}`} key={message.id} className="firm-app-message-configuration" data-message-id={message.id} tabIndex={-1}>
                  <ConfigurationMessage
                    ventureId={lens.ventureId}
                    message={message}
                    currentRevision={configurationForLens(lens).revision}
                    onChanged={onConfigurationChanged}
                    readOnly={readOnly}
                    readOnlyReason={readOnlyReason}
                  />
                </li>
              );
            }
            if (message.outcomeReport) {
              // Evidence to cause: the teammate reports a real market reply, attached to the effort that
              // caused it and linking down to its record. The founder reads what came back and can open
              // the full receipt from here.
              const outcome = (lens.outcomes ?? []).find((entry) => entry.id === message.outcomeReport!.outcomeId) ?? null;
              const reportTime = timeLabel(message.createdAt);
              return (
                <li id={`firm-message:${message.id}`} key={message.id} className="firm-app-message firm-app-message-teammate firm-app-message-return" data-message-id={message.id} data-outcome-id={message.outcomeReport.outcomeId} tabIndex={-1}>
                  <CrewFace agentRef={message.teammateRef ?? "unassigned-teammate"} size={30} />
                  <article>
                    <header>
                      <strong>{teammateName(lens, message.teammateRef)}</strong>
                      <span className="firm-app-return-flag">The market answered</span>
                      {reportTime ? <time dateTime={message.createdAt}>{reportTime}</time> : null}
                    </header>
                    <p className="firm-app-return-line">{message.content}</p>
                    {message.betId ? (
                      <button type="button" className="firm-app-return-open" onClick={() => onSelectBet(message.betId!)}>
                        See what came back{outcome?.channel ? ` · ${outcome.channel}` : ""}
                      </button>
                    ) : null}
                  </article>
                </li>
              );
            }
            const teammate = message.role === "teammate";
            const context = messageContext(message, lens);
            const time = timeLabel(message.createdAt);
            return (
              <li id={`firm-message:${message.id}`} key={message.id} className={`firm-app-message firm-app-message-${message.role}`} data-message-id={message.id} tabIndex={-1}>
                {teammate ? <CrewFace agentRef={message.teammateRef ?? "unassigned-teammate"} size={30} /> : null}
                <article>
                  <header>
                    <strong>{teammate ? teammateName(lens, message.teammateRef) : message.role === "agent" ? "Drover agent" : "You"}</strong>
                    {context && !teammate ? message.betId ? (
                      <button type="button" onClick={() => onSelectBet(message.betId!)}>{context}</button>
                    ) : <span>{context}</span> : null}
                    {time && !teammate ? <time dateTime={message.createdAt}>{time}</time> : null}
                  </header>
                  {message.role === "founder" ? <p>{message.content}</p> : teammate ? (
                    <div className="firm-app-structured-act" aria-label={`${teammateAct(message)} act`}>
                      <div className="firm-app-act-name"><small>Act</small><strong>{teammateAct(message)}</strong></div>
                      <section><small>What changed</small><MessageResponse>{message.content}</MessageResponse></section>
                      <footer className="firm-app-act-receipt">
                        <strong>Receipt</strong>
                        {context ? <span>{context}</span> : null}
                        {message.runtime?.label ? <span>{message.runtime.label}</span> : null}
                        {message.runtime?.model ? <span>{message.runtime.model}</span> : null}
                        {message.runtime?.configurationRevision ? <span>Configuration v{message.runtime.configurationRevision}</span> : null}
                        {time ? <time dateTime={message.createdAt}>{time}</time> : null}
                      </footer>
                    </div>
                  ) : <MessageResponse>{message.content}</MessageResponse>}
                  {!teammate && message.runtime?.label ? (
                    <footer className="firm-app-message-runtime" aria-label="Runtime receipt">
                      <strong>Receipt</strong><span>{message.runtime.label}</span>
                      {message.runtime.model ? <span>{message.runtime.model}</span> : null}
                      {message.runtime.configurationRevision ? <span>Configuration v{message.runtime.configurationRevision}</span> : null}
                    </footer>
                  ) : null}
                </article>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="firm-app-feed-empty">
          <div className="firm-app-feed-empty-intro">
            {selectedMember ? <CrewFace agentRef={selectedMember.ref} size={32} /> : <span className="firm-app-feed-empty-mark"><GitBranch aria-hidden="true" /></span>}
            <span>
              <strong>{selection?.workRef
                ? "No conversation for this exact work yet"
                : selectedMember
                  ? `${teammateName(lens, selectedMember.ref)} is ready`
                  : firstUse
                    ? "Give Drover its first direction"
                    : "Your firm is ready"}</strong>
              <p>{selection?.workRef
                ? "Direction sent below will stay attached to this work identity."
                : selection
                  ? "Direct this focus below, or return to the firm."
                  : firstUse
                    ? "Name what should change for this venture. Drover will ground the first work in the bound product."
                    : "Use the composer below to direct the whole firm."}</p>
            </span>
          </div>
        </div>
      )}
      {focusedActiveWork.map((work) => (
        <ActiveWorkReceipt
          key={work.id}
          lens={lens}
          work={work}
          onStop={onStopActiveWork}
          readOnly={readOnly}
          readOnlyReason={readOnlyReason}
        />
      ))}
      {driving && showOptimisticDrive ? <PendingDriveReceipt lens={lens} driving={driving} /> : null}
      {activityCount ? (
        <details className="firm-app-activity-log">
          <summary>
            <span>Work log</span>
            <small>{activityCount} {activityCount === 1 ? "update" : "updates"}</small>
          </summary>
          <EventFeed
            lens={lens}
            includeVoice={false}
            betIds={scopedBetIds}
            onRetryBet={onRetryBet}
            onRedirectBet={onRedirectBet}
          />
        </details>
      ) : null}
      <span ref={endRef} className="firm-app-conversation-end" aria-hidden="true" />
    </div>
  );
}
