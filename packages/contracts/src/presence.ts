import * as Schema from "effect/Schema";

import { AuthClientMetadataDeviceType } from "./auth.ts";
import { IsoDateTime, ThreadId, TrimmedNonEmptyString } from "./baseSchemas.ts";

/**
 * Presence is deliberately scoped to the surfaces where another person's
 * activity is useful. It is not a general-purpose online roster.
 */
export const PresenceSurface = Schema.Literal("thread");
export type PresenceSurface = typeof PresenceSurface.Type;

export const PresenceActivity = Schema.Literals(["viewing", "typing"]);
export type PresenceActivity = typeof PresenceActivity.Type;

export const PresenceUpdateKind = Schema.Literals(["enter", "heartbeat", "leave"]);
export type PresenceUpdateKind = typeof PresenceUpdateKind.Type;

export const PresenceSubscribeInput = Schema.Struct({
  threadId: ThreadId,
});
export type PresenceSubscribeInput = typeof PresenceSubscribeInput.Type;

export const PresenceUpdateInput = Schema.Struct({
  threadId: ThreadId,
  surface: PresenceSurface,
  activity: PresenceActivity,
  update: PresenceUpdateKind,
});
export type PresenceUpdateInput = typeof PresenceUpdateInput.Type;

/**
 * `participantId` is intentionally opaque to clients. The first transport
 * implementation derives it from the authenticated session and RPC client;
 * that boundary can later map the participant to a durable Person without
 * changing the presence wire shape. No message, draft, or history is carried
 * in this contract.
 */
export const PresenceParticipant = Schema.Struct({
  participantId: TrimmedNonEmptyString,
  threadId: ThreadId,
  surface: PresenceSurface,
  label: TrimmedNonEmptyString,
  deviceType: AuthClientMetadataDeviceType,
  os: Schema.optionalKey(TrimmedNonEmptyString),
  activity: PresenceActivity,
  lastSeenAt: IsoDateTime,
  expiresAt: IsoDateTime,
});
export type PresenceParticipant = typeof PresenceParticipant.Type;

export const PresenceSnapshotEvent = Schema.Struct({
  version: Schema.Literal(1),
  type: Schema.Literal("snapshot"),
  threadId: ThreadId,
  participants: Schema.Array(PresenceParticipant),
});
export type PresenceSnapshotEvent = typeof PresenceSnapshotEvent.Type;

export const PresenceUpsertEvent = Schema.Struct({
  version: Schema.Literal(1),
  type: Schema.Literal("upsert"),
  threadId: ThreadId,
  participant: PresenceParticipant,
});
export type PresenceUpsertEvent = typeof PresenceUpsertEvent.Type;

export const PresenceRemovedEvent = Schema.Struct({
  version: Schema.Literal(1),
  type: Schema.Literal("removed"),
  threadId: ThreadId,
  participantId: TrimmedNonEmptyString,
});
export type PresenceRemovedEvent = typeof PresenceRemovedEvent.Type;

export const PresenceStreamEvent = Schema.Union([
  PresenceSnapshotEvent,
  PresenceUpsertEvent,
  PresenceRemovedEvent,
]);
export type PresenceStreamEvent = typeof PresenceStreamEvent.Type;
