import crypto from "node:crypto";
import { PersistenceConflictError, persistence } from "./persistence.mjs";
import { safeId } from "./store-fs.mjs";

export const GOAL_SCHEMA_VERSION = 1;
export const GOAL_STATUSES = Object.freeze([
  "active",
  "needs-founder",
  "waiting",
  "paused",
  "completed",
  "abandoned",
  "failed",
  "stale",
]);

const COLLECTION = "goals";
const STATUS_SET = new Set(GOAL_STATUSES);
const STRONG_PROVENANCE = new Set(["grounded", "proven"]);

export class GoalConflictError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "GoalConflictError";
    this.code = "GOAL_CONFLICT";
    Object.assign(this, details);
  }
}

function timestamp(options = {}) {
  const value = typeof options.now === "function" ? options.now() : new Date().toISOString();
  return value instanceof Date ? value.toISOString() : String(value);
}

function text(value) {
  return String(value ?? "").trim();
}

function required(value, label) {
  const normalized = text(value);
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
}

function id(prefix, at) {
  return `${prefix}-${String(at).replace(/\D/g, "").slice(0, 14)}-${crypto.randomBytes(5).toString("hex")}`;
}

function idempotentId(prefix, projectId, idempotencyKey) {
  const digest = crypto.createHash("sha256")
    .update(`${projectId}\u0000${idempotencyKey}`)
    .digest("hex")
    .slice(0, 20);
  return `${prefix}-${digest}`;
}

function keyFor(projectId) {
  const value = required(projectId, "A projectId");
  const digest = crypto.createHash("sha256").update(value).digest("hex").slice(0, 12);
  return `${safeId(value).slice(0, 70)}-${digest}`;
}

function deepClone(value) {
  return structuredClone(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function immutable(value) {
  return deepFreeze(deepClone(value));
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function fingerprint(value) {
  return crypto.createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

function mutationActor(input = {}, options = {}) {
  return required(
    input.revisionAuthor ?? input.mutationActor ?? input.actor
      ?? input.createdBy ?? options.revisionAuthor ?? options.mutationActor ?? options.actor,
    "A mutation actor/revisionAuthor",
  );
}

function validatedRelationProvenance(declared, basis) {
  const value = required(declared, "Relation provenance").toLowerCase();
  if (!STRONG_PROVENANCE.has(value)) return value;
  return basis.length ? "inferred" : "speculative";
}

function normalizeRef(raw, projectId) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("A stable reference must be an object with type and id.");
  }
  const type = required(raw.type ?? raw.kind, "A stable reference type").toLowerCase();
  const refId = required(raw.id ?? raw.ref ?? raw.key, "A stable reference id");
  const owner = text(raw.projectId ?? raw.project);
  if (owner && owner !== projectId) {
    throw new Error(`Reference ${type}:${refId} belongs to project ${owner}, not ${projectId}.`);
  }
  return { type, id: refId };
}

export function normalizeGoalRefs(values, projectId) {
  const refs = (Array.isArray(values) ? values : values == null ? [] : [values])
    .map((value) => normalizeRef(value, projectId));
  const unique = new Map(refs.map((ref) => [`${ref.type}\u0000${ref.id}`, ref]));
  return [...unique.values()].sort((a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id));
}

function normalizeBasis(values, projectId) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error("A goal relation requires a non-empty basis.");
  }
  const normalized = values.map((raw) => {
    if (typeof raw === "string") {
      return { type: "reasoning", statement: required(raw, "Relation basis reasoning") };
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("Relation basis entries must be stable references or reasoning statements.");
    }
    if (raw.statement != null || raw.reason != null) {
      const statement = required(raw.statement ?? raw.reason, "Relation basis reasoning");
      const provenance = text(raw.provenance);
      return { type: text(raw.type ?? raw.kind) || "reasoning", statement, ...(provenance ? { provenance } : {}) };
    }
    return normalizeRef(raw, projectId);
  });
  const unique = new Map(normalized.map((entry) => [JSON.stringify(canonical(entry)), entry]));
  return [...unique.values()].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

function normalizeStatus(value) {
  const status = text(value) || "active";
  if (!STATUS_SET.has(status)) throw new Error(`Unknown goal status: ${status}`);
  return status;
}

export function normalizeGoal(input = {}, context = {}) {
  const projectId = required(input.projectId ?? context.projectId, "A projectId");
  const createdAt = input.createdAt || context.createdAt || timestamp(context);
  const status = normalizeStatus(input.status);
  const desiredChange = text(input.desiredChange);
  const statusReason = text(input.statusReason);
  const originRef = input.originRef == null ? null : normalizeRef(input.originRef, projectId);
  const completedAt = status === "completed" ? (input.completedAt || context.completedAt || createdAt) : null;
  const retiredAt = input.retiredAt ? String(input.retiredAt) : null;
  return {
    schemaVersion: GOAL_SCHEMA_VERSION,
    id: required(input.id ?? context.id, "A goal id"),
    projectId,
    statement: required(input.statement, "A goal statement"),
    ...(desiredChange ? { desiredChange } : {}),
    scopeRefs: normalizeGoalRefs(input.scopeRefs, projectId),
    relatedGoalRefs: normalizeGoalRefs(input.relatedGoalRefs, projectId)
      .filter((ref) => ref.type === "goal" && ref.id !== (input.id ?? context.id)),
    ...(originRef ? { originRef } : {}),
    createdBy: required(input.createdBy, "createdBy"),
    revisionAuthor: required(input.revisionAuthor ?? input.createdBy, "revisionAuthor"),
    status,
    ...(statusReason ? { statusReason } : {}),
    currentWorkRefs: normalizeGoalRefs(input.currentWorkRefs, projectId),
    revision: Number.isInteger(input.revision) && input.revision >= 0 ? input.revision : 0,
    createdAt: String(createdAt),
    updatedAt: String(input.updatedAt || createdAt),
    ...(completedAt ? { completedAt: String(completedAt) } : {}),
    ...(retiredAt ? { retiredAt } : {}),
  };
}

export function normalizeGoalRelation(input = {}, context = {}) {
  const projectId = required(input.projectId ?? context.projectId, "A projectId");
  const createdAt = input.createdAt || context.createdAt || timestamp(context);
  const sourceRef = normalizeRef(input.sourceRef ?? { type: "goal", id: input.sourceGoalId }, projectId);
  const targetRef = normalizeRef(input.targetRef ?? { type: "goal", id: input.targetGoalId }, projectId);
  if (sourceRef.type !== "goal" || targetRef.type !== "goal") {
    throw new Error("Goal relations must connect two goal references.");
  }
  if (sourceRef.id === targetRef.id) throw new Error("A goal cannot relate to itself.");
  const label = text(input.label);
  const retiredAt = input.retiredAt ? String(input.retiredAt) : null;
  const basis = normalizeBasis(input.basis, projectId);
  const declaredProvenance = required(input.declaredProvenance ?? input.provenance, "Relation provenance");
  return {
    schemaVersion: GOAL_SCHEMA_VERSION,
    id: required(input.id ?? context.id, "A goal relation id"),
    projectId,
    sourceRef,
    targetRef,
    kind: required(input.kind, "A goal relation kind"),
    ...(label ? { label } : {}),
    basis,
    declaredProvenance,
    provenance: validatedRelationProvenance(declaredProvenance, basis),
    createdBy: required(input.createdBy, "createdBy"),
    revisionAuthor: required(input.revisionAuthor ?? input.createdBy, "revisionAuthor"),
    revision: Number.isInteger(input.revision) && input.revision >= 0 ? input.revision : 0,
    createdAt: String(createdAt),
    updatedAt: String(input.updatedAt || createdAt),
    ...(retiredAt ? { retiredAt } : {}),
  };
}

function emptyAuthority(projectId) {
  return {
    schemaVersion: GOAL_SCHEMA_VERSION,
    projectId,
    revision: 0,
    goals: [],
    relations: [],
    relationRevisions: [],
    mutations: [],
    updatedAt: null,
  };
}

function normalizeAuthority(raw, projectId) {
  if (!raw) return emptyAuthority(projectId);
  if (raw.schemaVersion !== GOAL_SCHEMA_VERSION) {
    throw new Error(`Unsupported goal authority schemaVersion: ${raw.schemaVersion}.`);
  }
  if (raw.projectId !== projectId) {
    throw new Error(`Goal authority belongs to project ${raw.projectId}, not ${projectId}.`);
  }
  if (!Number.isInteger(raw.revision) || raw.revision < 0) throw new Error("Goal authority revision is invalid.");
  if (!Array.isArray(raw.goals) || !Array.isArray(raw.relations) || !Array.isArray(raw.mutations)) {
    throw new Error("Goal authority collections must be arrays.");
  }
  const authority = {
    schemaVersion: GOAL_SCHEMA_VERSION,
    projectId,
    revision: raw.revision,
    goals: raw.goals.map((goal) => normalizeGoal(goal, { projectId })),
    relations: raw.relations.map((relation) => normalizeGoalRelation(relation, { projectId })),
    // Relation heads predate retained snapshots. A legacy authority starts its honest history at the
    // current head; every subsequent mutation appends an immutable revision here.
    relationRevisions: (Array.isArray(raw.relationRevisions) ? raw.relationRevisions : raw.relations)
      .map((relation) => normalizeGoalRelation(relation, { projectId })),
    mutations: raw.mutations.map((entry) => {
      const normalized = canonical(entry);
      required(normalized.key, "Mutation receipt key");
      required(normalized.kind, "Mutation receipt kind");
      required(normalized.digest, "Mutation receipt digest");
      if (!normalized.resultRef && normalized.result == null) throw new Error("Mutation receipt result reference is required.");
      return normalized;
    }),
    updatedAt: raw.updatedAt ?? null,
  };
  const goalIds = new Set();
  for (const goal of authority.goals) {
    if (goalIds.has(goal.id)) throw new Error(`Duplicate goal id in authority: ${goal.id}`);
    goalIds.add(goal.id);
  }
  const relationIds = new Set();
  for (const relation of authority.relations) {
    if (relationIds.has(relation.id)) throw new Error(`Duplicate goal relation id in authority: ${relation.id}`);
    relationIds.add(relation.id);
    if (!goalIds.has(relation.sourceRef.id) || !goalIds.has(relation.targetRef.id)) {
      throw new Error(`Goal relation ${relation.id} points outside its project authority.`);
    }
  }
  const relationRevisionKeys = new Set();
  for (const relation of authority.relationRevisions) {
    const key = `${relation.id}\u0000${relation.revision}`;
    if (relationRevisionKeys.has(key)) throw new Error(`Duplicate goal relation revision: ${relation.id}@${relation.revision}`);
    relationRevisionKeys.add(key);
    if (!relationIds.has(relation.id)) throw new Error(`Goal relation history points to missing relation head: ${relation.id}`);
  }
  return authority;
}

function load(projectId, options = {}) {
  return normalizeAuthority(persistence(options).get(COLLECTION, keyFor(projectId)), projectId);
}

function findMutation(authority, idempotencyKey, kind, payload) {
  const key = required(idempotencyKey, "An idempotencyKey");
  const existing = authority.mutations.find((entry) => entry.key === key);
  const digest = fingerprint({ kind, payload });
  if (!existing) return { key, digest, result: null };
  if (existing.digest !== digest || existing.kind !== kind) {
    throw new Error(`Idempotency key ${key} was already used for a different mutation.`);
  }
  if (existing.result != null) return { key, digest, result: immutable(existing.result) };
  const ref = existing.resultRef;
  if (ref?.type === "goal") {
    const goal = authority.goals.find((item) => item.id === ref.id);
    if (!goal) throw new Error(`Idempotency receipt points to missing goal ${ref.id}.`);
    return { key, digest, result: immutable(publicGoal(goal, authority)) };
  }
  if (ref?.type === "goal-relation") {
    const relation = authority.relations.find((item) => item.id === ref.id);
    if (!relation) throw new Error(`Idempotency receipt points to missing goal relation ${ref.id}.`);
    return { key, digest, result: immutable(relation) };
  }
  throw new Error(`Idempotency receipt ${key} has an invalid result reference.`);
}

function commit(authority, mutation, result, at, options) {
  const next = {
    ...authority,
    revision: authority.revision + 1,
    mutations: [...authority.mutations, {
      key: mutation.key,
      kind: mutation.kind,
      digest: mutation.digest,
      resultRef: {
        type: Object.hasOwn(result, "sourceRef") ? "goal-relation" : "goal",
        id: result.id,
      },
      resultRevision: result.revision,
      resultHash: fingerprint(result),
      revisionAuthor: result.revisionAuthor,
      createdAt: at,
    }],
    updatedAt: at,
  };
  if (typeof options.beforeCommit === "function") options.beforeCommit({ authority: deepClone(authority), next: deepClone(next) });
  try {
    persistence(options).compareAndSet(COLLECTION, keyFor(authority.projectId), authority.revision, next);
  } catch (error) {
    if (error instanceof PersistenceConflictError) {
      throw new GoalConflictError(error.message, {
        scope: "goal authority",
        projectId: authority.projectId,
        expectedRevision: authority.revision,
        actualRevision: error.actualRevision,
        cause: error,
      });
    }
    throw error;
  }
  return immutable(result);
}

function begin(projectId, idempotencyKey, kind, payload, options) {
  const authority = load(projectId, options);
  const mutation = { ...findMutation(authority, idempotencyKey, kind, payload), kind };
  return { authority, mutation };
}

function goalIndex(authority, goalId) {
  return authority.goals.findIndex((goal) => goal.id === goalId);
}

function relationIndex(authority, relationId) {
  return authority.relations.findIndex((relation) => relation.id === relationId);
}

function assertExpected(record, expectedRevision, noun) {
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
    throw new Error(`An expectedRevision is required to mutate ${noun}.`);
  }
  if (record.revision !== expectedRevision) {
    throw new Error(`Stale ${noun} revision: expected ${expectedRevision}, current ${record.revision}.`);
  }
}

function relatedRefs(goal, authority) {
  const refs = authority.relations.flatMap((relation) => {
    if (relation.retiredAt) return [];
    if (relation.sourceRef.id === goal.id) return [relation.targetRef];
    if (relation.targetRef.id === goal.id) return [relation.sourceRef];
    return [];
  });
  return normalizeGoalRefs([...goal.relatedGoalRefs, ...refs], goal.projectId);
}

function publicGoal(goal, authority) {
  return { ...goal, relatedGoalRefs: relatedRefs(goal, authority) };
}

function assertOwnedGoal(authority, goalId, options = {}) {
  const index = goalIndex(authority, goalId);
  if (index >= 0) return index;
  for (const other of persistence(options).list(COLLECTION)) {
    if (other?.projectId !== authority.projectId && other?.goals?.some((goal) => goal.id === goalId)) {
      throw new Error(`Goal ${goalId} belongs to project ${other.projectId}, not ${authority.projectId}.`);
    }
  }
  throw new Error(`Goal not found in project ${authority.projectId}: ${goalId}`);
}

function assertOwnedRelation(authority, relationId, options = {}) {
  const index = relationIndex(authority, relationId);
  if (index >= 0) return index;
  for (const other of persistence(options).list(COLLECTION)) {
    if (other?.projectId !== authority.projectId && other?.relations?.some((relation) => relation.id === relationId)) {
      throw new Error(`Goal relation ${relationId} belongs to project ${other.projectId}, not ${authority.projectId}.`);
    }
  }
  throw new Error(`Goal relation not found in project ${authority.projectId}: ${relationId}`);
}

function assertNoResolvableForeignGoalRefs(goal, authority, options = {}) {
  const provider = persistence(options);
  const localWork = provider.list("work-artifacts").find((item) => item?.projectId === authority.projectId);
  const localWorkIds = new Set((localWork?.artifactHeads ?? []).map((head) => head.artifactId));
  const refs = [...goal.scopeRefs, ...goal.currentWorkRefs, ...(goal.originRef ? [goal.originRef] : [])]
    .filter((ref) => (ref.type === "goal" && !authority.goals.some((item) => item.id === ref.id))
      || (ref.type === "work-artifact" && !localWorkIds.has(ref.id)));
  if (!refs.length) return;
  const foreignAuthorities = [
    ...provider.list(COLLECTION).map((item) => ({ ...item, authorityType: "goal" })),
    ...provider.list("work-artifacts").map((item) => ({ ...item, authorityType: "work-artifact" })),
  ];
  for (const other of foreignAuthorities) {
    if (!other || other.projectId === authority.projectId) continue;
    const foreign = refs.find((ref) => ref.type === other.authorityType && (
      ref.type === "goal"
        ? other.goals?.some((item) => item.id === ref.id)
        : other.artifactHeads?.some((item) => item.artifactId === ref.id)
    ));
    if (foreign) {
      throw new Error(`Reference ${foreign.type}:${foreign.id} belongs to project ${other.projectId}, not ${authority.projectId}.`);
    }
  }
}

export function createGoal(input = {}, options = {}) {
  const projectId = required(input.projectId ?? options.projectId, "A projectId");
  if (input.relatedGoalRefs != null) {
    throw new Error("Create goal relationships with createGoalRelation so kind, basis, and provenance remain explicit.");
  }
  const at = input.createdAt || timestamp(options);
  const idempotencyKey = input.idempotencyKey ?? options.idempotencyKey;
  const actor = mutationActor(input, options);
  const goalId = text(input.id) || (idempotencyKey
    ? idempotentId("goal", projectId, idempotencyKey)
    : id("goal", at));
  const payload = { ...input, projectId, id: goalId, revisionAuthor: actor, idempotencyKey: undefined };
  const { authority, mutation } = begin(projectId, idempotencyKey, "create-goal", payload, options);
  if (mutation.result) return mutation.result;
  if (goalIndex(authority, goalId) >= 0) throw new Error(`Goal already exists in project ${projectId}: ${goalId}`);
  if (input.expectedRevision != null && input.expectedRevision !== authority.revision) {
    throw new Error(`Stale goal authority revision: expected ${input.expectedRevision}, current ${authority.revision}.`);
  }
  const goal = normalizeGoal({
    ...input,
    id: goalId,
    projectId,
    createdBy: input.createdBy ?? actor,
    revisionAuthor: actor,
    revision: 0,
    createdAt: at,
    updatedAt: at,
  }, { projectId });
  assertNoResolvableForeignGoalRefs(goal, authority, options);
  authority.goals = [...authority.goals, goal];
  return commit(authority, mutation, publicGoal(goal, authority), at, options);
}

export function getGoal(goalId, options = {}) {
  const projectId = required(options.projectId, "A projectId");
  const authority = load(projectId, options);
  const index = assertOwnedGoal(authority, goalId, options);
  return immutable(publicGoal(authority.goals[index], authority));
}

export function listGoals(projectId = "default", options = {}) {
  const authority = load(projectId, options);
  const includeRetired = options.includeRetired === true;
  return immutable(authority.goals
    .filter((goal) => includeRetired || !goal.retiredAt)
    .map((goal) => publicGoal(goal, authority))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)));
}

export function reviseGoal(goalId, patch = {}, options = {}) {
  const projectId = required(options.projectId ?? patch.projectId, "A projectId");
  const expectedRevision = options.expectedRevision ?? patch.expectedRevision;
  const idempotencyKey = options.idempotencyKey ?? patch.idempotencyKey;
  const actor = mutationActor(patch, options);
  const cleanPatch = { ...patch };
  delete cleanPatch.expectedRevision;
  delete cleanPatch.idempotencyKey;
  delete cleanPatch.projectId;
  delete cleanPatch.createdBy;
  delete cleanPatch.revisionAuthor;
  delete cleanPatch.mutationActor;
  delete cleanPatch.actor;
  for (const field of ["id", "createdAt", "revision", "retiredAt", "completedAt", "relatedGoalRefs"]) {
    if (Object.prototype.hasOwnProperty.call(cleanPatch, field)) throw new Error(`Goal field ${field} is not directly revisable.`);
  }
  const payload = { goalId, patch: cleanPatch, expectedRevision, revisionAuthor: actor };
  const { authority, mutation } = begin(projectId, idempotencyKey, "revise-goal", payload, options);
  if (mutation.result) return mutation.result;
  const index = assertOwnedGoal(authority, goalId, options);
  const current = authority.goals[index];
  assertExpected(current, expectedRevision, `goal ${goalId}`);
  if (current.retiredAt) throw new Error(`Goal ${goalId} is retired.`);
  if (cleanPatch.status != null && cleanPatch.status !== current.status) {
    throw new Error("Use changeGoalStatus to change behavioral status.");
  }
  const at = timestamp(options);
  const next = normalizeGoal({ ...current, ...cleanPatch, revisionAuthor: actor, revision: current.revision + 1, updatedAt: at }, { projectId });
  assertNoResolvableForeignGoalRefs(next, authority, options);
  authority.goals = authority.goals.map((goal, position) => position === index ? next : goal);
  return commit(authority, mutation, publicGoal(next, authority), at, options);
}

export function changeGoalStatus(goalId, status, input = {}, options = {}) {
  const projectId = required(input.projectId ?? options.projectId, "A projectId");
  const expectedRevision = input.expectedRevision ?? options.expectedRevision;
  const idempotencyKey = input.idempotencyKey ?? options.idempotencyKey;
  const actor = mutationActor(input, options);
  const normalizedStatus = normalizeStatus(status);
  const statusReason = text(input.statusReason);
  const payload = { goalId, status: normalizedStatus, statusReason, expectedRevision, revisionAuthor: actor };
  const { authority, mutation } = begin(projectId, idempotencyKey, "change-goal-status", payload, options);
  if (mutation.result) return mutation.result;
  const index = assertOwnedGoal(authority, goalId, options);
  const current = authority.goals[index];
  assertExpected(current, expectedRevision, `goal ${goalId}`);
  if (current.retiredAt) throw new Error(`Goal ${goalId} is retired.`);
  const at = timestamp(options);
  const next = normalizeGoal({
    ...current,
    status: normalizedStatus,
    statusReason: statusReason || undefined,
    completedAt: normalizedStatus === "completed" ? (current.completedAt || at) : undefined,
    revisionAuthor: actor,
    revision: current.revision + 1,
    updatedAt: at,
  }, { projectId });
  authority.goals = authority.goals.map((goal, position) => position === index ? next : goal);
  return commit(authority, mutation, publicGoal(next, authority), at, options);
}

export function retireGoal(goalId, input = {}, options = {}) {
  const projectId = required(input.projectId ?? options.projectId, "A projectId");
  const expectedRevision = input.expectedRevision ?? options.expectedRevision;
  const idempotencyKey = input.idempotencyKey ?? options.idempotencyKey;
  const actor = mutationActor(input, options);
  const payload = { goalId, expectedRevision, revisionAuthor: actor };
  const { authority, mutation } = begin(projectId, idempotencyKey, "retire-goal", payload, options);
  if (mutation.result) return mutation.result;
  const index = assertOwnedGoal(authority, goalId, options);
  const current = authority.goals[index];
  assertExpected(current, expectedRevision, `goal ${goalId}`);
  const at = timestamp(options);
  const next = normalizeGoal({ ...current, revisionAuthor: actor, revision: current.revision + 1, updatedAt: at, retiredAt: current.retiredAt || at }, { projectId });
  authority.goals = authority.goals.map((goal, position) => position === index ? next : goal);
  return commit(authority, mutation, publicGoal(next, authority), at, options);
}

export function restoreGoal(goalId, input = {}, options = {}) {
  const projectId = required(input.projectId ?? options.projectId, "A projectId");
  const expectedRevision = input.expectedRevision ?? options.expectedRevision;
  const idempotencyKey = input.idempotencyKey ?? options.idempotencyKey;
  const actor = mutationActor(input, options);
  const payload = { goalId, expectedRevision, revisionAuthor: actor };
  const { authority, mutation } = begin(projectId, idempotencyKey, "restore-goal", payload, options);
  if (mutation.result) return mutation.result;
  const index = assertOwnedGoal(authority, goalId, options);
  const current = authority.goals[index];
  assertExpected(current, expectedRevision, `goal ${goalId}`);
  if (!current.retiredAt) throw new Error(`Goal ${goalId} is not retired.`);
  const at = timestamp(options);
  const next = normalizeGoal({ ...current, revisionAuthor: actor, revision: current.revision + 1, updatedAt: at, retiredAt: undefined }, { projectId });
  authority.goals = authority.goals.map((goal, position) => position === index ? next : goal);
  return commit(authority, mutation, publicGoal(next, authority), at, options);
}

export function createGoalRelation(input = {}, options = {}) {
  const projectId = required(input.projectId ?? options.projectId, "A projectId");
  const at = input.createdAt || timestamp(options);
  const idempotencyKey = input.idempotencyKey ?? options.idempotencyKey;
  const actor = mutationActor(input, options);
  const relationId = text(input.id) || (idempotencyKey
    ? idempotentId("goal-rel", projectId, idempotencyKey)
    : id("goal-rel", at));
  const payload = { ...input, projectId, id: relationId, revisionAuthor: actor, idempotencyKey: undefined };
  const { authority, mutation } = begin(projectId, idempotencyKey, "create-goal-relation", payload, options);
  if (mutation.result) return mutation.result;
  if (relationIndex(authority, relationId) >= 0) throw new Error(`Goal relation already exists in project ${projectId}: ${relationId}`);
  const relation = normalizeGoalRelation({
    ...input,
    id: relationId,
    projectId,
    createdBy: input.createdBy ?? actor,
    revisionAuthor: actor,
    revision: 0,
    createdAt: at,
    updatedAt: at,
  }, { projectId });
  assertOwnedGoal(authority, relation.sourceRef.id, options);
  assertOwnedGoal(authority, relation.targetRef.id, options);
  authority.relations = [...authority.relations, relation];
  authority.relationRevisions = [...authority.relationRevisions, relation];
  return commit(authority, mutation, relation, at, options);
}

export function getGoalRelation(relationId, options = {}) {
  const projectId = required(options.projectId, "A projectId");
  const authority = load(projectId, options);
  return immutable(authority.relations[assertOwnedRelation(authority, relationId, options)]);
}

export function listGoalRelations(projectId = "default", options = {}) {
  const authority = load(projectId, options);
  const includeRetired = options.includeRetired === true;
  return immutable(authority.relations
    .filter((relation) => includeRetired || !relation.retiredAt)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)));
}

export function getGoalRelationHistory(relationId, options = {}) {
  const projectId = required(options.projectId, "A projectId");
  const authority = load(projectId, options);
  assertOwnedRelation(authority, relationId, options);
  return immutable(authority.relationRevisions
    .filter((relation) => relation.id === relationId)
    .sort((a, b) => a.revision - b.revision));
}

export function reviseGoalRelation(relationId, patch = {}, options = {}) {
  const projectId = required(options.projectId ?? patch.projectId, "A projectId");
  const expectedRevision = options.expectedRevision ?? patch.expectedRevision;
  const idempotencyKey = options.idempotencyKey ?? patch.idempotencyKey;
  const actor = mutationActor(patch, options);
  const cleanPatch = { ...patch };
  for (const field of ["expectedRevision", "idempotencyKey", "projectId"]) delete cleanPatch[field];
  for (const field of ["createdBy", "revisionAuthor", "mutationActor", "actor"]) delete cleanPatch[field];
  for (const field of ["id", "sourceRef", "targetRef", "sourceGoalId", "targetGoalId", "createdAt", "revision", "retiredAt"]) {
    if (Object.prototype.hasOwnProperty.call(cleanPatch, field)) throw new Error(`Goal relation field ${field} is not directly revisable.`);
  }
  const payload = { relationId, patch: cleanPatch, expectedRevision, revisionAuthor: actor };
  const { authority, mutation } = begin(projectId, idempotencyKey, "revise-goal-relation", payload, options);
  if (mutation.result) return mutation.result;
  const index = assertOwnedRelation(authority, relationId, options);
  const current = authority.relations[index];
  assertExpected(current, expectedRevision, `goal relation ${relationId}`);
  if (current.retiredAt) throw new Error(`Goal relation ${relationId} is retired.`);
  const at = timestamp(options);
  const next = normalizeGoalRelation({ ...current, ...cleanPatch, revisionAuthor: actor, revision: current.revision + 1, updatedAt: at }, { projectId });
  authority.relations = authority.relations.map((relation, position) => position === index ? next : relation);
  authority.relationRevisions = [...authority.relationRevisions, next];
  return commit(authority, mutation, next, at, options);
}

export function retireGoalRelation(relationId, input = {}, options = {}) {
  const projectId = required(input.projectId ?? options.projectId, "A projectId");
  const expectedRevision = input.expectedRevision ?? options.expectedRevision;
  const idempotencyKey = input.idempotencyKey ?? options.idempotencyKey;
  const actor = mutationActor(input, options);
  const payload = { relationId, expectedRevision, revisionAuthor: actor };
  const { authority, mutation } = begin(projectId, idempotencyKey, "retire-goal-relation", payload, options);
  if (mutation.result) return mutation.result;
  const index = assertOwnedRelation(authority, relationId, options);
  const current = authority.relations[index];
  assertExpected(current, expectedRevision, `goal relation ${relationId}`);
  const at = timestamp(options);
  const next = normalizeGoalRelation({ ...current, revisionAuthor: actor, revision: current.revision + 1, updatedAt: at, retiredAt: current.retiredAt || at }, { projectId });
  authority.relations = authority.relations.map((relation, position) => position === index ? next : relation);
  authority.relationRevisions = [...authority.relationRevisions, next];
  return commit(authority, mutation, next, at, options);
}

export function restoreGoalRelation(relationId, input = {}, options = {}) {
  const projectId = required(input.projectId ?? options.projectId, "A projectId");
  const expectedRevision = input.expectedRevision ?? options.expectedRevision;
  const idempotencyKey = input.idempotencyKey ?? options.idempotencyKey;
  const actor = mutationActor(input, options);
  const payload = { relationId, expectedRevision, revisionAuthor: actor };
  const { authority, mutation } = begin(projectId, idempotencyKey, "restore-goal-relation", payload, options);
  if (mutation.result) return mutation.result;
  const index = assertOwnedRelation(authority, relationId, options);
  const current = authority.relations[index];
  assertExpected(current, expectedRevision, `goal relation ${relationId}`);
  if (!current.retiredAt) throw new Error(`Goal relation ${relationId} is not retired.`);
  const target = [...authority.relationRevisions].reverse()
    .find((relation) => relation.id === relationId && !relation.retiredAt);
  if (!target) throw new Error(`Restorable goal relation revision not found: ${relationId}`);
  const at = timestamp(options);
  const next = normalizeGoalRelation({
    ...target,
    revisionAuthor: actor,
    revision: current.revision + 1,
    updatedAt: at,
    retiredAt: undefined,
  }, { projectId });
  authority.relations = authority.relations.map((relation, position) => position === index ? next : relation);
  authority.relationRevisions = [...authority.relationRevisions, next];
  return commit(authority, mutation, next, at, options);
}

export const goalStore = Object.freeze({
  collection: COLLECTION,
  create: createGoal,
  get: getGoal,
  list: listGoals,
  revise: reviseGoal,
  changeStatus: changeGoalStatus,
  retire: retireGoal,
  restore: restoreGoal,
  createRelation: createGoalRelation,
  getRelation: getGoalRelation,
  listRelations: listGoalRelations,
  relationHistory: getGoalRelationHistory,
  reviseRelation: reviseGoalRelation,
  retireRelation: retireGoalRelation,
  restoreRelation: restoreGoalRelation,
});
