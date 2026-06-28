import fs from "node:fs";
import path from "node:path";
import {
  deleteProjectFromCatalog, loadProject, loadProjectCatalog, projectStoreRoot, saveProject, setActiveProject,
} from "./project-store.mjs";
import { loadProgramStore, saveProgramStore } from "./program-store.mjs";
import { loadAgentPolicyStore, saveAgentPolicyStore } from "./agent-policy-store.mjs";
import { loadFeedbackLedger, saveFeedbackLedger } from "./feedback-ledger.mjs";
import { loadCapabilityFoundry, saveCapabilityFoundry } from "./capability-foundry.mjs";
import { loadProductModelStore, saveProductModelStore } from "./product-model-store.mjs";
import { loadDomainEventStore, saveDomainEventStore } from "./domain-events.mjs";
import { getOperatorSession, listOperatorSessions, saveOperatorSession } from "./operator-store.mjs";

// One project per repo. The dedupe-on-point guard (server.mjs) keeps NEW duplicates from forming;
// this module cleans up the ones that already exist and powers an in-product "remove this project"
// affordance. Two operations: merge several projects into one (no record lost), and delete a project
// (purge its records). Both leave the catalog with a valid active project and at least one survivor.
//
// What moves vs. what stays:
// - MOVES (one file per projectId): programs, agent policies, feedback signals, capability-foundry
//   profiles/instances/evaluations/blueprints, product models, domain events, and each record's
//   `projectId` is repointed to the target.
// - REPOINTED IN PLACE (one file per id, carries a projectId field): operator sessions.
// - STAYS PUT (global, keyed by graphId): flows. A moved program record keeps its existing graphId,
//   so `loadFlow(graphId)` still finds the flow file. The graphId prefix (e.g. `rodentradar-3--…`)
//   becomes a cosmetic, opaque string under the target — never rekeyed, so no program→flow reference
//   ever has to be rewritten.
// - UNIONED ON THE TARGET PROJECT OBJECT: opportunities and legacy channels (deduped by id). The
//   target keeps its own sharedContext (its repo grounding) as authoritative.

function safeId(value) {
  return String(value || "default").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-|-$/g, "").slice(0, 90) || "default";
}

// The per-project store files this module owns. Each is `<root>/<dir>/<safeId(projectId)>.json`.
const PROJECT_STORE_DIRS = [
  "programs", "agent-policies", "feedback-ledger", "capability-foundry", "product-models", "domain-events",
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

function moveCapabilityFoundry(sourceId, targetId, options) {
  const source = loadCapabilityFoundry(sourceId, options);
  const hasContent = ["blueprints", "profiles", "instances", "evaluations"]
    .some((key) => Array.isArray(source?.[key]) && source[key].length);
  if (!hasContent) return;
  const target = loadCapabilityFoundry(targetId, options);
  // blueprints are plain refs (strings), not id-bearing records — union by value.
  const blueprints = [...new Set([...(target.blueprints ?? []), ...(source.blueprints ?? [])])];
  saveCapabilityFoundry({
    ...target,
    projectId: targetId,
    blueprints,
    profiles: dedupeById(target.profiles ?? [], source.profiles ?? [], targetId).slice(-500),
    instances: dedupeById(target.instances ?? [], source.instances ?? [], targetId),
    evaluations: dedupeById(target.evaluations ?? [], source.evaluations ?? [], targetId).slice(-1000),
  }, options);
}

function moveOperatorSessions(sourceId, targetId, options) {
  // listOperatorSessions returns summaries — reload each full session so repointing never drops the
  // event log or model transcript.
  for (const summary of listOperatorSessions({ ...options, projectId: sourceId })) {
    const session = getOperatorSession(summary.id, options);
    saveOperatorSession({ ...session, projectId: targetId }, options);
  }
}

function unionProjectCollections(sourceProject, targetProject) {
  const items = dedupeById(
    targetProject.opportunities?.items ?? [],
    sourceProject.opportunities?.items ?? [],
    targetProject.id,
  );
  const channels = dedupeById(targetProject.channels ?? [], sourceProject.channels ?? [], targetProject.id);
  return {
    ...targetProject,
    channels,
    opportunities: {
      ...(targetProject.opportunities ?? { generatedAt: null, sourceContextVersion: null, items: [] }),
      items,
    },
  };
}

function purgeProjectStoreFiles(projectId, options) {
  const root = projectStoreRoot(options);
  for (const dir of PROJECT_STORE_DIRS) {
    const file = path.join(root, dir, `${safeId(projectId)}.json`);
    fs.rmSync(file, { force: true });
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
    moveListStore(loadProgramStore, saveProgramStore, "programs", sourceId, targetId, options);
    moveListStore(loadAgentPolicyStore, saveAgentPolicyStore, "policies", sourceId, targetId, options);
    moveListStore(loadFeedbackLedger, saveFeedbackLedger, "signals", sourceId, targetId, options, 1000);
    moveListStore(loadProductModelStore, saveProductModelStore, "productModels", sourceId, targetId, options);
    // Domain events are an authoritative append-only log — never capped.
    moveListStore(loadDomainEventStore, saveDomainEventStore, "events", sourceId, targetId, options);
    moveCapabilityFoundry(sourceId, targetId, options);
    moveOperatorSessions(sourceId, targetId, options);

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
