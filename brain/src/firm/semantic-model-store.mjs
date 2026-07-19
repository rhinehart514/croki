// Venture-scoped persistence adapter for the pure canonical semantic model.

import crypto from "node:crypto";

import { getVentureDoc, listVentureDocs, venturePersistence, now } from "./venture-store.mjs";
import {
  normalizeSemanticModel,
  validateSemanticModel,
} from "./semantic-model.mjs";
import { applySemanticModelMutations } from "./semantic-model-mutations.mjs";
import { isRepositoryRef } from "./repository-ref.mjs";
import {
  ROOT_THREAD_ID,
  createRootThread,
  createThread,
  withThreadReferences,
  withThreadReviewedThrough,
} from "./thread.mjs";
import { completeRun, createRun } from "./run.mjs";

export const SEMANTIC_MODEL_KEY = "atlas";

function list(value) {
  return Array.isArray(value) ? value : [];
}

function externalRefResolver(ventureId, options) {
  const refs = new Set([`venture:${ventureId}`, "placement:canvas"]);
  for (const bet of listVentureDocs(ventureId, "bets", options)) {
    refs.add(`bet:${bet.id}`);
    for (const work of [...list(bet.staged), ...list(bet.evidence)]) if (work?.id) refs.add(`work:${work.id}`);
    for (const event of list(bet.events)) if (event?.id) refs.add(`event:${event.id}`);
  }
  for (const outcome of listVentureDocs(ventureId, "outcomes", options)) refs.add(`outcome:${outcome.id}`);
  for (const decision of listVentureDocs(ventureId, "decisions", options)) {
    refs.add(`wall-item:${decision.id}`);
    refs.add(`decision:${decision.id}`);
  }
  for (const message of listVentureDocs(ventureId, "conversation", options)) refs.add(`conversation:${message.id}`);
  const roster = getVentureDoc(ventureId, "crew", "roster", options);
  for (const participant of list(roster?.teammates ?? roster?.crew)) {
    const id = participant?.ref ?? participant?.id;
    if (id) {
      refs.add(`participant:${id}`);
      refs.add(`teammate:${id}`);
    }
  }
  return (ref) => {
    const value = String(ref);
    if (value.startsWith("repository:")) return isRepositoryRef(value);
    return refs.has(value.split("#")[0]);
  };
}

export function getSemanticModelState(ventureId, options = {}) {
  const stored = getVentureDoc(ventureId, "architecture", SEMANTIC_MODEL_KEY, options);
  return normalizeSemanticModel(stored, { ventureId, externalRefExists: externalRefResolver(ventureId, options) });
}

export function getSemanticModel(ventureId, options = {}) {
  return structuredClone(getSemanticModelState(ventureId, options).model);
}

export function writeSemanticModelState(ventureId, state, model, options = {}) {
  validateSemanticModel(model, { ventureId, externalRefExists: externalRefResolver(ventureId, options) });
  if (model.revision !== state.storageRevision + 1) throw new Error("A semantic model write must advance the atlas CAS revision exactly once.");
  const provider = venturePersistence(options, ventureId);
  if (!state.storageRevisionPresent) return provider.set("architecture", SEMANTIC_MODEL_KEY, model);
  return provider.compareAndSet("architecture", SEMANTIC_MODEL_KEY, state.storageRevision, model);
}

export function mutateSemanticModel({ ventureId, baseRevision, operations, actor } = {}, options = {}) {
  const state = getSemanticModelState(ventureId, options);
  const next = applySemanticModelMutations(state.model, {
    baseRevision,
    operations,
    actor,
    externalRefExists: externalRefResolver(ventureId, options),
  });
  writeSemanticModelState(ventureId, state, next, options);
  return structuredClone(next);
}

const SYSTEM_ACTOR = { authority: "host", id: "system" };

function applyOne(ventureId, record, family, { actor = SYSTEM_ACTOR, at } = {}, options = {}, op = "create-record") {
  const state = getSemanticModelState(ventureId, options);
  const next = applySemanticModelMutations(state.model, {
    baseRevision: state.model.revision,
    operations: [{ op, family, record }],
    actor,
    ...(at ? { at } : {}),
    externalRefExists: externalRefResolver(ventureId, options),
  });
  writeSemanticModelState(ventureId, state, next, options);
  return structuredClone(next);
}

// Create the venture's deterministic root thread only when a durable conversation actually needs it.
// A read never creates it; callers form it lazily before threading the first message.
export function ensureRootThread(ventureId, { actor = SYSTEM_ACTOR, at } = {}, options = {}) {
  const rootRef = `thread:${ROOT_THREAD_ID}`;
  const existing = getSemanticModelState(ventureId, options).model.threads.find((thread) => thread.id === ROOT_THREAD_ID);
  if (existing) return { threadRef: rootRef, created: false };
  applyOne(ventureId, createRootThread(ventureId, { at }), "threads", { actor, at }, options);
  return { threadRef: rootRef, created: true };
}

function directionThreadId(identity) {
  return `direction-${crypto.createHash("sha256").update(String(identity)).digest("hex").slice(0, 20)}`;
}

function normalizeRef(value, prefix) {
  const ref = String(value ?? "").trim();
  if (!ref) return null;
  return ref.startsWith(prefix) ? ref : `${prefix}${ref}`;
}

// Form or resume the child Thread that owns one founder direction. Callers may supply an exact threadRef
// once the UI carries it end-to-end. Until then, bet-scoped directions resume the latest open child for
// that bet; betless directions mint from their initiating message. The root remains organization only —
// runs never land on it after this seam.
export function ensureDirectionThread(ventureId, {
  name,
  originMessageRef = null,
  subjectRefs = [],
  resumeThreadRef = null,
  identityKey = null,
  actor = SYSTEM_ACTOR,
  at,
} = {}, options = {}) {
  ensureRootThread(ventureId, { actor, at }, options);
  const origin = normalizeRef(originMessageRef, "conversation:");
  const subjects = [...new Set(list(subjectRefs).map((ref) => String(ref ?? "").trim()).filter(Boolean))];
  const model = getSemanticModelState(ventureId, options).model;
  const exactId = normalizeRef(resumeThreadRef, "thread:")?.slice("thread:".length);
  let existing = exactId ? model.threads.find((thread) => thread.id === exactId) : null;
  if (exactId && (!existing || existing.id === ROOT_THREAD_ID)) {
    throw Object.assign(new Error(`No such direction thread: ${exactId}`), { code: "semantic_model_missing_ref", status: 404 });
  }
  if (!existing) {
    const betRefs = subjects.filter((ref) => ref.startsWith("bet:"));
    existing = model.threads
      .filter((thread) => thread.id !== ROOT_THREAD_ID && (thread.lifecycle ?? "open") === "open")
      .filter((thread) => betRefs.some((ref) => list(thread.subjectRefs).includes(ref)))
      .sort((a, b) => String(b.updatedAt ?? b.createdAt ?? "").localeCompare(String(a.updatedAt ?? a.createdAt ?? "")))[0] ?? null;
  }
  if (existing) {
    const updated = withThreadReferences(existing, {
      messageRefs: origin ? [origin] : [],
      subjectRefs: subjects,
      at,
    });
    applyOne(ventureId, updated, "threads", { actor, at }, options, "update-record");
    return { threadRef: `thread:${existing.id}`, created: false };
  }

  const id = directionThreadId(origin ?? identityKey ?? `${ventureId}:${name ?? "direction"}`);
  const collision = model.threads.find((thread) => thread.id === id);
  if (collision) {
    const updated = withThreadReferences(collision, {
      messageRefs: origin ? [origin] : [],
      subjectRefs: subjects,
      at,
    });
    applyOne(ventureId, updated, "threads", { actor, at }, options, "update-record");
    return { threadRef: `thread:${collision.id}`, created: false };
  }
  const record = createThread({
    id,
    name: String(name ?? "Founder direction").trim() || "Founder direction",
    messageRefs: origin ? [origin] : [],
    subjectRefs: subjects,
    parentThreadRef: `thread:${ROOT_THREAD_ID}`,
    originMessageRef: origin,
    createdAt: at ?? null,
    updatedAt: at ?? null,
  });
  applyOne(ventureId, record, "threads", { actor, at }, options);
  return { threadRef: `thread:${id}`, created: true };
}

export function extendDirectionThread(ventureId, threadRef, { messageRefs = [], subjectRefs = [], actor = SYSTEM_ACTOR, at } = {}, options = {}) {
  const id = normalizeRef(threadRef, "thread:")?.slice("thread:".length);
  const existing = getSemanticModelState(ventureId, options).model.threads.find((thread) => thread.id === id);
  if (!existing || existing.id === ROOT_THREAD_ID) throw Object.assign(new Error(`No such direction thread: ${id}`), { code: "semantic_model_missing_ref", status: 404 });
  const updated = withThreadReferences(existing, { messageRefs, subjectRefs, at });
  applyOne(ventureId, updated, "threads", { actor, at }, options, "update-record");
  return structuredClone(updated);
}

export function markDirectionThreadReviewed(ventureId, threadRef, reviewedThrough, { actor = SYSTEM_ACTOR, at } = {}, options = {}) {
  const id = normalizeRef(threadRef, "thread:")?.slice("thread:".length);
  const existing = getSemanticModelState(ventureId, options).model.threads.find((thread) => thread.id === id);
  if (!existing || existing.id === ROOT_THREAD_ID) throw Object.assign(new Error(`No such direction thread: ${id}`), { code: "semantic_model_missing_ref", status: 404 });
  const updated = withThreadReviewedThrough(existing, reviewedThrough, { at });
  applyOne(ventureId, updated, "threads", { actor, at }, options, "update-record");
  return structuredClone(updated);
}

// Persist a run record after drive input/configuration/runtime validation, before provider dispatch.
// The run joins durable records by reference and never carries running state.
export function recordRun(ventureId, runInput, { actor = SYSTEM_ACTOR, at } = {}, options = {}) {
  const record = createRun(runInput);
  applyOne(ventureId, record, "runs", { actor, at }, options);
  return { runRef: `run:${record.id}`, id: record.id };
}

// Attach a terminal completion timestamp and any durable decision/outcome joins to a run already
// persisted by recordRun. Re-reads current atlas state (a drive spans other atlas writers), so completion
// never reuses the creation-time revision. Completion is a timestamp plus durable joins, never live state;
// an interrupted/cancelled drive simply never reaches this call and its run stays historical-unknown.
export function completeDriveRun(ventureId, runId, { at, decisionRefs = [], outcomeRefs = [], actor = SYSTEM_ACTOR } = {}, options = {}) {
  const id = String(runId ?? "").trim();
  if (!id) throw Object.assign(new Error("Completing a run needs a run id."), { code: "run_invalid", status: 400 });
  const existing = getSemanticModelState(ventureId, options).model.runs.find((run) => run.id === id);
  if (!existing) throw Object.assign(new Error(`No such run to complete: ${id}`), { code: "semantic_model_missing_ref", status: 404 });
  const completedAt = at ?? now();
  const completed = completeRun(existing, { at: completedAt, decisionRefs, outcomeRefs });
  applyOne(ventureId, completed, "runs", { actor, at: completedAt }, options, "update-record");
  return { runRef: `run:${id}`, id };
}
