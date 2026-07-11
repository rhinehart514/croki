import crypto from "node:crypto";
import { PersistenceConflictError, persistence } from "./persistence.mjs";
import { canvasRegionStore } from "./canvas-region-store.mjs";
import { objectGraphLayoutStore, PROJECT_CANVAS_LAYOUT_NAMESPACE } from "./object-graph-store.mjs";

const COLLECTION = "canvas-structure-history";
const SCHEMA_VERSION = 1;
const ENTRY_LIMIT = 100;
const RECEIPT_LIMIT = 256;

export class CanvasStructureHistoryConflictError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "CanvasStructureHistoryConflictError";
    this.code = "CANVAS_STRUCTURE_HISTORY_CONFLICT";
    Object.assign(this, details);
  }
}

const clone = (value) => structuredClone(value);
const clean = (value) => String(value ?? "").trim();
function required(value, label) {
  const result = clean(value);
  if (!result) throw new Error(`${label} is required.`);
  return result;
}
function timestamp(options = {}) { return typeof options.now === "function" ? options.now() : new Date().toISOString(); }
function keyFor(projectId) { return encodeURIComponent(required(projectId, "projectId")); }
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function fingerprint(value) { return crypto.createHash("sha256").update(stable(value)).digest("hex"); }
function expectedRevision(value) {
  if (!Number.isInteger(value) || value < 0) throw new Error("expectedHistoryRevision must be a non-negative integer.");
  return value;
}

function empty(projectId) {
  return { schemaVersion: SCHEMA_VERSION, projectId, revision: 0, entries: [], idempotency: [] };
}
function normalize(input, projectId) {
  if (!input) return empty(projectId);
  if (input.projectId !== projectId) throw new Error(`Canvas history belongs to project ${input.projectId}, not ${projectId}.`);
  return {
    schemaVersion: SCHEMA_VERSION,
    projectId,
    revision: Number.isInteger(input.revision) ? input.revision : 0,
    entries: Array.isArray(input.entries) ? input.entries : [],
    idempotency: Array.isArray(input.idempotency) ? input.idempotency.slice(-RECEIPT_LIMIT) : [],
  };
}
function load(projectId, options = {}) {
  projectId = required(projectId, "projectId");
  return normalize(persistence(options).get(COLLECTION, keyFor(projectId)), projectId);
}
function commit(current, patch, options = {}) {
  const next = { ...current, ...patch, revision: current.revision + 1 };
  try {
    persistence(options).compareAndSet(COLLECTION, keyFor(current.projectId), current.revision, next);
  } catch (error) {
    if (error instanceof PersistenceConflictError) throw new CanvasStructureHistoryConflictError(error.message, {
      projectId: current.projectId,
      expectedRevision: current.revision,
      actualRevision: error.actualRevision,
    });
    throw error;
  }
  return next;
}
function publicDocument(document) {
  return {
    projectId: document.projectId,
    revision: document.revision,
    entries: clone(document.entries.filter((entry) => entry.status !== "failed" && entry.status !== "superseded")),
  };
}
function assertIdle(document) {
  const pending = document.entries.find((entry) => ["applying", "undoing", "redoing"].includes(entry.status));
  if (pending) throw new CanvasStructureHistoryConflictError(`Canvas structure change ${pending.id} is still ${pending.status}. Retry that operation before starting another.`, {
    projectId: document.projectId, entryId: pending.id, actualRevision: document.revision,
  });
}

function regionShape(region) {
  if (!region) return null;
  return {
    id: region.id,
    title: region.title,
    purpose: region.purpose ?? null,
    memberRefs: clone(region.memberRefs ?? []),
    position: clone(region.position),
    size: clone(region.size),
    collapsed: Boolean(region.collapsed),
    founderPlaced: Boolean(region.founderPlaced),
    archived: Boolean(region.archivedAt),
  };
}
function layoutShape(layout) {
  return {
    positions: clone(layout.positions ?? {}),
    collapsedGroups: clone(layout.collapsedGroups ?? []),
    pinnedCrew: clone(layout.pinnedCrew ?? []),
    viewport: clone(layout.viewport ?? null),
  };
}
function sameShape(left, right) { return stable(left) === stable(right); }
function regionSummary(operation, before, after) {
  const title = after?.title ?? before?.title ?? "region";
  if (operation === "create") return `Created region “${title}”`;
  if (operation === "archive") return `Archived region “${title}”`;
  if (operation === "reopen") return `Reopened region “${title}”`;
  const changes = [];
  if (!sameShape(before?.position, after?.position)) changes.push("moved");
  if (!sameShape(before?.size, after?.size)) changes.push("resized");
  if (before?.collapsed !== after?.collapsed) changes.push(after?.collapsed ? "collapsed" : "expanded");
  if (!sameShape(before?.memberRefs, after?.memberRefs)) changes.push("changed membership");
  if (before?.title !== after?.title) changes.push("renamed");
  return `${changes.length ? changes.join(", ") : "Updated"} region “${title}”`;
}
function layoutSummary(before, after) {
  const moved = Object.keys(after.positions).filter((id) => !sameShape(before.positions[id], after.positions[id])).length;
  const removed = Object.keys(before.positions).filter((id) => !Object.hasOwn(after.positions, id)).length;
  const details = [];
  if (moved) details.push(`${moved} ${moved === 1 ? "item" : "items"} placed`);
  if (removed) details.push(`${removed} ${removed === 1 ? "placement" : "placements"} cleared`);
  if (!sameShape(before.collapsedGroups, after.collapsedGroups)) details.push("group visibility changed");
  if (!sameShape(before.viewport, after.viewport)) details.push("view changed");
  return details.length ? details.join(", ") : "Canvas layout updated";
}

function beginEntry(projectId, descriptor, input, options) {
  const idempotencyKey = required(input.idempotencyKey, "idempotencyKey");
  const mutationFingerprint = fingerprint(descriptor.fingerprint);
  const current = load(projectId, options);
  const receipt = current.idempotency.find((item) => item.key === idempotencyKey);
  if (receipt) {
    if (receipt.fingerprint !== mutationFingerprint || receipt.action !== "apply") {
      throw new CanvasStructureHistoryConflictError(`Idempotency key ${idempotencyKey} was already used for another canvas history operation.`, { projectId });
    }
    const entry = current.entries.find((item) => item.id === receipt.entryId);
    if (!entry) throw new CanvasStructureHistoryConflictError(`The bounded history receipt for ${idempotencyKey} has expired. Use a new idempotency key.`, { projectId });
    if (entry?.status === "failed") throw new CanvasStructureHistoryConflictError(entry.error || "The recorded structure change failed.", { projectId, entryId: entry.id });
    return { document: current, entry, duplicate: true };
  }
  assertIdle(current);
  // A new edit after undo creates a new branch. Keep old receipts as readable evidence but remove them
  // from the redo stack; no canvas authority record is deleted.
  const entries = current.entries.map((entry) => entry.status === "undone" ? { ...entry, status: "superseded" } : entry);
  const createdAt = timestamp(options);
  const entry = {
    id: `structure-${crypto.randomUUID()}`,
    sequence: (entries.at(-1)?.sequence ?? 0) + 1,
    projectId,
    scope: descriptor.scope,
    operation: descriptor.operation,
    targetRef: descriptor.targetRef,
    actor: required(input.revisionAuthor ?? input.actor, "revisionAuthor"),
    summary: descriptor.summary,
    before: clone(descriptor.before),
    after: null,
    status: "applying",
    sourceIdempotencyKey: idempotencyKey,
    createdAt,
    updatedAt: createdAt,
  };
  const nextEntries = [...entries, entry].slice(-ENTRY_LIMIT);
  const next = commit(current, {
    entries: nextEntries,
    idempotency: [...current.idempotency, { key: idempotencyKey, action: "apply", fingerprint: mutationFingerprint, entryId: entry.id }].slice(-RECEIPT_LIMIT),
  }, options);
  return { document: next, entry: next.entries.find((item) => item.id === entry.id), duplicate: false };
}
function finishEntry(projectId, entryId, status, patch, options) {
  const current = load(projectId, options);
  const index = current.entries.findIndex((entry) => entry.id === entryId);
  if (index < 0) throw new Error(`Canvas history entry not found: ${entryId}`);
  const entry = { ...current.entries[index], ...patch, status, updatedAt: timestamp(options) };
  const entries = current.entries.slice();
  entries[index] = entry;
  return { document: commit(current, { entries }, options), entry };
}

export function applyRecordedRegionMutation(projectId, operation, regionId, input, options = {}) {
  projectId = required(projectId, "projectId");
  const beforeRecord = regionId ? canvasRegionStore.get(projectId, regionId, { ...options, includeArchived: true }) : null;
  const before = regionShape(beforeRecord);
  const provisional = beginEntry(projectId, {
    scope: "region", operation, targetRef: { type: "work-region", id: regionId || input.id || "pending" }, before,
    summary: regionSummary(operation, before, before), fingerprint: { scope: "region", operation, regionId, input },
  }, input, options);
  if (provisional.entry.status === "applied") {
    return { region: canvasRegionStore.get(projectId, provisional.entry.targetRef.id, { ...options, includeArchived: true }), history: publicDocument(provisional.document), receipt: clone(provisional.entry) };
  }
  try {
    let region;
    if (operation === "create") region = canvasRegionStore.create(projectId, input, options);
    else if (operation === "archive") region = canvasRegionStore.archive(projectId, regionId, input, options);
    else if (operation === "reopen") region = canvasRegionStore.reopen(projectId, regionId, input, options);
    else region = canvasRegionStore.revise(projectId, regionId, input, options);
    const after = regionShape(region);
    const completed = finishEntry(projectId, provisional.entry.id, "applied", {
      targetRef: { type: "work-region", id: region.id }, after, sourceRevision: region.revision,
      summary: regionSummary(operation, provisional.entry.before, after),
    }, options);
    return { region, history: publicDocument(completed.document), receipt: clone(completed.entry) };
  } catch (error) {
    finishEntry(projectId, provisional.entry.id, "failed", { error: error instanceof Error ? error.message : String(error) }, options);
    throw error;
  }
}

export function applyRecordedLayoutMutation(projectId, patch, input, options = {}) {
  projectId = required(projectId, "projectId");
  const currentLayout = objectGraphLayoutStore.loadNamespace(projectId, PROJECT_CANVAS_LAYOUT_NAMESPACE, options);
  const before = layoutShape(currentLayout);
  const provisional = beginEntry(projectId, {
    scope: "layout", operation: "update", targetRef: { type: "canvas-layout", id: PROJECT_CANVAS_LAYOUT_NAMESPACE }, before,
    summary: "Canvas layout updated", fingerprint: { scope: "layout", patch, expectedRevision: input.expectedRevision },
  }, input, options);
  if (provisional.entry.status === "applied") {
    const layout = objectGraphLayoutStore.loadNamespace(projectId, PROJECT_CANVAS_LAYOUT_NAMESPACE, options);
    return { layout, history: publicDocument(provisional.document), receipt: clone(provisional.entry) };
  }
  try {
    const layout = objectGraphLayoutStore.mergeNamespace(projectId, PROJECT_CANVAS_LAYOUT_NAMESPACE, patch, {
      ...options, expectedRevision: input.expectedRevision, idempotencyKey: input.idempotencyKey,
    });
    const after = layoutShape(layout);
    const completed = finishEntry(projectId, provisional.entry.id, "applied", {
      after, sourceRevision: layout.revision, summary: layoutSummary(provisional.entry.before, after),
    }, options);
    return { layout, history: publicDocument(completed.document), receipt: clone(completed.entry) };
  } catch (error) {
    finishEntry(projectId, provisional.entry.id, "failed", { error: error instanceof Error ? error.message : String(error) }, options);
    throw error;
  }
}

function restoreRegionShape(projectId, entry, desired, key, actor, options) {
  const current = canvasRegionStore.get(projectId, entry.targetRef.id, { ...options, includeArchived: true });
  const currentShape = regionShape(current);
  const snapshot = desired === null ? { ...entry.after, archived: true } : desired;
  // Crash recovery: the source CAS may have completed before the history receipt was finalized.
  // Seeing the exact intended snapshot means the transition can be finalized without a second write.
  if (sameShape(currentShape, snapshot)) return current;
  const expectedShape = entry.status === "undoing"
    ? entry.after
    : (entry.before === null ? { ...entry.after, archived: true } : entry.before);
  if (!sameShape(currentShape, expectedShape)) throw new CanvasStructureHistoryConflictError(`Region “${current.title}” changed after this history receipt. Undo newer work first.`, { projectId, entryId: entry.id });
  return canvasRegionStore.restoreStructure(projectId, current.id, snapshot, {
    idempotencyKey: key, expectedRevision: current.revision, revisionAuthor: actor,
  }, options);
}
function restoreLayoutShape(projectId, entry, desired, key, options) {
  const current = objectGraphLayoutStore.loadNamespace(projectId, PROJECT_CANVAS_LAYOUT_NAMESPACE, options);
  if (sameShape(layoutShape(current), desired)) return current;
  const expectedShape = entry.status === "undoing" ? entry.after : entry.before;
  if (!sameShape(layoutShape(current), expectedShape)) throw new CanvasStructureHistoryConflictError("Canvas layout changed after this history receipt. Undo newer work first.", { projectId, entryId: entry.id });
  return objectGraphLayoutStore.saveNamespace(projectId, PROJECT_CANVAS_LAYOUT_NAMESPACE, desired, {
    ...options, expectedRevision: current.revision, idempotencyKey: key,
  });
}

function transition(projectId, action, input, options = {}) {
  projectId = required(projectId, "projectId");
  const key = required(input.idempotencyKey, "idempotencyKey");
  const actor = required(input.revisionAuthor ?? input.actor, "revisionAuthor");
  let document = load(projectId, options);
  const existing = document.idempotency.find((item) => item.key === key);
  let entry;
  if (existing) {
    if (existing.action !== action) throw new CanvasStructureHistoryConflictError(`Idempotency key ${key} was already used for another canvas history operation.`, { projectId });
    entry = document.entries.find((item) => item.id === existing.entryId);
    if (!entry) throw new CanvasStructureHistoryConflictError(`The bounded history receipt for ${key} has expired. Use a new idempotency key.`, { projectId });
    if (entry?.status === (action === "undo" ? "undone" : "applied")) return { history: publicDocument(document), receipt: clone(entry) };
  } else {
    if (document.revision !== expectedRevision(input.expectedHistoryRevision)) throw new CanvasStructureHistoryConflictError(`Stale canvas history revision: expected ${input.expectedHistoryRevision}, current ${document.revision}.`, { projectId, expectedRevision: input.expectedHistoryRevision, actualRevision: document.revision });
    assertIdle(document);
    const candidates = document.entries.filter((item) => item.status === (action === "undo" ? "applied" : "undone"));
    entry = action === "undo" ? candidates.at(-1) : candidates[0];
    if (!entry) throw new CanvasStructureHistoryConflictError(`There is no canvas structure change to ${action}.`, { projectId, actualRevision: document.revision });
    const entries = document.entries.map((item) => item.id === entry.id ? { ...item, status: `${action}ing`, updatedAt: timestamp(options) } : item);
    document = commit(document, {
      entries,
      idempotency: [...document.idempotency, { key, action, fingerprint: fingerprint({ action, entryId: entry.id }), entryId: entry.id }].slice(-RECEIPT_LIMIT),
    }, options);
    entry = document.entries.find((item) => item.id === entry.id);
  }
  try {
    const desired = action === "undo" ? entry.before : entry.after;
    // One entry can be undone and redone more than once. Scope the source mutation to this transition
    // receipt so a later undo does not collide with the first undo's (different-revision) payload.
    const sourceKey = `history:${entry.id}:${action}:${fingerprint(key).slice(0, 12)}`;
    if (entry.scope === "region") restoreRegionShape(projectId, entry, desired, sourceKey, actor, options);
    else restoreLayoutShape(projectId, entry, desired, sourceKey, options);
    const completed = finishEntry(projectId, entry.id, action === "undo" ? "undone" : "applied", {
      [`${action}Receipt`]: { idempotencyKey: key, actor, at: timestamp(options), summary: `${action === "undo" ? "Undid" : "Redid"}: ${entry.summary}` },
    }, options);
    return { history: publicDocument(completed.document), receipt: clone(completed.entry) };
  } catch (error) {
    // Keep the transitional state. A retry with the same key resumes the exact inverse safely; allowing
    // another edit here could overwrite the conflicting structure and make the receipt dishonest.
    throw error;
  }
}

export const undoCanvasStructure = (projectId, input, options = {}) => transition(projectId, "undo", input, options);
export const redoCanvasStructure = (projectId, input, options = {}) => transition(projectId, "redo", input, options);
export const canvasStructureHistoryStore = {
  collection: COLLECTION,
  load,
  list(projectId, options = {}) { return publicDocument(load(projectId, options)); },
  applyRegion: applyRecordedRegionMutation,
  applyLayout: applyRecordedLayoutMutation,
  undo: undoCanvasStructure,
  redo: redoCanvasStructure,
};
