import {
  type Device,
  AuthSessionId,
  DeviceId,
  type IdentityCurrent,
  IdentityOperationError,
  type Person,
  ProjectInvitation,
  ProjectInvitationAcceptInput,
  ProjectInvitationCreateInput,
  ProjectInvitationCreated,
  ProjectInvitationError,
  ProjectInvitationFailureReason,
  ProjectInvitationId,
  ProjectInvitationListResult,
  ProjectInvitationRevokeInput,
  ProjectMembership,
  ProjectMembershipError,
  ProjectMembershipFailureReason,
  ProjectMembershipListResult,
  ProjectMember,
  type ProjectMembershipRole,
  ProjectMembershipTransferInput,
  ProjectMembershipRemoveInput,
  PersonId,
  ProjectId,
  IdentityRegisterInput,
} from "@croki/contracts";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Encoding from "effect/Encoding";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import * as Identity from "../persistence/Identity.ts";
import * as ProjectAccess from "../persistence/ProjectAccess.ts";

const MAX_INVITATION_TTL_SECONDS = 2_592_000;

type ProjectAccessError = IdentityOperationError | ProjectMembershipError | ProjectInvitationError;
type MembershipAccessError = IdentityOperationError | ProjectMembershipError;

export class ProjectAccessService extends Context.Service<
  ProjectAccessService,
  {
    readonly current: (
      sessionId: AuthSessionId,
    ) => Effect.Effect<IdentityCurrent, IdentityOperationError>;
    readonly register: (
      sessionId: AuthSessionId,
      input: IdentityRegisterInput,
    ) => Effect.Effect<IdentityCurrent, IdentityOperationError>;
    readonly authorizeProject: (
      sessionId: AuthSessionId,
      projectId: ProjectId,
      requiredRole?: ProjectMembershipRole,
    ) => Effect.Effect<ProjectMembership, MembershipAccessError>;
    readonly ensureProjectOwner: (
      sessionId: AuthSessionId,
      projectId: ProjectId,
    ) => Effect.Effect<ProjectMembership, MembershipAccessError>;
    readonly createInvitation: (
      sessionId: AuthSessionId,
      input: ProjectInvitationCreateInput,
    ) => Effect.Effect<ProjectInvitationCreated, ProjectAccessError>;
    readonly acceptInvitation: (
      sessionId: AuthSessionId,
      input: ProjectInvitationAcceptInput,
    ) => Effect.Effect<ProjectMembership, ProjectAccessError>;
    readonly listMembers: (
      sessionId: AuthSessionId,
      projectId: ProjectId,
    ) => Effect.Effect<ProjectMembershipListResult, MembershipAccessError>;
    readonly listInvitations: (
      sessionId: AuthSessionId,
      input: { readonly projectId: ProjectId },
    ) => Effect.Effect<ProjectInvitationListResult, MembershipAccessError>;
    readonly revokeInvitation: (
      sessionId: AuthSessionId,
      input: ProjectInvitationRevokeInput,
    ) => Effect.Effect<void, ProjectAccessError>;
    readonly removeMember: (
      sessionId: AuthSessionId,
      input: ProjectMembershipRemoveInput,
    ) => Effect.Effect<void, MembershipAccessError>;
    readonly transferOwnership: (
      sessionId: AuthSessionId,
      input: ProjectMembershipTransferInput,
    ) => Effect.Effect<ProjectMembership, MembershipAccessError>;
  }
>()("croki-server/identity/ProjectAccessService") {}

const identityFailure = (message: string) => new IdentityOperationError({ message });
const membershipFailure = (reason: ProjectMembershipFailureReason, message: string) =>
  new ProjectMembershipError({ reason, message });
const invitationFailure = (reason: ProjectInvitationFailureReason, message: string) =>
  new ProjectInvitationError({ reason, message });
const isIdentityOperationError = Schema.is(IdentityOperationError);
const isProjectMembershipError = Schema.is(ProjectMembershipError);
const isProjectInvitationError = Schema.is(ProjectInvitationError);

const mapIdentityError = (cause: unknown): IdentityOperationError =>
  isIdentityOperationError(cause)
    ? cause
    : identityFailure(`Identity operation failed: ${String(cause)}`);

const mapMembershipError = (cause: unknown): MembershipAccessError =>
  isIdentityOperationError(cause) || isProjectMembershipError(cause)
    ? cause
    : identityFailure(`Project membership operation failed: ${String(cause)}`);

const mapProjectAccessError = (cause: unknown): ProjectAccessError =>
  isIdentityOperationError(cause) ||
  isProjectMembershipError(cause) ||
  isProjectInvitationError(cause)
    ? cause
    : identityFailure(`Project access operation failed: ${String(cause)}`);

const toMembership = (record: ProjectAccess.ProjectMembershipRecord): ProjectMembership => record;

const toMember = (
  record: ProjectAccess.ProjectMembershipRecord,
  person: Person,
): ProjectMember => ({
  ...toMembership(record),
  displayName: person.displayName,
});

const invitationState = (
  invitation: ProjectAccess.ProjectInvitationRecord,
  now: DateTime.Utc,
): ProjectInvitation["state"] => {
  if (invitation.revokedAt !== null) return "revoked";
  if (invitation.acceptedAt !== null) return "accepted";
  return Date.parse(invitation.expiresAt) <= now.epochMilliseconds ? "expired" : "created";
};

const toInvitation = (
  invitation: ProjectAccess.ProjectInvitationRecord,
  now: DateTime.Utc,
): ProjectInvitation => ({
  invitationId: invitation.invitationId,
  projectId: invitation.projectId,
  createdByPersonId: invitation.createdByPersonId,
  recipientPersonId: invitation.recipientPersonId,
  createdAt: invitation.createdAt,
  expiresAt: invitation.expiresAt,
  state: invitationState(invitation, now),
  acceptedAt: invitation.acceptedAt,
  acceptedByPersonId: invitation.acceptedByPersonId,
  revokedAt: invitation.revokedAt,
});

const asPerson = (identity: IdentityCurrent): Person | null => identity.person;
const asDevice = (identity: IdentityCurrent): Device | null => identity.device;

export const make = Effect.gen(function* () {
  const identity = yield* Identity.IdentityRepository;
  const access = yield* ProjectAccess.ProjectAccessRepository;
  const crypto = yield* Crypto.Crypto;

  const current: ProjectAccessService["Service"]["current"] = (sessionId) =>
    identity.getSessionIdentity({ sessionId }).pipe(
      Effect.mapError(mapIdentityError),
      Effect.map((value) =>
        Option.getOrElse(value, () => ({ person: null, device: null }) satisfies IdentityCurrent),
      ),
    );

  const register: ProjectAccessService["Service"]["register"] = (sessionId, input) =>
    Effect.gen(function* () {
      const existing = yield* current(sessionId);
      if (existing.person !== null && existing.device !== null) {
        if (existing.person.revokedAt !== null || existing.device.revokedAt !== null) {
          return yield* identityFailure("The current identity has been revoked.");
        }
        return existing;
      }

      const now = yield* DateTime.now;
      const personId = PersonId.make(yield* crypto.randomUUIDv4);
      const deviceId = DeviceId.make(yield* crypto.randomUUIDv4);
      yield* identity.createPerson({
        personId,
        displayName: input.displayName,
        createdAt: DateTime.formatIso(now),
        updatedAt: DateTime.formatIso(now),
      });
      yield* identity.createDevice({
        deviceId,
        personId,
        label: input.deviceLabel,
        deviceType: input.deviceType,
        createdAt: DateTime.formatIso(now),
      });
      const bound = yield* identity.bindSessionIdentity({ sessionId, personId, deviceId });
      if (!bound) {
        return yield* identityFailure("The authenticated session is no longer available.");
      }
      return yield* current(sessionId);
    }).pipe(Effect.mapError(mapIdentityError));

  const requirePerson = Effect.fn("ProjectAccessService.requirePerson")(function* (
    sessionId: AuthSessionId,
  ) {
    const identityState = yield* current(sessionId);
    const person = asPerson(identityState);
    const device = asDevice(identityState);
    if (person === null || device === null) {
      return yield* membershipFailure(
        "person_not_bound",
        "Register this authenticated Device as a Person before using Project access.",
      );
    }
    if (person.revokedAt !== null) {
      return yield* membershipFailure("person_revoked", "This Person has been revoked.");
    }
    if (device.revokedAt !== null) {
      return yield* membershipFailure("person_revoked", "This Device has been revoked.");
    }
    return person;
  });

  const authorizeProject: ProjectAccessService["Service"]["authorizeProject"] = (
    sessionId,
    projectId,
    requiredRole = "member",
  ) =>
    Effect.gen(function* () {
      const person = yield* requirePerson(sessionId);
      const membership = yield* access.getMembership({ projectId, personId: person.personId });
      if (Option.isNone(membership) || membership.value.removedAt !== null) {
        return yield* membershipFailure("not_a_member", "You are not an active Project Member.");
      }
      if (requiredRole === "owner" && membership.value.role !== "owner") {
        return yield* membershipFailure("owner_required", "Project Owner authority is required.");
      }
      return toMembership(membership.value);
    }).pipe(Effect.mapError(mapMembershipError));

  const ensureProjectOwner: ProjectAccessService["Service"]["ensureProjectOwner"] = (
    sessionId,
    projectId,
  ) =>
    Effect.gen(function* () {
      const person = yield* requirePerson(sessionId);
      const owner = yield* access.getOwner({ projectId });
      if (Option.isSome(owner) && owner.value.personId !== person.personId) {
        return yield* membershipFailure(
          "owner_already_exists",
          "This Project already has a different Owner.",
        );
      }
      if (Option.isSome(owner)) return toMembership(owner.value);
      const now = yield* DateTime.now;
      const created = yield* access.ensureOwner({
        projectId,
        personId: person.personId,
        role: "owner",
        createdAt: DateTime.formatIso(now),
        updatedAt: DateTime.formatIso(now),
      });
      if (Option.isNone(created)) {
        return yield* membershipFailure(
          "owner_already_exists",
          "Project Owner changed concurrently.",
        );
      }
      return toMembership(created.value);
    }).pipe(Effect.mapError(mapMembershipError));

  const createInvitation: ProjectAccessService["Service"]["createInvitation"] = (
    sessionId,
    input,
  ) =>
    Effect.gen(function* () {
      const owner = yield* authorizeProject(sessionId, input.projectId, "owner");
      const ttlSeconds = Math.min(input.ttlSeconds, MAX_INVITATION_TTL_SECONDS);
      const now = yield* DateTime.now;
      const expiresAt = DateTime.add(now, { seconds: ttlSeconds });
      const invitationId = ProjectInvitationId.make(yield* crypto.randomUUIDv4);
      const secretBytes = yield* crypto.randomBytes(32);
      const secret = Encoding.encodeBase64Url(secretBytes);
      const digest = yield* crypto.digest("SHA-256", new TextEncoder().encode(secret));
      yield* access.createInvitation({
        invitationId,
        projectId: input.projectId,
        createdByPersonId: owner.personId,
        recipientPersonId: input.recipientPersonId ?? null,
        secretHash: Encoding.encodeHex(digest),
        createdAt: DateTime.formatIso(now),
        expiresAt: DateTime.formatIso(expiresAt),
      });
      const record = yield* access.getInvitation({
        projectId: input.projectId,
        invitationId,
      });
      if (Option.isNone(record)) {
        return yield* invitationFailure("unavailable", "The invitation could not be created.");
      }
      return {
        invitation: toInvitation(record.value, now),
        secret,
      } satisfies ProjectInvitationCreated;
    }).pipe(Effect.mapError(mapProjectAccessError));

  const acceptInvitation: ProjectAccessService["Service"]["acceptInvitation"] = (
    sessionId,
    input,
  ) =>
    Effect.gen(function* () {
      const person = yield* requirePerson(sessionId);
      const digest = yield* crypto.digest("SHA-256", new TextEncoder().encode(input.secret));
      const secretHash = Encoding.encodeHex(digest);
      const record = yield* access.getInvitationByHash({ secretHash });
      if (Option.isNone(record)) {
        return yield* invitationFailure("unavailable", "This Project Invitation is unavailable.");
      }
      const invitation = record.value;
      if (
        invitation.recipientPersonId !== null &&
        invitation.recipientPersonId !== person.personId
      ) {
        return yield* invitationFailure(
          "identity_mismatch",
          "This invitation is for another Person.",
        );
      }
      const now = yield* DateTime.now;
      const state = invitationState(invitation, now);
      if (state !== "created") {
        return yield* invitationFailure(
          state === "expired" ? "expired" : state === "revoked" ? "revoked" : "accepted",
          "This Project Invitation is no longer available.",
        );
      }
      const membership = yield* access.acceptInvitation({
        secretHash,
        personId: person.personId,
        acceptedAt: DateTime.formatIso(now),
        now: DateTime.formatIso(now),
        updatedAt: DateTime.formatIso(now),
      });
      if (Option.isNone(membership)) {
        return yield* invitationFailure("unavailable", "This Project Invitation is unavailable.");
      }
      return toMembership(membership.value);
    }).pipe(Effect.mapError(mapProjectAccessError));

  const listMembers: ProjectAccessService["Service"]["listMembers"] = (sessionId, projectId) =>
    authorizeProject(sessionId, projectId).pipe(
      Effect.flatMap(() =>
        access.listMemberships({ projectId }).pipe(
          Effect.flatMap((members) =>
            Effect.forEach(members, (member) =>
              identity.getPerson({ personId: member.personId }).pipe(
                Effect.flatMap(
                  Option.match({
                    onNone: () => identityFailure("A Project Member identity could not be read."),
                    onSome: (person) => Effect.succeed(toMember(member, person)),
                  }),
                ),
              ),
            ),
          ),
        ),
      ),
      Effect.map((members) => ({ projectId, members }) satisfies ProjectMembershipListResult),
      Effect.mapError(mapMembershipError),
    );

  const listInvitations: ProjectAccessService["Service"]["listInvitations"] = (sessionId, input) =>
    authorizeProject(sessionId, input.projectId, "owner").pipe(
      Effect.flatMap(() =>
        Effect.all({
          records: access.listInvitations({ projectId: input.projectId }),
          now: DateTime.now,
        }),
      ),
      Effect.map(
        ({ records, now }) =>
          ({
            projectId: input.projectId,
            invitations: records.map((record) => toInvitation(record, now)),
          }) satisfies ProjectInvitationListResult,
      ),
      Effect.mapError(mapMembershipError),
    );

  const revokeInvitation: ProjectAccessService["Service"]["revokeInvitation"] = (
    sessionId,
    input,
  ) =>
    authorizeProject(sessionId, input.projectId, "owner").pipe(
      Effect.flatMap(() => DateTime.now),
      Effect.flatMap((now) =>
        access.revokeInvitation({ ...input, revokedAt: DateTime.formatIso(now) }),
      ),
      Effect.flatMap((revoked) =>
        revoked
          ? Effect.void
          : Effect.fail(
              invitationFailure("unavailable", "This invitation is no longer revocable."),
            ),
      ),
      Effect.mapError(mapProjectAccessError),
    );

  const removeMember: ProjectAccessService["Service"]["removeMember"] = (sessionId, input) =>
    Effect.gen(function* () {
      const owner = yield* authorizeProject(sessionId, input.projectId, "owner");
      if (owner.personId === input.personId) {
        return yield* membershipFailure(
          "owner_cannot_be_removed",
          "The Project Owner cannot be removed.",
        );
      }
      const now = yield* DateTime.now;
      const removed = yield* access.removeMembership({
        ...input,
        removedAt: DateTime.formatIso(now),
      });
      if (!removed) {
        return yield* membershipFailure(
          "member_not_found",
          "The requested Person is not an active Project Member.",
        );
      }
    }).pipe(Effect.mapError(mapMembershipError));

  const transferOwnership: ProjectAccessService["Service"]["transferOwnership"] = (
    sessionId,
    input,
  ) =>
    Effect.gen(function* () {
      const owner = yield* authorizeProject(sessionId, input.projectId, "owner");
      if (owner.personId === input.personId) {
        return yield* membershipFailure(
          "cannot_transfer_to_owner",
          "That Person is already the Owner.",
        );
      }
      const target = yield* access.getMembership({
        projectId: input.projectId,
        personId: input.personId,
      });
      if (Option.isNone(target) || target.value.removedAt !== null) {
        return yield* membershipFailure(
          "member_not_found",
          "Transfer ownership to an active Member.",
        );
      }
      const now = yield* DateTime.now;
      const transferred = yield* access.transferOwnership({
        projectId: input.projectId,
        personId: input.personId,
        updatedAt: DateTime.formatIso(now),
      });
      if (!transferred) {
        return yield* membershipFailure("member_not_found", "Ownership changed concurrently.");
      }
      const result = yield* access.getMembership({
        projectId: input.projectId,
        personId: input.personId,
      });
      if (Option.isNone(result)) {
        return yield* identityFailure("The ownership transfer could not be read back.");
      }
      return toMembership(result.value);
    }).pipe(Effect.mapError(mapMembershipError));

  return {
    current,
    register,
    authorizeProject,
    ensureProjectOwner,
    createInvitation,
    acceptInvitation,
    listMembers,
    listInvitations,
    revokeInvitation,
    removeMember,
    transferOwnership,
  } satisfies ProjectAccessService["Service"];
});

export const layer = Layer.effect(ProjectAccessService, make).pipe(
  Layer.provide(Identity.layer),
  Layer.provide(ProjectAccess.layer),
);
