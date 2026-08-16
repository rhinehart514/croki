import { useAtomValue } from "@effect/atom-react";
import {
  type EnvironmentId,
  type PresenceActivity,
  type PresenceParticipant,
  type ThreadId,
} from "@croki/contracts";
import * as Option from "effect/Option";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import { useCallback, useEffect, useRef } from "react";

import { threadPresence } from "../../state/presence";
import { useAtomCommand } from "../../state/use-atom-command";

export const PRESENCE_HEARTBEAT_MS = 8_000;

const EMPTY_PRESENCE_RESULT = Atom.make(
  AsyncResult.success<ReadonlyArray<PresenceParticipant>, never>([]),
).pipe(Atom.withLabel("web-thread-presence:empty"));

function participantLabels(
  participants: ReadonlyArray<PresenceParticipant>,
): ReadonlyArray<string> {
  return [...new Set(participants.map((participant) => participant.label.trim()).filter(Boolean))];
}

function formatNames(labels: ReadonlyArray<string>): string {
  if (labels.length === 0) return "";
  if (labels.length === 1) return `${labels[0]} here`;
  if (labels.length === 2) return `${labels[0]} and ${labels[1]} here`;
  return `${labels.slice(0, 2).join(", ")} +${labels.length - 2} here`;
}

function typingLabel(labels: ReadonlyArray<string>): string {
  if (labels.length === 1) return `${labels[0]} is typing…`;
  if (labels.length === 2) return `${labels[0]} and ${labels[1]} are typing…`;
  return `${labels.slice(0, 2).join(", ")} +${labels.length - 2} are typing…`;
}

/** Pure presentation seam for the header; empty input renders no multiplayer chrome. */
export function ThreadPresenceSummaryContent({
  participants,
}: {
  readonly participants: ReadonlyArray<PresenceParticipant>;
}) {
  const labels = participantLabels(participants);
  if (labels.length === 0) return null;
  return (
    <span
      aria-label={`People in this thread: ${labels.join(", ")}`}
      className="inline-flex min-w-0 max-w-52 items-center gap-1 text-muted-foreground text-xs"
      data-thread-presence="summary"
      title={labels.join(", ")}
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-emerald-500/80" />
      <span className="truncate">{formatNames(labels)}</span>
    </span>
  );
}

/** Pure presentation seam for the composer; never includes draft contents. */
export function ThreadTypingIndicatorContent({
  participants,
}: {
  readonly participants: ReadonlyArray<PresenceParticipant>;
}) {
  const labels = participantLabels(
    participants.filter((participant) => participant.activity === "typing"),
  );
  if (labels.length === 0) return null;
  return (
    <div
      aria-live="polite"
      className="px-3 pb-1 text-muted-foreground text-xs"
      data-thread-presence="typing"
      role="status"
    >
      {typingLabel(labels)}
    </div>
  );
}

function useThreadPresenceParticipants(input: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId | null;
  readonly enabled: boolean;
}): ReadonlyArray<PresenceParticipant> {
  const result = useAtomValue(
    input.enabled && input.threadId !== null
      ? threadPresence.participants({
          environmentId: input.environmentId,
          input: { threadId: input.threadId },
        })
      : EMPTY_PRESENCE_RESULT,
  );
  return Option.getOrElse(
    AsyncResult.value(result),
    () => [] as ReadonlyArray<PresenceParticipant>,
  );
}

export function ThreadPresenceSummary({
  environmentId,
  threadId,
  enabled,
}: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId | null;
  readonly enabled: boolean;
}) {
  const participants = useThreadPresenceParticipants({ environmentId, threadId, enabled });
  if (!enabled || threadId === null) return null;
  return <ThreadPresenceSummaryContent participants={participants} />;
}

export function ThreadTypingIndicator({
  environmentId,
  threadId,
  enabled,
}: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId | null;
  readonly enabled: boolean;
}) {
  const participants = useThreadPresenceParticipants({ environmentId, threadId, enabled });
  if (!enabled || threadId === null) return null;
  return <ThreadTypingIndicatorContent participants={participants} />;
}

/**
 * Owns the short-lived enter/heartbeat/leave lifecycle for one server thread.
 * The caller controls `typing`; this hook never sends the prompt or any draft
 * content over the wire.
 */
export function useThreadPresenceController({
  environmentId,
  threadId,
  enabled,
  typing,
}: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId | null;
  readonly enabled: boolean;
  readonly typing: boolean;
}) {
  const updatePresence = useAtomCommand(threadPresence.update, { reportFailure: false });
  const activityRef = useRef<PresenceActivity>("viewing");

  const send = useCallback(
    (activity: PresenceActivity, update: "enter" | "heartbeat" | "leave") => {
      if (!enabled || threadId === null) return;
      if (
        update !== "leave" &&
        typeof document !== "undefined" &&
        document.visibilityState !== "visible"
      ) {
        return;
      }
      activityRef.current = activity;
      void updatePresence({
        environmentId,
        input: {
          threadId,
          surface: "thread",
          activity,
          update,
        },
      });
    },
    [enabled, environmentId, threadId, updatePresence],
  );

  useEffect(() => {
    if (!enabled || threadId === null) return;
    send("viewing", "enter");

    const heartbeat = window.setInterval(
      () => send(activityRef.current, "heartbeat"),
      PRESENCE_HEARTBEAT_MS,
    );
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        send(activityRef.current, "enter");
      } else {
        send(activityRef.current, "leave");
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      send(activityRef.current, "leave");
    };
  }, [enabled, send, threadId]);

  useEffect(() => {
    if (!enabled || threadId === null) return;
    send(typing ? "typing" : "viewing", "heartbeat");
  }, [enabled, send, threadId, typing]);
}
