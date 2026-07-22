import crypto from "node:crypto";

import { getSemanticModel, mutateSemanticModel } from "./semantic-model-store.mjs";
import { now } from "./venture-store.mjs";

const text = (value) => String(value ?? "").trim() || null;
const list = (value) => Array.isArray(value) ? value : [];
const unique = (value) => [...new Set(list(value).map(text).filter(Boolean))];

function fail(message, code = "work_scope_invalid", status = 400) {
  throw Object.assign(new Error(message), { code, status });
}

function resolvedFounder(actor) {
  if (actor?.authority !== "founder" || !text(actor?.id)) fail("Only the founder can grant or revoke continuing work.", "work_scope_authority_denied", 403);
  return { ...structuredClone(actor), id: text(actor.id) };
}

function writeRetry(ventureId, build, actor, options) {
  let conflict = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const model = getSemanticModel(ventureId, options);
    try {
      return mutateSemanticModel({ ventureId, baseRevision: model.revision, operations: build(model), actor }, options);
    } catch (error) {
      if (error?.code !== "PERSISTENCE_CONFLICT" && error?.code !== "semantic_model_stale_revision") throw error;
      conflict = error;
    }
  }
  throw conflict;
}

export function createWorkScope({ ventureId, originThreadRef, originMessageRef, objective, subjectRefs = [], branchRefs = [], allowedInwardEffects = [], wakeOnEvidenceRefs = [], resumeOnRestart = true, spendPolicyRef = null, stopConditions = [], actor } = {}, options = {}) {
  const founder = resolvedFounder(actor);
  const createdAt = now();
  const record = {
    id: `work-scope-${crypto.randomUUID()}`,
    ventureId,
    originThreadRef: text(originThreadRef) ?? fail("Continuing work needs its originating Thread."),
    originMessageRef: text(originMessageRef) ?? fail("Continuing work needs its originating founder direction."),
    objective: text(objective) ?? fail("Continuing work needs an objective."),
    subjectRefs: unique(subjectRefs),
    branchRefs: unique(branchRefs),
    allowedInwardEffects: unique(allowedInwardEffects),
    wakeOnEvidenceRefs: unique(wakeOnEvidenceRefs),
    resumeOnRestart: resumeOnRestart !== false,
    spendPolicyRef: text(spendPolicyRef),
    stopConditions: unique(stopConditions),
    createdAt,
    revokedAt: null,
    revokedBy: null,
  };
  const model = writeRetry(ventureId, () => [{ op: "create-record", family: "workScopes", record }], founder, options);
  return structuredClone(model.workScopes.find((scope) => scope.id === record.id));
}

export function listWorkScopes(ventureId, options = {}) {
  return structuredClone(getSemanticModel(ventureId, options).workScopes);
}

export function requireActiveWorkScope(ventureId, scopeId, options = {}) {
  const scope = getSemanticModel(ventureId, options).workScopes.find((entry) => entry.id === scopeId);
  if (!scope) fail(`No such continuing work scope: ${scopeId}`, "work_scope_not_found", 404);
  if (scope.revokedAt) fail("This continuing work authority was revoked.", "work_scope_revoked", 409);
  return structuredClone(scope);
}

export function revokeWorkScope({ ventureId, scopeId, reason, actor } = {}, options = {}) {
  const founder = resolvedFounder(actor);
  const revokedAt = now();
  const model = writeRetry(ventureId, (current) => {
    const scope = current.workScopes.find((entry) => entry.id === scopeId);
    if (!scope) fail(`No such continuing work scope: ${scopeId}`, "work_scope_not_found", 404);
    if (scope.revokedAt) return [{ op: "update-record", family: "workScopes", id: scope.id, record: scope }];
    return [{ op: "update-record", family: "workScopes", id: scope.id, record: { ...scope, revokedAt, revokedBy: founder, revokeReason: text(reason) } }];
  }, founder, options);
  return structuredClone(model.workScopes.find((scope) => scope.id === scopeId));
}

export function restartableWorkScopes(ventureId, evidenceRefs = [], options = {}) {
  const returned = new Set(unique(evidenceRefs));
  return listWorkScopes(ventureId, options).filter((scope) => !scope.revokedAt && scope.resumeOnRestart && (
    returned.size === 0 || scope.wakeOnEvidenceRefs.some((ref) => returned.has(ref))
  ));
}

