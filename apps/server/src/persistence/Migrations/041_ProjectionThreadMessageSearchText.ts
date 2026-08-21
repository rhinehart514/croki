import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { normalizeThreadSearchText } from "../../orchestration/threadSearchText.ts";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const columns = yield* sql<{ readonly name: string }>`
    PRAGMA table_info(projection_thread_messages)
  `;

  if (!columns.some((column) => column.name === "search_text")) {
    yield* sql`
      ALTER TABLE projection_thread_messages
      ADD COLUMN search_text TEXT NOT NULL DEFAULT ''
    `;
  }

  const messages = yield* sql<{
    readonly messageId: string;
    readonly text: string;
  }>`
    SELECT
      message_id AS "messageId",
      text
    FROM projection_thread_messages
  `;

  yield* Effect.forEach(
    messages,
    ({ messageId, text }) =>
      sql`
        UPDATE projection_thread_messages
        SET search_text = ${normalizeThreadSearchText(text)}
        WHERE message_id = ${messageId}
      `,
    { concurrency: 1, discard: true },
  );
});
