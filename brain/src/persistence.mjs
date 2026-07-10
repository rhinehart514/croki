// The persistence provider — one interface, two backends, behind which every durable JSON store
// in brain/ now reads and writes. Phase 2 makes SQLite the real local database; the JSON-file
// behavior is retained verbatim for reading legacy data and as a fallback.
//
// THE MODEL: a (collection, key) pair addresses one durable document.
//
//   - A PER-ID store (flows/<graphId>.json, operator-sessions/<id>.json, programs/<projectId>.json,
//     people/<projectId>.json, …) maps to collection = the directory name, key = the file basename
//     without ".json". A per-project store is simply a per-id store whose id is the projectId.
//   - A SINGLETON store (project.json — one catalog object at the root) maps to a collection name
//     ("project") and a fixed singleton key ("catalog"). The JSON backend keeps writing the same
//     project.json on disk so legacy readers and the migrator see exactly the old layout.
//
// THE SQLITE BACKEND (default) is a single key-value table: (collection, key, json), primary-keyed
// on (collection, key) with an index on collection so list() is a cheap indexed scan. The whole
// document is stored as one JSON text blob — the stores already serialize/deserialize whole objects,
// so nothing about their shape changes.
//
// THE JSON BACKEND is the CURRENT behavior, lifted out of the stores: atomic temp-file + rename into
// ~/.gtm-ide/<collection>/<key>.json (or ~/.gtm-ide/project.json for the project singleton), with the
// same Convex write-behind mirror the old store-fs.atomicWrite carried.
//
// Backend selection: GTM_IDE_PERSISTENCE = "sqlite" (default) | "json". The provider is created per
// call from the resolved storeRoot, so a test passing { root } gets an isolated backend rooted there
// and the real ~/.gtm-ide is never touched.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

// Resolves better-sqlite3 from brain/node_modules exactly as a CommonJS require would. Bound once at
// module load; the native module itself is only required inside openDatabase, so a json-only run
// never actually loads it.
const require = createRequire(import.meta.url);

// The on-disk home for all durable state. Mirrors store-fs.storeRoot exactly: a test passes
// { root }; otherwise GTM_IDE_HOME or ~/.gtm-ide.
export function storeRoot(options = {}) {
  return options.root || process.env.GTM_IDE_HOME || path.join(os.homedir(), ".gtm-ide");
}

// The project singleton lives at the root as project.json (not in a per-collection directory), so it
// needs its own (collection, key) address. Every other store is per-id under a directory.
export const PROJECT_COLLECTION = "project";
export const PROJECT_KEY = "catalog";

// The default SQLite database file, alongside the JSON it supersedes.
export function databaseFile(options = {}) {
  return path.join(storeRoot(options), "gtm-ide.db");
}

function resolveBackendName(options = {}) {
  const requested = String(options.backend || process.env.GTM_IDE_PERSISTENCE || "sqlite").toLowerCase();
  if (requested === "json") return "json";
  if (requested === "convex") return "convex";
  // Auto-select Convex when a team deployment is configured, unless a backend was named explicitly.
  // GTM_IDE_CONVEX_URL is the team sync switch: set it and the project becomes shared; unset (the
  // default) and the engine is plain local-first SQLite. An explicit options.backend always wins so a
  // test or migrator can pin SQLite even with a Convex URL in the environment.
  if (!options.backend && (options.convexUrl || process.env.GTM_IDE_CONVEX_URL)) return "convex";
  return "sqlite";
}

// The Convex backend lives in convex-backend.mjs, which imports THIS module (it wraps a SQLite backend),
// so persistence cannot import it back without an ESM cycle. It registers its factory here at import
// time — the same hook pattern the SQLite migrator uses — and the server's boot path imports
// convex-backend before serving, so the hook is live by the time any provider is selected. Until
// registered, asking for the Convex backend throws a clear error rather than silently downgrading.
let convexBackendFactory = null;
export function registerConvexBackend(fn) {
  convexBackendFactory = typeof fn === "function" ? fn : null;
}

// ── The JSON file backend — the CURRENT behavior, unchanged ─────────────────────────────────────

// The on-disk file for a (collection, key). The project singleton stays project.json at the root so
// the layout legacy readers and the migrator expect is preserved byte-for-byte.
function jsonFileFor(root, collection, key) {
  if (collection === PROJECT_COLLECTION) return path.join(root, "project.json");
  return path.join(root, collection, `${key}.json`);
}

// Durable write: serialize to a per-process temp file, then atomically rename into place so a crash
// mid-write can never leave a half-written store on disk. Pure local write — the team-sync mirror is
// applied separately (by the selected JSON backend) through the single seam.
function atomicWriteFile(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

// Mirror a JSON-backend write to the team's single write-behind queue — the ONE mirror implementation,
// in convex-backend.mjs (the SQLite-era seam). The dynamic import both breaks the import cycle
// (convex-backend imports THIS module) and keeps a local-only engine from ever loading the sync layer.
// Guarded by the team-sync env switch so the default (no team) is zero network and loads no extra
// modules. Only the explicitly-selected JSON backend mirrors; the legacy JSON backend embedded inside
// the SQLite backend does not (the Convex backend that wraps SQLite owns that mirror), so a write is
// never pushed twice.
function mirrorJsonWrite(op, collection, key, data) {
  if (!(process.env.GTM_IDE_CONVEX_URL && process.env.GTM_IDE_TEAM_ID)) return;
  import("./convex-backend.mjs")
    .then((m) => (op === "delete" ? m.enqueueDelete(collection, key) : m.enqueueDocument(collection, key, data)))
    .catch(() => {});
}

function createJsonBackend(root, { mirror = false } = {}) {
  return {
    name: "json",
    get(collection, key) {
      const file = jsonFileFor(root, collection, key);
      if (!fs.existsSync(file)) return null;
      try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
      } catch {
        return null;
      }
    },
    set(collection, key, data) {
      atomicWriteFile(jsonFileFor(root, collection, key), data);
      if (mirror) mirrorJsonWrite("set", collection, key, data);
      return data;
    },
    list(collection) {
      if (collection === PROJECT_COLLECTION) {
        const file = jsonFileFor(root, collection, PROJECT_KEY);
        if (!fs.existsSync(file)) return [];
        try {
          return [JSON.parse(fs.readFileSync(file, "utf8"))];
        } catch {
          return [];
        }
      }
      const dir = path.join(root, collection);
      if (!fs.existsSync(dir)) return [];
      const out = [];
      for (const entry of fs.readdirSync(dir)) {
        if (!entry.endsWith(".json")) continue;
        try {
          out.push(JSON.parse(fs.readFileSync(path.join(dir, entry), "utf8")));
        } catch {
          // skip unreadable / half-written files, same tolerance the old listers had
        }
      }
      return out;
    },
    delete(collection, key) {
      const file = jsonFileFor(root, collection, key);
      const removed = fs.existsSync(file);
      if (removed) fs.rmSync(file);
      // Mirror the delete regardless of whether this machine still held the file — a remote remove is
      // idempotent, and a cross-machine delete must propagate even when the local copy was already gone.
      if (mirror) mirrorJsonWrite("delete", collection, key);
      return removed;
    },
  };
}

// ── The SQLite backend (default) — one key-value table ──────────────────────────────────────────

// One database connection per root, cached, so repeated provider() calls in one process reuse the
// same handle instead of re-opening the file (which would defeat WAL and churn file handles).
const dbCache = new Map();

function openDatabase(root) {
  if (dbCache.has(root)) return dbCache.get(root);
  // Required here (not at module top) so a json-only run never loads the native module.
  const Database = require("better-sqlite3");
  fs.mkdirSync(root, { recursive: true });
  const db = new Database(path.join(root, "gtm-ide.db"));
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      collection TEXT NOT NULL,
      key        TEXT NOT NULL,
      json       TEXT NOT NULL,
      PRIMARY KEY (collection, key)
    );
    CREATE INDEX IF NOT EXISTS idx_documents_collection ON documents(collection);
  `);
  dbCache.set(root, db);
  maybeAutoMigrate(root, db);
  return db;
}

// Auto-import legacy JSON into a freshly opened, empty SQLite DB — the "migrate on boot" hook,
// triggered the first time any process opens the database for a root (boot creates the first
// provider). Runs at most once per root per process, only when the DB has no documents yet, and is a
// no-op when there is no JSON to import. Opt out with GTM_IDE_AUTO_MIGRATE=0 (tests that want a bare
// SQLite DB set it). The import module is loaded dynamically to avoid an import cycle
// (migrate-to-sqlite imports this module) and never crashes the open: a migration failure leaves the
// DB usable and the JSON intact.
const autoMigrated = new Set();
function maybeAutoMigrate(root, db) {
  if (process.env.GTM_IDE_AUTO_MIGRATE === "0") return;
  if (autoMigrated.has(root)) return;
  autoMigrated.add(root);
  const count = db.prepare("SELECT COUNT(*) AS n FROM documents").get().n;
  if (count > 0) return; // already populated — never re-import over live data
  // Synchronous import via createRequire is not possible for an ESM module, so the importer is loaded
  // lazily here through a function the migrator registers (registerAutoMigrator). If nothing has
  // registered yet, the migrator simply hasn't been imported — boot imports it before serving, so the
  // hook is live by then. Best-effort: a failure leaves the DB usable and the JSON intact.
  if (autoMigrator) {
    try {
      autoMigrator({ root });
    } catch {
      /* migration is best-effort; the JSON stays as the rollback path */
    }
  }
}

// The migrator registers its migrateIfNeeded here at import time, breaking the import cycle without
// an async dynamic import: persistence does not import the migrator, the migrator imports persistence
// and hands its hook back. Until registered, the auto-migrate hook is a no-op.
let autoMigrator = null;
export function registerAutoMigrator(fn) {
  autoMigrator = typeof fn === "function" ? fn : null;
}

function createSqliteBackend(root) {
  const db = openDatabase(root);
  const getStmt = db.prepare("SELECT json FROM documents WHERE collection = ? AND key = ?");
  const setStmt = db.prepare(
    "INSERT INTO documents (collection, key, json) VALUES (?, ?, ?) " +
    "ON CONFLICT(collection, key) DO UPDATE SET json = excluded.json",
  );
  const listStmt = db.prepare("SELECT collection, key, json FROM documents WHERE collection = ?");
  const deleteStmt = db.prepare("DELETE FROM documents WHERE collection = ? AND key = ?");

  // The legacy JSON on disk, read through the JSON backend. SQLite is authoritative; this is the
  // read-through fallback that lets a document still in the JSON era (not yet migrated) be read. It
  // is read-only here — writes always go to SQLite, so the first write of a legacy document promotes
  // it into the DB and the fallback stops mattering for that key.
  const legacy = createJsonBackend(root);

  // Map a SQLite collection back to its on-disk directory so list() can discover legacy keys not yet
  // in the DB. For the project singleton the JSON backend already handles project.json.
  function legacyKeysFor(collection) {
    if (collection === PROJECT_COLLECTION) {
      return legacy.get(PROJECT_COLLECTION, PROJECT_KEY) ? [PROJECT_KEY] : [];
    }
    const dir = path.join(root, collection);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter((entry) => entry.endsWith(".json"))
      .map((entry) => entry.slice(0, -".json".length));
  }

  return {
    name: "sqlite",
    get(collection, key) {
      const row = getStmt.get(collection, key);
      if (row) {
        try {
          return JSON.parse(row.json);
        } catch {
          return null;
        }
      }
      // Read-through to legacy JSON for a document not yet migrated into the DB.
      return legacy.get(collection, key);
    },
    set(collection, key, data) {
      setStmt.run(collection, key, JSON.stringify(data));
      return data;
    },
    list(collection) {
      const out = [];
      const seenKeys = new Set();
      for (const row of listStmt.all(collection)) {
        seenKeys.add(row.key);
        try {
          out.push(JSON.parse(row.json));
        } catch {
          // skip a corrupt row rather than failing the whole list
        }
      }
      // Union in any legacy JSON documents not yet present in the DB, so a list never hides
      // unmigrated data. A key already in SQLite wins (it is the migrated / current copy).
      for (const key of legacyKeysFor(collection)) {
        if (seenKeys.has(key)) continue;
        const doc = legacy.get(collection, key);
        if (doc != null) out.push(doc);
      }
      return out;
    },
    delete(collection, key) {
      const info = deleteStmt.run(collection, key);
      // Also drop the legacy JSON so a deleted document cannot resurface through the read-through
      // fallback. Returns true when either backend held the document (a real removal occurred).
      const legacyRemoved = legacy.delete(collection, key);
      return info.changes > 0 || legacyRemoved;
    },
  };
}

// ── In-process document cache ─────────────────────────────────────────────────────────────────────
//
// Every get(collection, key) below re-reads and JSON.parses the whole document blob. Within a SINGLE
// board request the same flow blob is parsed 8+ times; this cache parses it once. Correctness rests on
// total write-through invalidation: because the persistence() provider is the ONLY runtime write path
// (the migrator and boot hydration use it too — createConvexBackend's local base IS persistence({backend:
// "sqlite"})), every set/delete updates or evicts the entry in lockstep, so the cache can never serve a
// value older than the last write in this process.
//
// The cache is keyed by root (the physical store location); all backends for one root — sqlite, its
// legacy-json read-through, the convex wrapper, the explicit json backend — address the SAME logical
// documents, so one map per root is coherent. Values are stored PARSED. The current behavior already
// returns a fresh JSON.parse object on every get, so callers freely mutate what they receive; the cache
// preserves that exact contract by handing back a structuredClone on every get and storing a
// structuredClone on every set. The cached copy is therefore pristine and never shares a reference with
// any caller — a mutation downstream cannot bleed into the cache or across reads.
const docCache = new Map(); // root -> Map(`${collection} ${key}` -> parsed value | null)

function cacheMapFor(root) {
  let map = docCache.get(root);
  if (!map) {
    map = new Map();
    docCache.set(root, map);
  }
  return map;
}

function withDocumentCache(backend, root) {
  const cache = cacheMapFor(root);
  return {
    // Preserve any extra surface a backend exposes (e.g. convex's `mirror` / `hydrate`).
    ...backend,
    name: backend.name,
    get(collection, key) {
      const ck = `${collection} ${key}`;
      if (cache.has(ck)) {
        const hit = cache.get(ck);
        return hit == null ? null : structuredClone(hit);
      }
      const value = backend.get(collection, key);
      // The backend just produced this object (a fresh JSON.parse); no one else references it, so it is
      // safe to hold as the pristine cached copy. The caller gets a clone.
      cache.set(ck, value == null ? null : value);
      return value == null ? null : structuredClone(value);
    },
    // Re-read one document from the selected backend and replace the process-local cache entry. MCP
    // servers run out of process, so their durable writes are invisible to this map until a caller
    // explicitly crosses that boundary. Normal in-process reads keep using get() and its hot cache.
    getFresh(collection, key) {
      const ck = `${collection} ${key}`;
      const value = backend.get(collection, key);
      cache.set(ck, value == null ? null : value);
      return value == null ? null : structuredClone(value);
    },
    set(collection, key, data) {
      const stored = backend.set(collection, key, data);
      // Store a pristine copy so a later mutation of `data` by the caller cannot bleed into the cache.
      cache.set(`${collection} ${key}`, stored == null ? null : structuredClone(stored));
      return stored;
    },
    list(collection) {
      // Not cached: list() unions in legacy on-disk keys and its result changes on any set/delete within
      // the collection. Left as a fresh read so it is never stale; the per-key get() cache is untouched.
      return backend.list(collection);
    },
    delete(collection, key) {
      const removed = backend.delete(collection, key);
      // Negative-cache the now-absent key so a subsequent get() short-circuits to null without a read.
      cache.set(`${collection} ${key}`, null);
      return removed;
    },
  };
}

// ── The provider — one interface over the selected backend ──────────────────────────────────────

// get(collection, key)        → the stored document, or null when absent.
// set(collection, key, data)  → persists data, returns data.
// list(collection)            → array of every document in the collection (order not guaranteed).
// delete(collection, key)     → true when a document was removed, false when none existed.
//
// Created per call from the resolved root so { root } in tests is fully isolated. Cheap: the SQLite
// handle is cached per root, the JSON backend is stateless, and the per-root document cache is shared
// across calls so repeated reads within one request are served from memory.
export function persistence(options = {}) {
  const root = storeRoot(options);
  return withDocumentCache(selectBackend(options, root), root);
}

function selectBackend(options, root) {
  const backendName = resolveBackendName(options);
  // The explicitly-selected JSON backend is a primary store, so it mirrors team writes through the one
  // seam. (The JSON backend embedded inside the SQLite backend, below, is read-through legacy only and
  // never mirrors — the Convex wrapper owns SQLite's mirror.)
  if (backendName === "json") return createJsonBackend(root, { mirror: true });
  if (backendName === "convex") {
    // The Convex backend wraps a local SQLite backend and mirrors writes to the team deployment, so the
    // synchronous provider contract is preserved and the local-first base never breaks. If its factory
    // hasn't been registered (convex-backend not imported in this process) or the wrap fails, fall back
    // to plain SQLite rather than crash every store — the engine stays runnable, just unshared.
    if (convexBackendFactory) {
      try {
        return convexBackendFactory({ ...options, root });
      } catch (error) {
        if (options.backend === "convex") throw error;
        // best-effort: an explicit convex pin throws; an env-driven auto-select degrades to SQLite.
      }
    } else if (options.backend === "convex") {
      throw new Error(
        "Convex backend requested but not registered — import ./convex-backend.mjs before selecting it",
      );
    }
  }
  try {
    return createSqliteBackend(root);
  } catch (error) {
    // If the native module is unavailable at runtime, fall back to JSON rather than crash every
    // store. This keeps the product runnable; the migrator and tests detect the real backend.
    if (process.env.GTM_IDE_PERSISTENCE === "sqlite") throw error;
    return createJsonBackend(root);
  }
}

// The JSON backend explicitly — the migrator reads legacy data through this regardless of the
// active default backend.
export function jsonPersistence(options = {}) {
  return createJsonBackend(storeRoot(options));
}

// The SQLite backend explicitly — the migrator writes through this.
export function sqlitePersistence(options = {}) {
  return createSqliteBackend(storeRoot(options));
}

// Test/maintenance helper: drop the cached connection for a root so a fresh provider re-opens the
// file (used when a test deletes its temp home between runs).
export function closePersistence(options = {}) {
  const root = storeRoot(options);
  // Drop the in-process document cache for this root too, so a fresh provider re-reads from disk.
  docCache.delete(root);
  const db = dbCache.get(root);
  if (db) {
    try { db.close(); } catch { /* already closed */ }
    dbCache.delete(root);
  }
}
