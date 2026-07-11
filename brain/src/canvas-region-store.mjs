import crypto from "node:crypto";
import { PersistenceConflictError, persistence } from "./persistence.mjs";

const COLLECTION = "canvas-regions";
const SCHEMA_VERSION = 1;
const RECEIPT_LIMIT = 256;

export class CanvasRegionConflictError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "CanvasRegionConflictError";
    this.code = "CANVAS_REGION_CONFLICT";
    Object.assign(this, details);
  }
}

function clean(value) { return String(value ?? "").trim(); }
function required(value, label) {
  const result = clean(value);
  if (!result) throw new Error(`${label} is required.`);
  return result;
}
function at(options = {}) { return typeof options.now === "function" ? options.now() : new Date().toISOString(); }
function clone(value) { return structuredClone(value); }
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function fingerprint(kind, value) { return crypto.createHash("sha256").update(`${kind}\0${stable(value)}`).digest("hex"); }
function keyFor(projectId) { return encodeURIComponent(required(projectId, "projectId")); }
function deterministicId(projectId, idempotencyKey) {
  return `region-${crypto.createHash("sha256").update(`${projectId}\0${idempotencyKey}`).digest("hex").slice(0, 20)}`;
}
function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be a finite number.`);
  return number;
}
function normalizeRef(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Region members must be stable references.");
  return { type: required(input.type, "Region member type").toLowerCase(), id: required(input.id, "Region member id") };
}
function normalizeRefs(input = []) {
  if (!Array.isArray(input)) throw new Error("memberRefs must be an array.");
  const seen = new Set();
  return input.map(normalizeRef).filter((ref) => {
    const key = `${ref.type}:${ref.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((left, right) => `${left.type}:${left.id}`.localeCompare(`${right.type}:${right.id}`));
}
function normalizePosition(input = {}) {
  return { x: finite(input.x ?? 0, "Region x"), y: finite(input.y ?? 0, "Region y") };
}
function normalizeSize(input = {}) {
  const width = finite(input.width ?? 640, "Region width");
  const height = finite(input.height ?? 420, "Region height");
  if (width < 160 || height < 120) throw new Error("Region size must be at least 160 by 120.");
  return { width, height };
}
function normalizePlacementMode(value) {
  const mode = clean(value || "founder").toLowerCase();
  if (mode !== "founder" && mode !== "automatic") throw new Error("placementMode must be founder or automatic.");
  return mode;
}
function normalizeRegion(input, projectId) {
  const createdAt = input.createdAt || input.updatedAt || new Date(0).toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: required(input.id, "Region id"),
    projectId: required(input.projectId ?? projectId, "projectId"),
    title: required(input.title, "Region title"),
    purpose: clean(input.purpose) || null,
    memberRefs: normalizeRefs(input.memberRefs),
    position: normalizePosition(input.position),
    size: normalizeSize(input.size),
    collapsed: Boolean(input.collapsed),
    founderPlaced: Boolean(input.founderPlaced),
    revision: Number.isInteger(input.revision) && input.revision >= 0 ? input.revision : 0,
    createdBy: required(input.createdBy, "createdBy"),
    revisionAuthor: required(input.revisionAuthor ?? input.createdBy, "revisionAuthor"),
    createdAt,
    updatedAt: input.updatedAt || createdAt,
    ...(input.archivedAt ? { archivedAt: input.archivedAt } : {}),
  };
}
function empty(projectId) {
  return { schemaVersion: SCHEMA_VERSION, projectId, revision: 0, regions: [], idempotency: [] };
}
function normalizeAuthority(input, projectId) {
  if (!input) return empty(projectId);
  if (input.projectId && input.projectId !== projectId) throw new Error(`Region authority belongs to project ${input.projectId}, not ${projectId}.`);
  return {
    schemaVersion: SCHEMA_VERSION,
    projectId,
    revision: Number.isInteger(input.revision) && input.revision >= 0 ? input.revision : 0,
    regions: Array.isArray(input.regions) ? input.regions.map((item) => normalizeRegion(item, projectId)) : [],
    idempotency: Array.isArray(input.idempotency) ? input.idempotency.slice(-RECEIPT_LIMIT) : [],
  };
}
function load(projectId, options = {}) {
  return normalizeAuthority(persistence(options).get(COLLECTION, keyFor(projectId)), projectId);
}
function actor(input, options) { return required(input.revisionAuthor ?? input.actor ?? options.revisionAuthor ?? options.actor, "revisionAuthor"); }
function expected(value) {
  if (!Number.isInteger(value) || value < 0) throw new Error("expectedRevision must be a non-negative integer.");
  return value;
}
function idempotency(input, options) { return required(input.idempotencyKey ?? options.idempotencyKey, "idempotencyKey"); }
function assertRecord(authority, regionId, options = {}) {
  const index = authority.regions.findIndex((item) => item.id === regionId);
  if (index >= 0) return index;
  for (const other of persistence(options).list(COLLECTION)) {
    if (other?.projectId !== authority.projectId && other?.regions?.some((item) => item.id === regionId)) {
      throw new Error(`Canvas region ${regionId} belongs to project ${other.projectId}, not ${authority.projectId}.`);
    }
  }
  throw new Error(`Canvas region not found in project ${authority.projectId}: ${regionId}`);
}
function assertMemberScope(authority, refs, options = {}) {
  const provider = persistence(options);
  const foreign = [
    ...provider.list("goals").map((item) => ({ type: "goal", projectId: item.projectId, ids: item.goals?.map((record) => record.id) ?? [] })),
    ...provider.list("work-artifacts").map((item) => ({ type: "work-artifact", projectId: item.projectId, ids: item.artifactHeads?.map((record) => record.artifactId) ?? [] })),
    ...provider.list(COLLECTION).map((item) => ({ type: "work-region", projectId: item.projectId, ids: item.regions?.map((record) => record.id) ?? [] })),
  ];
  for (const ref of refs) {
    const owner = foreign.find((item) => item.projectId !== authority.projectId && item.type === ref.type && item.ids.includes(ref.id));
    if (owner) throw new Error(`Reference ${ref.type}:${ref.id} belongs to project ${owner.projectId}, not ${authority.projectId}.`);
  }
}
function assertOneLevelHierarchy(authority, candidate = null) {
  const regions = new Map(authority.regions.map((region) => [region.id, region]));
  if (candidate) regions.set(candidate.id, candidate);
  const parentsByChild = new Map();
  for (const region of regions.values()) {
    const childIds = region.memberRefs.filter((ref) => ref.type === "work-region").map((ref) => ref.id);
    if (childIds.includes(region.id)) throw new Error(`Canvas region ${region.id} cannot contain itself.`);
    for (const childId of childIds) {
      if (!regions.has(childId)) throw new Error(`Nested canvas region not found in project ${authority.projectId}: ${childId}`);
      const parents = parentsByChild.get(childId) ?? [];
      parents.push(region.id);
      parentsByChild.set(childId, parents);
    }
  }
  for (const region of regions.values()) {
    const childIds = region.memberRefs.filter((ref) => ref.type === "work-region").map((ref) => ref.id);
    if (childIds.length && parentsByChild.has(region.id)) {
      throw new Error(`Canvas regions support one grouping layer only. Region ${region.id} cannot contain a region while nested inside another.`);
    }
  }
}
function begin(projectId, kind, payload, input, options) {
  const authority = load(projectId, options);
  const key = idempotency(input, options);
  const hash = fingerprint(kind, payload);
  const receipt = authority.idempotency.find((item) => item.key === key);
  if (receipt) {
    if (receipt.kind !== kind || receipt.fingerprint !== hash) throw new CanvasRegionConflictError(`Idempotency key ${key} was already used for a different region mutation.`, { projectId });
    const region = authority.regions.find((item) => item.id === receipt.regionId);
    return { authority, key, hash, result: region ? clone(region) : null };
  }
  return { authority, key, hash, result: undefined };
}
function commit(authority, mutation, region, options = {}) {
  const next = {
    ...authority,
    revision: authority.revision + 1,
    idempotency: [...authority.idempotency, { key: mutation.key, kind: mutation.kind, fingerprint: mutation.hash, regionId: region.id }].slice(-RECEIPT_LIMIT),
  };
  try {
    persistence(options).compareAndSet(COLLECTION, keyFor(authority.projectId), authority.revision, next);
  } catch (error) {
    if (error instanceof PersistenceConflictError) throw new CanvasRegionConflictError(error.message, {
      projectId: authority.projectId, expectedRevision: authority.revision, actualRevision: error.actualRevision,
    });
    throw error;
  }
  return clone(region);
}

export function createCanvasRegion(projectId, input = {}, options = {}) {
  projectId = required(projectId, "projectId");
  const key = idempotency(input, options);
  const regionId = clean(input.id) || deterministicId(projectId, key);
  const mode = normalizePlacementMode(input.placementMode);
  const revisionAuthor = actor(input, options);
  const timestamp = at(options);
  const payload = { ...input, id: regionId, projectId, revisionAuthor, placementMode: mode, idempotencyKey: undefined };
  const started = begin(projectId, "create-region", payload, input, options);
  if (started.result !== undefined) return started.result;
  if (started.authority.regions.some((item) => item.id === regionId)) throw new Error(`Canvas region already exists in project ${projectId}: ${regionId}`);
  if (input.expectedStoreRevision != null && input.expectedStoreRevision !== started.authority.revision) {
    throw new CanvasRegionConflictError(`Stale canvas region store revision: expected ${input.expectedStoreRevision}, current ${started.authority.revision}.`, { projectId, expectedRevision: input.expectedStoreRevision, actualRevision: started.authority.revision });
  }
  const region = normalizeRegion({ ...input, id: regionId, projectId, revision: 0, revisionAuthor, createdBy: input.createdBy ?? revisionAuthor, createdAt: timestamp, updatedAt: timestamp, founderPlaced: mode === "founder" }, projectId);
  assertMemberScope(started.authority, region.memberRefs, options);
  assertOneLevelHierarchy(started.authority, region);
  started.authority.regions.push(region);
  return commit(started.authority, { ...started, kind: "create-region" }, region, options);
}

export function reviseCanvasRegion(projectId, regionId, patch = {}, options = {}) {
  projectId = required(projectId, "projectId");
  regionId = required(regionId, "regionId");
  const revisionAuthor = actor(patch, options);
  const expectedRevision = expected(patch.expectedRevision ?? options.expectedRevision);
  const mode = normalizePlacementMode(patch.placementMode);
  const cleanPatch = { ...patch };
  for (const field of ["id", "projectId", "revision", "createdAt", "createdBy", "archivedAt", "idempotencyKey", "expectedRevision", "revisionAuthor", "actor", "placementMode"]) delete cleanPatch[field];
  const payload = { regionId, patch: cleanPatch, expectedRevision, revisionAuthor, placementMode: mode };
  const started = begin(projectId, "revise-region", payload, patch, options);
  if (started.result !== undefined) return started.result;
  const index = assertRecord(started.authority, regionId, options);
  const current = started.authority.regions[index];
  if (current.revision !== expectedRevision) throw new CanvasRegionConflictError(`Stale canvas region ${regionId} revision: expected ${expectedRevision}, current ${current.revision}.`, { projectId, regionId, expectedRevision, actualRevision: current.revision });
  if (current.archivedAt) throw new Error(`Canvas region ${regionId} is archived.`);
  const touchesPlacement = ["position", "size", "collapsed"].some((field) => Object.hasOwn(cleanPatch, field));
  if (touchesPlacement && mode === "automatic" && current.founderPlaced) throw new CanvasRegionConflictError(`Automatic layout cannot overwrite founder placement for canvas region ${regionId}.`, { projectId, regionId });
  const timestamp = at(options);
  const next = normalizeRegion({ ...current, ...cleanPatch, revision: current.revision + 1, revisionAuthor, updatedAt: timestamp, founderPlaced: current.founderPlaced || (touchesPlacement && mode === "founder") }, projectId);
  assertMemberScope(started.authority, next.memberRefs, options);
  assertOneLevelHierarchy(started.authority, next);
  started.authority.regions[index] = next;
  return commit(started.authority, { ...started, kind: "revise-region" }, next, options);
}

function setArchived(projectId, regionId, input, options, reopen) {
  const revisionAuthor = actor(input, options);
  const expectedRevision = expected(input.expectedRevision ?? options.expectedRevision);
  const kind = reopen ? "reopen-region" : "archive-region";
  const payload = { regionId, expectedRevision, revisionAuthor };
  const started = begin(projectId, kind, payload, input, options);
  if (started.result !== undefined) return started.result;
  const index = assertRecord(started.authority, regionId, options);
  const current = started.authority.regions[index];
  if (current.revision !== expectedRevision) throw new CanvasRegionConflictError(`Stale canvas region ${regionId} revision: expected ${expectedRevision}, current ${current.revision}.`, { projectId, regionId, expectedRevision, actualRevision: current.revision });
  if (reopen ? !current.archivedAt : current.archivedAt) throw new Error(`Canvas region ${regionId} is already ${reopen ? "open" : "archived"}.`);
  const timestamp = at(options);
  const next = normalizeRegion({ ...current, revision: current.revision + 1, revisionAuthor, updatedAt: timestamp, ...(reopen ? { archivedAt: undefined } : { archivedAt: timestamp }) }, projectId);
  started.authority.regions[index] = next;
  return commit(started.authority, { ...started, kind }, next, options);
}

export const archiveCanvasRegion = (projectId, regionId, input = {}, options = {}) => setArchived(required(projectId, "projectId"), required(regionId, "regionId"), input, options, false);
export const reopenCanvasRegion = (projectId, regionId, input = {}, options = {}) => setArchived(required(projectId, "projectId"), required(regionId, "regionId"), input, options, true);

// Internal structural-history primitive. This restores the canvas-owned shape in one CAS write so an
// undo cannot stop halfway between lifecycle and geometry changes. It never deletes the region or any
// referenced authority, and it is intentionally not exposed as a general HTTP mutation.
export function restoreCanvasRegionStructure(projectId, regionId, snapshot = {}, input = {}, options = {}) {
  projectId = required(projectId, "projectId");
  regionId = required(regionId, "regionId");
  const revisionAuthor = actor(input, options);
  const expectedRevision = expected(input.expectedRevision ?? options.expectedRevision);
  const structural = {
    title: required(snapshot.title, "Region title"),
    purpose: clean(snapshot.purpose) || null,
    memberRefs: normalizeRefs(snapshot.memberRefs),
    position: normalizePosition(snapshot.position),
    size: normalizeSize(snapshot.size),
    collapsed: Boolean(snapshot.collapsed),
    founderPlaced: Boolean(snapshot.founderPlaced),
    archived: Boolean(snapshot.archived),
  };
  const payload = { regionId, structural, expectedRevision, revisionAuthor };
  const started = begin(projectId, "restore-region-structure", payload, input, options);
  if (started.result !== undefined) return started.result;
  const index = assertRecord(started.authority, regionId, options);
  const current = started.authority.regions[index];
  if (current.revision !== expectedRevision) throw new CanvasRegionConflictError(`Stale canvas region ${regionId} revision: expected ${expectedRevision}, current ${current.revision}.`, { projectId, regionId, expectedRevision, actualRevision: current.revision });
  assertMemberScope(started.authority, structural.memberRefs, options);
  const changedAt = at(options);
  const next = normalizeRegion({
    ...current,
    ...structural,
    revision: current.revision + 1,
    revisionAuthor,
    updatedAt: changedAt,
    archivedAt: structural.archived ? (current.archivedAt || changedAt) : undefined,
  }, projectId);
  assertOneLevelHierarchy(started.authority, next);
  started.authority.regions[index] = next;
  return commit(started.authority, { ...started, kind: "restore-region-structure" }, next, options);
}
export function getCanvasRegion(projectId, regionId, options = {}) {
  const authority = load(projectId, options);
  const region = authority.regions[assertRecord(authority, regionId, options)];
  if (region.archivedAt && options.includeArchived !== true) throw new Error(`Canvas region not found in project ${projectId}: ${regionId}`);
  return clone(region);
}
export function listCanvasRegions(projectId, options = {}) {
  return clone(load(projectId, options).regions.filter((item) => options.includeArchived === true || !item.archivedAt).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)));
}
export const canvasRegionStore = { collection: COLLECTION, load, list: listCanvasRegions, get: getCanvasRegion, create: createCanvasRegion, revise: reviseCanvasRegion, archive: archiveCanvasRegion, reopen: reopenCanvasRegion, restoreStructure: restoreCanvasRegionStructure };
