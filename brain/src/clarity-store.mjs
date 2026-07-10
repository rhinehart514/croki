import crypto from "node:crypto";
import { persistence } from "./persistence.mjs";
import { loadFounderDecisions } from "./feedback-ledger.mjs";

// Clarity — the durable output of an Ideate thinking-posture conversation. A founder pins a thought
// onto the canvas as one of four kinds: a claim, a direction, an icp, or an open question. It is real
// GTM state captured from the founder's own pins — NEVER seeded, never fabricated. The store mirrors
// the persistence conventions of person-store.mjs (atomic write, per-project JSON under
// ~/.gtm-ide/clarity/<projectId>.json, a sane list cap).
//
//   ClarityObject = { id, kind: "claim"|"direction"|"icp"|"question", text, note?, createdAt }

const SCHEMA_VERSION = 1;

// Cap the active working set. Referenced archived questions remain outside the cap so historical
// source records never acquire dangling question ids.
const MAX_CLARITY = 2000;

const CLARITY_KINDS = new Set(["claim", "direction", "icp", "question"]);

function now() {
  return new Date().toISOString();
}

function safeId(value) {
  return String(value || "default").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-|-$/g, "").slice(0, 90) || "default";
}

function trimOrNull(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function normalizeParticipantRefs(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  return list.flatMap((raw) => {
    if (!raw) return [];
    const ref = typeof raw === "string"
      ? { type: null, id: trimOrNull(raw) }
      : { type: trimOrNull(raw.type ?? raw.kind), id: trimOrNull(raw.id ?? raw.ref) };
    if (!ref.id) return [];
    const key = `${ref.type ?? ""}:${ref.id}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [ref];
  });
}

function normalizeRefs(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    if (!raw) continue;
    const ref = typeof raw === "string"
      ? { type: null, id: trimOrNull(raw) }
      : { type: trimOrNull(raw.type ?? raw.kind), id: trimOrNull(raw.id ?? raw.ref) };
    if (!ref.id) continue;
    const key = `${ref.type ?? ""}:${ref.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ref);
  }
  return out;
}

function normalizeClarityItem(item) {
  if (!item || typeof item !== "object" || item.kind !== "question") return item;
  return {
    ...item,
    status: trimOrNull(item.status) ?? "open",
    updatedAt: item.updatedAt ?? item.createdAt ?? null,
    participantRefs: normalizeParticipantRefs(item.participantRefs),
    evidenceRefs: normalizeRefs(item.evidenceRefs),
    productRefs: normalizeRefs(item.productRefs),
  };
}

const COLLECTION = "clarity";

function emptyStore(projectId) {
  return { schemaVersion: SCHEMA_VERSION, projectId, items: [] };
}

function loadStore(projectId, options = {}) {
  const stored = persistence(options).get(COLLECTION, safeId(projectId));
  if (!stored) return emptyStore(projectId);
  if (stored?.schemaVersion === SCHEMA_VERSION && Array.isArray(stored.items)) {
    return { ...stored, projectId, items: stored.items.map(normalizeClarityItem).filter(Boolean) };
  }
  return {
    ...emptyStore(projectId),
    ...stored,
    schemaVersion: SCHEMA_VERSION,
    items: Array.isArray(stored?.items) ? stored.items.map(normalizeClarityItem).filter(Boolean) : [],
  };
}

function saveStore(store, options = {}) {
  const items = Array.isArray(store.items) ? store.items.map(normalizeClarityItem).filter(Boolean) : [];
  const active = items.filter((item) => item?.status !== "archived").slice(-MAX_CLARITY);
  const activeIds = new Set(active.map((item) => item.id));
  const durable = {
    ...store,
    schemaVersion: SCHEMA_VERSION,
    items: items.filter((item) => item?.status === "archived" || activeIds.has(item.id)),
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

  const createdAt = now();
  const item = normalizeClarityItem({
    id: trimOrNull(input?.id) ?? `clarity-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
    kind,
    text,
    ...(note ? { note } : {}),
    createdAt,
    ...(kind === "question" ? {
      status: trimOrNull(input?.status) ?? "open",
      updatedAt: createdAt,
      participantRefs: input?.participantRefs,
      evidenceRefs: input?.evidenceRefs,
      productRefs: input?.productRefs,
    } : {}),
  });
  const store = loadStore(projectId, options);
  const existing = store.items.find((candidate) => candidate.id === item.id);
  if (existing) {
    if (existing.kind === item.kind && existing.text === item.text) return existing;
    throw new Error(`Clarity object ${item.id} already exists; update it instead of replacing its history.`);
  }
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
  const items = loadClarity(projectId, options)
    .filter((item) => item.kind !== "question" || !["archived", "closed"].includes(item.status));
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

// Update a pin without changing its stable id or creation receipt. Question refs remain optional and
// open; their completeness never gates a pipeline.
export function updateClarity(projectId = "default", itemId, patch = {}, options = {}) {
  const store = loadStore(projectId, options);
  const index = store.items.findIndex((item) => item.id === itemId);
  if (index === -1) return null;
  const current = store.items[index];
  const text = patch.text === undefined ? current.text : String(patch.text ?? "").trim();
  if (!text) throw new Error("Clarity text is required.");
  const note = patch.note === undefined ? current.note : String(patch.note ?? "").trim();
  const updated = { ...current, text, ...(note ? { note } : {}), updatedAt: now() };
  if (!note) delete updated.note;
  if (current.kind === "question") {
    if (patch.status !== undefined) updated.status = trimOrNull(patch.status) ?? current.status ?? "open";
    if (patch.participantRefs !== undefined) updated.participantRefs = normalizeParticipantRefs(patch.participantRefs);
    if (patch.evidenceRefs !== undefined) updated.evidenceRefs = normalizeRefs(patch.evidenceRefs);
    if (patch.productRefs !== undefined) updated.productRefs = normalizeRefs(patch.productRefs);
    if (updated.status !== "archived") delete updated.archivedAt;
  }
  store.items[index] = normalizeClarityItem(updated);
  saveStore(store, options);
  return store.items[index];
}

function isQuestionReferenced(projectId, questionId, options) {
  if (Array.isArray(options.referencedQuestionIds) && options.referencedQuestionIds.includes(questionId)) return true;
  if (typeof options.isClarityReferenced === "function" && options.isClarityReferenced(questionId, projectId)) return true;
  try { return loadFounderDecisions(projectId, options).some((receipt) => receipt?.questionId === questionId); }
  catch { return false; }
}

function belongsToProject(record, projectId) {
  return record?.projectId == null || record.projectId === projectId;
}

function sourceRefFor(record, fallbackType) {
  return normalizeRefs(record?.sourceRef ? [record.sourceRef] : [{
    type: record?.sourceType ?? record?.type ?? record?.kind ?? fallbackType,
    id: record?.id,
  }])[0] ?? null;
}

function normalizeTransientQuestion(record, projectId) {
  if (!record || !belongsToProject(record, projectId)) return null;
  const sourceRef = sourceRefFor(record, "operator-question");
  const text = trimOrNull(record.question ?? record.text);
  if (!sourceRef || !text) return null;
  return {
    id: trimOrNull(record.id) ?? `${sourceRef.type ?? "artifact"}:${sourceRef.id}`,
    projectId,
    kind: "question",
    text,
    status: trimOrNull(record.status) ?? "transient",
    pinned: false,
    sourceRef,
    participantRefs: normalizeParticipantRefs(record.participantRefs),
    evidenceRefs: normalizeRefs(record.evidenceRefs),
    productRefs: normalizeRefs(record.productRefs),
    createdAt: record.createdAt ?? null,
    updatedAt: record.updatedAt ?? record.createdAt ?? null,
  };
}

function normalizePosition(record, projectId) {
  if (!record || !belongsToProject(record, projectId)) return null;
  const questionId = trimOrNull(record.questionId);
  const sourceRef = sourceRefFor(record, "artifact");
  const statement = trimOrNull(record.statement ?? record.claim ?? record.text);
  if (!questionId || !sourceRef || !statement) return null;
  const participantRef = normalizeParticipantRefs([
    record.participantRef ?? record.agentRef ?? record.teammateRef,
  ])[0] ?? null;
  return {
    id: trimOrNull(record.id) ?? `${sourceRef.type ?? "artifact"}:${sourceRef.id}`,
    questionId,
    ...(participantRef ? { participantRef } : {}),
    statement,
    sourceRef,
    evidenceRefs: normalizeRefs(record.evidenceRefs),
    ...(trimOrNull(record.provenance) ? { provenance: trimOrNull(record.provenance) } : {}),
    ...(trimOrNull(record.relation ?? record.stance) ? { relation: trimOrNull(record.relation ?? record.stance) } : {}),
    ...(record.uncertainty != null ? { uncertainty: record.uncertainty } : {}),
    ...(record.unknowns != null ? { unknowns: record.unknowns } : {}),
    ...(record.recommendation != null ? { recommendation: record.recommendation } : {}),
    ...(record.falsifier != null || record.whatWouldChangeMyMind != null
      ? { falsifier: record.falsifier ?? record.whatWouldChangeMyMind } : {}),
    createdAt: record.createdAt ?? null,
  };
}

function normalizeBacklink(record, projectId) {
  if (!record || !belongsToProject(record, projectId)) return null;
  const questionId = trimOrNull(record.questionId);
  if (!questionId) return null;
  const ref = sourceRefFor(record, "record");
  return ref ? { questionId, ref } : null;
}

// Pure read projection over pinned clarity plus caller-supplied operator/run artifacts. It preserves
// every attributed position as its own branch and reverse-joins source-owned backlinks; it stores no
// transient question, contribution, consensus, or fuzzy judgment.
export function projectQuestions(projectId = "default", {
  transientQuestions = [], positions = [], sourceRecords = [],
} = {}, options = {}) {
  const pinned = loadClarity(projectId, options).filter((item) => item.kind === "question").map((item) => ({
    ...item, projectId, pinned: true, sourceRef: { type: "clarity", id: item.id },
  }));
  const pinnedIds = new Set(pinned.map((item) => item.id));
  const transient = (Array.isArray(transientQuestions) ? transientQuestions : [])
    .map((item) => normalizeTransientQuestion(item, projectId)).filter((item) => item && !pinnedIds.has(item.id));
  const projectedPositions = (Array.isArray(positions) ? positions : [])
    .map((item) => normalizePosition(item, projectId)).filter(Boolean);
  const decisionSources = loadFounderDecisions(projectId, options).map((receipt) => ({
    id: receipt.id, projectId: receipt.projectId, questionId: receipt.questionId,
    sourceRef: { type: "decision", id: receipt.id },
  }));
  const backlinks = [...(Array.isArray(sourceRecords) ? sourceRecords : []), ...decisionSources]
    .map((item) => normalizeBacklink(item, projectId)).filter(Boolean);

  return [...pinned, ...transient].map((question) => {
    const questionPositions = projectedPositions.filter((item) => item.questionId === question.id);
    const seen = new Set();
    const questionBacklinks = backlinks.filter((item) => item.questionId === question.id).flatMap((item) => {
      const key = `${item.ref.type ?? ""}:${item.ref.id}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [item.ref];
    });
    return {
      ...question,
      positions: questionPositions,
      relevantParticipantRefs: normalizeParticipantRefs([
        ...question.participantRefs, ...questionPositions.map((item) => item.participantRef),
      ]),
      backlinks: questionBacklinks,
    };
  });
}

// Unpin a clarity object by id. Returns true when one was removed, false when the id was unknown.
export function removeClarity(projectId = "default", itemId, options = {}) {
  const store = loadStore(projectId, options);
  const existing = store.items.find((item) => item.id === itemId);
  if (!existing) return false;
  if (existing.kind === "question" && isQuestionReferenced(projectId, itemId, options)) {
    if (existing.status === "archived") return true;
    const archivedAt = now();
    store.items = store.items.map((item) => item.id === itemId
      ? normalizeClarityItem({ ...item, status: "archived", archivedAt, updatedAt: archivedAt }) : item);
    saveStore(store, options);
    return true;
  }
  const next = store.items.filter((item) => item.id !== itemId);
  store.items = next;
  saveStore(store, options);
  return true;
}
