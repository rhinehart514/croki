// Bounded semantic context for conversation and teammate drives. It exposes what the selected Atlas
// target means, what live work it touches, and what was deliberately omitted—never tools or authority.

import { buildArchitectureProjection } from "./architecture-projection.mjs";

function list(value) {
  return Array.isArray(value) ? value : [];
}

function refMentions(ref, id) {
  return String(ref ?? "").replace(/^architecture:/, "").split("#")[0] === id;
}

function parentTrace(element, elements) {
  if (element.role === "campaign") {
    return elements.filter((entry) => list(element.motionIds).includes(entry.id) || entry.id === element.primaryMotionId);
  }
  if (element.role === "motion") {
    return elements.filter((entry) => list(element.systemIds).includes(entry.id) || list(element.productRefs).some((ref) => ref.split("#")[0] === entry.id));
  }
  if (element.role === "system") return elements.filter((entry) => entry.role === "motion" && list(entry.systemIds).includes(element.id));
  return [];
}

export function buildArchitectureContext(ventureId, target = null, options = {}) {
  const projection = buildArchitectureProjection(ventureId, options);
  const targetId = String(target?.id ?? target?.architectureId ?? "").trim() || null;
  const selected = targetId ? projection.elements.find((entry) => entry.id === targetId) : null;
  if (targetId && !selected) {
    const error = new Error(`No architecture target ${targetId} belongs to this venture.`);
    error.code = "architecture_missing_ref";
    error.status = 404;
    throw error;
  }
  const requestedRevision = Number.isInteger(target?.revision) ? target.revision : projection.revision;
  const groups = selected ? projection.groups.filter((group) => list(group.memberRefs).some((ref) => refMentions(ref, selected.id))) : [];
  const connections = selected ? projection.connections.filter((entry) => refMentions(entry.fromRef, selected.id) || refMentions(entry.toRef, selected.id)) : [];
  const related = selected ? parentTrace(selected, projection.elements) : [];
  const selectedIds = new Set([selected?.id, ...related.map((entry) => entry.id)].filter(Boolean));
  const evidenceAnnotations = projection.evidenceAnnotations.filter((entry) => selectedIds.has(String(entry.subjectRef).replace(/^architecture:/, "").split("#")[0]));
  const campaignIds = new Set([
    ...(selected?.role === "campaign" ? [selected.id] : []),
    ...(selected?.role === "motion" ? projection.elements.filter((entry) => entry.role === "campaign" && list(entry.motionIds).includes(selected.id)).map((entry) => entry.id) : []),
  ]);
  const joins = {
    bets: projection.joins.bets.filter((entry) => campaignIds.has(entry.campaignId)),
    work: projection.joins.work.filter((entry) => campaignIds.has(entry.campaignId)),
    wall: projection.joins.wall.filter((entry) => campaignIds.has(entry.campaignId)),
    outcomes: projection.joins.outcomes.filter((entry) => entry.campaignIds.some((id) => campaignIds.has(id))),
  };
  const context = {
    ventureId,
    architectureRevision: projection.revision,
    requestedRevision,
    stale: requestedRevision !== projection.revision,
    intent: projection.document.intent,
    selected: selected ? { ...selected, live: undefined } : null,
    stepId: target?.stepId ?? target?.architectureStepId ?? null,
    containingGroups: groups,
    relatedElements: related.map(({ live: _live, ...entry }) => entry),
    openConnections: connections,
    evidenceAnnotations,
    pressure: selected ? projection.pressure.filter((entry) => entry.subjectId === selected.id) : projection.pressure,
    live: joins,
    descriptiveOnly: !selected || selected.role === "concept",
    omissions: {
      elements: Math.max(0, projection.elements.length - selectedIds.size),
      machinery: true,
      placement: true,
      history: true,
    },
  };
  return context;
}

export function architectureContextPrompt(context) {
  if (!context?.selected) return "";
  const selected = context.selected;
  const lines = [
    `Selected venture architecture (${selected.role}): ${selected.name}.`,
    selected.statement ? `Meaning: ${selected.statement}` : null,
    `Architecture revision: ${context.architectureRevision}${context.stale ? ` (selection was made at revision ${context.requestedRevision}; treat the prior context as stale)` : ""}.`,
    context.descriptiveOnly
      ? "This is descriptive founder context only. It does not independently authorize, prioritize, or attribute execution."
      : "Use this operational context to bound proposals and prioritize relevant work; it grants no tool or outward authority.",
    context.relatedElements.length
      ? `Relevant trace: ${context.relatedElements.map((entry) => `${entry.role} ${entry.name}`).join("; ")}.`
      : null,
    context.evidenceAnnotations.length
      ? `Founder-applied evidence: ${context.evidenceAnnotations.map((entry) => `${entry.stance} via ${entry.evidenceRef}: ${entry.note}`).join("; ")}.`
      : "No founder-applied architecture evidence is in this bounded slice.",
    context.pressure.length
      ? `Current pressure: ${context.pressure.map((entry) => `${entry.reason} — ${entry.detail}`).join("; ")}.`
      : null,
    `Omitted from this bounded slice: ${context.omissions.elements} other architecture elements, placement, history, and runtime machinery.`,
  ];
  return lines.filter(Boolean).join("\n");
}

export function buildWorkingTheoryContext(ventureId, target = null, options = {}) {
  const projection = buildArchitectureProjection(ventureId, options);
  const theory = projection.workingTheory;
  const requestedTheoryId = String(target?.theoryId ?? "").trim() || null;
  const subjectId = String(target?.subjectId ?? target?.theorySubjectId ?? "").trim() || null;
  const relationshipId = String(target?.relationshipId ?? target?.theoryRelationshipId ?? "").trim() || null;
  if (subjectId && relationshipId) {
    const error = new Error("Working-theory context needs one selected subject or relationship, not both.");
    error.code = "working_theory_target_invalid";
    error.status = 400;
    throw error;
  }
  if (!theory || (requestedTheoryId && requestedTheoryId !== theory.id)) {
    const error = new Error(requestedTheoryId ? `Working theory ${requestedTheoryId} is no longer current.` : "This venture has no current working theory.");
    error.code = "working_theory_stale";
    error.status = 409;
    throw error;
  }
  const selectionKind = relationshipId ? "relationship" : "subject";
  const selected = relationshipId
    ? theory.relationships.find((relationship) => relationship.id === relationshipId)
    : theory.subjects.find((subject) => subject.id === subjectId);
  if (!selected) {
    const selectedId = relationshipId ?? subjectId;
    const error = new Error(`No current working-theory ${selectionKind} ${selectedId} belongs to this venture.`);
    error.code = selectionKind === "relationship" ? "working_theory_relationship_missing" : "working_theory_subject_missing";
    error.status = 404;
    throw error;
  }
  const selectedRef = selectionKind === "relationship" ? `theory-relationship:${selected.id}` : `theory:${selected.id}`;
  return {
    ventureId,
    theoryId: theory.id,
    supersedes: theory.supersedes,
    baseRevision: theory.baseRevision,
    intent: theory.intent,
    selectionKind,
    selected,
    relationships: selectionKind === "relationship"
      ? [selected]
      : theory.relationships.filter((relationship) => relationship.fromRef === `theory:${subjectId}` || relationship.toRef === `theory:${subjectId}`),
    anchors: theory.anchors.filter((anchor) => anchor.subjectRef === selectedRef),
    sources: theory.sources.filter((source) => selected.sourceRefs.includes(source.ref)),
    live: {
      work: theory.joins.work.filter((item) => selected.workRefs.includes(item.id)),
      wall: theory.joins.wall.filter((item) => selected.workRefs.includes(item.workRef)),
      outcomes: theory.joins.outcomes.filter((item) => selected.workRefs.includes(item.workRef)),
    },
    provisional: true,
    grantsAuthority: false,
  };
}

export function workingTheoryContextPrompt(context) {
  if (!context?.selected) return "";
  const relationship = context.selectionKind === "relationship";
  return [
    relationship
      ? `Selected provisional theory relationship: ${context.selected.fromRef} ${context.selected.label} ${context.selected.toRef}.`
      : `Selected provisional theory subject: ${context.selected.name}.`,
    relationship ? `Current relationship id: ${context.selected.id}.` : `Current statement: ${context.selected.statement}`,
    `Working theory: ${context.theoryId}; durable architecture revision: ${context.baseRevision}.`,
    context.sources.length ? `Repository basis: ${context.sources.map((source) => `${source.path}:L${source.startLine}-L${source.endLine}`).join("; ")}.` : "No repository source is attached to this selected claim.",
    `Interpret the founder's ordinary-language correction by recording a superseding working theory. Explicitly update or remove ${relationship ? "relationship" : "subject"} ${context.selected.id}; preserve every unchanged subject id.`,
    "This is provisional context only. It grants no durable architecture, tool, spending, or outward authority.",
  ].join("\n");
}
