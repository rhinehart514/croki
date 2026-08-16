import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

/**
 * Durable identity and Project admission tables. All new columns are
 * nullable where they touch the pre-multiplayer auth tables so existing
 * bootstrap/session credentials continue to work as legacy environment
 * credentials until a Person and Device are explicitly registered.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const authSessionColumns = yield* sql<{ readonly name: string }>`
    PRAGMA table_info(auth_sessions)
  `;
  if (!authSessionColumns.some((column) => column.name === "person_id")) {
    yield* sql`ALTER TABLE auth_sessions ADD COLUMN person_id TEXT`;
  }
  if (!authSessionColumns.some((column) => column.name === "device_id")) {
    yield* sql`ALTER TABLE auth_sessions ADD COLUMN device_id TEXT`;
  }

  yield* sql`
    CREATE TABLE IF NOT EXISTS identity_people (
      person_id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      revoked_at TEXT
    )
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS identity_devices (
      device_id TEXT PRIMARY KEY,
      person_id TEXT NOT NULL REFERENCES identity_people(person_id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      device_type TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_seen_at TEXT,
      revoked_at TEXT
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_identity_devices_person_active
    ON identity_devices(person_id, revoked_at, created_at)
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS project_memberships (
      project_id TEXT NOT NULL,
      person_id TEXT NOT NULL REFERENCES identity_people(person_id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      removed_at TEXT,
      PRIMARY KEY (project_id, person_id)
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_project_memberships_person_active
    ON project_memberships(person_id, removed_at, project_id)
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_project_memberships_project_active
    ON project_memberships(project_id, removed_at, role, person_id)
  `;

  // SQLite's partial unique index expresses "at most one active owner". The
  // service keeps the companion invariant that a newly created/claimed
  // Project always has one owner and never removes the last one.
  yield* sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_project_memberships_one_active_owner
    ON project_memberships(project_id)
    WHERE role = 'owner' AND removed_at IS NULL
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS project_invitations (
      invitation_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      created_by_person_id TEXT NOT NULL REFERENCES identity_people(person_id),
      recipient_person_id TEXT REFERENCES identity_people(person_id),
      secret_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      accepted_at TEXT,
      accepted_by_person_id TEXT REFERENCES identity_people(person_id),
      revoked_at TEXT
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_project_invitations_project_state
    ON project_invitations(project_id, revoked_at, accepted_at, expires_at, created_at)
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_project_invitations_secret_hash
    ON project_invitations(secret_hash)
  `;
});
