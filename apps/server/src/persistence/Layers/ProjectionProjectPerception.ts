import { CrokiProjectPerceptionSnapshot } from "@croki/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";
import * as Struct from "effect/Struct";

import { toPersistenceDecodeError, toPersistenceSqlError } from "../Errors.ts";
import {
  DeleteProjectionProjectPerceptionInput,
  GetProjectionProjectPerceptionInput,
  ProjectionProjectPerception,
  ProjectionProjectPerceptionRepository,
  type ProjectionProjectPerceptionRepositoryShape,
} from "../Services/ProjectionProjectPerception.ts";

const ProjectionProjectPerceptionDbRow = ProjectionProjectPerception.mapFields(
  Struct.assign({
    snapshot: Schema.fromJsonString(CrokiProjectPerceptionSnapshot),
  }),
);

function toPersistenceSqlOrDecodeError(sqlOperation: string, decodeOperation: string) {
  return (cause: unknown) =>
    Schema.isSchemaError(cause)
      ? toPersistenceDecodeError(decodeOperation)(cause)
      : toPersistenceSqlError(sqlOperation)(cause);
}

const makeProjectionProjectPerceptionRepository = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const upsertRow = SqlSchema.void({
    Request: ProjectionProjectPerception,
    execute: (row) =>
      sql`
        INSERT INTO projection_project_perception (
          project_id,
          revision,
          snapshot_json,
          updated_at
        )
        VALUES (
          ${row.projectId},
          ${row.revision},
          ${JSON.stringify(row.snapshot)},
          ${row.updatedAt}
        )
        ON CONFLICT (project_id)
        DO UPDATE SET
          revision = excluded.revision,
          snapshot_json = excluded.snapshot_json,
          updated_at = excluded.updated_at
      `,
  });

  const getRow = SqlSchema.findOneOption({
    Request: GetProjectionProjectPerceptionInput,
    Result: ProjectionProjectPerceptionDbRow,
    execute: ({ projectId }) =>
      sql`
        SELECT
          project_id AS "projectId",
          revision,
          snapshot_json AS "snapshot",
          updated_at AS "updatedAt"
        FROM projection_project_perception
        WHERE project_id = ${projectId}
      `,
  });

  const deleteRow = SqlSchema.void({
    Request: DeleteProjectionProjectPerceptionInput,
    execute: ({ projectId }) =>
      sql`
        DELETE FROM projection_project_perception
        WHERE project_id = ${projectId}
      `,
  });

  const upsert: ProjectionProjectPerceptionRepositoryShape["upsert"] = (row) =>
    upsertRow(row).pipe(
      Effect.mapError(
        toPersistenceSqlOrDecodeError(
          "ProjectionProjectPerceptionRepository.upsert:query",
          "ProjectionProjectPerceptionRepository.upsert:encodeRequest",
        ),
      ),
    );

  const getByProjectId: ProjectionProjectPerceptionRepositoryShape["getByProjectId"] = (input) =>
    getRow(input).pipe(
      Effect.mapError(
        toPersistenceSqlOrDecodeError(
          "ProjectionProjectPerceptionRepository.getByProjectId:query",
          "ProjectionProjectPerceptionRepository.getByProjectId:decodeRow",
        ),
      ),
      Effect.map((row) =>
        Option.map(row, (value) => ({
          projectId: value.projectId,
          revision: value.revision,
          snapshot: value.snapshot,
          updatedAt: value.updatedAt,
        })),
      ),
    );

  const deleteByProjectId: ProjectionProjectPerceptionRepositoryShape["deleteByProjectId"] = (
    input,
  ) =>
    deleteRow(input).pipe(
      Effect.mapError(
        toPersistenceSqlError("ProjectionProjectPerceptionRepository.deleteByProjectId:query"),
      ),
    );

  return {
    upsert,
    getByProjectId,
    deleteByProjectId,
  } satisfies ProjectionProjectPerceptionRepositoryShape;
});

export const ProjectionProjectPerceptionRepositoryLive = Layer.effect(
  ProjectionProjectPerceptionRepository,
  makeProjectionProjectPerceptionRepository,
);
