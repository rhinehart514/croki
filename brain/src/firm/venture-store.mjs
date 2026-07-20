// venture-store.mjs — one venture, one readable local directory (FIRM-SPEC.md firm rail #8:
// "A venture is a file. Local-first, readable, exportable.").
//
// Every durable record a venture holds — crew, bets, outcomes, decisions, settings, product-change
// history, conversation, and placement — is a JSON document
// addressed through persistence.mjs, scoped to that venture's own subdirectory under the product
// home (~/.gtm-ide/ventures/<ventureId>/ in production; an injectable root in tests, same
// convention as every other store in this tree). One venture never reads or writes another's
// directory: every call below is venture-scoped by construction, and a caller naming a venture that
// doesn't exist gets a closed failure rather than a silent cross-venture read.
//
// This is deliberately thin. persistence.mjs already gives atomic writes, revisioned
// compareAndSet, and a list() scan; venture-store.mjs only resolves *which* directory a venture's
// documents live in and shapes the venture's own manifest record. It invents no new persistence
// mechanism and no revision ceremony beyond what persistence.mjs's CAS already provides.

import path from "node:path";
import crypto from "node:crypto";
import fs from "node:fs";
import { persistence, storeRoot as persistenceStoreRoot } from "../persistence.mjs";
import { safeId } from "../store-fs.mjs";
import { teammateSoulStore } from "../teammate-soul-store.mjs";
// founding-crew → crew → venture-store forms an ES module cycle; it is safe because seedFoundingCrew is a
// live binding only *called* at runtime (createVenture), never at module load. crew.mjs likewise only uses
// venture-store's exports at call time.
import { seedFoundingCrew } from "./founding-crew.mjs";

export { safeId };

export function now() {
  return new Date().toISOString();
}

function genId(prefix) {
  const stamp = now().replace(/\D/g, "").slice(0, 14);
  return `${prefix}-${stamp}-${crypto.randomBytes(4).toString("hex")}`;
}

// The manifest collection lives at the product home (one row per venture, so listVentures() and
// createVenture() don't need to scan every venture's own subdirectory to find out what exists).
const MANIFEST_COLLECTION = "ventures";

// A venture's own documents live one level down, rooted at
// ventures/<ventureId>/ under the same product home. Each is its own persistence collection so
// persistence.mjs's list()/get() work unmodified — only the physical root differs from a flat store.
export const VENTURE_COLLECTIONS = Object.freeze([
  "crew",
  "bets",
  "outcomes",
  "decisions",
  "settings",
  "productChanges",
  "codeWorkspaces",
  "conversation",
  "placement",
  "configuration",
  "architecture",
  "grants",
  "receipts",
  // Law 12 — saved live views + snapshots (a WAY OF LOOKING at the venture, never a copy of it). Each
  // view record's `.id` IS its storage key, so importVenture (storageKeyFor) round-trips it unchanged.
  "views",
  // Law 11/12 — a finding promoted OUT of a temporary view into durable venture truth, carrying the
  // source-view ref as provenance. Promotion is the intentional act that lets a useful question persist.
  "findings",
]);

function ventureRoot(options, ventureId) {
  return path.join(persistenceStoreRoot(options), "ventures", safeId(ventureId));
}

// The persistence provider scoped to one venture's directory. Every read/write in this module (and
// in bet.mjs/crew.mjs callers that accept `{ ventureId, root }`-shaped options) goes through this,
// so a venture's documents can never land under a sibling venture's directory or the shared root.
// Exported so a module needing a CAS write venture-store itself has no opinion on (lens.mjs's
// placement document) can reach the same scoped provider rather than re-deriving the path convention.
export function venturePersistence(options, ventureId) {
  if (!safeId(ventureId) || safeId(ventureId) === "default") {
    throw new Error("A venture operation requires a real ventureId.");
  }
  return persistence({ ...options, root: ventureRoot(options, ventureId) });
}

function manifestPersistence(options) {
  return persistence(options);
}

function normalizeManifest(input = {}) {
  const createdAt = input.createdAt || now();
  const name = String(input.name ?? "").trim();
  if (!name) throw new Error("A venture needs a name.");
  const requestedRepository = String(input.repository ?? input.repo ?? process.cwd()).trim();
  if (!requestedRepository) throw new Error("A venture needs a product repository.");
  const resolvedRepository = path.resolve(requestedRepository);
  if (!fs.existsSync(resolvedRepository) || !fs.statSync(resolvedRepository).isDirectory()) {
    throw new Error(`The venture's product repository does not exist: ${resolvedRepository}`);
  }
  const repository = fs.realpathSync(resolvedRepository);
  return {
    id: input.id || genId("venture"),
    name,
    repository,
    createdAt,
    updatedAt: input.updatedAt || createdAt,
  };
}

// Create a venture: writes its manifest at the product home and returns the manifest. The venture's own
// subdirectory is created lazily on first document write (persistence.mjs's atomic write already mkdir -p's
// the collection directory).
//
// The product venture-create route (lens-routes.mjs) passes `{ seedFoundingCrew: false }`: a new founder
// venture must not silently imply a pre-existing crew (Product Law 1). It opens with connected Claude/Codex
// runtime capability and no persistent specialist; the first founder direction forms the first participant
// explicitly (ensureInitialFirmParticipant / the work-loop first-participant path).
//
// The legacy fictional founding crew (Yara/Mira/Soren/Kai as the SAME CHARACTERS across ventures) remains an
// explicit opt-in seam so existing seeded ventures stay readable and low-level tests can exercise a
// pre-populated roster. It is NOT the product default. `seedFoundingCrew` defaults to on only for that
// legacy/test convenience; the shipped product never reaches it.
export function createVenture(input = {}, options = {}) {
  const manifest = normalizeManifest(input);
  manifestPersistence(options).set(MANIFEST_COLLECTION, safeId(manifest.id), manifest);
  if (options.seedFoundingCrew !== false) seedFoundingCrew(manifest.id, options);
  return manifest;
}

// The venture's manifest, or null if it has never been created.
export function openVenture(ventureId, options = {}) {
  return manifestPersistence(options).get(MANIFEST_COLLECTION, safeId(ventureId)) ?? null;
}

// Every venture's manifest — the portfolio list (FIRM-SPEC.md scale axis 1: "a portfolio of isolated
// machines behind one decision wall").
export function listVentures(options = {}) {
  return manifestPersistence(options)
    .list(MANIFEST_COLLECTION)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

// Fail-closed guard for every read/write below: a caller naming a venture that was never created (or
// naming the wrong one for a record it's trying to reach) gets a real error, never an empty/ambient
// fallback that could be mistaken for "this venture just has no data yet".
function assertVentureExists(ventureId, options) {
  if (!openVenture(ventureId, options)) {
    const error = new Error(`No such venture: ${ventureId}`);
    error.code = "venture_not_found";
    throw error;
  }
}

// One document in one venture's own collection (crew/bets/decisions/placement), addressed by
// (ventureId, collection, key). Read and write both resolve through venturePersistence, so a record
// physically cannot be written into or read from a different venture's directory — there is no
// shared "documents" table a bad key could cross into.
export function getVentureDoc(ventureId, collection, key, options = {}) {
  assertVentureExists(ventureId, options);
  if (!VENTURE_COLLECTIONS.includes(collection)) {
    throw new Error(`Unknown venture collection: ${collection}`);
  }
  return venturePersistence(options, ventureId).get(collection, safeId(key)) ?? null;
}

export function setVentureDoc(ventureId, collection, key, value, options = {}) {
  assertVentureExists(ventureId, options);
  if (!VENTURE_COLLECTIONS.includes(collection)) {
    throw new Error(`Unknown venture collection: ${collection}`);
  }
  venturePersistence(options, ventureId).set(collection, safeId(key), value);
  return value;
}

export function listVentureDocs(ventureId, collection, options = {}) {
  assertVentureExists(ventureId, options);
  if (!VENTURE_COLLECTIONS.includes(collection)) {
    throw new Error(`Unknown venture collection: ${collection}`);
  }
  return venturePersistence(options, ventureId).list(collection);
}

// Export a venture: the manifest, every document in every venture-scoped collection, and this
// venture's own SOUL INSTANCES (F8 rail 8/6: a running venture is a file that resumes elsewhere) — as
// one plain object, the readable, transferable shape FIRM-SPEC.md's transfer axis rests on.
//
// Souls live in teammate-soul-store.mjs's OWN flat collection at the shared product home, not under
// ventures/<id>/ (crew.mjs deliberately never duplicates a soul into the venture tree — "there is
// exactly one place a teammate's memory lives"). listForVenture already filters to this venture's own
// instances, which structurally excludes the reusable TEMPLATE tier (teammate-soul-store.LIBRARY_VENTURE
// = "__library__", never a real ventureId) — so a template soul, the founder's cross-venture asset,
// never leaves with one venture's export. Credentials need no exclusion logic at all: credential-
// store.mjs keeps ONE universal document outside every venture's own collection list and outside this
// soul read, so a venture's bundle structurally cannot reach a credential — there is nothing to strip.
//
// Product-change review history is included, but live repository/worktree paths are not portable. The
// exported history is marked needs-rebind and strips those machine-local paths rather than pretending a
// destination machine can resume a worktree that does not exist there.
function stripMachinePaths(value) {
  if (Array.isArray(value)) return value.map(stripMachinePaths);
  if (!value || typeof value !== "object") return value;
  const portable = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key === "repo" || key === "worktree") continue;
    portable[key] = stripMachinePaths(entry);
  }
  return portable;
}

function portableProductChange(value) {
  return { ...stripMachinePaths(value), transferState: "needs-rebind" };
}

export function exportVenture(ventureId, options = {}) {
  const manifest = openVenture(ventureId, options);
  if (!manifest) throw new Error(`No such venture: ${ventureId}`);
  const documents = {};
  for (const collection of VENTURE_COLLECTIONS) {
    const docs = venturePersistence(options, ventureId).list(collection);
    documents[collection] = ["productChanges", "codeWorkspaces"].includes(collection) ? docs.map(portableProductChange) : docs;
  }
  const souls = teammateSoulStore.listForVenture(ventureId, options);
  return { manifest, documents, souls };
}

// The fixed-key SINGLETON documents that live inside an otherwise per-id venture collection: crew.mjs's
// roster ("roster") and lens.mjs's placement canvas ("canvas") are each the one document their
// collection ever holds, addressed by a constant, not their own `.id` (a roster/placement document
// carries no `id` field at all — it IS the collection's single row). The prior import loop wrote back
// only `doc.id`-bearing documents, so both singletons were silently dropped on every import — crew and
// placement never actually round-tripped despite being listed in VENTURE_COLLECTIONS. Fixed here by
// resolving each document's real storage key: its own `.id` when it has one (bets, decisions), else the
// known singleton key for that specific collection.
const SINGLETON_KEYS = { crew: "roster", placement: "canvas", configuration: "firm", architecture: "atlas" };

function storageKeyFor(collection, doc) {
  if (doc?.id) return safeId(doc.id);
  return SINGLETON_KEYS[collection] ?? null;
}

// Import a venture bundle produced by exportVenture — writes the manifest, every document, and every
// exported soul instance back, into a (possibly new) venture directory / product home. Used by the
// portfolio proof (F8) to move a running venture between machines; here only as the write half that
// keeps venture-store self-contained. Writing a bundle with no `souls` (an older export) is a no-op on
// that half, never an error — the bundle's own documents still round-trip in full.
export function importVenture(bundle, options = {}) {
  if (!bundle?.manifest?.id) throw new Error("A venture bundle needs a manifest with an id.");
  const manifest = normalizeManifest({ ...bundle.manifest, repository: options.repository ?? bundle.manifest.repository });
  manifestPersistence(options).set(MANIFEST_COLLECTION, safeId(manifest.id), manifest);
  const target = venturePersistence(options, manifest.id);
  for (const collection of VENTURE_COLLECTIONS) {
    for (const doc of bundle.documents?.[collection] ?? []) {
      const key = storageKeyFor(collection, doc);
      if (key) target.set(collection, key, doc);
    }
  }
  for (const soul of bundle.souls ?? []) {
    if (soul?.ref) teammateSoulStore.save({ ...soul, ventureId: manifest.id }, options);
  }
  return manifest;
}
