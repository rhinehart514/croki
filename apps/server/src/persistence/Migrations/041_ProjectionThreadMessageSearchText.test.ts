import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("041_ProjectionThreadMessageSearchText", (it) => {
  it.effect("adds and backfills canonical Unicode search text", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* runMigrations({ toMigrationInclusive: 40 });
      yield* sql`
        INSERT INTO projection_thread_messages (
          message_id,
          thread_id,
          turn_id,
          role,
          text,
          is_streaming,
          created_at,
          updated_at
        )
        VALUES (
          'message-unicode-search',
          'thread-unicode-search',
          NULL,
          'user',
          ${"E\u0301CHEC"},
          0,
          '2026-08-07T00:00:00.000Z',
          '2026-08-07T00:00:00.000Z'
        )
      `;

      yield* runMigrations({ toMigrationInclusive: 41 });

      const rows = yield* sql<{ readonly searchText: string }>`
        SELECT search_text AS "searchText"
        FROM projection_thread_messages
        WHERE message_id = 'message-unicode-search'
      `;
      assert.deepStrictEqual(rows, [{ searchText: "échec" }]);
    }),
  );
});
