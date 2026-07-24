import crypto from "node:crypto";

import { getSemanticModel, mutateSemanticModel } from "./semantic-model-store.mjs";
import { now } from "./venture-store.mjs";

const TARGET_FAMILIES = new Set(["objects", "relationships"]);
const CHANGE_OPERATIONS = new Set(["create", "update", "remove"]);

function fail(message, code = "model_branch_invalid", status = 400, details = {}) {
  throw Object.assign(new Error(message), { code, status, ...details });
}

function text(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function unique(value) {
  return [...new Set(list(value).map(text).filter(Boolean))];
}

function id(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function modelBranchId(value) {
  return text(value)?.replace(/^model-branch:/, "") ?? null;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

export function semanticRecordDigest(record) {
  if (record == null) return null;
  return crypto.createHash("sha256").update(JSON.stringify(stable(record))).digest("hex");
}

function actor(input) {
  const authority = text(input?.authority);
  const actorId = text(input?.id);
  if (!new Set(["founder", "agent", "host"]).has(authority) || !actorId) fail("Model work needs a resolved actor.", "model_branch_authority_denied", 403);
  return { ...structuredClone(input), authority, id: actorId };
}

function branchById(model, branchId) {
  const idValue = modelBranchId(branchId);
  const branch = model.modelBranches.find((entry) => entry.id === idValue);
  if (!branch) fail(`No such Product model branch: ${branchId}`, "model_branch_not_found", 404);
  return branch;
}

function targetId(targetRef, targetFamily) {
  const raw = text(targetRef);
  if (!raw) return null;
  const expected = targetFamily === "objects" ? "object:" : "relationship:";
  if (raw.includes(":")) {
    if (!raw.startsWith(expected)) fail(`Target ${raw} does not belong to ${targetFamily}.`, "model_change_target_invalid");
    return raw.slice(expected.length);
  }
  return raw;
}

function currentTarget(model, family, ref) {
  const recordId = targetId(ref, family);
  return recordId ? model[family].find((entry) => entry.id === recordId) ?? null : null;
}

function mutateRetry(ventureId, buildOperations, mutationActor, options, attempts = 6) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const model = getSemanticModel(ventureId, options);
    const operations = buildOperations(model);
    try {
      return mutateSemanticModel({ ventureId, baseRevision: model.revision, operations, actor: mutationActor }, options);
    } catch (error) {
      if (error?.code !== "PERSISTENCE_CONFLICT" && error?.code !== "semantic_model_stale_revision") throw error;
      lastError = error;
    }
  }
  throw lastError ?? new Error("Product model write could not settle after unrelated changes.");
}

export function createModelBranch({ ventureId, name, question, parentBranchRef = null, scopeRefs = [], threadRefs = [], sourceRefs = [], createdBy } = {}, options = {}) {
  const creator = actor(createdBy);
  const branchId = id("model-branch");
  const createdAt = now();
  const record = {
    id: branchId,
    ventureId,
    name: text(name) ?? text(question) ?? "Product alternative",
    question: text(question) ?? fail("A Product model branch needs the question it is exploring."),
    baseModelRevision: getSemanticModel(ventureId, options).revision,
    parentBranchRef: text(parentBranchRef),
    scopeRefs: unique(scopeRefs),
    threadRefs: unique(threadRefs),
    sourceRefs: unique(sourceRefs),
    createdBy: creator,
    createdAt,
    updatedAt: createdAt,
    closedAt: null,
    closedBy: null,
  };
  const model = mutateRetry(ventureId, () => [{ op: "create-record", family: "modelBranches", record }], creator, options);
  return structuredClone(model.modelBranches.find((entry) => entry.id === branchId));
}

export function proposeModelChange({ ventureId, branchId, targetFamily, targetRef = null, operation, proposedRecord, patch, rationale, sourceRefs = [], supersedesRef = null, proposedBy } = {}, options = {}) {
  const proposer = actor(proposedBy);
  const branchIdValue = modelBranchId(branchId);
  if (!TARGET_FAMILIES.has(targetFamily) || !CHANGE_OPERATIONS.has(operation)) fail("A Product model change needs a supported target and operation.");
  const changeId = id("model-change");
  const createdAt = now();
  const model = mutateRetry(ventureId, (current) => {
    const branch = branchById(current, branchIdValue);
    if (branch.closedAt) fail("Closed Product model branches keep their history but cannot receive new changes.", "model_branch_closed", 409);
    const target = currentTarget(current, targetFamily, targetRef ?? proposedRecord?.id);
    if (operation === "create" && target) fail("That Product model record already exists in current truth.", "model_change_conflict", 409);
    if (operation !== "create" && !target) fail("The Product model change target no longer exists.", "model_change_target_missing", 404);
    // Within-branch stacking: an agent may only build on current truth or its own branch, never on
    // another branch's still-provisional output. A colliding create or a cross-branch supersede is the
    // exact way that invariant breaks, so both are rejected here rather than silently ignored.
    const branchRef = `model-branch:${branchIdValue}`;
    if (operation === "create" && proposedRecord?.id) {
      const foreign = current.modelChanges.find((entry) =>
        entry.branchRef !== branchRef && entry.operation === "create" && entry.proposedRecord?.id === proposedRecord.id);
      if (foreign) fail("That record is still provisional on another branch. Build on current truth, not another branch's unkept work.", "model_change_cross_branch", 409);
    }
    if (text(supersedesRef)) {
      const supersededId = text(supersedesRef).replace(/^model-change:/, "");
      const superseded = current.modelChanges.find((entry) => entry.id === supersededId);
      if (superseded && superseded.branchRef !== branchRef) fail("A change can only supersede earlier work on its own branch.", "model_change_cross_branch", 409);
    }
    const normalizedRecord = proposedRecord ? { ...structuredClone(proposedRecord), assertion: "tentative" } : undefined;
    const record = {
      id: changeId,
      branchRef: `model-branch:${branchIdValue}`,
      targetFamily,
      targetRef: operation === "create" ? null : `${targetFamily === "objects" ? "object" : "relationship"}:${target.id}`,
      operation,
      baseDigest: semanticRecordDigest(target),
      ...(normalizedRecord ? { proposedRecord: normalizedRecord } : {}),
      ...(patch ? { patch: structuredClone(patch) } : {}),
      rationale: text(rationale) ?? fail("A Product model change needs a rationale."),
      sourceRefs: unique(sourceRefs),
      supersedesRef: text(supersedesRef),
      proposedBy: proposer,
      createdAt,
      updatedAt: createdAt,
    };
    return [{ op: "create-record", family: "modelChanges", record }];
  }, proposer, options);
  return structuredClone(model.modelChanges.find((entry) => entry.id === changeId));
}

function activeChanges(model, branchId) {
  const changes = model.modelChanges.filter((entry) => entry.branchRef === `model-branch:${branchId}`);
  const superseded = new Set(changes.map((entry) => entry.supersedesRef).filter(Boolean).map((ref) => ref.replace(/^model-change:/, "")));
  return changes.filter((entry) => !superseded.has(entry.id));
}

function changeConflict(model, change) {
  const target = currentTarget(model, change.targetFamily, change.targetRef ?? change.proposedRecord?.id);
  const actualDigest = semanticRecordDigest(target);
  const conflict = change.operation === "create" ? target != null : actualDigest !== change.baseDigest;
  return conflict ? { changeRef: `model-change:${change.id}`, targetRef: change.targetRef, expectedDigest: change.baseDigest, actualDigest } : null;
}

function applyChange(record, change, founderActor) {
  const provenance = {
    ...(record?.provenance ?? {}),
    kind: "founder-model-merge",
    branchRef: change.branchRef,
    changeRef: `model-change:${change.id}`,
    sourceRefs: unique([...(record?.provenance?.sourceRefs ?? []), ...change.sourceRefs]),
    actor: founderActor.id,
  };
  if (change.operation === "create") return { ...structuredClone(change.proposedRecord), assertion: "founder-asserted", provenance };
  if (change.operation === "update") return { ...structuredClone(record), ...structuredClone(change.patch), assertion: "founder-asserted", provenance };
  return null;
}

export function projectModelBranch(ventureId, branchId, options = {}) {
  const branchIdValue = modelBranchId(branchId);
  const model = getSemanticModel(ventureId, options);
  const branch = branchById(model, branchIdValue);
  const changes = activeChanges(model, branchIdValue);
  const projected = { objects: structuredClone(model.objects), relationships: structuredClone(model.relationships) };
  for (const change of changes) {
    const idValue = targetId(change.targetRef ?? change.proposedRecord?.id, change.targetFamily);
    const index = projected[change.targetFamily].findIndex((entry) => entry.id === idValue);
    if (change.operation === "create" && index < 0) projected[change.targetFamily].push(structuredClone(change.proposedRecord));
    if (change.operation === "update" && index >= 0) projected[change.targetFamily][index] = { ...projected[change.targetFamily][index], ...structuredClone(change.patch) };
    if (change.operation === "remove" && index >= 0) projected[change.targetFamily].splice(index, 1);
  }
  return {
    ventureId,
    currentRevision: model.revision,
    branch: structuredClone(branch),
    changes: structuredClone(changes),
    conflicts: changes.map((change) => changeConflict(model, change)).filter(Boolean),
    current: { objects: structuredClone(model.objects), relationships: structuredClone(model.relationships) },
    proposed: projected,
  };
}

export function compareModelBranches(ventureId, branchIds, options = {}) {
  const ids = unique(branchIds);
  if (ids.length < 2) fail("Comparing Product models needs at least two branches.");
  return { ventureId, branches: ids.map((branchId) => projectModelBranch(ventureId, branchId, options)) };
}

export function mergeModelBranch({ ventureId, branchId, selectedChangeRefs, resolvedConflicts = [], reason, actor: inputActor, kind = "merge", at = null } = {}, options = {}) {
  const founder = actor(inputActor);
  if (founder.authority !== "founder") fail("Only the founder can make a Product model current.", "model_branch_authority_denied", 403);
  const selectedIds = unique(selectedChangeRefs).map((ref) => ref.replace(/^model-change:/, ""));
  if (!selectedIds.length) fail("Select at least one Product model change to merge.");
  const receiptId = id("model-merge");
  let receipt = null;
  const merged = mutateRetry(ventureId, (model) => {
    branchById(model, branchId);
    const allowed = new Map(activeChanges(model, branchId).map((change) => [change.id, change]));
    const selected = selectedIds.map((changeId) => allowed.get(changeId) ?? fail(`Model change ${changeId} is not active on this branch.`, "model_change_not_found", 404));
    const conflicts = selected.map((change) => changeConflict(model, change)).filter(Boolean);
    const resolvedRefs = new Set(list(resolvedConflicts).map((entry) => text(entry?.changeRef)).filter(Boolean));
    const unresolved = conflicts.filter((conflict) => !resolvedRefs.has(conflict.changeRef));
    if (unresolved.length) fail("Current Product truth changed beneath this branch. Resolve the conflicting changes before merging.", "model_branch_conflict", 409, { conflicts: unresolved });
    const operations = [];
    for (const change of selected) {
      const target = currentTarget(model, change.targetFamily, change.targetRef ?? change.proposedRecord?.id);
      const record = applyChange(target, change, founder);
      const recordId = targetId(change.targetRef ?? change.proposedRecord?.id, change.targetFamily);
      operations.push(change.operation === "remove"
        ? { op: "remove-record", family: change.targetFamily, id: recordId }
        : { op: change.operation === "create" ? "create-record" : "update-record", family: change.targetFamily, id: recordId, record: { ...record, id: recordId } });
    }
    receipt = {
      id: receiptId,
      kind,
      branchRef: `model-branch:${branchId}`,
      selectedChangeRefs: selected.map((change) => `model-change:${change.id}`),
      resolvedConflicts: structuredClone(resolvedConflicts),
      previousModelRevision: model.revision,
      resultingModelRevision: model.revision + 1,
      actor: founder,
      reason: text(reason) ?? "Make the selected Product changes current.",
      createdAt: text(at) ?? now(),
    };
    operations.push({ op: "create-record", family: "modelMergeReceipts", record: receipt });
    return operations;
  }, founder, options);
  return { model: merged, receipt: structuredClone(receipt) };
}

// The founder-facing grammar over the merge machinery: keep exactly one change at a time. There is no
// bulk keep and no branch/merge vocabulary at this boundary — the founder keeps one object; the merge
// receipt underneath stays the inspectable authority record. Keeps are rate-bounded so a founder (or an
// agent acting on their behalf) cannot rapid-fire a whole branch into current truth as de facto bulk.
const KEEP_MIN_INTERVAL_MS = 700;

export function keepModelChange({ ventureId, branchId, changeRef, reason, actor: inputActor, at = null } = {}, options = {}) {
  const founder = actor(inputActor);
  if (founder.authority !== "founder") fail("Only the founder can keep a Product change.", "model_branch_authority_denied", 403);
  const ref = text(changeRef) ?? fail("Keep one exact change.");
  const keptAt = text(at) ?? now();
  const minInterval = Number.isFinite(options.keepMinIntervalMs) ? options.keepMinIntervalMs : KEEP_MIN_INTERVAL_MS;
  if (minInterval > 0) {
    const model = getSemanticModel(ventureId, options);
    const lastKeep = model.modelMergeReceipts
      .filter((entry) => entry.kind === "keep")
      .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))[0];
    if (lastKeep) {
      const gap = Date.parse(keptAt) - Date.parse(lastKeep.createdAt);
      if (Number.isFinite(gap) && gap >= 0 && gap < minInterval) fail("One change at a time. Give the last keep a moment before the next.", "model_keep_rate_limited", 429);
    }
  }
  return mergeModelBranch({ ventureId, branchId, selectedChangeRefs: [ref], reason: text(reason) ?? "Keep this change.", actor: inputActor, kind: "keep", at: keptAt }, options);
}

export function closeModelBranch({ ventureId, branchId, reason, actor: inputActor } = {}, options = {}) {
  const founder = actor(inputActor);
  if (founder.authority !== "founder") fail("Only the founder can close Product model work.", "model_branch_authority_denied", 403);
  const closedAt = now();
  const model = mutateRetry(ventureId, (current) => {
    const branch = branchById(current, branchId);
    return [{ op: "update-record", family: "modelBranches", id: branchId, record: { ...branch, closedAt, closedBy: founder, closeReason: text(reason), updatedAt: closedAt } }];
  }, founder, options);
  return structuredClone(model.modelBranches.find((entry) => entry.id === branchId));
}

const TOOL_REF_LIST = { type: "array", items: { type: "string" } };

export function buildModelWorkLoopTools({ ventureId, teammateRef, target, options, trackCall }) {
  const agent = { authority: "agent", id: teammateRef };
  const currentModel = getSemanticModel(ventureId, options);
  const targetThreadRef = text(target?.threadRef);
  const targetThreadId = targetThreadRef?.replace(/^thread:/, "");
  const canonicalThreadRef = currentModel.threads.some((thread) => thread.id === targetThreadId) ? targetThreadRef : null;
  const threadRefs = canonicalThreadRef ? [canonicalThreadRef] : [];
  const targetSources = [canonicalThreadRef, target?.originMessageRef].filter(Boolean);
  return [
    {
      name: "read_current_model", description: "Read current Product/GTM truth and its provisional branches before proposing a local model view. Read-only.",
      input_schema: { type: "object", properties: {}, required: [] },
      async run() { trackCall("read_current_model"); return getSemanticModel(ventureId, options); },
    },
    {
      name: "create_model_branch", description: "Create one durable provisional Product/GTM branch for the current Thread. It never changes current truth.",
      input_schema: { type: "object", properties: { name: { type: "string" }, question: { type: "string" }, parentBranchRef: { type: "string" }, scopeRefs: TOOL_REF_LIST, sourceRefs: TOOL_REF_LIST }, required: ["question"] },
      async run({ name, question, parentBranchRef = null, scopeRefs = [], sourceRefs = [] } = {}) {
        trackCall("create_model_branch");
        return createModelBranch({ ventureId, name, question, parentBranchRef, scopeRefs, threadRefs, sourceRefs: [...new Set([...targetSources, ...sourceRefs])], createdBy: agent }, options);
      },
    },
    {
      name: "read_model_branch", description: "Read one provisional Product/GTM branch with its exact changes and conflicts. Read-only.",
      input_schema: { type: "object", properties: { branchId: { type: "string" } }, required: ["branchId"] },
      async run({ branchId } = {}) { trackCall("read_model_branch"); return projectModelBranch(ventureId, branchId, options); },
    },
    {
      name: "propose_model_change", description: "Add one source-bearing object or relationship change to a provisional Product/GTM branch. The founder still chooses what becomes current.",
      input_schema: { type: "object", properties: { branchId: { type: "string" }, targetFamily: { enum: ["objects", "relationships"] }, targetRef: { type: "string" }, operation: { enum: ["create", "update", "remove"] }, proposedRecord: { type: "object" }, patch: { type: "object" }, rationale: { type: "string" }, sourceRefs: TOOL_REF_LIST, supersedesRef: { type: "string" } }, required: ["branchId", "targetFamily", "operation", "rationale"] },
      async run({ branchId, targetFamily, targetRef = null, operation, proposedRecord, patch, rationale, sourceRefs = [], supersedesRef = null } = {}) {
        trackCall("propose_model_change");
        return proposeModelChange({ ventureId, branchId, targetFamily, targetRef, operation, proposedRecord, patch, rationale, sourceRefs: [...new Set([...targetSources, ...sourceRefs])], supersedesRef, proposedBy: agent }, options);
      },
    },
  ];
}
