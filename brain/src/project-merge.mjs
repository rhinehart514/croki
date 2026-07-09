import {
  deleteProjectFromCatalog, loadProject, loadProjectCatalog, saveProject, setActiveProject,
} from "./project-store.mjs";
import { persistence } from "./persistence.mjs";
import { loadFeedbackLedger, saveFeedbackLedger } from "./feedback-ledger.mjs";
import { loadProductModelStore, saveProductModelStore } from "./product-model-store.mjs";
import { loadDomainEventStore, saveDomainEventStore } from "./domain-events.mjs";
import { getOperatorSession, listOperatorSessions, saveOperatorSession } from "./operator-store.mjs";
import { loadInputStore, saveInputStore } from "./inputs-store.mjs";
import { getGtmIdea, listGtmIdeas, saveGtmIdea } from "./idea-store.mjs";

// One project per repo. The dedupe-on-point guard (server.mjs) keeps NEW duplicates from forming;
// this module cleans up the ones that already exist and powers an in-product "remove this project"
// affordance. Two operations: merge several projects into one (no record lost), and delete a project
// (purge its records). Both leave the catalog with a valid active project and at least one survivor.
//
// What moves vs. what stays:
// - MOVES (one file per projectId): feedback signals, product models, domain events, captured world
//   inputs (the append-only signal inbox), and each record's `projectId` is repointed to the target.
// - REPOINTED IN PLACE (one file per id, carries a projectId field): operator sessions and graded
//   ideas (gtm-ideas, keyed by the idea's own id) — each is reloaded and re-saved under the target.
// - STAYS PUT (global, keyed by graphId): flows. A moved channel keeps its existing graphId, so
//   `loadFlow(graphId)` still finds the flow file. The graphId prefix becomes a cosmetic, opaque
//   string under the target — never rekeyed.
// - NOT TOUCHED (founder-owned, UNIVERSAL): pasted credentials. Since 2026-07-08 credentials live in
//   one global slot keyed by provider, not per project (credential-store.mjs) — a merge has no
//   per-project credential file to move or purge, so the founder's connections carry through untouched.
// - UNIONED ON THE TARGET PROJECT OBJECT: channels (deduped by id). The target keeps its own
//   sharedContext (its repo grounding) as authoritative.

function safeId(value) {
  return String(value || "default").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-|-$/g, "").slice(0, 90) || "default";
}

// The per-project store files this module owns (keyed by safeId(projectId)). Each is
// `<root>/<dir>/<safeId(projectId)>.json`. Purged from a source on merge and from a project on delete.
// Credentials are NOT listed — they are founder-owned and universal (one global slot, not per project),
// so there is nothing per-project to purge. (gtm-ideas is keyed by idea id, not projectId, so it is
// repointed in place like operator sessions, not listed here.)
const PROJECT_STORE_DIRS = [
  "feedback-ledger", "product-models", "domain-events", "inputs",
];

function dedupeById(existing, incoming, targetId) {
  const seen = new Set(existing.map((record) => record?.id).filter(Boolean));
  const moved = incoming
    .filter((record) => !record?.id || !seen.has(record.id))
    .map((record) => (record && typeof record === "object" ? { ...record, projectId: targetId } : record));
  return [...existing, ...moved];
}

function moveListStore(load, save, listKey, sourceId, targetId, options, cap = null) {
  const source = load(sourceId, options);
  const incoming = Array.isArray(source?.[listKey]) ? source[listKey] : [];
  if (!incoming.length) return;
  const target = load(targetId, options);
  const existing = Array.isArray(target?.[listKey]) ? target[listKey] : [];
  const merged = dedupeById(existing, incoming, targetId);
  save({ ...target, projectId: targetId, [listKey]: cap ? merged.slice(-cap) : merged }, options);
}

function moveOperatorSessions(sourceId, targetId, options) {
  // listOperatorSessions returns summaries — reload each full session so repointing never drops the
  // event log or model transcript.
  for (const summary of listOperatorSessions({ ...options, projectId: sourceId })) {
    const session = getOperatorSession(summary.id, options);
    saveOperatorSession({ ...session, projectId: targetId }, options);
  }
}

function moveGtmIdeas(sourceId, targetId, options) {
  // gtm-ideas are keyed by the idea's own id and carry a projectId field, like operator sessions —
  // repoint each in place so a merged project keeps every survived/killed idea it generated.
  for (const summary of listGtmIdeas({ ...options, projectId: sourceId })) {
    const idea = getGtmIdea(summary.id, options);
    saveGtmIdea({ ...idea, projectId: targetId }, options);
  }
}

function unionProjectCollections(sourceProject, targetProject) {
  const channels = dedupeById(targetProject.channels ?? [], sourceProject.channels ?? [], targetProject.id);
  return {
    ...targetProject,
    channels,
  };
}

// Purge a project's per-project store records. Each per-project store keys its document by
// safeId(projectId) within its collection (the collection name matches the legacy directory name),
// so deleting that (collection, key) pair removes the record from whichever backend holds it —
// SQLite by default, the JSON file on the legacy path. Idempotent: a delete of an absent record is a
// harmless no-op, so a re-run (or a project that never wrote a given store) is safe.
function purgeProjectStoreFiles(projectId, options) {
  const store = persistence(options);
  for (const collection of PROJECT_STORE_DIRS) {
    store.delete(collection, safeId(projectId));
  }
}

// Fold every source project into the target. Records move first, then each source is dropped from the
// catalog and its now-empty store files are removed. Idempotent on re-run (dedupe-by-id). Returns the
// surviving catalog summary.
export function mergeProjects(sourceIds, targetId, options = {}) {
  const sources = (Array.isArray(sourceIds) ? sourceIds : [sourceIds]).filter((id) => id && id !== targetId);
  if (!sources.length) throw new Error("No source projects to merge.");
  const catalog = loadProjectCatalog(options);
  const known = new Set(catalog.projects.map((project) => project.id));
  if (!known.has(targetId)) throw new Error(`Merge target not found: ${targetId}`);
  for (const sourceId of sources) {
    if (!known.has(sourceId)) throw new Error(`Merge source not found: ${sourceId}`);
  }

  for (const sourceId of sources) {
    moveListStore(loadFeedbackLedger, saveFeedbackLedger, "signals", sourceId, targetId, options, 1000);
    moveListStore(loadProductModelStore, saveProductModelStore, "productModels", sourceId, targetId, options);
    // Domain events and captured inputs are authoritative append-only logs — never capped.
    moveListStore(loadDomainEventStore, saveDomainEventStore, "events", sourceId, targetId, options);
    moveListStore(loadInputStore, saveInputStore, "inputs", sourceId, targetId, options);
    moveOperatorSessions(sourceId, targetId, options);
    moveGtmIdeas(sourceId, targetId, options);

    const sourceProject = loadProject({ ...options, projectId: sourceId });
    const targetProject = loadProject({ ...options, projectId: targetId });
    saveProject(unionProjectCollections(sourceProject, targetProject), options);

    deleteProjectFromCatalog(sourceId, options);
    purgeProjectStoreFiles(sourceId, options);
  }

  // The target is what you land on after a merge.
  setActiveProject(targetId, options);
  return loadProjectCatalog(options);
}

// Delete a project outright: purge its per-project store files, then drop it from the catalog. Flows
// keyed under it are left (global, harmless); operator sessions keep their projectId and simply fall
// out of every project-scoped list. Refuses to remove the last project.
export function deleteProject(projectId, options = {}) {
  const result = deleteProjectFromCatalog(projectId, options); // validates existence + last-project guard
  purgeProjectStoreFiles(projectId, options);
  return result;
}
