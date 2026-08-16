import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("045_MultiplayerIdentity", (it) => {
  it.effect("creates identity, membership, invitation, and session binding columns", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 44 });
      yield* runMigrations({ toMigrationInclusive: 45 });

      const sessions = yield* sql<{ readonly name: string }>`PRAGMA table_info(auth_sessions)`;
      assert.ok(sessions.some((column) => column.name === "person_id"));
      assert.ok(sessions.some((column) => column.name === "device_id"));

      const tables = yield* sql<{ readonly name: string }>`
        SELECT name FROM sqlite_master
        WHERE type = 'table'
          AND name IN ('identity_people', 'identity_devices', 'project_memberships', 'project_invitations')
      `;
      assert.deepStrictEqual(tables.map((table) => table.name).sort(), [
        "identity_devices",
        "identity_people",
        "project_invitations",
        "project_memberships",
      ]);

      yield* sql`
        INSERT INTO identity_people (person_id, display_name, created_at, updated_at)
        VALUES ('person-owner', 'Owner', '2026-08-16T00:00:00.000Z', '2026-08-16T00:00:00.000Z')
      `;
      yield* sql`
        INSERT INTO identity_people (person_id, display_name, created_at, updated_at)
        VALUES ('person-owner-2', 'Owner Two', '2026-08-16T00:00:00.000Z', '2026-08-16T00:00:00.000Z')
      `;
      yield* sql`
        INSERT INTO project_memberships (project_id, person_id, role, created_at, updated_at)
        VALUES ('project-a', 'person-owner', 'owner', '2026-08-16T00:00:00.000Z', '2026-08-16T00:00:00.000Z')
      `;
      const duplicateOwner = yield* Effect.flip(sql`
        INSERT INTO project_memberships (project_id, person_id, role, created_at, updated_at)
        VALUES ('project-a', 'person-owner-2', 'owner', '2026-08-16T00:00:00.000Z', '2026-08-16T00:00:00.000Z')
      `);
      assert.equal(duplicateOwner._tag, "SqlError");
    }),
  );
});
