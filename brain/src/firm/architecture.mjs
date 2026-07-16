// The Living Venture Atlas's semantic kernel. Architecture is one revisioned document inside the
// venture's existing persistence boundary; placement, bets, outcomes, and wall receipts remain their
// own authorities. This module validates and mutates semantic truth only.

import crypto from "node:crypto";
import { getVentureDoc, listVentureDocs, now, venturePersistence } from "./venture-store.mjs";

export const ARCHITECTURE_KEY = "atlas";
export const ARCHITECTURE_SCHEMA_VERSION = 1;
export const ARCHITECTURE_ROLES = Object.freeze(["concept", "product-loop", "system", "motion", "campaign"]);
export const ARCHITECTURE_OPERATIONS = Object.freeze([
  "update-intent",
  "create-element", "update-element", "change-role", "remove-element",
  "create-connection", "update-connection", "remove-connection",
  "create-group", "update-group", "remove-group", "apply-evidence", "remove-evidence",
]);

const ROLE_SET = new Set(ARCHITECTURE_ROLES);
const OPERATION_SET = new Set(ARCHITECTURE_OPERATIONS);
const ASSERTIONS = new Set(["tentative", "founder-asserted"]);
const EVIDENCE_STANCES = new Set(["supports", "challenges"]);
const EVIDENCE_BASES = new Set(["repository-citation", "captured-join", "founder-confirmed"]);

function text(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueStrings(value) {
  return [...new Set(list(value).map(text).filter(Boolean))];
}

function fail(message, code = "architecture_invalid", status = 400, details = {}) {
  throw Object.assign(new Error(message), { code, status, ...details });
}

function generatedId(prefix) {
  return `${prefix}-${crypto.randomBytes(8).toString("hex")}`;
}

function founderActor(actor) {
  if (actor?.authority !== "founder") fail("Only the founder can change current venture architecture.", "architecture_authority_denied", 403);
  return { authority: "founder", id: text(actor.id) ?? "founder" };
}

export function emptyArchitecture(ventureId, intent = null) {
  return {
    schemaVersion: ARCHITECTURE_SCHEMA_VERSION,
    ventureId,
    revision: 0,
    intent: {
      statement: text(intent?.statement ?? intent) ?? "",
      constraints: uniqueStrings(intent?.constraints),
    },
    elements: [],
    connections: [],
    groups: [],
    evidenceAnnotations: [],
    updatedAt: null,
    updatedBy: null,
  };
}

export function getArchitectureState(ventureId, options = {}) {
  const stored = getVentureDoc(ventureId, "architecture", ARCHITECTURE_KEY, options);
  if (!stored) return { current: emptyArchitecture(ventureId), revisions: [], proposals: [], storageRevision: 0, storageRevisionPresent: true };
  const state = {
    current: stored.current ?? emptyArchitecture(ventureId),
    revisions: list(stored.revisions),
    proposals: list(stored.proposals),
    storageRevision: Number.isInteger(stored.revision) ? stored.revision : (stored.current?.revision ?? 0),
    storageRevisionPresent: Number.isInteger(stored.revision),
  };
  validateArchitecture(state.current, { ventureId, options });
  return structuredClone(state);
}

export function getArchitecture(ventureId, options = {}) {
  return getArchitectureState(ventureId, options).current;
}

function writeArchitectureState(ventureId, state, stored, options) {
  const provider = venturePersistence(options, ventureId);
  if (!state.storageRevisionPresent) return provider.set("architecture", ARCHITECTURE_KEY, stored);
  return provider.compareAndSet("architecture", ARCHITECTURE_KEY, state.storageRevision, stored);
}

function architectureRefId(ref) {
  const value = text(ref);
  if (!value?.startsWith("architecture:")) return null;
  return value.slice("architecture:".length).split("#")[0] || null;
}

function refExists(ref, { elementIds, betIds, outcomeIds, workRefs, wallIds }) {
  const value = text(ref);
  if (!value) return false;
  const [kind, rest] = value.split(":", 2);
  const id = rest?.split("#")[0];
  if (kind === "architecture") return elementIds.has(id);
  if (kind === "bet") return betIds.has(id);
  if (kind === "outcome") return outcomeIds.has(id);
  if (kind === "work") return workRefs.has(id);
  if (kind === "wall-item") return wallIds.has(id);
  if (kind === "repository") return Boolean(rest);
  if (kind === "venture") return true;
  return false;
}

function roleError(element, requirement) {
  fail(`${element.role} element ${element.id} ${requirement}.`, "architecture_role_invariant");
}

function validateElement(element, index, sets) {
  if (!element || typeof element !== "object") fail(`Architecture element ${index} must be an object.`);
  const id = text(element.id);
  const role = text(element.role);
  if (!id) fail(`Architecture element ${index} needs an id.`);
  if (!ROLE_SET.has(role)) fail(`Architecture element ${id} has unknown role "${role}".`, "architecture_role_invariant");
  if (!text(element.name)) roleError({ id, role }, "needs a name");
  if (role === "product-loop") {
    if (!text(element.actor) || !text(element.entry) || !text(element.value) || !text(element.intendedChange)) {
      roleError(element, "needs actor, entry, value, and intendedChange");
    }
    if (!list(element.steps).length || element.steps.some((step) => !text(step?.id) || !text(step?.label))) {
      roleError(element, "needs ordered named steps");
    }
  }
  if (role === "system" && !text(element.does)) roleError(element, "needs a reusable capability statement in does");
  if (role === "motion") {
    if (!text(element.actor) || !text(element.entry) || !text(element.value) || !text(element.repeatabilityClaim)) {
      roleError(element, "needs actor, entry, value, and repeatabilityClaim");
    }
    for (const systemId of uniqueStrings(element.systemIds)) {
      if (sets.roles.get(systemId) !== "system") roleError(element, `references missing/non-system ${systemId}`);
    }
    for (const productRef of uniqueStrings(element.productRefs)) {
      const id = productRef.split("#")[0];
      if (sets.roles.get(id) !== "product-loop") roleError(element, `references missing/non-product-loop ${productRef}`);
    }
  }
  if (role === "campaign") {
    if (!text(element.audience) || !text(element.objective)) roleError(element, "needs audience and objective");
    if (sets.roles.get(text(element.primaryMotionId)) !== "motion") roleError(element, "needs one primary motion");
    const motionIds = uniqueStrings(element.motionIds);
    if (!motionIds.includes(element.primaryMotionId) || motionIds.some((id) => sets.roles.get(id) !== "motion")) {
      roleError(element, "must include only existing motions and its primary motion");
    }
    if (!sets.betIds.has(text(element.governingBetId))) roleError(element, "needs one existing governing bet");
    if (uniqueStrings(element.supportingBetIds).some((id) => !sets.betIds.has(id) || id === element.governingBetId)) {
      roleError(element, "has a missing or duplicate supporting bet");
    }
    if (!text(element.measurement?.observation) || !text(element.measurement?.window)) {
      roleError(element, "needs a measurement observation and window");
    }
  }
}

export function validateArchitecture(document, { ventureId = document?.ventureId, options = {}, additionalBetIds = [] } = {}) {
  if (!document || typeof document !== "object") fail("Architecture current document must be an object.");
  if (document.schemaVersion !== ARCHITECTURE_SCHEMA_VERSION) fail("Unsupported architecture schema version.");
  if (document.ventureId !== ventureId) fail("Architecture belongs to a different venture.", "architecture_cross_scope", 404);
  if (!Number.isInteger(document.revision) || document.revision < 0) fail("Architecture revision must be non-negative.");
  for (const key of ["elements", "connections", "groups", "evidenceAnnotations"]) {
    if (!Array.isArray(document[key])) fail(`Architecture ${key} must be a list.`);
  }
  const bets = listVentureDocs(ventureId, "bets", options);
  const outcomes = listVentureDocs(ventureId, "outcomes", options);
  const decisions = listVentureDocs(ventureId, "decisions", options);
  const roles = new Map(document.elements.map((element) => [text(element?.id), text(element?.role)]));
  if (roles.has(null) || roles.size !== document.elements.length) fail("Architecture element ids must be present and unique.");
  const betIds = new Set([...bets.map((entry) => entry.id), ...additionalBetIds]);
  const outcomeIds = new Set(outcomes.map((entry) => entry.id));
  const wallIds = new Set(decisions.map((entry) => entry.id));
  const workRefs = new Set(bets.flatMap((bet) => list(bet.staged).map((work) => work?.id).filter(Boolean)));
  const sets = { roles, elementIds: new Set(roles.keys()), betIds, outcomeIds, workRefs, wallIds };
  document.elements.forEach((element, index) => validateElement(element, index, sets));

  const connectionIds = new Set();
  for (const connection of document.connections) {
    if (!text(connection?.id) || connectionIds.has(connection.id)) fail("Architecture connection ids must be present and unique.");
    connectionIds.add(connection.id);
    if (!refExists(connection.fromRef, sets) || !refExists(connection.toRef, sets)) fail(`Connection ${connection.id} has a missing target.`, "architecture_missing_ref", 404);
    if (!text(connection.label) || !ASSERTIONS.has(connection.assertion)) fail(`Connection ${connection.id} needs a label and valid assertion.`);
  }
  const groupIds = new Set();
  for (const group of document.groups) {
    if (!text(group?.id) || groupIds.has(group.id) || !text(group.name)) fail("Architecture groups need unique ids and names.");
    groupIds.add(group.id);
    if (uniqueStrings(group.memberRefs).some((ref) => !refExists(ref, sets))) fail(`Group ${group.id} has a missing member.`, "architecture_missing_ref", 404);
  }
  const evidenceIds = new Set();
  for (const annotation of document.evidenceAnnotations) {
    if (!text(annotation?.id) || evidenceIds.has(annotation.id)) fail("Evidence annotation ids must be present and unique.");
    evidenceIds.add(annotation.id);
    if (!architectureRefId(annotation.subjectRef) || !refExists(annotation.subjectRef, sets)) fail(`Evidence ${annotation.id} has a missing architecture subject.`, "architecture_missing_ref", 404);
    if (!refExists(annotation.evidenceRef, sets)) fail(`Evidence ${annotation.id} has a missing same-venture source.`, "architecture_missing_ref", 404);
    if (!EVIDENCE_STANCES.has(annotation.stance) || !EVIDENCE_BASES.has(annotation.basis) || !text(annotation.note)) {
      fail(`Evidence ${annotation.id} needs an allowed stance, basis, and honest note.`);
    }
    if (annotation.appliedBy?.authority !== "founder") fail(`Evidence ${annotation.id} must be founder-applied.`, "architecture_authority_denied", 403);
  }
  return document;
}

function replaceById(items, id, replacement, label) {
  const index = items.findIndex((entry) => entry.id === id);
  if (index < 0) fail(`No such ${label}: ${id}`, "architecture_missing_ref", 404);
  items[index] = replacement;
}

function applyOperation(document, operation, actor) {
  if (!OPERATION_SET.has(operation?.op)) fail(`Unknown architecture operation: ${operation?.op}`);
  const supplied = operation.value ?? operation.element ?? operation.connection ?? operation.group ?? operation.evidence ?? {};
  const value = structuredClone(operation.op === "change-role"
    ? { ...(operation.fields ?? supplied), role: operation.role ?? supplied.role }
    : supplied);
  const id = text(operation.id ?? operation.elementId ?? operation.connectionId ?? operation.groupId ?? operation.evidenceId ?? value.id);
  if (operation.op === "update-intent") {
    const statement = text(value.statement);
    if (!statement) fail("Venture intent needs a plain-language statement.");
    document.intent = { statement, constraints: uniqueStrings(value.constraints) };
  } else if (operation.op === "create-element") {
    value.id = id ?? generatedId("arch");
    value.provenance ??= { kind: "founder-authored", createdAt: now() };
    if (document.elements.some((entry) => entry.id === value.id)) fail(`Architecture element ${value.id} already exists.`, "architecture_conflict", 409);
    document.elements.push(value);
  } else if (operation.op === "update-element") {
    const current = document.elements.find((entry) => entry.id === id);
    if (!current) fail(`No such architecture element: ${id}`, "architecture_missing_ref", 404);
    if (value.role && value.role !== current.role) fail("Use change-role to promote or demote architecture.", "architecture_role_invariant");
    replaceById(document.elements, id, { ...current, ...value, id, role: current.role }, "architecture element");
  } else if (operation.op === "change-role") {
    const current = document.elements.find((entry) => entry.id === id);
    if (!current) fail(`No such architecture element: ${id}`, "architecture_missing_ref", 404);
    replaceById(document.elements, id, { id, name: current.name, statement: current.statement, provenance: current.provenance, ...value, id, role: value.role }, "architecture element");
  } else if (operation.op === "remove-element") {
    if (!document.elements.some((entry) => entry.id === id)) fail(`No such architecture element: ${id}`, "architecture_missing_ref", 404);
    const ref = `architecture:${id}`;
    const inbound = document.elements.some((entry) => uniqueStrings(entry.systemIds).includes(id) || uniqueStrings(entry.motionIds).includes(id) || entry.primaryMotionId === id || uniqueStrings(entry.productRefs).some((candidate) => candidate.split("#")[0] === id))
      || document.connections.some((entry) => entry.fromRef.startsWith(ref) || entry.toRef.startsWith(ref))
      || document.groups.some((entry) => uniqueStrings(entry.memberRefs).some((candidate) => candidate.startsWith(ref)))
      || document.evidenceAnnotations.some((entry) => entry.subjectRef.startsWith(ref));
    if (inbound) fail(`Architecture element ${id} is still referenced; detach or rewire it in the same mutation.`, "architecture_active_reference", 409);
    document.elements = document.elements.filter((entry) => entry.id !== id);
  } else if (operation.op === "create-connection") {
    value.id = id ?? generatedId("connection");
    value.source ??= { kind: actor.authority === "founder" ? "founder-authored" : "proposal" };
    document.connections.push(value);
  } else if (operation.op === "update-connection") {
    const current = document.connections.find((entry) => entry.id === id);
    replaceById(document.connections, id, { ...current, ...value, id }, "architecture connection");
  } else if (operation.op === "remove-connection") document.connections = document.connections.filter((entry) => entry.id !== id);
  else if (operation.op === "create-group") {
    value.id = id ?? generatedId("group");
    document.groups.push(value);
  } else if (operation.op === "update-group") {
    const current = document.groups.find((entry) => entry.id === id);
    replaceById(document.groups, id, { ...current, ...value, id }, "architecture group");
  } else if (operation.op === "remove-group") document.groups = document.groups.filter((entry) => entry.id !== id);
  else if (operation.op === "apply-evidence") {
    value.id = id ?? generatedId("evidence");
    value.appliedBy = actor;
    value.appliedAt = now();
    document.evidenceAnnotations.push(value);
  } else if (operation.op === "remove-evidence") document.evidenceAnnotations = document.evidenceAnnotations.filter((entry) => entry.id !== id);
}

function affectedTargets(operations) {
  return [...new Set(operations.flatMap((operation) => [operation.id, operation.value?.id, operation.value?.fromRef, operation.value?.toRef, operation.value?.subjectRef]).map(text).filter(Boolean))];
}

function previewArchitectureMutations({ ventureId, baseRevision, operations, actor, additionalBetIds = [] }, options) {
  if (!Number.isInteger(baseRevision) || baseRevision < 0) fail("Architecture mutation needs a non-negative baseRevision.");
  if (!Array.isArray(operations) || !operations.length) fail("Architecture mutation needs operations.");
  const state = getArchitectureState(ventureId, options);
  if (state.current.revision !== baseRevision) fail("Architecture changed since this edit began.", "architecture_stale_revision", 409, { baseRevision, currentRevision: state.current.revision });
  const before = structuredClone(state.current);
  const next = structuredClone(before);
  for (const operation of operations) applyOperation(next, operation, actor);
  next.revision = baseRevision + 1;
  validateArchitecture(next, { ventureId, options, additionalBetIds });
  return { state, before, next };
}

// Proposals are ghosts, but they must still be ghosts of a change the mutation kernel can apply.
// Validate against current venture truth using the founder semantics that acceptance will eventually
// use, without persisting the preview or granting the proposer founder authority.
export function validateArchitectureProposalOperations({ ventureId, baseRevision, operations } = {}, options = {}) {
  const previewOperations = structuredClone(operations);
  const additionalBetIds = [];
  for (const operation of previewOperations) {
    const element = operation?.element ?? operation?.value;
    if (operation?.op !== "create-element" || element?.role !== "campaign") continue;
    if (text(element.governingBetId) && text(element.governingBetSeed)) {
      fail(`Campaign ${text(element.id) ?? "without an id"} cannot carry both a real governing bet and a ghost seed.`, "architecture_role_invariant");
    }
    if (element.governingBetId) continue;
    const seed = text(element.governingBetSeed);
    if (!seed) fail(`Ghost campaign ${text(element.id) ?? "without an id"} needs a governingBetSeed.`, "architecture_role_invariant");
    if (!text(element.id)) fail("A ghost campaign needs an explicit id so its governing bet can be joined at acceptance.", "architecture_role_invariant");
    const placeholderBetId = `proposal-governing-bet-${element.id}`;
    delete element.governingBetSeed;
    element.governingBetId = placeholderBetId;
    additionalBetIds.push(placeholderBetId);
  }
  previewArchitectureMutations({
    ventureId,
    baseRevision,
    operations: previewOperations,
    actor: { authority: "founder", id: "proposal-preview" },
    additionalBetIds,
  }, options);
  return true;
}

export function applyArchitectureMutations({ ventureId, baseRevision, operations, reason = null, actor, source = "founder-direct", proposalId = null, proposalDecision = null } = {}, options = {}) {
  const appliedBy = founderActor(actor);
  const { state, before, next } = previewArchitectureMutations({ ventureId, baseRevision, operations, actor: appliedBy }, options);
  next.updatedAt = now();
  next.updatedBy = appliedBy;
  const receipt = {
    id: `architecture-revision-${next.revision}`,
    revision: next.revision,
    baseRevision,
    actor: appliedBy,
    source: text(source) ?? "founder-direct",
    ...(text(proposalId) ? { proposalId: text(proposalId) } : {}),
    reason: text(reason),
    operations: structuredClone(operations),
    affectedTargets: affectedTargets(operations),
    before,
    after: structuredClone(next),
    createdAt: next.updatedAt,
  };
  let decidedProposal = null;
  const proposals = proposalDecision
    ? state.proposals.map((entry) => {
        if (entry.id !== proposalDecision.proposalId) return entry;
        if (entry.status !== "pending") fail(`Architecture proposal ${entry.id} was already decided.`, "architecture_proposal_decided", 409);
        decidedProposal = { ...entry, ...structuredClone(proposalDecision.fields) };
        return decidedProposal;
      })
    : state.proposals;
  if (proposalDecision && !decidedProposal) fail(`No such architecture proposal: ${proposalDecision.proposalId}`, "architecture_proposal_not_found", 404);
  const stored = { current: next, revisions: [...state.revisions, receipt], proposals };
  writeArchitectureState(ventureId, state, { ...stored, revision: state.storageRevision + 1 }, options);
  return { architecture: next, revision: next.revision, receipt, affectedContexts: receipt.affectedTargets, ...(decidedProposal ? { proposal: decidedProposal } : {}) };
}

export function restoreArchitectureRevision({ ventureId, revision, baseRevision, actor, reason = null } = {}, options = {}) {
  const state = getArchitectureState(ventureId, options);
  const prior = state.revisions.find((entry) => entry.revision === revision)?.after;
  if (!prior) fail(`No architecture revision ${revision}.`, "architecture_revision_not_found", 404);
  const operations = [
    ...state.current.elements.map((entry) => ({ op: "remove-element", id: entry.id })).reverse(),
  ];
  // Restore is a complete semantic snapshot, but it still creates a forward revision and receipt.
  const appliedBy = founderActor(actor);
  if (state.current.revision !== baseRevision) fail("Architecture changed since this restore began.", "architecture_stale_revision", 409);
  const next = { ...structuredClone(prior), revision: baseRevision + 1, updatedAt: now(), updatedBy: appliedBy };
  validateArchitecture(next, { ventureId, options });
  const receipt = { id: `architecture-revision-${next.revision}`, revision: next.revision, baseRevision, actor: appliedBy, source: "restore", reason: text(reason), restoredRevision: revision, operations, affectedTargets: next.elements.map((entry) => entry.id), before: state.current, after: next, createdAt: next.updatedAt };
  writeArchitectureState(ventureId, state, { current: next, revisions: [...state.revisions, receipt], proposals: state.proposals, revision: state.storageRevision + 1 }, options);
  return { architecture: next, revision: next.revision, receipt, affectedContexts: receipt.affectedTargets };
}
