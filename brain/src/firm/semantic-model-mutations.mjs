import { SEMANTIC_MODEL_FAMILIES, validateSemanticModel } from "./semantic-model.mjs";

const FAMILY_SET = new Set(SEMANTIC_MODEL_FAMILIES);
const OPERATIONS = new Set(["create-record", "update-record", "remove-record"]);

function text(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function fail(message, code = "semantic_model_invalid", status = 400, details = {}) {
  throw Object.assign(new Error(message), { code, status, ...details });
}

function compatibilityOwned(record) {
  return Boolean(record?.properties?.architecture || record?.properties?.workingTheory);
}

function sourceBearing(record) {
  return Boolean(record?.provenance?.sourceRef)
    || (record?.provenance?.sourceRefs ?? []).length > 0
    || (record?.sourceRefs ?? []).length > 0
    || (record?.properties?.sourceRefs ?? []).length > 0;
}

function authorize(actor, operation, current, record) {
  const authority = text(actor?.authority);
  if (!new Set(["founder", "agent", "host"]).has(authority)) fail("Semantic mutation needs a resolved actor.", "semantic_model_authority_denied", 403);
  if (current && compatibilityOwned(current)) fail("Compatibility-owned semantic records change only through their source adapter.", "semantic_model_compatibility_owned", 409);
  if (authority === "founder") return;
  if (operation.op === "remove-record") fail("Only the founder can remove canonical semantic truth.", "semantic_model_authority_denied", 403);
  if (authority === "agent" && !new Set(["objects", "relationships", "insights"]).has(operation.family)) {
    fail("Agents may add tentative interpretation, not execution or organization authority.", "semantic_model_authority_denied", 403);
  }
  if (new Set(["objects", "relationships", "insights"]).has(operation.family)) {
    if (record.assertion !== "tentative" || !sourceBearing(record)) fail("Non-founder semantic claims must remain tentative and source-bearing.", "semantic_model_authority_denied", 403);
    if (record.proposedBy?.authority === "founder") fail("A non-founder cannot stamp founder provenance.", "semantic_model_authority_denied", 403);
  }
}

export function applySemanticModelMutations(model, { baseRevision, operations, actor, at = new Date().toISOString(), externalRefExists = null } = {}) {
  if (baseRevision !== model.revision) fail("Semantic model changed since this edit began.", "semantic_model_stale_revision", 409, { baseRevision, currentRevision: model.revision });
  if (!Array.isArray(operations) || !operations.length) fail("Semantic model mutation needs operations.");
  const next = structuredClone(model);
  for (const operation of operations) {
    if (!OPERATIONS.has(operation?.op) || !FAMILY_SET.has(operation.family)) fail("Unsupported semantic model operation.");
    const records = next[operation.family];
    const supplied = structuredClone(operation.record ?? operation.value ?? {});
    const id = text(operation.id ?? supplied.id);
    const index = records.findIndex((entry) => entry.id === id);
    if (!id) fail("Semantic model operations need a record id.");
    if (operation.op === "create-record") {
      if (index >= 0) fail(`${operation.family} record ${id} already exists.`, "semantic_model_conflict", 409);
      const record = { ...supplied, id, createdAt: supplied.createdAt ?? at, updatedAt: supplied.updatedAt ?? at };
      authorize(actor, operation, null, record);
      records.push(record);
    } else if (operation.op === "update-record") {
      if (index < 0) fail(`No such ${operation.family} record: ${id}`, "semantic_model_missing_ref", 404);
      const record = { ...records[index], ...supplied, id, updatedAt: at };
      authorize(actor, operation, records[index], record);
      records[index] = record;
    } else {
      if (index < 0) fail(`No such ${operation.family} record: ${id}`, "semantic_model_missing_ref", 404);
      authorize(actor, operation, records[index], null);
      records.splice(index, 1);
    }
  }
  next.revision = baseRevision + 1;
  next.updatedAt = at;
  next.updatedBy = structuredClone(actor);
  validateSemanticModel(next, { ventureId: model.ventureId, externalRefExists });
  return next;
}
