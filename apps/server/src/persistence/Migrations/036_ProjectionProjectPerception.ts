import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

/** Durable cache for the project-scoped Canvas working model. */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS projection_project_perception (
      project_id TEXT PRIMARY KEY,
      revision INTEGER NOT NULL,
      snapshot_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_project_perception_updated_at
    ON projection_project_perception(updated_at)
  `;
});
