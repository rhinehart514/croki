// Venture-scoped persistence adapter for the pure canonical semantic model.

import { getVentureDoc, listVentureDocs, venturePersistence } from "./venture-store.mjs";
import {
  normalizeSemanticModel,
  validateSemanticModel,
} from "./semantic-model.mjs";
import { applySemanticModelMutations } from "./semantic-model-mutations.mjs";
import { isRepositoryRef } from "./repository-ref.mjs";
import { ROOT_THREAD_ID, createRootThread } from "./thread.mjs";
import { createRun } from "./run.mjs";

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

function applyOne(ventureId, record, family, { actor = SYSTEM_ACTOR, at } = {}, options = {}) {
  const state = getSemanticModelState(ventureId, options);
  const next = applySemanticModelMutations(state.model, {
    baseRevision: state.model.revision,
    operations: [{ op: "create-record", family, record }],
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

// Persist a run record after drive input/configuration/runtime validation, before provider dispatch.
// The run joins durable records by reference and never carries running state.
export function recordRun(ventureId, runInput, { actor = SYSTEM_ACTOR, at } = {}, options = {}) {
  const record = createRun(runInput);
  applyOne(ventureId, record, "runs", { actor, at }, options);
  return { runRef: `run:${record.id}`, id: record.id };
}
