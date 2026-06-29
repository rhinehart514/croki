import crypto from "node:crypto";
import { persistence } from "./persistence.mjs";

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

function safeId(value) {
  return String(value || "default").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-|-$/g, "").slice(0, 90) || "default";
}

const COLLECTION = "clarity";

function emptyStore(projectId) {
  return { schemaVersion: SCHEMA_VERSION, projectId, items: [] };
}

function loadStore(projectId, options = {}) {
  const stored = persistence(options).get(COLLECTION, safeId(projectId));
  if (!stored) return emptyStore(projectId);
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
  persistence(options).set(COLLECTION, safeId(durable.projectId), durable);
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

// Shape the project's pinned clarity for injection into composer grounding. Returns null when the
// founder has pinned nothing (so the caller can omit the section entirely rather than show an empty
// label). Otherwise returns founder INPUT — real direction the founder pinned, NEVER seeded or
// inferred — grouped by kind so the compose prompt can present it as explicit founder steering:
// claims to honor, the ICP, directions to take, and open questions to respect. Notes ride along.
// Doctrine: this is direction from the founder, not invented fact; the labels keep it honest.
export function clarityGrounding(projectId = "default", options = {}) {
  const items = loadClarity(projectId, options);
  if (!items.length) return null;
  const byKind = { claims: [], icp: [], directions: [], questions: [] };
  const bucket = { claim: "claims", icp: "icp", direction: "directions", question: "questions" };
  for (const item of items) {
    const target = byKind[bucket[item.kind]];
    if (!target) continue;
    target.push(item.note ? `${item.text} (${item.note})` : item.text);
  }
  const grounding = { source: "founder-pinned-clarity" };
  if (byKind.claims.length) grounding.claimsToHonor = byKind.claims;
  if (byKind.icp.length) grounding.icp = byKind.icp;
  if (byKind.directions.length) grounding.directions = byKind.directions;
  if (byKind.questions.length) grounding.openQuestions = byKind.questions;
  return grounding;
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
