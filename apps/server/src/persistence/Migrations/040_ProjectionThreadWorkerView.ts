import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

/** Parent-scoped worker presentation. Safe to renumber while batch branches converge. */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const columns = yield* sql<{ readonly name: string }>`
    PRAGMA table_info(projection_threads)
  `;

  if (!columns.some((column) => column.name === "worker_view")) {
    yield* sql`
      ALTER TABLE projection_threads
      ADD COLUMN worker_view TEXT NOT NULL DEFAULT 'threads'
      CHECK (worker_view IN ('threads', 'activity'))
    `;
  }
});
