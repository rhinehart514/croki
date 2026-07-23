// Teammates and MCP clients can suggest semantic changes, never apply them. Founder decisions reuse
// the architecture mutation kernel so accepting a proposal has exactly the same invariants and CAS.

import crypto from "node:crypto";
import { listVentureDocs, now } from "./venture-store.mjs";
import { ARCHITECTURE_OPERATIONS, applyArchitectureMutations, getArchitectureState, validateArchitectureProposalOperations, writeArchitectureCompatibilityState } from "./architecture.mjs";
import { listConversation } from "./conversation.mjs";

const OPERATIONS = new Set(ARCHITECTURE_OPERATIONS);
export const THEORY_OPERATIONS = new Set(["upsert-subject", "remove-subject", "upsert-relationship", "remove-relationship"]);

function text(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function fail(message, code = "architecture_proposal_invalid", status = 400, details = {}) {
  throw Object.assign(new Error(message), { code, status, ...details });
}

function proposalId() {
  return `architecture-proposal-${crypto.randomBytes(8).toString("hex")}`;
}

function unique(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(text).filter(Boolean))];
}

function theoryRef(ref, prefix) {
  const value = text(ref);
  return value?.startsWith(prefix) ? value.slice(prefix.length) : null;
}

function normalizeRepositorySource(source) {
  if (source?.kind !== "repository" || !text(source.ref) || !text(source.path) || !text(source.excerpt) || !text(source.digest)) {
    fail("Working-theory repository sources need a captured ref, path, excerpt, and digest.", "working_theory_source_invalid");
  }
  const digest = crypto.createHash("sha256").update(String(source.excerpt)).digest("hex");
  if (digest !== source.digest || !source.ref.endsWith(`:${digest.slice(0, 12)}`)) {
    fail("Working-theory repository source no longer matches its captured citation.", "working_theory_source_invalid");
  }
  if (!Number.isInteger(source.startLine) || !Number.isInteger(source.endLine) || source.startLine < 1 || source.endLine < source.startLine) {
    fail("Working-theory repository source needs an exact line range.", "working_theory_source_invalid");
  }
  return {
    ref: source.ref,
    kind: "repository",
    path: source.path,
    startLine: source.startLine,
    endLine: source.endLine,
    excerpt: source.excerpt,
    digest,
    observedAt: text(source.observedAt) ?? now(),
  };
}

function knownSourceRefs(ventureId, sources, options) {
  const refs = new Set(sources.map((source) => source.ref));
  for (const message of listConversation(ventureId, options)) refs.add(`conversation:${message.id}`);
  const bets = listVentureDocs(ventureId, "bets", options);
  for (const bet of bets) {
    refs.add(`bet:${bet.id}`);
    for (const item of [...(bet.staged ?? []), ...(bet.evidence ?? [])]) if (item?.id) refs.add(`work:${item.id}`);
  }
  for (const outcome of listVentureDocs(ventureId, "outcomes", options)) refs.add(`outcome:${outcome.id}`);
  for (const item of listVentureDocs(ventureId, "decisions", options)) refs.add(`wall-item:${item.id}`);
  const architecture = getArchitectureState(ventureId, options).current;
  for (const element of architecture.elements) refs.add(`architecture:${element.id}`);
  refs.add(`venture:${ventureId}`);
  return refs;
}

function applyTheoryOperations(previous, operations) {
  const subjects = new Map((previous?.subjects ?? []).map((entry) => [entry.id, structuredClone(entry)]));
  const relationships = new Map((previous?.relationships ?? []).map((entry) => [entry.id, structuredClone(entry)]));
  for (const operation of operations) {
    if (!THEORY_OPERATIONS.has(operation?.op)) fail(`Unsupported working-theory operation: ${operation?.op}`, "working_theory_operation_invalid");
    const supplied = operation.value ?? operation.subject ?? operation.relationship ?? {};
    const id = text(operation.id ?? operation.subjectId ?? operation.relationshipId ?? supplied.id);
    if (!id || id.length > 120 || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) fail("Working-theory operations need a stable alphanumeric id of at most 120 characters.", "working_theory_operation_invalid");
    if (operation.op === "upsert-subject") {
      const current = subjects.get(id) ?? {};
      const name = text(supplied.name ?? current.name);
      const statement = text(supplied.statement ?? current.statement ?? name);
      if (!name || !statement) fail(`Working-theory subject ${id} needs a name and statement.`, "working_theory_operation_invalid");
      subjects.set(id, { ...current, id, name, statement, assertion: "tentative" });
    } else if (operation.op === "remove-subject") {
      if (!subjects.has(id)) fail(`No such working-theory subject: ${id}`, "working_theory_subject_missing", 404);
      subjects.delete(id);
    } else if (operation.op === "upsert-relationship") {
      const current = relationships.get(id) ?? {};
      const fromRef = text(supplied.fromRef ?? current.fromRef);
      const toRef = text(supplied.toRef ?? current.toRef);
      const label = text(supplied.label ?? current.label);
      if (!theoryRef(fromRef, "theory:") || !theoryRef(toRef, "theory:") || !label) {
        fail(`Working-theory relationship ${id} needs two theory subject refs and a plain label.`, "working_theory_operation_invalid");
      }
      relationships.set(id, { ...current, id, fromRef, toRef, label, assertion: "tentative" });
    } else {
      if (!relationships.has(id)) fail(`No such working-theory relationship: ${id}`, "working_theory_relationship_missing", 404);
      relationships.delete(id);
    }
  }
  if (!subjects.size) fail("A working theory needs at least one visible subject.", "working_theory_empty");
  for (const relationship of relationships.values()) {
    if (!subjects.has(theoryRef(relationship.fromRef, "theory:")) || !subjects.has(theoryRef(relationship.toRef, "theory:"))) {
      fail(`Working-theory relationship ${relationship.id} points to a missing subject.`, "working_theory_subject_missing", 404);
    }
  }
  return { subjects: [...subjects.values()], relationships: [...relationships.values()] };
}

function materializeTheorySnapshot({ previous, operations, suppliedAnchors, suppliedSources, suppliedConversationRefs, ventureId, options }) {
  const snapshot = applyTheoryOperations(previous, operations);
  const sourceByRef = new Map([...(previous?.sources ?? []), ...suppliedSources.map(normalizeRepositorySource)].map((source) => [source.ref, source]));
  const anchorByRef = new Map((previous?.anchors ?? []).map((anchor) => [anchor.subjectRef, { ...anchor, sourceRefs: unique(anchor.sourceRefs) }]));
  for (const anchor of suppliedAnchors) {
    const subjectRef = text(anchor?.subjectRef);
    if (!subjectRef) fail("Working-theory anchors need a subjectRef.", "working_theory_anchor_invalid");
    const current = anchorByRef.get(subjectRef);
    anchorByRef.set(subjectRef, { subjectRef, sourceRefs: unique([...(current?.sourceRefs ?? []), ...(anchor.sourceRefs ?? [])]) });
  }
  const subjectIds = new Set(snapshot.subjects.map((entry) => entry.id));
  const relationshipIds = new Set(snapshot.relationships.map((entry) => entry.id));
  const validTarget = (ref) => {
    const subjectId = theoryRef(ref, "theory:");
    const relationshipId = theoryRef(ref, "theory-relationship:");
    return (subjectId && subjectIds.has(subjectId)) || (relationshipId && relationshipIds.has(relationshipId));
  };
  const anchors = [...anchorByRef.values()].filter((anchor) => validTarget(anchor.subjectRef));
  const knownRefs = knownSourceRefs(ventureId, [...sourceByRef.values()], options);
  for (const anchor of anchors) {
    if (!anchor.sourceRefs.length || anchor.sourceRefs.some((ref) => !knownRefs.has(ref))) {
      fail(`Working-theory anchor ${anchor.subjectRef} needs existing same-venture sources.`, "working_theory_anchor_invalid");
    }
  }
  for (const subject of snapshot.subjects) {
    if (!anchors.some((anchor) => anchor.subjectRef === `theory:${subject.id}`)) {
      fail(`Working-theory subject ${subject.id} has no concrete source anchor.`, "working_theory_anchor_invalid");
    }
  }
  const decorate = (entry, ref) => {
    const sourceRefs = unique(anchors.filter((anchor) => anchor.subjectRef === ref).flatMap((anchor) => anchor.sourceRefs));
    return {
      ...entry,
      sourceRefs,
      conversationRefs: sourceRefs.filter((sourceRef) => sourceRef.startsWith("conversation:")),
      workRefs: sourceRefs.filter((sourceRef) => sourceRef.startsWith("work:")).map((sourceRef) => sourceRef.slice("work:".length)),
    };
  };
  return {
    subjects: snapshot.subjects.map((subject) => decorate(subject, `theory:${subject.id}`)),
    relationships: snapshot.relationships.map((relationship) => decorate(relationship, `theory-relationship:${relationship.id}`)),
    anchors,
    sources: [...sourceByRef.values()],
    conversationRefs: unique([...(previous?.conversationRefs ?? []), ...suppliedConversationRefs]),
  };
}

function operationAssemblyEvent(operation, operationIndex) {
  const value = operation.value ?? operation.element ?? operation.connection ?? operation.group ?? operation.evidence ?? {};
  const elementId = text(operation.elementId ?? value.id);
  const role = text(value.role);
  const subject = text(value.name ?? value.label ?? value.statement ?? elementId);
  return {
    operationIndex,
    op: operation.op,
    ...(role ? { role } : {}),
    ...(elementId ? { elementId } : {}),
    label: subject ? `${operation.op}: ${subject}` : operation.op,
    validated: true,
    at: now(),
  };
}

function writeState(ventureId, state, currentState, options) {
  return writeArchitectureCompatibilityState(ventureId, currentState, state, options);
}

export function proposeArchitectureChange({
  ventureId,
  baseRevision,
  intent,
  operations,
  affectedExecutionContexts = [],
  evidenceRefs = [],
  unresolvedAssumptions = [],
  expectedExecutionEffect = null,
  proposedBy,
} = {}, options = {}) {
  if (!Number.isInteger(baseRevision) || baseRevision < 0) fail("Architecture proposal needs a non-negative baseRevision.");
  if (!text(intent)) fail("Architecture proposal needs a plain-language intent.");
  if (!Array.isArray(operations) || !operations.length || operations.some((entry) => !OPERATIONS.has(entry?.op))) {
    fail("Architecture proposal needs supported semantic operations.");
  }
  const authority = text(proposedBy?.authority) ?? "agent";
  if (authority === "founder") fail("Founder edits use the direct mutation path.", "architecture_proposal_authority", 403);
  const proposer = { authority, id: text(proposedBy?.id) ?? "unknown" };
  const proposedOperations = structuredClone(operations);
  // The entire list validates before any assembly receipt exists. These events report ordered,
  // completed validation; they do not pretend the synchronous proposal call streamed partial work.
  validateArchitectureProposalOperations({ ventureId, baseRevision, operations: proposedOperations }, options);
  const assemblyEvents = proposedOperations.map(operationAssemblyEvent);
  const state = getArchitectureState(ventureId, options);
  if (state.current.revision !== baseRevision) fail("Architecture changed before this proposal was recorded.", "architecture_stale_revision", 409);
  const proposal = {
    id: proposalId(),
    ventureId,
    mode: "structural-change",
    baseRevision,
    intent: text(intent),
    operations: proposedOperations,
    affectedExecutionContexts: [...new Set(affectedExecutionContexts.map(text).filter(Boolean))],
    evidenceRefs: [...new Set(evidenceRefs.map(text).filter(Boolean))],
    unresolvedAssumptions: unresolvedAssumptions.map(text).filter(Boolean),
    expectedExecutionEffect: text(expectedExecutionEffect),
    proposedBy: proposer,
    configurationRevision: Number.isInteger(proposedBy?.configurationRevision) ? proposedBy.configurationRevision : null,
    status: "pending",
    assemblyEvents,
    createdAt: now(),
    decidedAt: null,
    decision: null,
  };
  writeState(ventureId, { current: state.current, revisions: state.revisions, proposals: [...state.proposals, proposal] }, state, options);
  return { proposal, revision: state.current.revision, assemblyEvents };
}

export function getCurrentWorkingTheory(ventureId, options = {}) {
  const proposals = getArchitectureState(ventureId, options).proposals;
  return structuredClone(proposals.findLast((entry) => entry.mode === "working-theory" && entry.status === "current") ?? null);
}

export function recordWorkingTheory({
  ventureId,
  baseRevision,
  intent,
  supersedes = null,
  operations,
  anchors = [],
  sources = [],
  conversationRefs = [],
  proposedBy,
  requiredSubjectId = null,
  requiredRelationshipId = null,
} = {}, options = {}) {
  if (!Number.isInteger(baseRevision) || baseRevision < 0) fail("Working theory needs a non-negative baseRevision.", "working_theory_invalid");
  if (!text(intent)) fail("Working theory needs a plain-language intent.", "working_theory_invalid");
  if (!Array.isArray(operations) || !operations.length) fail("Working theory needs restricted semantic operations.", "working_theory_invalid");
  const authority = text(proposedBy?.authority) ?? "agent";
  if (authority === "founder") fail("A working theory records Croki's provisional read, not founder-confirmed architecture.", "working_theory_authority", 403);
  const state = getArchitectureState(ventureId, options);
  if (state.current.revision !== baseRevision) {
    fail("Durable architecture changed before this theory was recorded.", "architecture_stale_revision", 409, { baseRevision, currentRevision: state.current.revision });
  }
  const current = state.proposals.findLast((entry) => entry.mode === "working-theory" && entry.status === "current") ?? null;
  const supersededId = text(supersedes);
  if ((current?.id ?? null) !== supersededId) {
    fail(current ? `Working theory must supersede the current theory ${current.id}.` : "The first working theory cannot supersede a missing theory.", "working_theory_stale", 409, { currentTheoryId: current?.id ?? null });
  }
  if (requiredSubjectId) {
    if (!current?.subjects.some((subject) => subject.id === requiredSubjectId)) fail(`No current working-theory subject ${requiredSubjectId}.`, "working_theory_subject_missing", 404);
    const touchesSubject = operations.some((operation) => text(operation.subjectId ?? operation.id ?? operation.value?.id ?? operation.subject?.id) === requiredSubjectId);
    if (!touchesSubject) fail(`A correction must explicitly revise selected subject ${requiredSubjectId}.`, "working_theory_correction_missing");
  }
  if (requiredRelationshipId) {
    if (!current?.relationships.some((relationship) => relationship.id === requiredRelationshipId)) fail(`No current working-theory relationship ${requiredRelationshipId}.`, "working_theory_relationship_missing", 404);
    const touchesRelationship = operations.some((operation) => text(operation.relationshipId ?? operation.id ?? operation.value?.id ?? operation.relationship?.id) === requiredRelationshipId);
    if (!touchesRelationship) fail(`A correction must explicitly revise selected relationship ${requiredRelationshipId}.`, "working_theory_correction_missing");
  }
  const snapshot = materializeTheorySnapshot({
    previous: current,
    operations: structuredClone(operations),
    suppliedAnchors: Array.isArray(anchors) ? anchors : [],
    suppliedSources: Array.isArray(sources) ? sources : [],
    suppliedConversationRefs: conversationRefs,
    ventureId,
    options,
  });
  const createdAt = now();
  const theory = {
    id: proposalId(),
    ventureId,
    mode: "working-theory",
    supersedes: current?.id ?? null,
    baseRevision,
    intent: text(intent),
    operations: structuredClone(operations),
    ...snapshot,
    proposedBy: { authority, id: text(proposedBy?.id) ?? "unknown" },
    configurationRevision: Number.isInteger(proposedBy?.configurationRevision) ? proposedBy.configurationRevision : null,
    status: "current",
    createdAt,
    decidedAt: null,
    decision: null,
  };
  const proposals = state.proposals.map((entry) => entry.id === current?.id ? { ...entry, status: "superseded", supersededAt: createdAt, supersededBy: theory.id } : entry);
  writeState(ventureId, { current: state.current, revisions: state.revisions, proposals: [...proposals, theory] }, state, options);
  return { theory, revision: state.current.revision };
}

export function listArchitectureProposals(ventureId, { status = null, ...options } = {}) {
  const proposals = getArchitectureState(ventureId, options).proposals;
  return status ? proposals.filter((entry) => entry.status === status) : proposals;
}

export function decideArchitectureProposal({ ventureId, proposalId: id, decision, operations = null, reason = null, actor } = {}, options = {}) {
  if (actor?.authority !== "founder") fail("Only the founder can decide an architecture proposal.", "architecture_authority_denied", 403);
  if (!new Set(["accept", "partial", "reject"]).has(decision)) fail("Proposal decision must be accept, partial, or reject.");
  const state = getArchitectureState(ventureId, options);
  const proposal = state.proposals.find((entry) => entry.id === id);
  if (!proposal) fail(`No such architecture proposal: ${id}`, "architecture_proposal_not_found", 404);
  if (proposal.mode === "working-theory") fail("A working theory is revised or superseded; it cannot be accepted as durable architecture.", "working_theory_not_decidable", 409);
  if (proposal.status !== "pending") fail(`Architecture proposal ${id} was already decided.`, "architecture_proposal_decided", 409);
  const decidedAt = now();
  if (decision === "reject") {
    const current = state.current;
    const decided = { ...proposal, status: "rejected", decision, reason: text(reason), decidedAt, decidedBy: actor };
    const proposals = state.proposals.map((entry) => entry.id === id ? decided : entry);
    const receipt = {
      id: `architecture-proposal-decision-${id}`,
      revision: current.revision,
      baseRevision: state.current.revision,
      actor,
      source: "proposal-rejection",
      proposalId: id,
      reason: text(reason),
      operations: [],
      affectedTargets: [],
      createdAt: decidedAt,
    };
    writeState(ventureId, { current, revisions: state.revisions, proposals }, state, options);
    return { proposal: decided, architecture: current, revision: current.revision, receipt };
  }
  if (proposal.baseRevision !== state.current.revision) {
    fail(
      `Architecture proposal ${id} was based on revision ${proposal.baseRevision}, not ${state.current.revision}.`,
      "architecture_stale_revision",
      409,
      { baseRevision: proposal.baseRevision, currentRevision: state.current.revision },
    );
  }
  const selected = decision === "accept" ? proposal.operations : operations;
  if (!Array.isArray(selected) || !selected.length) fail("A partial acceptance needs selected or revised operations.");
  // Apply through the founder mutation seam first, then stamp the proposal decision onto the new
  // state with a plain set: the architecture CAS already serialized the semantic decision.
  const result = applyArchitectureMutations({
    ventureId,
    baseRevision: state.current.revision,
    operations: selected,
    reason: text(reason) ?? proposal.intent,
    actor,
    source: decision === "accept" ? "proposal-acceptance" : "proposal-partial-acceptance",
    proposalId: id,
  }, options);
  const after = getArchitectureState(ventureId, options);
  const decided = { ...proposal, status: decision === "accept" ? "accepted" : "partially-accepted", decision, reason: text(reason), decidedAt, decidedBy: actor, appliedRevision: result.revision };
  const proposals = after.proposals.map((entry) => entry.id === id ? decided : entry);
  writeArchitectureCompatibilityState(ventureId, after, { current: after.current, revisions: after.revisions, proposals }, options);
  return { ...result, proposal: decided };
}
