// One-time importer: copy every durable JSON document under ~/.gtm-ide into the SQLite database.
//
// SAFETY CONTRACT
//   - Additive and reversible: it only READS the JSON files and WRITES into SQLite. It NEVER deletes,
//     moves, or rewrites a JSON file. The JSON stays on disk as the rollback path.
//   - Idempotent: re-importing the same document is an upsert (same (collection, key)), so running it
//     twice is safe and produces the same DB.
//   - Honest about scope: it imports every known collection plus the project singleton. A collection
//     with no JSON on disk simply contributes nothing.
//
// AUTO-RUN ON BOOT (wired by the server): when the SQLite DB has no documents but JSON exists, the
// server calls migrateIfNeeded once so a founder upgrading from the JSON era lands on a populated DB
// without a manual step. This module performs the copy; it does not decide product policy.

import fs from "node:fs";
import path from "node:path";
import {
  storeRoot,
  databaseFile,
  jsonPersistence,
  sqlitePersistence,
  registerAutoMigrator,
  PROJECT_COLLECTION,
  PROJECT_KEY,
} from "./persistence.mjs";

// Every per-id JSON store: a directory of <key>.json files under the home root. The directory name
// IS the collection name; the file basename (minus .json) IS the key. This list is the full set of
// JSON-backed stores in brain/src as of Phase 2.
const PER_ID_COLLECTIONS = [
  "flows",
  "operator-sessions",
  "programs",
  "people",
  "agent-policies",
  "feedback-ledger",
  "product-models",
  "domain-events",
  "clarity",
  "capability-foundry",
  "capabilities",
  "design-state",
  "workspaces",
  "teams",
  // The world-signal inbox (inputs-store.mjs), founder-pasted API keys (credential-store.mjs), and
  // graded ideation output (idea-store.mjs). Each is a per-id JSON store under the home root, so each
  // imports document-by-document like the rest.
  "inputs",
  "credentials",
  "gtm-ideas",
];

// List the keys present on disk for a per-id collection (the .json basenames). Missing directory →
// no keys, which is the fresh-install case.
function keysOnDisk(root, collection) {
  const dir = path.join(root, collection);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((entry) => entry.endsWith(".json"))
    .map((entry) => entry.slice(0, -".json".length));
}

// True when the home directory holds any importable JSON (a per-id store file or the project
// singleton). Used to decide whether an empty DB warrants an auto-import.
export function hasJsonToMigrate(options = {}) {
  const root = storeRoot(options);
  if (fs.existsSync(path.join(root, "project.json"))) return true;
  return PER_ID_COLLECTIONS.some((collection) => keysOnDisk(root, collection).length > 0);
}

// True when the SQLite DB exists and already holds at least one document — the signal that a prior
// migration (or live use) has populated it, so an auto-import should be skipped.
export function sqliteHasData(options = {}) {
  if (!fs.existsSync(databaseFile(options))) return false;
  const sqlite = sqlitePersistence(options);
  if (sqlite.get(PROJECT_COLLECTION, PROJECT_KEY)) return true;
  return PER_ID_COLLECTIONS.some((collection) => sqlite.list(collection).length > 0);
}

// Copy every JSON document into SQLite. Returns a per-collection count of imported documents. Pure
// copy: reads through the JSON backend, writes through the SQLite backend, touches no JSON file.
export function migrateJsonToSqlite(options = {}) {
  const root = storeRoot(options);
  const json = jsonPersistence(options);
  const sqlite = sqlitePersistence(options);
  const imported = {};

  // The project singleton first (project.json → (project, catalog)).
  if (fs.existsSync(path.join(root, "project.json"))) {
    const catalog = json.get(PROJECT_COLLECTION, PROJECT_KEY);
    if (catalog) {
      sqlite.set(PROJECT_COLLECTION, PROJECT_KEY, catalog);
      imported[PROJECT_COLLECTION] = 1;
    }
  }

  // Then every per-id store, file by file.
  for (const collection of PER_ID_COLLECTIONS) {
    let count = 0;
    for (const key of keysOnDisk(root, collection)) {
      const doc = json.get(collection, key);
      if (doc == null) continue;
      sqlite.set(collection, key, doc);
      count += 1;
    }
    if (count) imported[collection] = count;
  }

  return { imported, total: Object.values(imported).reduce((a, b) => a + b, 0) };
}

// Hand the boot hook to the persistence layer so a freshly opened, empty SQLite DB auto-imports any
// legacy JSON the first time a provider opens it (boot creates the first provider). Importing this
// module anywhere in the boot path — the server does, via the stores — arms the hook.
registerAutoMigrator(migrateIfNeeded);

// The boot hook: import once when the DB is empty but JSON exists. A populated DB or an empty home is
// left untouched. Returns { migrated: boolean, ...counts } so the server can log what happened.
export function migrateIfNeeded(options = {}) {
  if (sqliteHasData(options)) return { migrated: false, reason: "sqlite-populated" };
  if (!hasJsonToMigrate(options)) return { migrated: false, reason: "no-json" };
  const result = migrateJsonToSqlite(options);
  return { migrated: result.total > 0, ...result };
}

// CLI entry: `node brain/src/migrate-to-sqlite.mjs` runs a full import against the live home and
// prints what it copied. Safe to run repeatedly.
if (import.meta.url === `file://${process.argv[1]}`) {
  const result = migrateJsonToSqlite();
  // eslint-disable-next-line no-console
  console.log(`Imported ${result.total} document(s) into ${databaseFile()}:`);
  for (const [collection, count] of Object.entries(result.imported)) {
    // eslint-disable-next-line no-console
    console.log(`  ${collection}: ${count}`);
  }
  if (!result.total) console.log("  (nothing to import)");
}
