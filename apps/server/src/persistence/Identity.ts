import {
  AuthClientMetadataDeviceType,
  AuthSessionId,
  Device,
  DeviceId,
  IdentityCurrent,
  Person,
  PersonId,
} from "@croki/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

import * as AuthSessions from "./AuthSessions.ts";
import {
  type AuthSessionRepositoryError,
  PersistenceDecodeError,
  PersistenceSqlError,
} from "./Errors.ts";

export const CreatePersonRecordInput = Schema.Struct({
  personId: PersonId,
  displayName: Schema.String,
  createdAt: Schema.String,
  updatedAt: Schema.String,
});
export type CreatePersonRecordInput = typeof CreatePersonRecordInput.Type;

export const UpdatePersonDisplayNameInput = Schema.Struct({
  personId: PersonId,
  displayName: Schema.String,
  updatedAt: Schema.String,
});
export type UpdatePersonDisplayNameInput = typeof UpdatePersonDisplayNameInput.Type;

export const GetPersonInput = Schema.Struct({ personId: PersonId });
export type GetPersonInput = typeof GetPersonInput.Type;

export const CreateDeviceRecordInput = Schema.Struct({
  deviceId: DeviceId,
  personId: PersonId,
  label: Schema.String,
  deviceType: AuthClientMetadataDeviceType,
  createdAt: Schema.String,
});
export type CreateDeviceRecordInput = typeof CreateDeviceRecordInput.Type;

export const GetDeviceInput = Schema.Struct({ deviceId: DeviceId });
export type GetDeviceInput = typeof GetDeviceInput.Type;

export const ListDevicesInput = Schema.Struct({ personId: PersonId });
export type ListDevicesInput = typeof ListDevicesInput.Type;

export const BindSessionIdentityInput = Schema.Struct({
  sessionId: AuthSessionId,
  personId: PersonId,
  deviceId: DeviceId,
});
export type BindSessionIdentityInput = typeof BindSessionIdentityInput.Type;

export const RevokeIdentityInput = Schema.Struct({
  personId: PersonId,
  revokedAt: Schema.DateTimeUtcFromString,
});
export type RevokeIdentityInput = typeof RevokeIdentityInput.Type;

export const RevokeDeviceInput = Schema.Struct({
  deviceId: DeviceId,
  revokedAt: Schema.DateTimeUtcFromString,
});
export type RevokeDeviceInput = typeof RevokeDeviceInput.Type;

const PersonDbRow = Schema.Struct({
  personId: PersonId,
  displayName: Schema.String,
  createdAt: Schema.String,
  updatedAt: Schema.String,
  revokedAt: Schema.NullOr(Schema.String),
});
const DeviceDbRow = Schema.Struct({
  deviceId: DeviceId,
  personId: PersonId,
  label: Schema.String,
  deviceType: AuthClientMetadataDeviceType,
  createdAt: Schema.String,
  lastSeenAt: Schema.NullOr(Schema.String),
  revokedAt: Schema.NullOr(Schema.String),
});
const IdentityDbRow = Schema.Struct({
  personId: Schema.NullOr(PersonId),
  personDisplayName: Schema.NullOr(Schema.String),
  personCreatedAt: Schema.NullOr(Schema.String),
  personUpdatedAt: Schema.NullOr(Schema.String),
  personRevokedAt: Schema.NullOr(Schema.String),
  deviceId: Schema.NullOr(DeviceId),
  devicePersonId: Schema.NullOr(PersonId),
  deviceLabel: Schema.NullOr(Schema.String),
  deviceType: Schema.NullOr(AuthClientMetadataDeviceType),
  deviceCreatedAt: Schema.NullOr(Schema.String),
  deviceLastSeenAt: Schema.NullOr(Schema.String),
  deviceRevokedAt: Schema.NullOr(Schema.String),
});

const RawIdentityDbRow = Schema.Struct({
  personId: Schema.Unknown,
  personDisplayName: Schema.Unknown,
  personCreatedAt: Schema.Unknown,
  personUpdatedAt: Schema.Unknown,
  personRevokedAt: Schema.Unknown,
  deviceId: Schema.Unknown,
  devicePersonId: Schema.Unknown,
  deviceLabel: Schema.Unknown,
  deviceType: Schema.Unknown,
  deviceCreatedAt: Schema.Unknown,
  deviceLastSeenAt: Schema.Unknown,
  deviceRevokedAt: Schema.Unknown,
});

const decodePerson = Schema.decodeUnknownEffect(PersonDbRow);
const decodeDevice = Schema.decodeUnknownEffect(DeviceDbRow);
const decodeIdentity = Schema.decodeUnknownEffect(IdentityDbRow);

export type IdentityRepositoryError =
  | PersistenceSqlError
  | PersistenceDecodeError
  | AuthSessionRepositoryError;

export class IdentityRepository extends Context.Service<
  IdentityRepository,
  {
    readonly createPerson: (
      input: CreatePersonRecordInput,
    ) => Effect.Effect<void, IdentityRepositoryError>;
    readonly getPerson: (
      input: GetPersonInput,
    ) => Effect.Effect<Option.Option<Person>, IdentityRepositoryError>;
    readonly updatePersonDisplayName: (
      input: UpdatePersonDisplayNameInput,
    ) => Effect.Effect<boolean, IdentityRepositoryError>;
    readonly createDevice: (
      input: CreateDeviceRecordInput,
    ) => Effect.Effect<void, IdentityRepositoryError>;
    readonly getDevice: (
      input: GetDeviceInput,
    ) => Effect.Effect<Option.Option<Device>, IdentityRepositoryError>;
    readonly listDevices: (
      input: ListDevicesInput,
    ) => Effect.Effect<ReadonlyArray<Device>, IdentityRepositoryError>;
    readonly getSessionIdentity: (input: {
      readonly sessionId: AuthSessionId;
    }) => Effect.Effect<Option.Option<IdentityCurrent>, IdentityRepositoryError>;
    readonly bindSessionIdentity: (
      input: BindSessionIdentityInput,
    ) => Effect.Effect<boolean, IdentityRepositoryError>;
    readonly revokePerson: (
      input: RevokeIdentityInput,
    ) => Effect.Effect<ReadonlyArray<AuthSessionId>, IdentityRepositoryError>;
    readonly revokeDevice: (
      input: RevokeDeviceInput,
    ) => Effect.Effect<ReadonlyArray<AuthSessionId>, IdentityRepositoryError>;
  }
>()("croki-server/persistence/Identity/IdentityRepository") {}

const toSqlError =
  (operation: string) =>
  (cause: unknown): PersistenceSqlError =>
    new PersistenceSqlError({ operation, cause });

const toDecodeError = (operation: string) => (cause: Schema.SchemaError) =>
  PersistenceDecodeError.fromSchemaError(operation, cause);

const makeIdentity = (row: typeof IdentityDbRow.Type): IdentityCurrent => ({
  person:
    row.personId === null
      ? null
      : {
          personId: row.personId,
          displayName: row.personDisplayName!,
          createdAt: row.personCreatedAt!,
          updatedAt: row.personUpdatedAt!,
          revokedAt: row.personRevokedAt,
        },
  device:
    row.deviceId === null
      ? null
      : {
          deviceId: row.deviceId,
          personId: row.devicePersonId!,
          label: row.deviceLabel!,
          deviceType: row.deviceType!,
          createdAt: row.deviceCreatedAt!,
          lastSeenAt: row.deviceLastSeenAt,
          revokedAt: row.deviceRevokedAt,
        },
});

export const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const authSessions = yield* AuthSessions.AuthSessionRepository;

  const createPersonRow = SqlSchema.void({
    Request: CreatePersonRecordInput,
    execute: (input) => sql`
      INSERT INTO identity_people (person_id, display_name, created_at, updated_at, revoked_at)
      VALUES (${input.personId}, ${input.displayName}, ${input.createdAt}, ${input.updatedAt}, NULL)
    `,
  });
  const getPersonRow = SqlSchema.findOneOption({
    Request: GetPersonInput,
    Result: Schema.Struct({
      personId: Schema.Unknown,
      displayName: Schema.Unknown,
      createdAt: Schema.Unknown,
      updatedAt: Schema.Unknown,
      revokedAt: Schema.Unknown,
    }),
    execute: ({ personId }) => sql`
      SELECT person_id AS "personId", display_name AS "displayName",
        created_at AS "createdAt", updated_at AS "updatedAt", revoked_at AS "revokedAt"
      FROM identity_people WHERE person_id = ${personId}
    `,
  });
  const updatePersonRow = SqlSchema.findAll({
    Request: UpdatePersonDisplayNameInput,
    Result: Schema.Struct({ personId: PersonId }),
    execute: (input) => sql`
      UPDATE identity_people
      SET display_name = ${input.displayName}, updated_at = ${input.updatedAt}
      WHERE person_id = ${input.personId} AND revoked_at IS NULL
      RETURNING person_id AS "personId"
    `,
  });
  const createDeviceRow = SqlSchema.void({
    Request: CreateDeviceRecordInput,
    execute: (input) => sql`
      INSERT INTO identity_devices
        (device_id, person_id, label, device_type, created_at, last_seen_at, revoked_at)
      VALUES (${input.deviceId}, ${input.personId}, ${input.label}, ${input.deviceType},
        ${input.createdAt}, NULL, NULL)
    `,
  });
  const getDeviceRow = SqlSchema.findOneOption({
    Request: GetDeviceInput,
    Result: Schema.Struct({
      deviceId: Schema.Unknown,
      personId: Schema.Unknown,
      label: Schema.Unknown,
      deviceType: Schema.Unknown,
      createdAt: Schema.Unknown,
      lastSeenAt: Schema.Unknown,
      revokedAt: Schema.Unknown,
    }),
    execute: ({ deviceId }) => sql`
      SELECT device_id AS "deviceId", person_id AS "personId", label,
        device_type AS "deviceType", created_at AS "createdAt",
        last_seen_at AS "lastSeenAt", revoked_at AS "revokedAt"
      FROM identity_devices WHERE device_id = ${deviceId}
    `,
  });
  const listDeviceRows = SqlSchema.findAll({
    Request: ListDevicesInput,
    Result: Schema.Struct({
      deviceId: Schema.Unknown,
      personId: Schema.Unknown,
      label: Schema.Unknown,
      deviceType: Schema.Unknown,
      createdAt: Schema.Unknown,
      lastSeenAt: Schema.Unknown,
      revokedAt: Schema.Unknown,
    }),
    execute: ({ personId }) => sql`
      SELECT device_id AS "deviceId", person_id AS "personId", label,
        device_type AS "deviceType", created_at AS "createdAt",
        last_seen_at AS "lastSeenAt", revoked_at AS "revokedAt"
      FROM identity_devices WHERE person_id = ${personId}
      ORDER BY created_at ASC, device_id ASC
    `,
  });
  const getSessionIdentityRow = SqlSchema.findOneOption({
    Request: Schema.Struct({ sessionId: AuthSessionId }),
    Result: RawIdentityDbRow,
    execute: ({ sessionId }) => sql`
      SELECT
        people.person_id AS "personId", people.display_name AS "personDisplayName",
        people.created_at AS "personCreatedAt", people.updated_at AS "personUpdatedAt",
        people.revoked_at AS "personRevokedAt",
        devices.device_id AS "deviceId", devices.person_id AS "devicePersonId",
        devices.label AS "deviceLabel", devices.device_type AS "deviceType",
        devices.created_at AS "deviceCreatedAt", devices.last_seen_at AS "deviceLastSeenAt",
        devices.revoked_at AS "deviceRevokedAt"
      FROM auth_sessions
      LEFT JOIN identity_people people ON people.person_id = auth_sessions.person_id
      LEFT JOIN identity_devices devices ON devices.device_id = auth_sessions.device_id
      WHERE auth_sessions.session_id = ${sessionId}
    `,
  });
  const bindSessionRow = SqlSchema.findAll({
    Request: BindSessionIdentityInput,
    Result: Schema.Struct({ sessionId: AuthSessionId }),
    execute: (input) => sql`
      UPDATE auth_sessions
      SET person_id = ${input.personId}, device_id = ${input.deviceId}
      WHERE session_id = ${input.sessionId} AND revoked_at IS NULL
        AND (person_id IS NULL OR person_id = ${input.personId})
        AND (device_id IS NULL OR device_id = ${input.deviceId})
      RETURNING session_id AS "sessionId"
    `,
  });

  const createPerson: IdentityRepository["Service"]["createPerson"] = (input) =>
    createPersonRow(input).pipe(Effect.mapError(toSqlError("IdentityRepository.createPerson")));
  const getPerson: IdentityRepository["Service"]["getPerson"] = (input) =>
    getPersonRow(input).pipe(
      Effect.mapError(toSqlError("IdentityRepository.getPerson")),
      Effect.flatMap((row) =>
        Option.match(row, {
          onNone: () => Effect.succeed(Option.none()),
          onSome: (raw) =>
            decodePerson(raw).pipe(
              Effect.mapError(toDecodeError("IdentityRepository.getPerson.decode")),
              Effect.map((decoded) =>
                Option.some({
                  personId: decoded.personId,
                  displayName: decoded.displayName,
                  createdAt: decoded.createdAt,
                  updatedAt: decoded.updatedAt,
                  revokedAt: decoded.revokedAt,
                } satisfies Person),
              ),
            ),
        }),
      ),
    );
  const updatePersonDisplayName: IdentityRepository["Service"]["updatePersonDisplayName"] = (
    input,
  ) =>
    updatePersonRow(input).pipe(
      Effect.mapError(toSqlError("IdentityRepository.updatePersonDisplayName")),
      Effect.map((rows) => rows.length > 0),
    );
  const createDevice: IdentityRepository["Service"]["createDevice"] = (input) =>
    createDeviceRow(input).pipe(Effect.mapError(toSqlError("IdentityRepository.createDevice")));
  const getDevice: IdentityRepository["Service"]["getDevice"] = (input) =>
    getDeviceRow(input).pipe(
      Effect.mapError(toSqlError("IdentityRepository.getDevice")),
      Effect.flatMap((row) =>
        Option.match(row, {
          onNone: () => Effect.succeed(Option.none()),
          onSome: (raw) =>
            decodeDevice(raw).pipe(
              Effect.mapError(toDecodeError("IdentityRepository.getDevice.decode")),
              Effect.map((decoded) => Option.some(decoded satisfies Device)),
            ),
        }),
      ),
    );
  const listDevices: IdentityRepository["Service"]["listDevices"] = (input) =>
    listDeviceRows(input).pipe(
      Effect.mapError(toSqlError("IdentityRepository.listDevices")),
      Effect.flatMap((rows) =>
        Effect.forEach(rows, (raw) =>
          decodeDevice(raw).pipe(
            Effect.mapError(toDecodeError("IdentityRepository.listDevices.decode")),
            Effect.map((decoded) => decoded satisfies Device),
          ),
        ),
      ),
    );
  const getSessionIdentity: IdentityRepository["Service"]["getSessionIdentity"] = (input) =>
    getSessionIdentityRow(input).pipe(
      Effect.mapError(toSqlError("IdentityRepository.getSessionIdentity")),
      Effect.flatMap((row) =>
        Option.match(row, {
          onNone: () => Effect.succeed(Option.none()),
          onSome: (raw) =>
            decodeIdentity(raw).pipe(
              Effect.mapError(toDecodeError("IdentityRepository.getSessionIdentity.decode")),
              Effect.map((decoded) => Option.some(makeIdentity(decoded))),
            ),
        }),
      ),
    );
  const bindSessionIdentity: IdentityRepository["Service"]["bindSessionIdentity"] = (input) =>
    bindSessionRow(input).pipe(
      Effect.mapError(toSqlError("IdentityRepository.bindSessionIdentity")),
      Effect.map((rows) => rows.length > 0),
    );

  const revokePerson: IdentityRepository["Service"]["revokePerson"] = (input) =>
    sql
      .withTransaction(
        Effect.gen(function* () {
          yield* sql`
          UPDATE identity_people SET revoked_at = ${input.revokedAt}, updated_at = ${input.revokedAt}
          WHERE person_id = ${input.personId} AND revoked_at IS NULL
        `;
          return yield* authSessions.revokeByPerson(input);
        }),
      )
      .pipe(Effect.mapError(toSqlError("IdentityRepository.revokePerson")));
  const revokeDevice: IdentityRepository["Service"]["revokeDevice"] = (input) =>
    sql
      .withTransaction(
        Effect.gen(function* () {
          yield* sql`
          UPDATE identity_devices SET revoked_at = ${input.revokedAt}
          WHERE device_id = ${input.deviceId} AND revoked_at IS NULL
        `;
          return yield* authSessions.revokeByDevice(input);
        }),
      )
      .pipe(Effect.mapError(toSqlError("IdentityRepository.revokeDevice")));

  return {
    createPerson,
    getPerson,
    updatePersonDisplayName,
    createDevice,
    getDevice,
    listDevices,
    getSessionIdentity,
    bindSessionIdentity,
    revokePerson,
    revokeDevice,
  } satisfies IdentityRepository["Service"];
});

export const layer = Layer.effect(IdentityRepository, make);
