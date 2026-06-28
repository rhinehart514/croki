import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Clarity — the durable output of an Ideate thinking-posture conversation. A founder pins a thought
// onto the canvas as one of four kinds: a claim, a direction, an icp, or an open question. It is real
// GTM state captured from the founder's own pins — NEVER seeded, never fabricated. The store mirrors
// the persistence conventions of person-store.mjs (atomic write, per-project JSON under
// ~/.gtm-ide/clarity/<projectId>.json, a sane list cap).
//
//   ClarityObject = { id, kind: "claim"|"direction"|"icp"|"question", text, note?, createdAt }

const SCHEMA_VERSION = 1;

// Cap the durable list so an unbounded pin history can never blow up a project file.
const MAX_CLARITY = 2000;

const CLARITY_KINDS = new Set(["claim", "direction", "icp", "question"]);

function now() {
  return new Date().toISOString();
}

function root(options = {}) {
  return options.root || process.env.GTM_IDE_HOME || path.join(os.homedir(), ".gtm-ide");
}

function safeId(value) {
  return String(value || "default").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-|-$/g, "").slice(0, 90) || "default";
}

function fileFor(projectId, options = {}) {
  return path.join(root(options), "clarity", `${safeId(projectId)}.json`);
}

function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

function emptyStore(projectId) {
  return { schemaVersion: SCHEMA_VERSION, projectId, items: [] };
}

function loadStore(projectId, options = {}) {
  const file = fileFor(projectId, options);
  if (!fs.existsSync(file)) return emptyStore(projectId);
  const stored = JSON.parse(fs.readFileSync(file, "utf8"));
  if (stored?.schemaVersion === SCHEMA_VERSION && Array.isArray(stored.items)) return stored;
  return {
    ...emptyStore(projectId),
    ...stored,
    schemaVersion: SCHEMA_VERSION,
    items: Array.isArray(stored?.items) ? stored.items : [],
  };
}

function saveStore(store, options = {}) {
  const durable = {
    ...store,
    schemaVersion: SCHEMA_VERSION,
    items: Array.isArray(store.items) ? store.items.slice(-MAX_CLARITY) : [],
  };
  write(fileFor(durable.projectId, options), durable);
  return durable;
}

// ── Public API ───────────────────────────────────────────────────────────────────────────────────

// List a project's pinned clarity objects, oldest first.
export function loadClarity(projectId = "default", options = {}) {
  return loadStore(projectId, options).items;
}

// Pin one clarity object. Validates kind is one of the four and text is non-empty, then stamps a
// stable id and createdAt. `note` is optional and trimmed; omitted when blank. Returns the stored
// ClarityObject. Throws on a bad kind or empty text so the canvas can never persist a malformed pin.
export function addClarity(projectId = "default", input = {}, options = {}) {
  const kind = String(input?.kind ?? "").trim();
  if (!CLARITY_KINDS.has(kind)) {
    throw new Error(`Invalid clarity kind: ${kind || "(empty)"}. Expected one of claim, direction, icp, question.`);
  }
  const text = String(input?.text ?? "").trim();
  if (!text) throw new Error("Clarity text is required.");
  const note = String(input?.note ?? "").trim();

  const item = {
    id: `clarity-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
    kind,
    text,
    ...(note ? { note } : {}),
    createdAt: now(),
  };
  const store = loadStore(projectId, options);
  store.items.push(item);
  saveStore(store, options);
  return item;
}

// Unpin a clarity object by id. Returns true when one was removed, false when the id was unknown.
export function removeClarity(projectId = "default", itemId, options = {}) {
  const store = loadStore(projectId, options);
  const next = store.items.filter((item) => item.id !== itemId);
  if (next.length === store.items.length) return false;
  store.items = next;
  saveStore(store, options);
  return true;
}
