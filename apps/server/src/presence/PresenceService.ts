import type {
  PresenceParticipant,
  PresenceStreamEvent,
  PresenceSubscribeInput,
  PresenceUpdateInput,
  ThreadId,
} from "@croki/contracts";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";
import * as SynchronizedRef from "effect/SynchronizedRef";

/** Presence intentionally expires quickly. It is an activity hint, not a
 * durable online/offline state and must not outlive an abandoned connection. */
export const PRESENCE_TTL_MS = 20_000;
export const PRESENCE_SWEEP_INTERVAL_MS = 5_000;

export interface PresenceIdentity {
  /** Opaque transport identity. A future Person mapping belongs at this edge. */
  readonly participantId: string;
  readonly label: string;
  readonly deviceType: PresenceParticipant["deviceType"];
  readonly os?: string;
}

interface PresenceRegistryOptions {
  readonly now?: () => number;
  readonly ttlMs?: number;
}

interface StoredPresence {
  readonly participant: PresenceParticipant;
  readonly expiresAtMs: number;
}

const participantKey = (threadId: ThreadId, participantId: string): string =>
  `${threadId}\u0000${participantId}`;

const isoAt = (millis: number): string =>
  DateTime.formatIso(DateTime.makeUnsafe({ epochMilliseconds: millis }));

const asParticipantId = (value: string): PresenceParticipant["participantId"] =>
  value as PresenceParticipant["participantId"];

const asLabel = (value: string): PresenceParticipant["label"] =>
  (value.trim() || "Anonymous") as PresenceParticipant["label"];

/**
 * Small mutable registry kept behind a SynchronizedRef by the service. The
 * class is exported so expiry and heartbeat semantics can be tested without a
 * live server clock or any persistence layer.
 */
export class PresenceRegistry {
  private readonly entries = new Map<string, StoredPresence>();
  private readonly now: () => number;
  private readonly ttlMs: number;

  constructor(options: PresenceRegistryOptions = {}) {
    this.now = options.now ?? (() => DateTime.nowUnsafe().epochMilliseconds);
    this.ttlMs = options.ttlMs ?? PRESENCE_TTL_MS;
  }

  update(
    identity: PresenceIdentity,
    input: PresenceUpdateInput,
    nowMs = this.now(),
  ): ReadonlyArray<PresenceStreamEvent> {
    const expired = this.expire(nowMs);
    const key = participantKey(input.threadId, identity.participantId);

    if (input.update === "leave") {
      const existing = this.entries.get(key);
      if (existing === undefined) {
        return expired;
      }
      this.entries.delete(key);
      return [
        ...expired,
        {
          version: 1,
          type: "removed",
          threadId: input.threadId,
          participantId: existing.participant.participantId,
        },
      ];
    }

    const expiresAtMs = nowMs + this.ttlMs;
    const participant: PresenceParticipant = {
      participantId: asParticipantId(identity.participantId),
      threadId: input.threadId,
      surface: input.surface,
      label: asLabel(identity.label),
      deviceType: identity.deviceType,
      ...(identity.os?.trim() ? { os: identity.os.trim() } : {}),
      activity: input.activity,
      lastSeenAt: isoAt(nowMs),
      expiresAt: isoAt(expiresAtMs),
    };
    this.entries.set(key, { participant, expiresAtMs });
    return [
      ...expired,
      {
        version: 1,
        type: "upsert",
        threadId: input.threadId,
        participant,
      },
    ];
  }

  expire(nowMs = this.now()): ReadonlyArray<PresenceStreamEvent> {
    const removed: Array<PresenceStreamEvent> = [];
    for (const [key, stored] of this.entries) {
      if (stored.expiresAtMs > nowMs) {
        continue;
      }
      this.entries.delete(key);
      removed.push({
        version: 1,
        type: "removed",
        threadId: stored.participant.threadId,
        participantId: stored.participant.participantId,
      });
    }
    return removed;
  }

  leave(participantId: string): ReadonlyArray<PresenceStreamEvent> {
    const removed: Array<PresenceStreamEvent> = [];
    for (const [key, stored] of this.entries) {
      if (stored.participant.participantId !== participantId) {
        continue;
      }
      this.entries.delete(key);
      removed.push({
        version: 1,
        type: "removed",
        threadId: stored.participant.threadId,
        participantId: stored.participant.participantId,
      });
    }
    return removed;
  }

  snapshot(threadId: ThreadId, nowMs = this.now()): ReadonlyArray<PresenceParticipant> {
    this.expire(nowMs);
    return [...this.entries.values()]
      .filter(({ participant }) => participant.threadId === threadId)
      .map(({ participant }) => participant)
      .sort((left, right) => left.participantId.localeCompare(right.participantId));
  }
}

export class PresenceService extends Context.Service<
  PresenceService,
  {
    readonly update: (
      identity: PresenceIdentity,
      input: PresenceUpdateInput,
    ) => Effect.Effect<void>;
    readonly subscribe: (
      input: PresenceSubscribeInput,
      excludedParticipantId: string,
    ) => Effect.Effect<Stream.Stream<PresenceStreamEvent>, never, Scope.Scope>;
    readonly leave: (participantId: string) => Effect.Effect<void>;
  }
>()("croki-server/presence/PresenceService") {}

const publishAll = (
  eventsPubSub: PubSub.PubSub<PresenceStreamEvent>,
  events: ReadonlyArray<PresenceStreamEvent>,
): Effect.Effect<void> =>
  Effect.forEach(events, (event) => PubSub.publish(eventsPubSub, event), { discard: true });

const make = Effect.gen(function* () {
  const state = yield* SynchronizedRef.make(new PresenceRegistry());
  const eventsPubSub = yield* PubSub.unbounded<PresenceStreamEvent>();

  // The registry is server-memory only. A single sweep keeps expiry working
  // even when nobody happens to send another update for that thread.
  yield* Stream.runForEach(Stream.tick(Duration.millis(PRESENCE_SWEEP_INTERVAL_MS)), () =>
    SynchronizedRef.modifyEffect(state, (registry) => {
      const expired = registry.expire();
      return publishAll(eventsPubSub, expired).pipe(Effect.as([undefined, registry] as const));
    }),
  ).pipe(Effect.forkScoped);

  const update: PresenceService["Service"]["update"] = (identity, input) =>
    SynchronizedRef.modifyEffect(state, (registry) => {
      const events = registry.update(identity, input);
      return publishAll(eventsPubSub, events).pipe(Effect.as([undefined, registry] as const));
    });

  const leave: PresenceService["Service"]["leave"] = (participantId) =>
    SynchronizedRef.modifyEffect(state, (registry) => {
      const events = registry.leave(participantId);
      return publishAll(eventsPubSub, events).pipe(Effect.as([undefined, registry] as const));
    });

  const subscribe: PresenceService["Service"]["subscribe"] = (input, excludedParticipantId) =>
    Effect.gen(function* () {
      // Subscribe first so an update cannot be lost while the initial snapshot
      // is being read. The client reducer treats a repeated upsert as idempotent.
      const subscription = yield* PubSub.subscribe(eventsPubSub);
      const { participants } = yield* SynchronizedRef.modifyEffect(state, (registry) => {
        const expired = registry.expire();
        const participants = registry.snapshot(input.threadId);
        return publishAll(eventsPubSub, expired).pipe(
          Effect.as([{ participants, expired }, registry] as const),
        );
      });
      const changes = Stream.fromSubscription(subscription).pipe(
        Stream.filter((event) => {
          if (event.threadId !== input.threadId || event.type === "snapshot") {
            return event.threadId === input.threadId;
          }
          return event.type === "removed"
            ? event.participantId !== excludedParticipantId
            : event.participant.participantId !== excludedParticipantId;
        }),
      );
      const snapshot: PresenceStreamEvent = {
        version: 1,
        type: "snapshot",
        threadId: input.threadId,
        participants: participants.filter(
          (participant) => participant.participantId !== excludedParticipantId,
        ),
      };
      return Stream.concat(Stream.make(snapshot), changes);
    });

  return PresenceService.of({ update, subscribe, leave });
});

export const layer = Layer.effect(PresenceService, make);
