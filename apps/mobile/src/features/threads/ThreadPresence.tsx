import {
  type EnvironmentId,
  type PresenceActivity,
  type PresenceParticipant,
  type ThreadId,
} from "@croki/contracts";
import { useAtomValue } from "@effect/atom-react";
import * as Option from "effect/Option";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { AppState } from "react-native";

import { threadPresence } from "../../state/presence";
import { useAtomCommand } from "../../state/use-atom-command";
import { presenceSummaryContent, typingIndicatorLabel } from "./threadPresencePresentation";

export const PRESENCE_HEARTBEAT_MS = 8_000;

const EMPTY_PRESENCE_RESULT = Atom.make(
  AsyncResult.success<ReadonlyArray<PresenceParticipant>, never>([]),
).pipe(Atom.withLabel("mobile-thread-presence:empty"));

export function useThreadPresenceParticipants(input: {
  readonly environmentId: EnvironmentId | null;
  readonly threadId: ThreadId | null;
  readonly enabled: boolean;
}): ReadonlyArray<PresenceParticipant> {
  const result = useAtomValue(
    input.enabled && input.environmentId !== null && input.threadId !== null
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

export function ThreadPresenceSummaryContent(props: {
  readonly participants: ReadonlyArray<PresenceParticipant>;
}) {
  return presenceSummaryContent(props.participants);
}

export function ThreadTypingIndicatorContent(props: {
  readonly participants: ReadonlyArray<PresenceParticipant>;
}) {
  return typingIndicatorLabel(props.participants);
}

export function useThreadPresenceController(input: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId | null;
  readonly enabled: boolean;
  readonly typing: boolean;
}) {
  const updatePresence = useAtomCommand(threadPresence.update, { reportFailure: false });
  const activityRef = useRef<PresenceActivity>("viewing");

  const send = useCallback(
    (activity: PresenceActivity, update: "enter" | "heartbeat" | "leave") => {
      if (!input.enabled || input.threadId === null) return;
      activityRef.current = activity;
      void updatePresence({
        environmentId: input.environmentId,
        input: {
          threadId: input.threadId,
          surface: "thread",
          activity,
          update,
        },
      });
    },
    [input.enabled, input.environmentId, input.threadId, updatePresence],
  );

  useEffect(() => {
    if (!input.enabled || input.threadId === null) return;
    send("viewing", "enter");
    const heartbeat = setInterval(
      () => send(activityRef.current, "heartbeat"),
      PRESENCE_HEARTBEAT_MS,
    );
    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        send(activityRef.current, "enter");
      } else if (nextState === "background" || nextState === "inactive") {
        send(activityRef.current, "leave");
      }
    });
    return () => {
      clearInterval(heartbeat);
      appStateSubscription.remove();
      send(activityRef.current, "leave");
    };
  }, [input.enabled, input.threadId, send]);

  useEffect(() => {
    if (!input.enabled || input.threadId === null) return;
    send(input.typing ? "typing" : "viewing", "heartbeat");
  }, [input.enabled, input.threadId, input.typing, send]);
}

export function useThreadPresenceSummaryLabel(input: {
  readonly environmentId: EnvironmentId | null;
  readonly threadId: ThreadId | null;
  readonly enabled: boolean;
}) {
  const participants = useThreadPresenceParticipants(input);
  return useMemo(() => ThreadPresenceSummaryContent({ participants }), [participants]);
}

export function useThreadTypingLabel(input: {
  readonly environmentId: EnvironmentId | null;
  readonly threadId: ThreadId | null;
  readonly enabled: boolean;
}) {
  const participants = useThreadPresenceParticipants(input);
  return useMemo(() => ThreadTypingIndicatorContent({ participants }), [participants]);
}
