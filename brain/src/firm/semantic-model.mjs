// Canonical semantic truth for one venture. This module is intentionally pure: storage adapters own
// venture lookup and CAS, while this module owns schema normalization, validation, mutation, and the
// temporary schema-v1 architecture projection.

import { replaceArchitectureCompatibility as replaceArchitectureCompatibilityProjection } from "./semantic-model-architecture-compat.mjs";

// Territory is an optional, founder/earned FACET on an object's open properties — never a sixth
// architecture role. objectTerritory reads it tolerant of absence; the derivation lives feature-local in
// venture-traceability.mjs and is re-exported here so the facet reads as first-class on the canonical
// model. Validation imposes no reserved property keys on objects, so territory needs no schema change.
export { objectTerritory, TERRITORIES } from "./venture-traceability.mjs";

export const SEMANTIC_MODEL_SCHEMA_VERSION = 3;
export const SEMANTIC_MODEL_FAMILIES = Object.freeze([
  "objects",
  "relationships",
  "threads",
  "runs",
  "views",
  "workflowContracts",
  "insights",
  "modelBranches",
  "modelChanges",
  "modelMergeReceipts",
  "workScopes",
  "outwardActions",
]);

const ASSERTIONS = new Set(["tentative", "founder-asserted"]);
const ARCHITECTURE_ROLES = new Set(["concept", "product-loop", "system", "motion", "campaign"]);
const INTERNAL_REF_FAMILIES = new Map([
  ["architecture", "objects"], ["object", "objects"], ["relationship", "relationships"],
  ["thread", "threads"], ["run", "runs"], ["view", "views"],
  ["workflow-contract", "workflowContracts"], ["insight", "insights"],
  ["model-branch", "modelBranches"], ["model-change", "modelChanges"],
  ["model-merge", "modelMergeReceipts"], ["work-scope", "workScopes"],
  ["outward-action", "outwardActions"],
]);

function list(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function fail(message, code = "semantic_model_invalid", status = 400, details = {}) {
  throw Object.assign(new Error(message), { code, status, ...details });
}

function uniqueStrings(value) {
  return [...new Set(list(value).map(text).filter(Boolean))];
}

function without(value, keys) {
  const result = {};
  for (const [key, entry] of Object.entries(value ?? {})) if (!keys.has(key)) result[key] = structuredClone(entry);
  return result;
}

export function compatibilityMetadata(current, stored = {}) {
  return {
    revision: Number.isInteger(current.revision) ? current.revision : 0,
    intent: structuredClone(current.intent ?? { statement: "", constraints: [] }),
    revisions: structuredClone(list(stored.revisions)),
    proposals: structuredClone(list(stored.proposals)),
    updatedAt: current.updatedAt ?? null,
    updatedBy: structuredClone(current.updatedBy ?? null),
  };
}

function objectFromElement(element, current) {
  const role = text(element.role) ?? "open";
  const fields = without(element, new Set(["id", "role", "name", "statement", "provenance"]));
  return {
    id: element.id,
    type: role,
    name: text(element.name) ?? element.id,
    statement: text(element.statement) ?? "",
    properties: { architecture: { role, statementPresent: Object.hasOwn(element, "statement"), fields } },
    assertion: element.assertion ?? (element.provenance?.kind === "founder-authored" ? "founder-asserted" : "tentative"),
    provenance: structuredClone(element.provenance ?? { kind: "legacy-architecture" }),
    createdAt: element.createdAt ?? element.provenance?.createdAt ?? current.updatedAt ?? null,
    updatedAt: element.updatedAt ?? current.updatedAt ?? null,
  };
}

function relationshipFromConnection(connection, current) {
  const fields = without(connection, new Set(["id", "fromRef", "toRef", "label", "type", "properties", "assertion", "sourceRefs", "createdAt", "updatedAt"]));
  return {
    id: connection.id,
    fromRef: connection.fromRef,
    toRef: connection.toRef,
    label: connection.label,
    type: text(connection.type) ?? "architecture-connection",
    properties: { ...(connection.properties ?? {}), architecture: { connection: true, fields } },
    assertion: connection.assertion ?? "tentative",
    sourceRefs: uniqueStrings(connection.sourceRefs),
    createdAt: connection.createdAt ?? current.updatedAt ?? null,
    updatedAt: connection.updatedAt ?? current.updatedAt ?? null,
  };
}

function viewFromGroup(group, current) {
  const fields = without(group, new Set(["id", "name", "memberRefs", "createdAt", "updatedAt"]));
  return {
    id: group.id,
    name: group.name,
    kind: "architecture-group",
    rootRefs: uniqueStrings(group.memberRefs),
    filter: null,
    query: null,
    relationshipRefs: [],
    placementRef: null,
    properties: { architecture: { group: true, fields } },
    createdAt: group.createdAt ?? current.updatedAt ?? null,
    updatedAt: group.updatedAt ?? current.updatedAt ?? null,
  };
}

function insightFromEvidence(annotation, current) {
  const fields = without(annotation, new Set(["id", "subjectRef", "evidenceRef", "stance", "note", "appliedBy", "appliedAt", "createdAt", "updatedAt"]));
  return {
    id: annotation.id,
    statement: annotation.note,
    subjectRefs: [annotation.subjectRef],
    stance: annotation.stance,
    type: "architecture-evidence",
    assertion: "founder-asserted",
    sourceRefs: [annotation.evidenceRef],
    supersedes: [],
    status: "current",
    proposedBy: structuredClone(annotation.appliedBy ?? null),
    appliedBy: structuredClone(annotation.appliedBy ?? null),
    properties: { architecture: { evidence: true, fields } },
    createdAt: annotation.createdAt ?? annotation.appliedAt ?? current.updatedAt ?? null,
    updatedAt: annotation.updatedAt ?? annotation.appliedAt ?? current.updatedAt ?? null,
  };
}

function contractFromCampaign(element, current) {
  const refs = [element.governingBetId, ...list(element.supportingBetIds)].filter(Boolean).map((id) => `bet:${id}`);
  return {
    id: element.id,
    name: element.name,
    subjectRefs: [`architecture:${element.id}`],
    entryConditions: [element.audience, element.objective].filter(Boolean),
    expectedTransitions: [],
    gateRefs: [],
    measurement: structuredClone(element.measurement ?? null),
    sourceRefs: refs,
    properties: { architecture: { campaign: true } },
    createdAt: element.createdAt ?? current.updatedAt ?? null,
    updatedAt: element.updatedAt ?? current.updatedAt ?? null,
  };
}

function workingTheoryRecords(proposals, current, architectureObjectIds) {
  const objects = new Map();
  const relationships = new Map();
  const insights = [];
  const priorInsightBySubject = new Map();
  for (const theory of proposals.filter((entry) => entry?.mode === "working-theory")) {
    for (const subject of list(theory.subjects)) {
      const sourceRefs = uniqueStrings(subject.sourceRefs);
      if (!architectureObjectIds.has(subject.id)) {
        objects.set(subject.id, {
          id: subject.id,
          type: "working-theory",
          name: subject.name,
          statement: subject.statement,
          properties: { workingTheory: { sourceRefs, theoryId: theory.id } },
          assertion: "tentative",
          provenance: { kind: "model-inference", proposalId: theory.id },
          createdAt: objects.get(subject.id)?.createdAt ?? theory.createdAt ?? current.updatedAt ?? null,
          updatedAt: theory.createdAt ?? current.updatedAt ?? null,
        });
      }
      if (sourceRefs.length) {
        const id = `working-theory-insight-${theory.id}-${subject.id}`;
        const prior = priorInsightBySubject.get(`subject:${subject.id}`);
        insights.push({
          id,
          statement: subject.statement,
          subjectRefs: [`object:${subject.id}`],
          stance: "interprets",
          type: "working-theory",
          assertion: "tentative",
          sourceRefs,
          supersedes: prior ? [`insight:${prior}`] : [],
          status: theory.status,
          proposedBy: structuredClone(theory.proposedBy ?? { authority: "agent", id: "unknown" }),
          appliedBy: null,
          properties: { workingTheory: { theoryId: theory.id, subjectId: subject.id } },
          createdAt: theory.createdAt ?? current.updatedAt ?? null,
          updatedAt: theory.createdAt ?? current.updatedAt ?? null,
        });
        priorInsightBySubject.set(`subject:${subject.id}`, id);
      }
    }
    for (const relationship of list(theory.relationships)) {
      const sourceRefs = uniqueStrings(relationship.sourceRefs);
      relationships.set(relationship.id, {
        id: relationship.id,
        fromRef: `object:${String(relationship.fromRef).replace(/^theory:/, "")}`,
        toRef: `object:${String(relationship.toRef).replace(/^theory:/, "")}`,
        label: relationship.label,
        type: "working-theory",
        properties: { workingTheory: { theoryId: theory.id } },
        assertion: "tentative",
        sourceRefs,
        createdAt: relationships.get(relationship.id)?.createdAt ?? theory.createdAt ?? current.updatedAt ?? null,
        updatedAt: theory.createdAt ?? current.updatedAt ?? null,
      });
      if (sourceRefs.length) {
        const id = `working-theory-insight-${theory.id}-${relationship.id}`;
        const prior = priorInsightBySubject.get(`relationship:${relationship.id}`);
        insights.push({
          id,
          statement: relationship.label,
          subjectRefs: [`relationship:${relationship.id}`],
          stance: "interprets",
          type: "working-theory",
          assertion: "tentative",
          sourceRefs,
          supersedes: prior ? [`insight:${prior}`] : [],
          status: theory.status,
          proposedBy: structuredClone(theory.proposedBy ?? { authority: "agent", id: "unknown" }),
          appliedBy: null,
          properties: { workingTheory: { theoryId: theory.id, relationshipId: relationship.id } },
          createdAt: theory.createdAt ?? current.updatedAt ?? null,
          updatedAt: theory.createdAt ?? current.updatedAt ?? null,
        });
        priorInsightBySubject.set(`relationship:${relationship.id}`, id);
      }
    }
  }
  return { objects: [...objects.values()], relationships: [...relationships.values()], insights };
}

export function modelFromArchitecture(stored, ventureId) {
  const current = structuredClone(stored.current ?? {});
  const storageRevision = Number.isInteger(stored.revision) ? stored.revision : (current.revision ?? 0);
  const architectureObjects = list(current.elements).map((entry) => objectFromElement(entry, current));
  const theories = workingTheoryRecords(list(stored.proposals), current, new Set(architectureObjects.map((entry) => entry.id)));
  const architectureRelationships = list(current.connections).map((entry) => relationshipFromConnection(entry, current));
  const relationshipIds = new Set(architectureRelationships.map((entry) => entry.id));
  return {
    schemaVersion: SEMANTIC_MODEL_SCHEMA_VERSION,
    ventureId,
    revision: storageRevision,
    objects: [...architectureObjects, ...theories.objects],
    relationships: [...architectureRelationships, ...theories.relationships.filter((entry) => !relationshipIds.has(entry.id))],
    threads: [],
    runs: [],
    views: list(current.groups).map((entry) => viewFromGroup(entry, current)),
    workflowContracts: list(current.elements).filter((entry) => entry.role === "campaign").map((entry) => contractFromCampaign(entry, current)),
    insights: [...list(current.evidenceAnnotations).map((entry) => insightFromEvidence(entry, current)), ...theories.insights],
    modelBranches: [], modelChanges: [], modelMergeReceipts: [], workScopes: [], outwardActions: [],
    compatibility: { architecture: compatibilityMetadata(current, stored) },
    updatedAt: current.updatedAt ?? null,
    updatedBy: structuredClone(current.updatedBy ?? null),
  };
}

export function emptySemanticModel(ventureId) {
  return {
    schemaVersion: SEMANTIC_MODEL_SCHEMA_VERSION,
    ventureId,
    revision: 0,
    objects: [], relationships: [], threads: [], runs: [], views: [], workflowContracts: [], insights: [],
    modelBranches: [], modelChanges: [], modelMergeReceipts: [], workScopes: [], outwardActions: [],
    compatibility: { architecture: { revision: 0, intent: { statement: "", constraints: [] }, revisions: [], proposals: [] } },
    updatedAt: null,
    updatedBy: null,
  };
}

export function normalizeSemanticModel(stored, { ventureId, externalRefExists = null } = {}) {
  if (!text(ventureId)) fail("A semantic model read needs a ventureId.");
  if (stored == null) return { model: emptySemanticModel(ventureId), sourceFormat: "absent", storageRevision: 0, storageRevisionPresent: true };
  if (stored.schemaVersion === SEMANTIC_MODEL_SCHEMA_VERSION) {
    const model = structuredClone(stored);
    validateSemanticModel(model, { ventureId, externalRefExists });
    return { model, sourceFormat: "v3", storageRevision: model.revision, storageRevisionPresent: true };
  }
  if (stored.schemaVersion === 2) {
    const model = {
      ...structuredClone(stored),
      schemaVersion: SEMANTIC_MODEL_SCHEMA_VERSION,
      modelBranches: [],
      modelChanges: [],
      modelMergeReceipts: [],
      workScopes: [],
      outwardActions: [],
    };
    validateSemanticModel(model, { ventureId, externalRefExists });
    return { model, sourceFormat: "v2", storageRevision: model.revision, storageRevisionPresent: true };
  }
  if (stored.current || stored.schemaVersion === 1) {
    const model = modelFromArchitecture(stored.current ? stored : { current: stored }, ventureId);
    validateSemanticModel(model, { ventureId, externalRefExists });
    return {
      model,
      sourceFormat: "v1",
      storageRevision: model.revision,
      storageRevisionPresent: Number.isInteger(stored.revision),
    };
  }
  fail(`Unsupported semantic model schema version: ${stored.schemaVersion ?? "missing"}.`, "semantic_model_schema_unsupported");
}

function familyIndex(model) {
  return new Map(SEMANTIC_MODEL_FAMILIES.map((family) => [family, new Set(model[family].map((record) => record.id))]));
}

function validateRef(ref, model, indexes, externalRefExists, label) {
  const value = text(ref);
  const splitAt = value?.indexOf(":") ?? -1;
  if (splitAt < 1 || splitAt === value.length - 1) fail(`${label} needs a typed reference.`, "semantic_model_missing_ref", 404);
  const kind = value.slice(0, splitAt);
  const id = value.slice(splitAt + 1).split("#")[0];
  const family = INTERNAL_REF_FAMILIES.get(kind);
  if (family) {
    if (!indexes.get(family).has(id)) fail(`${label} points to a missing ${kind} record.`, "semantic_model_missing_ref", 404, { ref: value });
    return;
  }
  if (kind === "venture") {
    if (id !== model.ventureId) fail(`${label} crosses venture scope.`, "semantic_model_cross_scope", 404, { ref: value });
    return;
  }
  if (!externalRefExists || !externalRefExists(value)) fail(`${label} points outside known venture truth.`, "semantic_model_missing_ref", 404, { ref: value });
}

function validateRefs(refs, model, indexes, externalRefExists, label) {
  for (const ref of uniqueStrings(refs)) validateRef(ref, model, indexes, externalRefExists, label);
}

function requireRef(ref, prefix, model, indexes, externalRefExists, label) {
  if (!String(ref ?? "").startsWith(prefix)) fail(`${label} must be a ${prefix} reference.`, "semantic_model_missing_ref", 404);
  validateRef(ref, model, indexes, externalRefExists, label);
}

function optionalRef(ref, prefix, model, indexes, externalRefExists, label) {
  if (ref == null) return;
  requireRef(ref, prefix, model, indexes, externalRefExists, label);
}

function requireEach(refs, prefix, model, indexes, externalRefExists, label) {
  for (const ref of uniqueStrings(refs)) requireRef(ref, prefix, model, indexes, externalRefExists, label);
}

function carries(record, keys) {
  return keys.some((key) => Object.hasOwn(record, key) || Object.hasOwn(record.properties ?? {}, key));
}

function validateFamilyRecords(model) {
  for (const family of SEMANTIC_MODEL_FAMILIES) {
    if (!Array.isArray(model[family])) fail(`Semantic model ${family} must be a list.`);
    const ids = new Set();
    for (const [index, record] of model[family].entries()) {
      if (!record || typeof record !== "object" || !text(record.id)) fail(`${family} record ${index} needs an id.`);
      if (ids.has(record.id)) fail(`${family} record ids must be unique.`, "semantic_model_conflict", 409);
      ids.add(record.id);
    }
  }
}

export function validateSemanticModel(model, { ventureId = model?.ventureId, externalRefExists = null } = {}) {
  if (!model || typeof model !== "object") fail("Semantic model must be an object.");
  if (model.schemaVersion !== SEMANTIC_MODEL_SCHEMA_VERSION) fail("Unsupported semantic model schema version.", "semantic_model_schema_unsupported");
  if (model.ventureId !== ventureId) fail("Semantic model belongs to a different venture.", "semantic_model_cross_scope", 404);
  if (!Number.isInteger(model.revision) || model.revision < 0) fail("Semantic model revision must be non-negative.");
  validateFamilyRecords(model);
  const indexes = familyIndex(model);
  for (const object of model.objects) {
    if (!text(object.type) || !text(object.name) || typeof object.statement !== "string" || !object.properties || typeof object.properties !== "object") fail(`Object ${object.id} needs open type, name, statement, and properties.`);
    if (!ASSERTIONS.has(object.assertion)) fail(`Object ${object.id} needs a valid assertion.`);
    if (object.authorityRef) validateRef(object.authorityRef, model, indexes, externalRefExists, `Object ${object.id} authorityRef`);
  }
  for (const relationship of model.relationships) {
    if (!text(relationship.label) || !text(relationship.type) || !ASSERTIONS.has(relationship.assertion)) fail(`Relationship ${relationship.id} needs label, type, and assertion.`);
    if (["status", "runStatus", "executionStatus", "outcomeStatus"].some((key) => Object.hasOwn(relationship, key) || Object.hasOwn(relationship.properties ?? {}, key))) fail(`Relationship ${relationship.id} cannot store execution or outcome state.`);
    validateRef(relationship.fromRef, model, indexes, externalRefExists, `Relationship ${relationship.id} fromRef`);
    validateRef(relationship.toRef, model, indexes, externalRefExists, `Relationship ${relationship.id} toRef`);
    validateRefs(relationship.sourceRefs, model, indexes, externalRefExists, `Relationship ${relationship.id} sourceRefs`);
  }
  for (const thread of model.threads) {
    if (!text(thread.name)) fail(`Thread ${thread.id} needs a name.`);
    if (thread.lifecycle != null && !["open", "closed"].includes(thread.lifecycle)) fail(`Thread ${thread.id} needs a valid lifecycle.`);
    if (carries(thread, ["messages", "messageBodies", "body", "content"])) fail(`Thread ${thread.id} must reference conversation truth, not copy it.`);
    if (list(thread.messageRefs).some((ref) => !String(ref).startsWith("conversation:"))) fail(`Thread ${thread.id} can only reference conversation messages.`);
    optionalRef(thread.parentThreadRef, "thread:", model, indexes, externalRefExists, `Thread ${thread.id} parentThreadRef`);
    optionalRef(thread.originMessageRef, "conversation:", model, indexes, externalRefExists, `Thread ${thread.id} originMessageRef`);
    if (thread.reviewedThrough != null) validateRef(thread.reviewedThrough, model, indexes, externalRefExists, `Thread ${thread.id} reviewedThrough`);
    if (thread.parentThreadRef === `thread:${thread.id}`) fail(`Thread ${thread.id} cannot reference itself as its parent.`);
    validateRefs(thread.messageRefs, model, indexes, externalRefExists, `Thread ${thread.id} messageRefs`);
    validateRefs(thread.subjectRefs, model, indexes, externalRefExists, `Thread ${thread.id} subjectRefs`);
    validateRefs(thread.participantRefs, model, indexes, externalRefExists, `Thread ${thread.id} participantRefs`);
  }
  for (const run of model.runs) {
    // A run is a semantic join, never running state. Drives can be betless, multi-bet, or nested, so a
    // single bet is never assumed; betRef survives only as a legacy compatibility seam.
    if (Object.hasOwn(run, "status") || run.running === true) fail(`Run ${run.id} cannot persist running state.`);
    if (carries(run, ["bet", "bets", "events", "work", "decisions", "outcomes", "running"])) fail(`Run ${run.id} must join authoritative records by reference.`);
    requireRef(run.threadRef, "thread:", model, indexes, externalRefExists, `Run ${run.id} threadRef`);
    requireEach(run.betRefs, "bet:", model, indexes, externalRefExists, `Run ${run.id} betRefs`);
    optionalRef(run.betRef, "bet:", model, indexes, externalRefExists, `Run ${run.id} betRef`);
    optionalRef(run.parentRunRef, "run:", model, indexes, externalRefExists, `Run ${run.id} parentRunRef`);
    optionalRef(run.originMessageRef, "conversation:", model, indexes, externalRefExists, `Run ${run.id} originMessageRef`);
    optionalRef(run.workflowContractRef, "workflow-contract:", model, indexes, externalRefExists, `Run ${run.id} workflowContractRef`);
    if (run.parentRunRef === `run:${run.id}`) fail(`Run ${run.id} cannot reference itself as its parent.`);
    for (const key of ["eventRefs", "workRefs", "decisionRefs", "outcomeRefs", "scopeRefs", "participantRefs"]) validateRefs(run[key], model, indexes, externalRefExists, `Run ${run.id} ${key}`);
  }
  for (const view of model.views) {
    if (!text(view.name) || !text(view.kind)) fail(`View ${view.id} needs a name and kind.`);
    if (carries(view, ["positions", "coordinates", "camera", "placement"])) fail(`View ${view.id} must reference placement rather than copy it.`);
    validateRefs(view.rootRefs, model, indexes, externalRefExists, `View ${view.id} rootRefs`);
    validateRefs(view.relationshipRefs, model, indexes, externalRefExists, `View ${view.id} relationshipRefs`);
    if (view.placementRef) validateRef(view.placementRef, model, indexes, externalRefExists, `View ${view.id} placementRef`);
  }
  for (const contract of model.workflowContracts) {
    if (!text(contract.name)) fail(`Workflow contract ${contract.id} needs a name.`);
    if (["status", "stage", "currentStage"].some((key) => Object.hasOwn(contract, key) || Object.hasOwn(contract.properties ?? {}, key))) fail(`Workflow contract ${contract.id} cannot store status or stage.`);
    validateRefs(contract.subjectRefs, model, indexes, externalRefExists, `Workflow contract ${contract.id} subjectRefs`);
    validateRefs(contract.gateRefs, model, indexes, externalRefExists, `Workflow contract ${contract.id} gateRefs`);
    validateRefs(contract.sourceRefs, model, indexes, externalRefExists, `Workflow contract ${contract.id} sourceRefs`);
  }
  for (const insight of model.insights) {
    if (!text(insight.statement) || !text(insight.stance ?? insight.type) || !ASSERTIONS.has(insight.assertion)) fail(`Insight ${insight.id} needs a statement, stance/type, and assertion.`);
    if (carries(insight, ["evidence", "outcome", "decision", "message", "work"])) fail(`Insight ${insight.id} must reference evidence rather than copy it.`);
    validateRefs(insight.subjectRefs, model, indexes, externalRefExists, `Insight ${insight.id} subjectRefs`);
    validateRefs(insight.sourceRefs, model, indexes, externalRefExists, `Insight ${insight.id} sourceRefs`);
    validateRefs(insight.supersedes, model, indexes, externalRefExists, `Insight ${insight.id} supersedes`);
    if (insight.proposedBy?.authority !== "founder" && (insight.assertion !== "tentative" || !list(insight.sourceRefs).length)) fail(`Non-founder insight ${insight.id} must be tentative and source-bearing.`);
  }
  for (const branch of model.modelBranches) {
    if (!text(branch.name) || !text(branch.question) || !Number.isInteger(branch.baseModelRevision) || branch.baseModelRevision < 0) fail(`Model branch ${branch.id} needs a name, question, and base revision.`);
    if (!branch.createdBy?.authority || !text(branch.createdBy?.id)) fail(`Model branch ${branch.id} needs creator provenance.`);
    optionalRef(branch.parentBranchRef, "model-branch:", model, indexes, externalRefExists, `Model branch ${branch.id} parentBranchRef`);
    validateRefs(branch.scopeRefs, model, indexes, externalRefExists, `Model branch ${branch.id} scopeRefs`);
    requireEach(branch.threadRefs, "thread:", model, indexes, externalRefExists, `Model branch ${branch.id} threadRefs`);
    validateRefs(branch.sourceRefs, model, indexes, externalRefExists, `Model branch ${branch.id} sourceRefs`);
    if (branch.closedBy && branch.closedBy.authority !== "founder") fail(`Only the founder can close model branch ${branch.id}.`, "semantic_model_authority_denied", 403);
  }
  for (const change of model.modelChanges) {
    requireRef(change.branchRef, "model-branch:", model, indexes, externalRefExists, `Model change ${change.id} branchRef`);
    if (!["objects", "relationships"].includes(change.targetFamily) || !["create", "update", "remove"].includes(change.operation)) fail(`Model change ${change.id} has an unsupported target or operation.`);
    if (change.operation === "create" && !change.proposedRecord) fail(`Model change ${change.id} needs a proposed record.`);
    if (change.operation === "update" && (!text(change.targetRef) || !change.patch || typeof change.patch !== "object")) fail(`Model change ${change.id} needs a target and patch.`);
    if (change.operation === "remove" && !text(change.targetRef)) fail(`Model change ${change.id} needs a target.`);
    if (!text(change.rationale) || !change.proposedBy?.authority || !text(change.proposedBy?.id)) fail(`Model change ${change.id} needs rationale and proposer provenance.`);
    validateRefs(change.sourceRefs, model, indexes, externalRefExists, `Model change ${change.id} sourceRefs`);
    optionalRef(change.supersedesRef, "model-change:", model, indexes, externalRefExists, `Model change ${change.id} supersedesRef`);
  }
  for (const receipt of model.modelMergeReceipts) {
    requireRef(receipt.branchRef, "model-branch:", model, indexes, externalRefExists, `Model merge ${receipt.id} branchRef`);
    requireEach(receipt.selectedChangeRefs, "model-change:", model, indexes, externalRefExists, `Model merge ${receipt.id} selectedChangeRefs`);
    if (receipt.actor?.authority !== "founder" || !Number.isInteger(receipt.previousModelRevision) || !Number.isInteger(receipt.resultingModelRevision)) fail(`Model merge ${receipt.id} needs founder provenance and revisions.`);
  }
  for (const scope of model.workScopes) {
    requireRef(scope.originThreadRef, "thread:", model, indexes, externalRefExists, `Work scope ${scope.id} originThreadRef`);
    requireRef(scope.originMessageRef, "conversation:", model, indexes, externalRefExists, `Work scope ${scope.id} originMessageRef`);
    if (!text(scope.objective)) fail(`Work scope ${scope.id} needs an objective.`);
    validateRefs(scope.subjectRefs, model, indexes, externalRefExists, `Work scope ${scope.id} subjectRefs`);
    requireEach(scope.branchRefs, "model-branch:", model, indexes, externalRefExists, `Work scope ${scope.id} branchRefs`);
    validateRefs(scope.wakeOnEvidenceRefs, model, indexes, externalRefExists, `Work scope ${scope.id} wakeOnEvidenceRefs`);
    if (scope.revokedBy && scope.revokedBy.authority !== "founder") fail(`Only the founder can revoke work scope ${scope.id}.`, "semantic_model_authority_denied", 403);
  }
  for (const action of model.outwardActions) {
    if (!text(action.kind) || !text(action.decisionRef)) fail(`Outward action ${action.id} needs a kind and founder decision reference.`);
    validateRefs(action.subjectRefs, model, indexes, externalRefExists, `Outward action ${action.id} subjectRefs`);
    requireEach(action.branchRefs, "model-branch:", model, indexes, externalRefExists, `Outward action ${action.id} branchRefs`);
    validateRefs(action.motionRefs, model, indexes, externalRefExists, `Outward action ${action.id} motionRefs`);
    validateRefs(action.productDeltaRefs, model, indexes, externalRefExists, `Outward action ${action.id} productDeltaRefs`);
    validateRefs(action.workRefs, model, indexes, externalRefExists, `Outward action ${action.id} workRefs`);
    validateRefs(action.observationRefs, model, indexes, externalRefExists, `Outward action ${action.id} observationRefs`);
    validateRefs(action.outcomeRefs, model, indexes, externalRefExists, `Outward action ${action.id} outcomeRefs`);
  }
  return model;
}

export { projectArchitectureCompatibility } from "./semantic-model-architecture-compat.mjs";

export function replaceArchitectureCompatibility(model, stored, options) {
  return replaceArchitectureCompatibilityProjection(model, stored, options, { modelFromArchitecture });
}
