// One product-change review workspace per venture and bet.

import fs from "node:fs";
import path from "node:path";
import { now, getVentureDoc, setVentureDoc } from "./venture-store.mjs";

const WORKSPACE_COLLECTION = "productChanges";

function ventureIdFromWorkspace(id) {
  const boundary = String(id ?? "").indexOf("__");
  if (boundary <= 0) throw new Error(`Invalid product-change workspace id: ${id}`);
  return id.slice(0, boundary);
}

export function getWorkspace(id, options = {}) {
  const workspace = getVentureDoc(ventureIdFromWorkspace(id), WORKSPACE_COLLECTION, id, options);
  if (!workspace) throw new Error(`Product-change workspace not found: ${id}`);
  return workspace;
}

function saveWorkspace(workspace, options) {
  const updated = { ...workspace, updatedAt: now() };
  setVentureDoc(updated.ventureId, WORKSPACE_COLLECTION, updated.id, updated, options);
  return updated;
}

// One workspace per (ventureId, betId) — created on first use, reused after. repo is the real
// product repository the bet's worktree is cut from (never the .dogfood-worktrees entry itself).
export function openBetWorkspace(ventureId, betId, repo, options = {}) {
  const id = `${ventureId}__${betId}`;
  const existing = getVentureDoc(ventureId, WORKSPACE_COLLECTION, id, options);
  if (existing) return existing;
  const createdAt = now();
  return saveWorkspace({
    id, ventureId, betId,
    repo: fs.realpathSync(path.resolve(repo)),
    createdAt, updatedAt: createdAt,
    revisions: [], decisions: [],
  }, options);
}

export function addRevision(id, revision, options = {}) {
  const workspace = getWorkspace(id, options);
  return saveWorkspace({ ...workspace, revisions: [...workspace.revisions, revision] }, options);
}

export function updateRevision(id, revisionId, updater, options = {}) {
  const workspace = getWorkspace(id, options);
  let found = false;
  const revisions = workspace.revisions.map((revision) => {
    if (revision.id !== revisionId) return revision;
    found = true;
    return { ...updater(revision), updatedAt: now() };
  });
  if (!found) throw new Error(`Revision not found: ${revisionId}`);
  return saveWorkspace({ ...workspace, revisions }, options);
}

export function addDecision(id, decision, options = {}) {
  const workspace = getWorkspace(id, options);
  const entry = { id: decision.id || `decision-${Date.now()}`, createdAt: decision.createdAt || now(), ...decision };
  return saveWorkspace({ ...workspace, decisions: [...workspace.decisions, entry] }, options);
}
