// Provider-neutral authority for open work which has no more specific durable owner.
//
// One persistence document owns one project's artifact revisions, head pointers, open
// relationships, tombstones, and retry receipts. Mutations are synchronous load/change/save
// operations and cross the persistence seam once, so the provider's atomic document write is the
// commit boundary. Artifact content is inert JSON or text: this module validates, hashes, clones,
// and stores it, but never imports, evaluates, renders, or executes it.

import crypto from "node:crypto";
import { PersistenceConflictError, persistence } from "./persistence.mjs";
import { safeId } from "./store-fs.mjs";
import { normalizeStableRef, normalizeStableRefs } from "./operator-tools.mjs";

export const WORK_ARTIFACT_SCHEMA_VERSION = 1;
export const WORK_ARTIFACT_COLLECTION = "work-artifacts";

const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const ARTIFACT_PATCH_FIELDS = new Set([
  "kind", "title", "summary", "format", "contentType", "status", "content", "refs",
  "evidence", "provenance", "createdBy", "modelReceipts", "toolReceipts", "parentRef",
  "parentRefs",
]);
const RELATIONSHIP_PATCH_FIELDS = new Set([
  "sourceRef", "targetRef", "kind", "label", "basis", "provenance", "createdBy",
  "modelReceipts", "toolReceipts",
]);
const MUTATION_META_FIELDS = new Set([
  "projectId", "idempotencyKey", "expectedStoreRevision", "expectedArtifactRevision",
  "expectedRelationshipRevision", "revisionAuthor", "mutationActor", "actor",
]);
const STRONG_PROVENANCE = new Set(["grounded", "proven"]);

export class WorkArtifactConflictError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "WorkArtifactConflictError";
    this.code = "WORK_ARTIFACT_CONFLICT";
    Object.assign(this, details);
  }
}

function clock(options = {}) {
  if (typeof options.now === "function") return String(options.now());
  if (options.now) return String(options.now);
  return new Date().toISOString();
}

function text(value, label, { required = false } = {}) {
  const normalized = String(value ?? "").trim();
  if (required && !normalized) throw new Error(`${label} must be a non-empty string.`);
  return normalized || null;
}

function integer(value, fallback = 0) {
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

function clone(value) {
  return structuredClone(value);
}

// Produces JSON with a deterministic object-key order and no executable/prototype-bearing values.
// Array order remains meaningful. Undefined object fields are dropped; undefined array entries are
// normalized to null, matching JSON serialization without permitting ambiguous non-JSON values.
export function normalizeArtifactValue(value, path = "value", depth = 0) {
  if (depth > 64) throw new Error(`${path} exceeds the maximum nesting depth.`);
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${path} must contain only finite JSON numbers.`);
    return Object.is(value, -0) ? 0 : value;
  }
  if (value === undefined) return undefined;
  if (Array.isArray(value)) {
    return value.map((item, index) => normalizeArtifactValue(item, `${path}[${index}]`, depth + 1) ?? null);
  }
  if (typeof value !== "object") throw new Error(`${path} must contain only inert JSON or text.`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${path} must contain only plain JSON objects.`);
  }
  const output = {};
  for (const key of Object.keys(value).sort()) {
    if (FORBIDDEN_KEYS.has(key)) throw new Error(`${path} contains a forbidden key: ${key}.`);
    const normalized = normalizeArtifactValue(value[key], `${path}.${key}`, depth + 1);
    if (normalized !== undefined) output[key] = normalized;
  }
  return output;
}

export function hashArtifactContent(content) {
  const normalized = normalizeArtifactValue(content, "content");
  return crypto.createHash("sha256").update(JSON.stringify(normalized ?? null)).digest("hex");
}

function normalizeCreatedBy(value) {
  const source = typeof value === "string" ? { type: value } : value;
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new Error("createdBy must attribute the mutation to a founder, teammate, run, import, or model worker.");
  }
  const normalized = normalizeArtifactValue(source, "createdBy");
  const type = text(normalized.type ?? normalized.kind ?? normalized.role, "createdBy.type", { required: true });
  const output = { type };
  for (const key of Object.keys(normalized)) {
    if (["type", "kind", "role"].includes(key)) continue;
    output[key] = normalized[key];
  }
  return output;
}

function mutationActor(input = {}, options = {}) {
  return normalizeCreatedBy(
    input.revisionAuthor ?? input.mutationActor ?? input.actor
      ?? input.createdBy ?? options.revisionAuthor ?? options.mutationActor ?? options.actor,
  );
}

function normalizeReceipts(value, label) {
  const list = value == null ? [] : Array.isArray(value) ? value : [value];
  return list.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`${label}[${index}] must be an attributable receipt object.`);
    }
    return normalizeArtifactValue(item, `${label}[${index}]`);
  });
}

function normalizeBasis(value) {
  const list = value == null ? [] : Array.isArray(value) ? value : [value];
  return list.map((item, index) => normalizeArtifactValue(item, `basis[${index}]`));
}

function validatedProvenance(declared, fallback) {
  const value = text(declared, "provenance", { required: true }).toLowerCase();
  // Structural refs and model/tool receipts are attribution, not proof. Until a host authority resolves
  // them, strong labels fail closed; callers cannot mint truth by inventing a plausible-looking id.
  if (STRONG_PROVENANCE.has(value)) return fallback;
  return value;
}

function refsFrom(input, projectId) {
  return normalizeStableRefs(input, { projectId });
}

function artifactRevisionRef(revision) {
  return { type: "work-artifact-revision", id: revision.id };
}

function relationRevisionRef(revision) {
  return { type: "work-relation-revision", id: revision.id };
}

function makeId(prefix, options = {}) {
  if (typeof options.idGenerator === "function") return `${prefix}-${options.idGenerator(prefix)}`;
  return `${prefix}-${crypto.randomUUID()}`;
}

function assertProject(projectId, candidate, label = "Record") {
  const scope = text(projectId, "projectId", { required: true });
  const owner = candidate && typeof candidate === "object"
    ? text(candidate.projectId ?? candidate.project, `${label}.projectId`)
    : null;
  if (owner && owner !== scope) throw new Error(`${label} belongs to project ${owner}, not ${scope}.`);
  return scope;
}

function selectorId(value, projectId, label) {
  if (value && typeof value === "object") {
    assertProject(projectId, value, label);
    return text(value.artifactId ?? value.relationshipId ?? value.id ?? value.ref, `${label} id`, { required: true });
  }
  return text(value, `${label} id`, { required: true });
}

function assertPatch(patch, allowed, label) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error(`${label} patch must be an object.`);
  const unknown = Object.keys(patch).filter((key) => !MUTATION_META_FIELDS.has(key) && !allowed.has(key));
  if (unknown.length) throw new Error(`Unsupported ${label} fields: ${unknown.join(", ")}.`);
}

function defaultFormat(content) {
  return typeof content === "string" ? "text" : "json";
}

function defaultContentType(content) {
  return typeof content === "string" ? "text/plain" : "application/json";
}

export function normalizeWorkArtifactRevision(input = {}, projectId = input.projectId) {
  const scope = assertProject(projectId, input, "Artifact revision");
  const artifactId = text(input.artifactId, "artifactId", { required: true });
  const revision = integer(input.revision);
  if (revision < 1) throw new Error("Artifact revision must be at least 1.");
  const content = normalizeArtifactValue(input.content ?? null, "content");
  const createdAt = text(input.createdAt, "createdAt", { required: true });
  const retiredAt = text(input.retiredAt, "retiredAt");
  const evidence = normalizeReceipts(input.evidence, "evidence");
  const modelReceipts = normalizeReceipts(input.modelReceipts, "modelReceipts");
  const toolReceipts = normalizeReceipts(input.toolReceipts, "toolReceipts");
  const declaredProvenance = text(input.declaredProvenance ?? input.provenance ?? "generated", "provenance", { required: true });
  const creator = normalizeCreatedBy(input.createdBy);
  const unsupportedStrongFallback = ["model-worker", "run", "import"].includes(creator.type)
    ? "generated"
    : "inferred";
  return {
    id: text(input.id, "revision id", { required: true }),
    artifactId,
    projectId: scope,
    lineageId: text(input.lineageId ?? artifactId, "lineageId", { required: true }),
    revision,
    parentRefs: refsFrom(input.parentRefs ?? [], scope),
    kind: text(input.kind, "kind", { required: true }),
    title: text(input.title, "title"),
    summary: text(input.summary, "summary"),
    format: text(input.format ?? defaultFormat(content), "format", { required: true }),
    contentType: text(input.contentType ?? defaultContentType(content), "contentType", { required: true }),
    status: text(input.status ?? "active", "status", { required: true }),
    content,
    contentHash: hashArtifactContent(content),
    refs: refsFrom(input.refs ?? [], scope),
    evidence,
    declaredProvenance,
    provenance: validatedProvenance(declaredProvenance, unsupportedStrongFallback),
    createdBy: creator,
    revisionAuthor: normalizeCreatedBy(input.revisionAuthor ?? input.createdBy),
    modelReceipts,
    toolReceipts,
    createdAt,
    updatedAt: createdAt,
    ...(retiredAt ? { retiredAt } : {}),
  };
}

export function normalizeWorkRelationshipRevision(input = {}, projectId = input.projectId) {
  const scope = assertProject(projectId, input, "Relationship revision");
  const relationshipId = text(input.relationshipId, "relationshipId", { required: true });
  const revision = integer(input.revision);
  if (revision < 1) throw new Error("Relationship revision must be at least 1.");
  const sourceRef = normalizeStableRef(input.sourceRef, { projectId: scope });
  const targetRef = normalizeStableRef(input.targetRef, { projectId: scope });
  const basis = normalizeBasis(input.basis);
  const declaredProvenance = text(input.declaredProvenance ?? input.provenance ?? "speculative", "provenance", { required: true });
  const createdAt = text(input.createdAt, "createdAt", { required: true });
  const retiredAt = text(input.retiredAt, "retiredAt");
  const modelReceipts = normalizeReceipts(input.modelReceipts, "modelReceipts");
  const toolReceipts = normalizeReceipts(input.toolReceipts, "toolReceipts");
  return {
    id: text(input.id, "relationship revision id", { required: true }),
    relationshipId,
    projectId: scope,
    revision,
    parentRefs: refsFrom(input.parentRefs ?? [], scope),
    sourceRef,
    targetRef,
    kind: text(input.kind, "relationship kind", { required: true }),
    label: text(input.label, "relationship label"),
    basis,
    declaredProvenance,
    provenance: validatedProvenance(declaredProvenance, basis.length ? "inferred" : "speculative"),
    createdBy: normalizeCreatedBy(input.createdBy),
    revisionAuthor: normalizeCreatedBy(input.revisionAuthor ?? input.createdBy),
    modelReceipts,
    toolReceipts,
    createdAt,
    updatedAt: createdAt,
    ...(retiredAt ? { retiredAt } : {}),
  };
}

export function emptyWorkArtifactStore(projectId = "default") {
  const scope = assertProject(projectId, null, "Project");
  return {
    schemaVersion: WORK_ARTIFACT_SCHEMA_VERSION,
    projectId: scope,
    revision: 0,
    artifactRevisions: [],
    artifactHeads: [],
    relationshipRevisions: [],
    relationshipHeads: [],
    tombstones: [],
    idempotency: [],
    updatedAt: null,
  };
}

function normalizeHead(input, idField) {
  return {
    [idField]: text(input?.[idField], idField, { required: true }),
    revision: integer(input?.revision),
    revisionId: text(input?.revisionId, "revisionId", { required: true }),
    retired: input?.retired === true,
    updatedAt: text(input?.updatedAt, "updatedAt", { required: true }),
    ...(idField === "artifactId" ? { lineageId: text(input?.lineageId ?? input?.[idField], "lineageId", { required: true }) } : {}),
  };
}

function normalizeStore(input, projectId) {
  const empty = emptyWorkArtifactStore(projectId);
  if (!input) return empty;
  assertProject(projectId, input, "Artifact store");
  if (input.schemaVersion !== WORK_ARTIFACT_SCHEMA_VERSION) {
    throw new Error(`Unsupported work artifact schemaVersion: ${input.schemaVersion}.`);
  }
  if (!Number.isInteger(input.revision) || input.revision < 0) throw new Error("Artifact store revision is invalid.");
  for (const field of ["artifactRevisions", "artifactHeads", "relationshipRevisions", "relationshipHeads", "tombstones", "idempotency"]) {
    if (!Array.isArray(input[field])) throw new Error(`Artifact store ${field} must be an array.`);
  }
  const store = {
    ...empty,
    revision: input.revision,
    artifactRevisions: input.artifactRevisions.map((item) => normalizeWorkArtifactRevision(item, projectId)),
    artifactHeads: input.artifactHeads.map((item) => normalizeHead(item, "artifactId")),
    relationshipRevisions: input.relationshipRevisions.map((item) => normalizeWorkRelationshipRevision(item, projectId)),
    relationshipHeads: input.relationshipHeads.map((item) => normalizeHead(item, "relationshipId")),
    tombstones: input.tombstones.map((item) => normalizeArtifactValue(item, "tombstone")),
    idempotency: input.idempotency.map((item) => normalizeArtifactValue(item, "idempotency receipt")),
    updatedAt: text(input.updatedAt, "updatedAt"),
  };
  validateStoreInvariants(store);
  return store;
}

function validateStoreInvariants(store) {
  const revisionIds = new Set();
  for (const revision of [...store.artifactRevisions, ...store.relationshipRevisions]) {
    if (revisionIds.has(revision.id)) throw new Error(`Duplicate work revision id: ${revision.id}`);
    revisionIds.add(revision.id);
  }
  for (const [heads, revisions, idField, label] of [
    [store.artifactHeads, store.artifactRevisions, "artifactId", "artifact"],
    [store.relationshipHeads, store.relationshipRevisions, "relationshipId", "relationship"],
  ]) {
    const headIds = new Set();
    for (const head of heads) {
      if (headIds.has(head[idField])) throw new Error(`Duplicate ${label} head: ${head[idField]}`);
      headIds.add(head[idField]);
      const revision = revisions.find((item) => item.id === head.revisionId);
      if (!revision || revision[idField] !== head[idField] || revision.revision !== head.revision
        || Boolean(revision.retiredAt) !== head.retired) {
        throw new Error(`Invalid ${label} head invariant: ${head[idField]}`);
      }
    }
  }
  const receiptKeys = new Set();
  for (const receipt of store.idempotency) {
    const key = text(receipt.key, "idempotency receipt key", { required: true });
    if (receiptKeys.has(key)) throw new Error(`Duplicate idempotency receipt: ${key}`);
    receiptKeys.add(key);
    text(receipt.fingerprint, "idempotency fingerprint", { required: true });
    const bag = receipt.resultType === "artifact" ? store.artifactRevisions
      : receipt.resultType === "relationship" ? store.relationshipRevisions : null;
    if (!bag || !bag.some((item) => item.id === receipt.resultRevisionId)) {
      throw new Error(`Idempotency receipt ${key} points to a missing revision.`);
    }
  }
}

function projectKey(projectId) {
  const digest = crypto.createHash("sha256").update(projectId).digest("hex").slice(0, 12);
  return `${safeId(projectId).slice(0, 70)}-${digest}`;
}

function loadStoredProject(provider, scope) {
  const key = projectKey(scope);
  const current = provider.get(WORK_ARTIFACT_COLLECTION, key);
  if (current) return { key, stored: current };
  const legacyKey = safeId(scope);
  if (legacyKey === key) return { key, stored: null };
  const legacy = provider.get(WORK_ARTIFACT_COLLECTION, legacyKey);
  if (!legacy) return { key, stored: null };
  const initialized = provider.setIfAbsent(WORK_ARTIFACT_COLLECTION, key, legacy);
  if (initialized.inserted) provider.delete(WORK_ARTIFACT_COLLECTION, legacyKey);
  return { key, stored: initialized.value };
}

export function loadWorkArtifactStore(projectId = "default", options = {}) {
  const scope = assertProject(projectId, null, "Project");
  const provider = persistence(options);
  const { stored } = loadStoredProject(provider, scope);
  const store = normalizeStore(stored, scope);
  assertNoResolvableForeignRefs(store, provider);
  return clone(store);
}

function assertNoResolvableForeignRefs(store, provider) {
  const localIds = new Set(store.artifactHeads.map((head) => head.artifactId));
  const localGoals = provider.list("goals").find((item) => item?.projectId === store.projectId);
  const localGoalIds = new Set((localGoals?.goals ?? []).map((goal) => goal.id));
  const unresolved = [
    ...store.relationshipRevisions.flatMap((relation) => [relation.sourceRef, relation.targetRef]),
    ...store.artifactRevisions.flatMap((artifact) => [...(artifact.refs ?? []), ...(artifact.parentRefs ?? [])]),
  ].filter((ref) => (ref.type === "work-artifact" && !localIds.has(ref.id))
    || (ref.type === "goal" && !localGoalIds.has(ref.id)));
  if (!unresolved.length) return;
  const foreignAuthorities = [
    ...provider.list(WORK_ARTIFACT_COLLECTION).map((item) => ({ ...item, authorityType: "work-artifact" })),
    ...provider.list("goals").map((item) => ({ ...item, authorityType: "goal" })),
  ];
  for (const other of foreignAuthorities) {
    if (!other || other.projectId === store.projectId) continue;
    const foreign = unresolved.find((ref) => ref.type === other.authorityType && (
      ref.type === "work-artifact"
        ? other.artifactHeads?.some((head) => head.artifactId === ref.id)
        : other.goals?.some((goal) => goal.id === ref.id)
    ));
    if (foreign) throw new Error(`Reference ${foreign.type}:${foreign.id} belongs to project ${other.projectId}, not ${store.projectId}.`);
  }
}

function findRevision(store, revisionId, type) {
  const bag = type === "artifact" ? store.artifactRevisions : store.relationshipRevisions;
  const found = bag.find((item) => item.id === revisionId);
  if (!found) throw new Error(`${type === "artifact" ? "Artifact" : "Relationship"} revision not found: ${revisionId}`);
  return found;
}

function findHead(store, id, type, { includeRetired = true } = {}) {
  const bag = type === "artifact" ? store.artifactHeads : store.relationshipHeads;
  const idField = type === "artifact" ? "artifactId" : "relationshipId";
  const head = bag.find((item) => item[idField] === id);
  if (!head || (!includeRetired && head.retired)) throw new Error(`${type === "artifact" ? "Work artifact" : "Work relationship"} not found: ${id}`);
  return head;
}

function expectedRevision(value, label) {
  if (value == null) return null;
  if (!Number.isInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer.`);
  return value;
}

function assertExpected(actual, expected, scope, id = null) {
  if (expected == null || actual === expected) return;
  throw new WorkArtifactConflictError(
    `Stale ${scope} revision: expected ${expected}, current revision is ${actual}.`,
    { scope, id, expectedRevision: expected, actualRevision: actual },
  );
}

function option(input, options, name) {
  return input?.[name] ?? options?.[name];
}

function mutationPayload(input) {
  if (!input || typeof input !== "object") return input;
  const output = {};
  for (const key of Object.keys(input)) {
    if (["idempotencyKey", "expectedStoreRevision", "expectedArtifactRevision", "expectedRelationshipRevision"].includes(key)) continue;
    output[key] = input[key];
  }
  return normalizeArtifactValue(output, "mutation");
}

function fingerprint(operation, payload) {
  return crypto.createHash("sha256").update(JSON.stringify(normalizeArtifactValue({ operation, payload }))).digest("hex");
}

function replay(store, key, operation, payload) {
  if (!key) return null;
  const receipt = store.idempotency.find((item) => item.key === key);
  if (!receipt) return null;
  const nextFingerprint = fingerprint(operation, payload);
  if (receipt.fingerprint !== nextFingerprint) {
    throw new WorkArtifactConflictError(`Idempotency key "${key}" was already used for a different mutation.`, {
      scope: "idempotency", id: key,
    });
  }
  return clone(findRevision(store, receipt.resultRevisionId, receipt.resultType));
}

function commit(projectId, operation, input, options, change) {
  const scope = assertProject(projectId, input, "Mutation");
  const provider = persistence(options);
  const { key: projectDocumentKey, stored } = loadStoredProject(provider, scope);
  const store = normalizeStore(stored, scope);
  assertNoResolvableForeignRefs(store, provider);
  const actor = mutationActor(input, options);
  const attributedInput = { ...input, revisionAuthor: actor };
  const key = text(option(input, options, "idempotencyKey"), "idempotencyKey");
  const payload = mutationPayload(attributedInput);
  const replayed = replay(store, key, operation, payload);
  if (replayed) return replayed;
  assertExpected(store.revision, expectedRevision(option(input, options, "expectedStoreRevision"), "expectedStoreRevision"), "store", scope);

  const draft = clone(store);
  const result = change(draft, actor);
  draft.revision = store.revision + 1;
  draft.updatedAt = clock(options);
  if (key) {
    draft.idempotency.push({
      key,
      operation,
      fingerprint: fingerprint(operation, payload),
      resultType: "artifactId" in result ? "artifact" : "relationship",
      resultRevisionId: result.id,
      storeRevision: draft.revision,
      createdAt: draft.updatedAt,
    });
  }
  validateStoreInvariants(draft);
  assertNoResolvableForeignRefs(draft, provider);
  if (typeof options.beforeCommit === "function") options.beforeCommit({ store: clone(store), next: clone(draft) });
  try {
    provider.compareAndSet(WORK_ARTIFACT_COLLECTION, projectDocumentKey, store.revision, draft);
  } catch (error) {
    if (error instanceof PersistenceConflictError) {
      throw new WorkArtifactConflictError(error.message, {
        scope: "store",
        id: scope,
        expectedRevision: store.revision,
        actualRevision: error.actualRevision,
        cause: error,
      });
    }
    throw error;
  }
  return clone(result);
}

function setHead(store, type, revision, at) {
  const isArtifact = type === "artifact";
  const bagName = isArtifact ? "artifactHeads" : "relationshipHeads";
  const idField = isArtifact ? "artifactId" : "relationshipId";
  const id = revision[idField];
  const head = {
    [idField]: id,
    revision: revision.revision,
    revisionId: revision.id,
    retired: Boolean(revision.retiredAt),
    updatedAt: at,
    ...(isArtifact ? { lineageId: revision.lineageId } : {}),
  };
  store[bagName] = [...store[bagName].filter((item) => item[idField] !== id), head];
}

function nextArtifactRevision(current, patch, projectId, options, { parentRefs, retiredAt } = {}) {
  const revision = current ? current.revision + 1 : 1;
  const artifactId = current?.artifactId ?? text(patch.id ?? patch.artifactId, "artifact id") ?? makeId("artifact", options);
  const at = clock(options);
  const base = current ?? {};
  const actor = mutationActor(patch, options);
  return normalizeWorkArtifactRevision({
    ...base,
    ...patch,
    id: `${artifactId}:r${revision}`,
    artifactId,
    projectId,
    lineageId: patch.lineageId ?? base.lineageId ?? artifactId,
    revision,
    parentRefs: parentRefs ?? refsFrom(patch.parentRefs ?? patch.parentRef ?? [], projectId),
    createdBy: current?.createdBy ?? actor,
    revisionAuthor: actor,
    createdAt: at,
    ...(retiredAt ? { retiredAt } : { retiredAt: null }),
  }, projectId);
}

function nextRelationshipRevision(current, patch, projectId, options, { retiredAt } = {}) {
  const revision = current ? current.revision + 1 : 1;
  const relationshipId = current?.relationshipId ?? text(patch.id ?? patch.relationshipId, "relationship id") ?? makeId("relation", options);
  const at = clock(options);
  const actor = mutationActor(patch, options);
  return normalizeWorkRelationshipRevision({
    ...(current ?? {}),
    ...patch,
    id: `${relationshipId}:r${revision}`,
    relationshipId,
    projectId,
    revision,
    declaredProvenance: patch.declaredProvenance ?? patch.provenance ?? current?.declaredProvenance,
    parentRefs: current ? [relationRevisionRef(current)] : [],
    createdBy: current?.createdBy ?? actor,
    revisionAuthor: actor,
    createdAt: at,
    ...(retiredAt ? { retiredAt } : { retiredAt: null }),
  }, projectId);
}

export function createWorkArtifact(projectId, input = {}, options = {}) {
  return commit(projectId, "create-artifact", input, options, (store) => {
    const revision = nextArtifactRevision(null, input, projectId, options);
    if (store.artifactHeads.some((head) => head.artifactId === revision.artifactId)) throw new Error(`Work artifact already exists: ${revision.artifactId}`);
    store.artifactRevisions.push(revision);
    setHead(store, "artifact", revision, revision.createdAt);
    return revision;
  });
}

export function reviseWorkArtifact(projectId, artifact, patch = {}, options = {}) {
  assertProject(projectId, patch, "Artifact patch");
  assertPatch(patch, ARTIFACT_PATCH_FIELDS, "artifact");
  const artifactId = selectorId(artifact, projectId, "Artifact");
  return commit(projectId, `revise-artifact:${artifactId}`, patch, options, (store) => {
    const head = findHead(store, artifactId, "artifact", { includeRetired: false });
    assertExpected(head.revision, expectedRevision(option(patch, options, "expectedArtifactRevision"), "expectedArtifactRevision"), "artifact head", artifactId);
    const current = findRevision(store, head.revisionId, "artifact");
    const suppliedParents = refsFrom(patch.parentRefs ?? patch.parentRef ?? [], projectId);
    const revision = nextArtifactRevision(current, patch, projectId, options, {
      parentRefs: refsFrom([artifactRevisionRef(current), ...suppliedParents], projectId),
    });
    store.artifactRevisions.push(revision);
    setHead(store, "artifact", revision, revision.createdAt);
    return revision;
  });
}

export function branchWorkArtifact(projectId, artifact, input = {}, options = {}) {
  const sourceId = selectorId(artifact, projectId, "Source artifact");
  return commit(projectId, `branch-artifact:${sourceId}`, input, options, (store) => {
    const sourceHead = findHead(store, sourceId, "artifact", { includeRetired: false });
    assertExpected(sourceHead.revision, expectedRevision(option(input, options, "expectedArtifactRevision"), "expectedArtifactRevision"), "artifact head", sourceId);
    const source = findRevision(store, sourceHead.revisionId, "artifact");
    const artifactId = text(input.id ?? input.artifactId, "branch artifact id") ?? makeId("artifact", options);
    if (store.artifactHeads.some((head) => head.artifactId === artifactId)) throw new Error(`Work artifact already exists: ${artifactId}`);
    const suppliedParents = refsFrom(input.parentRefs ?? input.parentRef ?? [], projectId);
    const revision = nextArtifactRevision(null, {
      ...source,
      ...input,
      id: artifactId,
      artifactId,
      lineageId: source.lineageId,
    }, projectId, options, { parentRefs: refsFrom([artifactRevisionRef(source), ...suppliedParents], projectId) });
    store.artifactRevisions.push(revision);
    setHead(store, "artifact", revision, revision.createdAt);
    return revision;
  });
}

export function retireWorkArtifact(projectId, artifact, input = {}, options = {}) {
  const artifactId = selectorId(artifact, projectId, "Artifact");
  return commit(projectId, `retire-artifact:${artifactId}`, input, options, (store) => {
    const head = findHead(store, artifactId, "artifact", { includeRetired: false });
    assertExpected(head.revision, expectedRevision(option(input, options, "expectedArtifactRevision"), "expectedArtifactRevision"), "artifact head", artifactId);
    const current = findRevision(store, head.revisionId, "artifact");
    const at = clock(options);
    const revision = nextArtifactRevision(current, {
      status: input.status ?? "retired",
      createdBy: input.createdBy,
      modelReceipts: input.modelReceipts,
      toolReceipts: input.toolReceipts,
    }, projectId, options, { parentRefs: [artifactRevisionRef(current)], retiredAt: at });
    const tombstone = {
      id: `${artifactId}:tombstone:r${revision.revision}`,
      projectId,
      artifactRef: { type: "work-artifact", id: artifactId },
      revisionRef: artifactRevisionRef(revision),
      reason: text(input.reason, "retirement reason"),
      createdBy: revision.createdBy,
      createdAt: at,
    };
    store.artifactRevisions.push(revision);
    store.tombstones.push(tombstone);
    setHead(store, "artifact", revision, at);
    return revision;
  });
}

export function restoreWorkArtifact(projectId, artifact, input = {}, options = {}) {
  const artifactId = selectorId(artifact, projectId, "Artifact");
  return commit(projectId, `restore-artifact:${artifactId}`, input, options, (store) => {
    const head = findHead(store, artifactId, "artifact");
    if (!head.retired && input.revision == null) throw new Error(`Work artifact is not retired: ${artifactId}`);
    assertExpected(head.revision, expectedRevision(option(input, options, "expectedArtifactRevision"), "expectedArtifactRevision"), "artifact head", artifactId);
    const current = findRevision(store, head.revisionId, "artifact");
    const history = store.artifactRevisions.filter((item) => item.artifactId === artifactId);
    const target = input.revision == null
      ? [...history].reverse().find((item) => !item.retiredAt)
      : history.find((item) => item.revision === input.revision);
    if (!target || target.retiredAt) throw new Error(`Restorable artifact revision not found: ${artifactId} revision ${input.revision ?? "latest active"}`);
    const latestTombstone = [...store.tombstones].reverse().find((item) => item.artifactRef?.id === artifactId);
    const revision = nextArtifactRevision(current, {
      ...target,
      status: input.status ?? target.status,
      createdBy: input.createdBy,
      modelReceipts: input.modelReceipts,
      toolReceipts: input.toolReceipts,
    }, projectId, options, {
      parentRefs: refsFrom([
        artifactRevisionRef(current),
        artifactRevisionRef(target),
        ...(head.retired && latestTombstone ? [{ type: "work-artifact-tombstone", id: latestTombstone.id }] : []),
      ], projectId),
    });
    store.artifactRevisions.push(revision);
    setHead(store, "artifact", revision, revision.createdAt);
    return revision;
  });
}

export function getWorkArtifact(projectId, artifact, options = {}) {
  const scope = assertProject(projectId, artifact, "Artifact");
  const artifactId = selectorId(artifact, scope, "Artifact");
  const store = loadWorkArtifactStore(scope, options);
  const head = findHead(store, artifactId, "artifact", { includeRetired: options.includeRetired !== false });
  return clone(findRevision(store, head.revisionId, "artifact"));
}

export function listWorkArtifacts(projectId, options = {}) {
  const store = loadWorkArtifactStore(projectId, options);
  return store.artifactHeads
    .filter((head) => options.includeRetired === true || !head.retired)
    .map((head) => clone(findRevision(store, head.revisionId, "artifact")))
    .sort((a, b) => a.artifactId.localeCompare(b.artifactId));
}

export function getWorkArtifactHistory(projectId, artifact, options = {}) {
  const artifactId = selectorId(artifact, projectId, "Artifact");
  return loadWorkArtifactStore(projectId, options).artifactRevisions
    .filter((item) => item.artifactId === artifactId)
    .sort((a, b) => a.revision - b.revision)
    .map(clone);
}

export function createWorkRelationship(projectId, input = {}, options = {}) {
  return commit(projectId, "create-relationship", input, options, (store) => {
    const revision = nextRelationshipRevision(null, input, projectId, options);
    if (store.relationshipHeads.some((head) => head.relationshipId === revision.relationshipId)) throw new Error(`Work relationship already exists: ${revision.relationshipId}`);
    store.relationshipRevisions.push(revision);
    setHead(store, "relationship", revision, revision.createdAt);
    return revision;
  });
}

export function reviseWorkRelationship(projectId, relationship, patch = {}, options = {}) {
  assertProject(projectId, patch, "Relationship patch");
  assertPatch(patch, RELATIONSHIP_PATCH_FIELDS, "relationship");
  const relationshipId = selectorId(relationship, projectId, "Relationship");
  return commit(projectId, `revise-relationship:${relationshipId}`, patch, options, (store) => {
    const head = findHead(store, relationshipId, "relationship", { includeRetired: false });
    assertExpected(head.revision, expectedRevision(option(patch, options, "expectedRelationshipRevision"), "expectedRelationshipRevision"), "relationship head", relationshipId);
    const current = findRevision(store, head.revisionId, "relationship");
    const revision = nextRelationshipRevision(current, patch, projectId, options);
    store.relationshipRevisions.push(revision);
    setHead(store, "relationship", revision, revision.createdAt);
    return revision;
  });
}

export function retireWorkRelationship(projectId, relationship, input = {}, options = {}) {
  const relationshipId = selectorId(relationship, projectId, "Relationship");
  return commit(projectId, `retire-relationship:${relationshipId}`, input, options, (store) => {
    const head = findHead(store, relationshipId, "relationship", { includeRetired: false });
    assertExpected(head.revision, expectedRevision(option(input, options, "expectedRelationshipRevision"), "expectedRelationshipRevision"), "relationship head", relationshipId);
    const current = findRevision(store, head.revisionId, "relationship");
    const revision = nextRelationshipRevision(current, {
      createdBy: input.createdBy,
      modelReceipts: input.modelReceipts,
      toolReceipts: input.toolReceipts,
    }, projectId, options, { retiredAt: clock(options) });
    store.relationshipRevisions.push(revision);
    setHead(store, "relationship", revision, revision.createdAt);
    return revision;
  });
}

export function restoreWorkRelationship(projectId, relationship, input = {}, options = {}) {
  const relationshipId = selectorId(relationship, projectId, "Relationship");
  return commit(projectId, `restore-relationship:${relationshipId}`, input, options, (store) => {
    const head = findHead(store, relationshipId, "relationship");
    if (!head.retired) throw new Error(`Work relationship is not retired: ${relationshipId}`);
    assertExpected(head.revision, expectedRevision(option(input, options, "expectedRelationshipRevision"), "expectedRelationshipRevision"), "relationship head", relationshipId);
    const current = findRevision(store, head.revisionId, "relationship");
    const target = [...store.relationshipRevisions].reverse().find((item) => item.relationshipId === relationshipId && !item.retiredAt);
    if (!target) throw new Error(`Restorable work relationship revision not found: ${relationshipId}`);
    const revision = nextRelationshipRevision(current, {
      ...target,
      createdBy: input.createdBy,
      modelReceipts: input.modelReceipts,
      toolReceipts: input.toolReceipts,
    }, projectId, options);
    store.relationshipRevisions.push(revision);
    setHead(store, "relationship", revision, revision.createdAt);
    return revision;
  });
}

export function getWorkRelationship(projectId, relationship, options = {}) {
  const relationshipId = selectorId(relationship, projectId, "Relationship");
  const store = loadWorkArtifactStore(projectId, options);
  const head = findHead(store, relationshipId, "relationship", { includeRetired: options.includeRetired !== false });
  return clone(findRevision(store, head.revisionId, "relationship"));
}

export function listWorkRelationships(projectId, options = {}) {
  const store = loadWorkArtifactStore(projectId, options);
  return store.relationshipHeads
    .filter((head) => options.includeRetired === true || !head.retired)
    .map((head) => clone(findRevision(store, head.revisionId, "relationship")))
    .sort((a, b) => a.relationshipId.localeCompare(b.relationshipId));
}

export function getWorkRelationshipHistory(projectId, relationship, options = {}) {
  const relationshipId = selectorId(relationship, projectId, "Relationship");
  return loadWorkArtifactStore(projectId, options).relationshipRevisions
    .filter((item) => item.relationshipId === relationshipId)
    .sort((a, b) => a.revision - b.revision)
    .map(clone);
}

// Object-shaped facade for callers which prefer the repository's store convention.
export const workArtifactStore = Object.freeze({
  collection: WORK_ARTIFACT_COLLECTION,
  load: loadWorkArtifactStore,
  create: createWorkArtifact,
  get: getWorkArtifact,
  list: listWorkArtifacts,
  history: getWorkArtifactHistory,
  revise: reviseWorkArtifact,
  branch: branchWorkArtifact,
  retire: retireWorkArtifact,
  restore: restoreWorkArtifact,
  createRelationship: createWorkRelationship,
  getRelationship: getWorkRelationship,
  listRelationships: listWorkRelationships,
  relationshipHistory: getWorkRelationshipHistory,
  reviseRelationship: reviseWorkRelationship,
  retireRelationship: retireWorkRelationship,
  restoreRelationship: restoreWorkRelationship,
});
