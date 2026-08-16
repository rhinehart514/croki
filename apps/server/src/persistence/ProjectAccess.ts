import { PersonId, ProjectId, ProjectInvitationId, ProjectMembershipRole } from "@croki/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

import { PersistenceDecodeError, PersistenceSqlError } from "./Errors.ts";

export const ProjectMembershipRecord = Schema.Struct({
  projectId: ProjectId,
  personId: PersonId,
  role: ProjectMembershipRole,
  createdAt: Schema.String,
  updatedAt: Schema.String,
  removedAt: Schema.NullOr(Schema.String),
});
export type ProjectMembershipRecord = typeof ProjectMembershipRecord.Type;

export const ProjectInvitationRecord = Schema.Struct({
  invitationId: ProjectInvitationId,
  projectId: ProjectId,
  createdByPersonId: PersonId,
  recipientPersonId: Schema.NullOr(PersonId),
  secretHash: Schema.String,
  createdAt: Schema.String,
  expiresAt: Schema.String,
  acceptedAt: Schema.NullOr(Schema.String),
  acceptedByPersonId: Schema.NullOr(PersonId),
  revokedAt: Schema.NullOr(Schema.String),
});
export type ProjectInvitationRecord = typeof ProjectInvitationRecord.Type;

export const CreateProjectMembershipInput = Schema.Struct({
  projectId: ProjectId,
  personId: PersonId,
  role: ProjectMembershipRole,
  createdAt: Schema.String,
  updatedAt: Schema.String,
});
export type CreateProjectMembershipInput = typeof CreateProjectMembershipInput.Type;

export const GetProjectMembershipInput = Schema.Struct({
  projectId: ProjectId,
  personId: PersonId,
});
export type GetProjectMembershipInput = typeof GetProjectMembershipInput.Type;

export const ListProjectMembershipsInput = Schema.Struct({ projectId: ProjectId });
export type ListProjectMembershipsInput = typeof ListProjectMembershipsInput.Type;

export const CreateProjectInvitationInput = Schema.Struct({
  invitationId: ProjectInvitationId,
  projectId: ProjectId,
  createdByPersonId: PersonId,
  recipientPersonId: Schema.NullOr(PersonId),
  secretHash: Schema.String,
  createdAt: Schema.String,
  expiresAt: Schema.String,
});
export type CreateProjectInvitationInput = typeof CreateProjectInvitationInput.Type;

export const GetProjectInvitationByHashInput = Schema.Struct({ secretHash: Schema.String });
export type GetProjectInvitationByHashInput = typeof GetProjectInvitationByHashInput.Type;

export const GetProjectInvitationInput = Schema.Struct({
  projectId: ProjectId,
  invitationId: ProjectInvitationId,
});
export type GetProjectInvitationInput = typeof GetProjectInvitationInput.Type;

export const ListProjectInvitationsInput = Schema.Struct({ projectId: ProjectId });
export type ListProjectInvitationsInput = typeof ListProjectInvitationsInput.Type;

export const RevokeProjectInvitationInput = Schema.Struct({
  projectId: ProjectId,
  invitationId: ProjectInvitationId,
  revokedAt: Schema.String,
});
export type RevokeProjectInvitationInput = typeof RevokeProjectInvitationInput.Type;

export const AcceptProjectInvitationInput = Schema.Struct({
  secretHash: Schema.String,
  personId: PersonId,
  acceptedAt: Schema.String,
  now: Schema.String,
  updatedAt: Schema.String,
});
export type AcceptProjectInvitationInput = typeof AcceptProjectInvitationInput.Type;

const RawMembershipRow = Schema.Struct({
  projectId: Schema.Unknown,
  personId: Schema.Unknown,
  role: Schema.Unknown,
  createdAt: Schema.Unknown,
  updatedAt: Schema.Unknown,
  removedAt: Schema.Unknown,
});
const RawInvitationRow = Schema.Struct({
  invitationId: Schema.Unknown,
  projectId: Schema.Unknown,
  createdByPersonId: Schema.Unknown,
  recipientPersonId: Schema.Unknown,
  secretHash: Schema.Unknown,
  createdAt: Schema.Unknown,
  expiresAt: Schema.Unknown,
  acceptedAt: Schema.Unknown,
  acceptedByPersonId: Schema.Unknown,
  revokedAt: Schema.Unknown,
});
const decodeMembership = Schema.decodeUnknownEffect(ProjectMembershipRecord);
const decodeInvitation = Schema.decodeUnknownEffect(ProjectInvitationRecord);

export type ProjectAccessRepositoryError = PersistenceSqlError | PersistenceDecodeError;

export class ProjectAccessRepository extends Context.Service<
  ProjectAccessRepository,
  {
    readonly createMembership: (
      input: CreateProjectMembershipInput,
    ) => Effect.Effect<void, ProjectAccessRepositoryError>;
    readonly getMembership: (
      input: GetProjectMembershipInput,
    ) => Effect.Effect<Option.Option<ProjectMembershipRecord>, ProjectAccessRepositoryError>;
    readonly getOwner: (input: {
      readonly projectId: ProjectId;
    }) => Effect.Effect<Option.Option<ProjectMembershipRecord>, ProjectAccessRepositoryError>;
    readonly listMemberships: (
      input: ListProjectMembershipsInput,
    ) => Effect.Effect<ReadonlyArray<ProjectMembershipRecord>, ProjectAccessRepositoryError>;
    readonly ensureOwner: (
      input: CreateProjectMembershipInput,
    ) => Effect.Effect<Option.Option<ProjectMembershipRecord>, ProjectAccessRepositoryError>;
    readonly removeMembership: (
      input: GetProjectMembershipInput & { readonly removedAt: string },
    ) => Effect.Effect<boolean, ProjectAccessRepositoryError>;
    readonly transferOwnership: (
      input: GetProjectMembershipInput & { readonly updatedAt: string },
    ) => Effect.Effect<boolean, ProjectAccessRepositoryError>;
    readonly createInvitation: (
      input: CreateProjectInvitationInput,
    ) => Effect.Effect<void, ProjectAccessRepositoryError>;
    readonly getInvitationByHash: (
      input: GetProjectInvitationByHashInput,
    ) => Effect.Effect<Option.Option<ProjectInvitationRecord>, ProjectAccessRepositoryError>;
    readonly getInvitation: (
      input: GetProjectInvitationInput,
    ) => Effect.Effect<Option.Option<ProjectInvitationRecord>, ProjectAccessRepositoryError>;
    readonly listInvitations: (
      input: ListProjectInvitationsInput,
    ) => Effect.Effect<ReadonlyArray<ProjectInvitationRecord>, ProjectAccessRepositoryError>;
    readonly revokeInvitation: (
      input: RevokeProjectInvitationInput,
    ) => Effect.Effect<boolean, ProjectAccessRepositoryError>;
    readonly acceptInvitation: (
      input: AcceptProjectInvitationInput,
    ) => Effect.Effect<Option.Option<ProjectMembershipRecord>, ProjectAccessRepositoryError>;
  }
>()("croki-server/persistence/ProjectAccess/ProjectAccessRepository") {}

const sqlError =
  (operation: string) =>
  (cause: unknown): PersistenceSqlError =>
    new PersistenceSqlError({ operation, cause });
const decodeError = (operation: string) => (cause: Schema.SchemaError) =>
  PersistenceDecodeError.fromSchemaError(operation, cause);

export const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const createMembershipRow = SqlSchema.void({
    Request: CreateProjectMembershipInput,
    execute: (input) => sql`
      INSERT INTO project_memberships
        (project_id, person_id, role, created_at, updated_at, removed_at)
      VALUES (${input.projectId}, ${input.personId}, ${input.role}, ${input.createdAt},
        ${input.updatedAt}, NULL)
    `,
  });
  const getMembershipRow = SqlSchema.findOneOption({
    Request: GetProjectMembershipInput,
    Result: RawMembershipRow,
    execute: ({ projectId, personId }) => sql`
      SELECT project_id AS "projectId", person_id AS "personId", role,
        created_at AS "createdAt", updated_at AS "updatedAt", removed_at AS "removedAt"
      FROM project_memberships
      WHERE project_id = ${projectId} AND person_id = ${personId}
    `,
  });
  const getOwnerRow = SqlSchema.findOneOption({
    Request: Schema.Struct({ projectId: ProjectId }),
    Result: RawMembershipRow,
    execute: ({ projectId }) => sql`
      SELECT project_id AS "projectId", person_id AS "personId", role,
        created_at AS "createdAt", updated_at AS "updatedAt", removed_at AS "removedAt"
      FROM project_memberships
      WHERE project_id = ${projectId} AND role = 'owner' AND removed_at IS NULL
      LIMIT 1
    `,
  });
  const listMembershipRows = SqlSchema.findAll({
    Request: ListProjectMembershipsInput,
    Result: RawMembershipRow,
    execute: ({ projectId }) => sql`
      SELECT project_id AS "projectId", person_id AS "personId", role,
        created_at AS "createdAt", updated_at AS "updatedAt", removed_at AS "removedAt"
      FROM project_memberships
      WHERE project_id = ${projectId} AND removed_at IS NULL
      ORDER BY CASE role WHEN 'owner' THEN 0 ELSE 1 END, created_at ASC, person_id ASC
    `,
  });
  const ensureOwnerRow = SqlSchema.findOneOption({
    Request: CreateProjectMembershipInput,
    Result: RawMembershipRow,
    execute: (input) => sql`
      INSERT INTO project_memberships
        (project_id, person_id, role, created_at, updated_at, removed_at)
      VALUES (${input.projectId}, ${input.personId}, 'owner', ${input.createdAt},
        ${input.updatedAt}, NULL)
      ON CONFLICT (project_id, person_id)
      DO UPDATE SET role = 'owner', updated_at = excluded.updated_at, removed_at = NULL
      RETURNING project_id AS "projectId", person_id AS "personId", role,
        created_at AS "createdAt", updated_at AS "updatedAt", removed_at AS "removedAt"
    `,
  });
  const removeMembershipRow = SqlSchema.findAll({
    Request: Schema.Struct({
      projectId: ProjectId,
      personId: PersonId,
      removedAt: Schema.String,
    }),
    Result: Schema.Struct({ personId: PersonId }),
    execute: ({ projectId, personId, removedAt }) => sql`
      UPDATE project_memberships
      SET removed_at = ${removedAt}, updated_at = ${removedAt}
      WHERE project_id = ${projectId} AND person_id = ${personId}
        AND removed_at IS NULL AND role <> 'owner'
      RETURNING person_id AS "personId"
    `,
  });
  const transferOwnershipRow = SqlSchema.findAll({
    Request: Schema.Struct({
      projectId: ProjectId,
      personId: PersonId,
      updatedAt: Schema.String,
    }),
    Result: Schema.Struct({ personId: PersonId }),
    execute: ({ projectId, personId, updatedAt }) => sql`
      UPDATE project_memberships
      SET role = CASE WHEN person_id = ${personId} THEN 'owner' ELSE 'member' END,
          updated_at = ${updatedAt}
      WHERE project_id = ${projectId} AND removed_at IS NULL
        AND (person_id = ${personId} OR role = 'owner')
      RETURNING person_id AS "personId"
    `,
  });

  const createInvitationRow = SqlSchema.void({
    Request: CreateProjectInvitationInput,
    execute: (input) => sql`
      INSERT INTO project_invitations
        (invitation_id, project_id, created_by_person_id, recipient_person_id, secret_hash,
         created_at, expires_at, accepted_at, accepted_by_person_id, revoked_at)
      VALUES (${input.invitationId}, ${input.projectId}, ${input.createdByPersonId},
        ${input.recipientPersonId}, ${input.secretHash}, ${input.createdAt}, ${input.expiresAt},
        NULL, NULL, NULL)
    `,
  });
  const getInvitationByHashRow = SqlSchema.findOneOption({
    Request: GetProjectInvitationByHashInput,
    Result: RawInvitationRow,
    execute: ({ secretHash }) => sql`
      SELECT invitation_id AS "invitationId", project_id AS "projectId",
        created_by_person_id AS "createdByPersonId", recipient_person_id AS "recipientPersonId",
        secret_hash AS "secretHash", created_at AS "createdAt", expires_at AS "expiresAt",
        accepted_at AS "acceptedAt", accepted_by_person_id AS "acceptedByPersonId",
        revoked_at AS "revokedAt"
      FROM project_invitations
      WHERE secret_hash = ${secretHash}
    `,
  });
  const getInvitationRow = SqlSchema.findOneOption({
    Request: GetProjectInvitationInput,
    Result: RawInvitationRow,
    execute: ({ projectId, invitationId }) => sql`
      SELECT invitation_id AS "invitationId", project_id AS "projectId",
        created_by_person_id AS "createdByPersonId", recipient_person_id AS "recipientPersonId",
        secret_hash AS "secretHash", created_at AS "createdAt", expires_at AS "expiresAt",
        accepted_at AS "acceptedAt", accepted_by_person_id AS "acceptedByPersonId",
        revoked_at AS "revokedAt"
      FROM project_invitations
      WHERE project_id = ${projectId} AND invitation_id = ${invitationId}
    `,
  });
  const listInvitationRows = SqlSchema.findAll({
    Request: ListProjectInvitationsInput,
    Result: RawInvitationRow,
    execute: ({ projectId }) => sql`
      SELECT invitation_id AS "invitationId", project_id AS "projectId",
        created_by_person_id AS "createdByPersonId", recipient_person_id AS "recipientPersonId",
        secret_hash AS "secretHash", created_at AS "createdAt", expires_at AS "expiresAt",
        accepted_at AS "acceptedAt", accepted_by_person_id AS "acceptedByPersonId",
        revoked_at AS "revokedAt"
      FROM project_invitations
      WHERE project_id = ${projectId}
      ORDER BY created_at DESC, invitation_id DESC
    `,
  });
  const revokeInvitationRow = SqlSchema.findAll({
    Request: RevokeProjectInvitationInput,
    Result: Schema.Struct({ invitationId: ProjectInvitationId }),
    execute: ({ projectId, invitationId, revokedAt }) => sql`
      UPDATE project_invitations SET revoked_at = ${revokedAt}
      WHERE project_id = ${projectId} AND invitation_id = ${invitationId}
        AND revoked_at IS NULL AND accepted_at IS NULL
      RETURNING invitation_id AS "invitationId"
    `,
  });
  const acceptedInvitationRow = SqlSchema.findAll({
    Request: AcceptProjectInvitationInput,
    Result: Schema.Struct({ invitationId: ProjectInvitationId, projectId: ProjectId }),
    execute: ({ secretHash, personId, acceptedAt, now }) => sql`
      UPDATE project_invitations
      SET accepted_at = ${acceptedAt}, accepted_by_person_id = ${personId}
      WHERE secret_hash = ${secretHash} AND accepted_at IS NULL AND revoked_at IS NULL
        AND expires_at > ${now}
      RETURNING invitation_id AS "invitationId", project_id AS "projectId"
    `,
  });
  const upsertAcceptedMembershipRow = SqlSchema.findOneOption({
    Request: Schema.Struct({
      projectId: ProjectId,
      personId: PersonId,
      updatedAt: Schema.String,
    }),
    Result: RawMembershipRow,
    execute: ({ projectId, personId, updatedAt }) => sql`
      INSERT INTO project_memberships
        (project_id, person_id, role, created_at, updated_at, removed_at)
      VALUES (${projectId}, ${personId}, 'member', ${updatedAt}, ${updatedAt}, NULL)
      ON CONFLICT (project_id, person_id)
      DO UPDATE SET role = CASE WHEN project_memberships.role = 'owner' THEN 'owner' ELSE 'member' END,
        updated_at = excluded.updated_at, removed_at = NULL
      RETURNING project_id AS "projectId", person_id AS "personId", role,
        created_at AS "createdAt", updated_at AS "updatedAt", removed_at AS "removedAt"
    `,
  });

  const decodeMembershipRow = (row: unknown) =>
    decodeMembership(row).pipe(Effect.mapError(decodeError("ProjectAccess.membership.decode")));
  const decodeInvitationRow = (row: unknown) =>
    decodeInvitation(row).pipe(Effect.mapError(decodeError("ProjectAccess.invitation.decode")));
  const decodeMembershipOption = (row: Option.Option<typeof RawMembershipRow.Type>) =>
    Option.match(row, {
      onNone: () => Effect.succeed(Option.none<ProjectMembershipRecord>()),
      onSome: (value) => decodeMembershipRow(value).pipe(Effect.map(Option.some)),
    });
  const decodeInvitationOption = (row: Option.Option<typeof RawInvitationRow.Type>) =>
    Option.match(row, {
      onNone: () => Effect.succeed(Option.none<ProjectInvitationRecord>()),
      onSome: (value) => decodeInvitationRow(value).pipe(Effect.map(Option.some)),
    });

  const createMembership: ProjectAccessRepository["Service"]["createMembership"] = (input) =>
    createMembershipRow(input).pipe(Effect.mapError(sqlError("ProjectAccess.createMembership")));
  const getMembership: ProjectAccessRepository["Service"]["getMembership"] = (input) =>
    getMembershipRow(input).pipe(
      Effect.mapError(sqlError("ProjectAccess.getMembership")),
      Effect.flatMap(decodeMembershipOption),
    );
  const getOwner: ProjectAccessRepository["Service"]["getOwner"] = (input) =>
    getOwnerRow(input).pipe(
      Effect.mapError(sqlError("ProjectAccess.getOwner")),
      Effect.flatMap(decodeMembershipOption),
    );
  const listMemberships: ProjectAccessRepository["Service"]["listMemberships"] = (input) =>
    listMembershipRows(input).pipe(
      Effect.mapError(sqlError("ProjectAccess.listMemberships")),
      Effect.flatMap((rows) => Effect.forEach(rows, decodeMembershipRow)),
    );
  const ensureOwner: ProjectAccessRepository["Service"]["ensureOwner"] = (input) =>
    ensureOwnerRow(input).pipe(
      Effect.mapError(sqlError("ProjectAccess.ensureOwner")),
      Effect.flatMap(decodeMembershipOption),
    );
  const removeMembership: ProjectAccessRepository["Service"]["removeMembership"] = (input) =>
    removeMembershipRow(input).pipe(
      Effect.mapError(sqlError("ProjectAccess.removeMembership")),
      Effect.map((rows) => rows.length > 0),
    );
  const transferOwnership: ProjectAccessRepository["Service"]["transferOwnership"] = (input) =>
    sql
      .withTransaction(
        Effect.gen(function* () {
          const updated = yield* transferOwnershipRow(input);
          if (updated.length !== 2) {
            return yield* new PersistenceSqlError({
              operation: "ProjectAccess.transferOwnership",
              detail: "Ownership transfer requires an active owner and member.",
            });
          }
          return true;
        }),
      )
      .pipe(Effect.mapError(sqlError("ProjectAccess.transferOwnership")));
  const createInvitation: ProjectAccessRepository["Service"]["createInvitation"] = (input) =>
    createInvitationRow(input).pipe(Effect.mapError(sqlError("ProjectAccess.createInvitation")));
  const getInvitationByHash: ProjectAccessRepository["Service"]["getInvitationByHash"] = (input) =>
    getInvitationByHashRow(input).pipe(
      Effect.mapError(sqlError("ProjectAccess.getInvitationByHash")),
      Effect.flatMap(decodeInvitationOption),
    );
  const getInvitation: ProjectAccessRepository["Service"]["getInvitation"] = (input) =>
    getInvitationRow(input).pipe(
      Effect.mapError(sqlError("ProjectAccess.getInvitation")),
      Effect.flatMap(decodeInvitationOption),
    );
  const listInvitations: ProjectAccessRepository["Service"]["listInvitations"] = (input) =>
    listInvitationRows(input).pipe(
      Effect.mapError(sqlError("ProjectAccess.listInvitations")),
      Effect.flatMap((rows) => Effect.forEach(rows, decodeInvitationRow)),
    );
  const revokeInvitation: ProjectAccessRepository["Service"]["revokeInvitation"] = (input) =>
    revokeInvitationRow(input).pipe(
      Effect.mapError(sqlError("ProjectAccess.revokeInvitation")),
      Effect.map((rows) => rows.length > 0),
    );
  const acceptInvitation: ProjectAccessRepository["Service"]["acceptInvitation"] = (input) =>
    sql
      .withTransaction(
        acceptedInvitationRow(input).pipe(
          Effect.flatMap((rows) =>
            rows.length === 0
              ? Effect.succeed(Option.none<ProjectMembershipRecord>())
              : upsertAcceptedMembershipRow({
                  projectId: rows[0]!.projectId,
                  personId: input.personId,
                  updatedAt: input.updatedAt,
                }).pipe(Effect.flatMap(decodeMembershipOption)),
          ),
        ),
      )
      .pipe(Effect.mapError(sqlError("ProjectAccess.acceptInvitation")));

  return {
    createMembership,
    getMembership,
    getOwner,
    listMemberships,
    ensureOwner,
    removeMembership,
    transferOwnership,
    createInvitation,
    getInvitationByHash,
    getInvitation,
    listInvitations,
    revokeInvitation,
    acceptInvitation,
  } satisfies ProjectAccessRepository["Service"];
});

export const layer = Layer.effect(ProjectAccessRepository, make);
