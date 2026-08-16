import { type PresenceParticipant, type PresenceStreamEvent, WS_METHODS } from "@croki/contracts";
import * as Stream from "effect/Stream";
import { Atom } from "effect/unstable/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcSubscriptionAtomFamily,
} from "./runtime.ts";

export const EMPTY_PRESENCE_PARTICIPANTS: ReadonlyArray<PresenceParticipant> = [];

/**
 * Reconnects always begin with a snapshot, so replacing state here removes
 * stale participants that were present on the previous socket. Upserts and
 * removals are idempotent, which also makes snapshot/live delivery races safe.
 */
export function applyPresenceStreamEvent(
  current: ReadonlyArray<PresenceParticipant>,
  event: PresenceStreamEvent,
): ReadonlyArray<PresenceParticipant> {
  switch (event.type) {
    case "snapshot":
      return event.participants;
    case "removed":
      return current.filter((participant) => participant.participantId !== event.participantId);
    case "upsert":
      return [
        ...current.filter(
          (participant) => participant.participantId !== event.participant.participantId,
        ),
        event.participant,
      ].sort((left, right) => left.participantId.localeCompare(right.participantId));
  }
}

export function createThreadPresenceAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  return {
    participants: createEnvironmentRpcSubscriptionAtomFamily(runtime, {
      label: "environment-data:presence:thread",
      tag: WS_METHODS.presenceSubscribe,
      transform: (stream) =>
        stream.pipe(Stream.scan(EMPTY_PRESENCE_PARTICIPANTS, applyPresenceStreamEvent)),
    }),
    update: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:presence:update",
      tag: WS_METHODS.presenceUpdate,
      concurrency: {
        mode: "latest",
        key: ({ environmentId, input }) =>
          JSON.stringify([environmentId, input.threadId, input.surface]),
      },
    }),
  };
}
