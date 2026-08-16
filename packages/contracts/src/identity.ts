import * as Schema from "effect/Schema";

import { AuthClientMetadataDeviceType } from "./auth.ts";
import {
  DeviceId,
  IsoDateTime,
  PersonId,
  ProjectId,
  ProjectInvitationId,
  PositiveInt,
  TrimmedNonEmptyString,
} from "./baseSchemas.ts";

/** Durable Croki identity identifiers. They are deliberately distinct from
 * auth subjects, device presentation labels, and external provider ids. */
export const ProjectMembershipRole = Schema.Literals(["owner", "member"]);
export type ProjectMembershipRole = typeof ProjectMembershipRole.Type;

export const Person = Schema.Struct({
  personId: PersonId,
  displayName: TrimmedNonEmptyString,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  revokedAt: Schema.NullOr(IsoDateTime),
});
export type Person = typeof Person.Type;

export const Device = Schema.Struct({
  deviceId: DeviceId,
  personId: PersonId,
  label: TrimmedNonEmptyString,
  deviceType: AuthClientMetadataDeviceType,
  createdAt: IsoDateTime,
  lastSeenAt: Schema.NullOr(IsoDateTime),
  revokedAt: Schema.NullOr(IsoDateTime),
});
export type Device = typeof Device.Type;

export const ProjectMembership = Schema.Struct({
  projectId: ProjectId,
  personId: PersonId,
  role: ProjectMembershipRole,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  removedAt: Schema.NullOr(IsoDateTime),
});
export type ProjectMembership = typeof ProjectMembership.Type;

/**
 * The member list is a founder-facing read model, not the write-side
 * membership record. Keeping the person's display name here avoids making
 * every People surface perform a second identity lookup (and never exposes
 * provider credentials or auth subjects).
 */
export const ProjectMember = Schema.Struct({
  projectId: ProjectId,
  personId: PersonId,
  displayName: TrimmedNonEmptyString,
  role: ProjectMembershipRole,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  removedAt: Schema.NullOr(IsoDateTime),
});
export type ProjectMember = typeof ProjectMember.Type;

export const ProjectInvitationState = Schema.Literals([
  "created",
  "accepted",
  "expired",
  "revoked",
]);
export type ProjectInvitationState = typeof ProjectInvitationState.Type;

/** Secret material is intentionally absent from this read model. */
export const ProjectInvitation = Schema.Struct({
  invitationId: ProjectInvitationId,
  projectId: ProjectId,
  createdByPersonId: PersonId,
  recipientPersonId: Schema.NullOr(PersonId),
  createdAt: IsoDateTime,
  expiresAt: IsoDateTime,
  state: ProjectInvitationState,
  acceptedAt: Schema.NullOr(IsoDateTime),
  acceptedByPersonId: Schema.NullOr(PersonId),
  revokedAt: Schema.NullOr(IsoDateTime),
});
export type ProjectInvitation = typeof ProjectInvitation.Type;

export const IdentityCurrent = Schema.Struct({
  person: Schema.NullOr(Person),
  device: Schema.NullOr(Device),
});
export type IdentityCurrent = typeof IdentityCurrent.Type;

export const IdentityRegisterInput = Schema.Struct({
  displayName: TrimmedNonEmptyString,
  deviceLabel: TrimmedNonEmptyString,
  deviceType: AuthClientMetadataDeviceType,
});
export type IdentityRegisterInput = typeof IdentityRegisterInput.Type;

export const ProjectInvitationCreateInput = Schema.Struct({
  projectId: ProjectId,
  ttlSeconds: PositiveInt.check(Schema.isLessThanOrEqualTo(2_592_000)),
  recipientPersonId: Schema.optionalKey(PersonId),
});
export type ProjectInvitationCreateInput = typeof ProjectInvitationCreateInput.Type;

export const ProjectInvitationCreated = Schema.Struct({
  invitation: ProjectInvitation,
  /** Returned only at creation. The server persists only its digest. */
  secret: TrimmedNonEmptyString,
});
export type ProjectInvitationCreated = typeof ProjectInvitationCreated.Type;

export const ProjectInvitationAcceptInput = Schema.Struct({
  secret: TrimmedNonEmptyString.check(Schema.isMaxLength(512)),
});
export type ProjectInvitationAcceptInput = typeof ProjectInvitationAcceptInput.Type;

export const ProjectInvitationRevokeInput = Schema.Struct({
  projectId: ProjectId,
  invitationId: ProjectInvitationId,
});
export type ProjectInvitationRevokeInput = typeof ProjectInvitationRevokeInput.Type;

export const ProjectMembershipListInput = Schema.Struct({
  projectId: ProjectId,
});
export type ProjectMembershipListInput = typeof ProjectMembershipListInput.Type;

export const ProjectMembershipListResult = Schema.Struct({
  projectId: ProjectId,
  members: Schema.Array(ProjectMember),
});
export type ProjectMembershipListResult = typeof ProjectMembershipListResult.Type;

export const ProjectInvitationListInput = Schema.Struct({
  projectId: ProjectId,
});
export type ProjectInvitationListInput = typeof ProjectInvitationListInput.Type;

export const ProjectInvitationListResult = Schema.Struct({
  projectId: ProjectId,
  invitations: Schema.Array(ProjectInvitation),
});
export type ProjectInvitationListResult = typeof ProjectInvitationListResult.Type;

export const ProjectMembershipRemoveInput = Schema.Struct({
  projectId: ProjectId,
  personId: PersonId,
});
export type ProjectMembershipRemoveInput = typeof ProjectMembershipRemoveInput.Type;

export const ProjectMembershipTransferInput = Schema.Struct({
  projectId: ProjectId,
  personId: PersonId,
});
export type ProjectMembershipTransferInput = typeof ProjectMembershipTransferInput.Type;

export const ProjectMembershipEnsureOwnerInput = Schema.Struct({
  projectId: ProjectId,
});
export type ProjectMembershipEnsureOwnerInput = typeof ProjectMembershipEnsureOwnerInput.Type;

export const ProjectMembershipFailureReason = Schema.Literals([
  "person_not_bound",
  "person_not_found",
  "person_revoked",
  "project_not_found",
  "not_a_member",
  "owner_required",
  "owner_cannot_be_removed",
  "member_not_found",
  "owner_already_exists",
  "cannot_transfer_to_owner",
]);
export type ProjectMembershipFailureReason = typeof ProjectMembershipFailureReason.Type;

export class ProjectMembershipError extends Schema.TaggedErrorClass<ProjectMembershipError>()(
  "ProjectMembershipError",
  {
    reason: ProjectMembershipFailureReason,
    message: TrimmedNonEmptyString,
  },
) {}

export const ProjectInvitationFailureReason = Schema.Literals([
  "unavailable",
  "expired",
  "revoked",
  "accepted",
  "identity_mismatch",
  "already_member",
  "project_not_found",
]);
export type ProjectInvitationFailureReason = typeof ProjectInvitationFailureReason.Type;

export class ProjectInvitationError extends Schema.TaggedErrorClass<ProjectInvitationError>()(
  "ProjectInvitationError",
  {
    reason: ProjectInvitationFailureReason,
    message: TrimmedNonEmptyString,
  },
) {}

export class IdentityOperationError extends Schema.TaggedErrorClass<IdentityOperationError>()(
  "IdentityOperationError",
  {
    message: TrimmedNonEmptyString,
  },
) {}

export const IdentityRpcError = Schema.Union([
  IdentityOperationError,
  ProjectMembershipError,
  ProjectInvitationError,
]);
export type IdentityRpcError = typeof IdentityRpcError.Type;
