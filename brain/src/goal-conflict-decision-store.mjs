import crypto from "node:crypto";
import { PersistenceConflictError, persistence } from "./persistence.mjs";

const COLLECTION = "goal-conflict-decisions";
const SCHEMA_VERSION = 1;
const RECEIPT_LIMIT = 256;
const RESOLUTIONS = new Set(["keep-separate", "choose-goal", "acknowledge-coexistence"]);

export class GoalConflictDecisionConflictError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "GoalConflictDecisionConflictError";
    this.code = "GOAL_CONFLICT_DECISION_CONFLICT";
    Object.assign(this, details);
  }
}

function clean(value) { return String(value ?? "").trim(); }
function required(value, label) {
  const result = clean(value);
  if (!result) throw new Error(`${label} is required.`);
  return result;
}
function clone(value) { return structuredClone(value); }
function at(options = {}) { return typeof options.now === "function" ? options.now() : new Date().toISOString(); }
function keyFor(projectId) { return encodeURIComponent(required(projectId, "projectId")); }
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function fingerprint(kind, value) { return crypto.createHash("sha256").update(`${kind}\0${stable(value)}`).digest("hex"); }
function normalizeRef(input, label) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error(`${label} must be a stable reference.`);
  return { type: required(input.type, `${label} type`).toLowerCase(), id: required(input.id, `${label} id`) };
}
function refKey(ref) { return `${ref.type}:${ref.id}`; }
function normalizeGoalRefs(input) {
  if (!Array.isArray(input) || input.length < 2) throw new Error("A conflict receipt must identify at least two goals.");
  const refs = input.map((ref) => normalizeRef(ref, "Conflict goal")).filter((ref) => ref.type === "goal");
  const unique = [...new Map(refs.map((ref) => [refKey(ref), ref])).values()].sort((a, b) => refKey(a).localeCompare(refKey(b)));
  if (unique.length < 2 || unique.length !== input.length) throw new Error("Conflict goalRefs must contain distinct goal references only.");
  return unique;
}
function normalizeFounder(input) {
  if (!input || typeof input !== "object" || Array.isArray(input) || clean(input.type).toLowerCase() !== "founder") {
    throw new Error("decidedBy must identify the founder.");
  }
  return { type: "founder", id: required(input.id, "Founder id") };
}
function empty(projectId) {
  return { schemaVersion: SCHEMA_VERSION, projectId, revision: 0, decisionRevisions: [], decisionHeads: [], idempotency: [] };
}
function normalizeDecision(input, projectId) {
  const conflictId = required(input.conflictId ?? input.id, "conflictId");
  const resolution = required(input.resolution, "resolution").toLowerCase();
  if (!RESOLUTIONS.has(resolution)) throw new Error("resolution must be keep-separate, choose-goal, or acknowledge-coexistence.");
  const objectRef = normalizeRef(input.objectRef, "Conflict object");
  const goalRefs = normalizeGoalRefs(input.goalRefs);
  let chosenGoalRef = null;
  if (resolution === "choose-goal") {
    chosenGoalRef = normalizeRef(input.chosenGoalRef, "chosenGoalRef");
    if (chosenGoalRef.type !== "goal" || !goalRefs.some((ref) => ref.id === chosenGoalRef.id)) {
      throw new Error("chosenGoalRef must be one of the goals in the surfaced conflict receipt.");
    }
  } else if (input.chosenGoalRef != null) {
    throw new Error("chosenGoalRef is only valid when resolution is choose-goal.");
  }
  const createdAt = input.createdAt ?? input.updatedAt ?? new Date(0).toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: `${conflictId}:r${Number.isInteger(input.revision) ? input.revision : 0}`,
    conflictId,
    projectId,
    objectRef,
    goalRefs,
    receiptFingerprint: fingerprint("surfaced-goal-conflict", { conflictId, objectRef, goalRefs }),
    resolution,
    ...(chosenGoalRef ? { chosenGoalRef } : {}),
    note: clean(input.note) || null,
    decidedBy: normalizeFounder(input.decidedBy),
    revision: Number.isInteger(input.revision) && input.revision >= 0 ? input.revision : 0,
    createdAt,
    updatedAt: input.updatedAt ?? createdAt,
  };
}
function normalizeAuthority(input, projectId) {
  if (!input) return empty(projectId);
  if (input.projectId && input.projectId !== projectId) throw new Error(`Conflict decision authority belongs to project ${input.projectId}, not ${projectId}.`);
  return {
    schemaVersion: SCHEMA_VERSION,
    projectId,
    revision: Number.isInteger(input.revision) && input.revision >= 0 ? input.revision : 0,
    decisionRevisions: Array.isArray(input.decisionRevisions) ? input.decisionRevisions.map((item) => normalizeDecision(item, projectId)) : [],
    decisionHeads: Array.isArray(input.decisionHeads) ? input.decisionHeads.map((item) => ({ conflictId: required(item.conflictId, "Decision head conflictId"), revision: item.revision })) : [],
    idempotency: Array.isArray(input.idempotency) ? input.idempotency.slice(-RECEIPT_LIMIT) : [],
  };
}
function load(projectId, options = {}) {
  projectId = required(projectId, "projectId");
  return normalizeAuthority(persistence(options).get(COLLECTION, keyFor(projectId)), projectId);
}
function current(authority, conflictId) {
  const head = authority.decisionHeads.find((item) => item.conflictId === conflictId);
  return head ? authority.decisionRevisions.find((item) => item.conflictId === conflictId && item.revision === head.revision) ?? null : null;
}
function publicAuthority(authority) {
  return {
    projectId: authority.projectId,
    storeRevision: authority.revision,
    decisions: authority.decisionHeads.map((head) => current(authority, head.conflictId)).filter(Boolean).sort((a, b) => a.conflictId.localeCompare(b.conflictId)).map(clone),
  };
}

export function recordGoalConflictDecision(projectId, surfacedConflict = {}, input = {}, options = {}) {
  projectId = required(projectId, "projectId");
  const conflictId = required(surfacedConflict.id, "Surfaced conflict id");
  const objectRef = normalizeRef(surfacedConflict.objectRef, "Surfaced conflict object");
  const goalRefs = normalizeGoalRefs(surfacedConflict.goalRefs);
  const resolution = required(input.resolution, "resolution").toLowerCase();
  const decidedBy = normalizeFounder(input.decidedBy);
  const key = required(input.idempotencyKey ?? options.idempotencyKey, "idempotencyKey");
  const expectedStoreRevision = input.expectedStoreRevision;
  if (!Number.isInteger(expectedStoreRevision) || expectedStoreRevision < 0) throw new Error("expectedStoreRevision must be a non-negative integer.");
  const payload = { conflictId, objectRef, goalRefs, resolution, chosenGoalRef: input.chosenGoalRef ?? null, note: clean(input.note) || null, decidedBy };
  const hash = fingerprint("record-goal-conflict-decision", payload);
  const authority = load(projectId, options);
  const replay = authority.idempotency.find((item) => item.key === key);
  if (replay) {
    if (replay.fingerprint !== hash) throw new GoalConflictDecisionConflictError(`Idempotency key ${key} was already used for a different conflict decision.`, { projectId, conflictId });
    const decision = authority.decisionRevisions.find((item) => item.conflictId === replay.conflictId && item.revision === replay.decisionRevision);
    return { decision: clone(decision), ...publicAuthority(authority) };
  }
  if (authority.revision !== expectedStoreRevision) throw new GoalConflictDecisionConflictError(`Stale conflict decision store revision: expected ${expectedStoreRevision}, current ${authority.revision}.`, { projectId, conflictId, expectedRevision: expectedStoreRevision, actualRevision: authority.revision });
  const prior = current(authority, conflictId);
  const expectedDecisionRevision = input.expectedDecisionRevision;
  if (prior) {
    if (!Number.isInteger(expectedDecisionRevision) || expectedDecisionRevision !== prior.revision) throw new GoalConflictDecisionConflictError(`Stale conflict decision revision: expected ${expectedDecisionRevision}, current ${prior.revision}.`, { projectId, conflictId, expectedRevision: expectedDecisionRevision, actualRevision: prior.revision });
  } else if (expectedDecisionRevision != null) {
    throw new GoalConflictDecisionConflictError(`Conflict ${conflictId} has no prior decision revision.`, { projectId, conflictId, expectedRevision: expectedDecisionRevision, actualRevision: null });
  }
  const timestamp = at(options);
  const decision = normalizeDecision({ ...payload, revision: prior ? prior.revision + 1 : 0, createdAt: prior?.createdAt ?? timestamp, updatedAt: timestamp }, projectId);
  const next = clone(authority);
  next.revision += 1;
  next.decisionRevisions.push(decision);
  const headIndex = next.decisionHeads.findIndex((item) => item.conflictId === conflictId);
  const head = { conflictId, revision: decision.revision };
  if (headIndex >= 0) next.decisionHeads[headIndex] = head;
  else next.decisionHeads.push(head);
  next.idempotency = [...next.idempotency, { key, fingerprint: hash, conflictId, decisionRevision: decision.revision }].slice(-RECEIPT_LIMIT);
  try {
    persistence(options).compareAndSet(COLLECTION, keyFor(projectId), authority.revision, next);
  } catch (error) {
    if (error instanceof PersistenceConflictError) throw new GoalConflictDecisionConflictError(error.message, { projectId, conflictId, expectedRevision: authority.revision, actualRevision: error.actualRevision });
    throw error;
  }
  return { decision: clone(decision), ...publicAuthority(next) };
}

export function listGoalConflictDecisions(projectId, options = {}) { return publicAuthority(load(projectId, options)); }
export function goalConflictDecisionHistory(projectId, conflictId, options = {}) {
  const authority = load(projectId, options);
  return clone(authority.decisionRevisions.filter((item) => item.conflictId === required(conflictId, "conflictId")).sort((a, b) => a.revision - b.revision));
}

export const goalConflictDecisionStore = {
  collection: COLLECTION,
  load,
  list: listGoalConflictDecisions,
  history: goalConflictDecisionHistory,
  record: recordGoalConflictDecision,
};
