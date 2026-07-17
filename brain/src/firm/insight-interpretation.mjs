import { createEvidenceRef, formatEvidenceRef, parseEvidenceRef } from "./evidence-ref.mjs";

function text(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function fail(message, code = "insight_interpretation_invalid", status = 400) {
  throw Object.assign(new Error(message), { code, status });
}

function refs(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(text).filter(Boolean))];
}

export function createInsightInterpretation({
  id,
  ventureId,
  statement,
  subjectRefs = [],
  evidenceRefs = [],
  stance = "interprets",
  assertion = "tentative",
  proposedBy,
  supersedes = [],
  status = "current",
  createdAt = new Date().toISOString(),
} = {}) {
  const actor = { authority: text(proposedBy?.authority) ?? "agent", id: text(proposedBy?.id) ?? "unknown" };
  // Evidence is validated, immutable, and scoped to this venture — the interpretation's venture always
  // wins, so an evidence entry can never smuggle in a foreign ventureId.
  const evidence = (Array.isArray(evidenceRefs) ? evidenceRefs : []).map((entry) => {
    if (typeof entry === "string") return parseEvidenceRef(entry, { ventureId });
    const supplied = entry && typeof entry === "object" ? entry : {};
    if (supplied.ventureId && text(supplied.ventureId) !== text(ventureId)) {
      fail("Evidence for an interpretation must belong to the same venture.", "insight_interpretation_cross_scope", 404);
    }
    return createEvidenceRef({ ...supplied, ventureId });
  });
  const sources = evidence.map((ref) => formatEvidenceRef(ref));
  if (!text(id) || !text(ventureId) || !text(statement) || !refs(subjectRefs).length || !sources.length) {
    fail("An insight interpretation needs identity, subjects, and source evidence.");
  }
  if (actor.authority !== "founder" && assertion !== "tentative") {
    fail("Non-founder interpretation remains tentative.", "insight_interpretation_authority", 403);
  }
  return Object.freeze({
    id: text(id),
    statement: text(statement),
    subjectRefs: refs(subjectRefs),
    stance: text(stance) ?? "interprets",
    type: "interpretation",
    assertion,
    sourceRefs: sources,
    supersedes: refs(supersedes),
    status: text(status) ?? "current",
    proposedBy: actor,
    appliedBy: actor.authority === "founder" ? actor : null,
    properties: { evidenceRefs: evidence },
    createdAt,
    updatedAt: createdAt,
  });
}

export function supersedeInsightInterpretation(previous, input) {
  if (!previous?.id) fail("Superseding an interpretation needs its prior identity.");
  const next = createInsightInterpretation({ ...input, supersedes: [...(input?.supersedes ?? []), `insight:${previous.id}`] });
  return {
    previous: Object.freeze({ ...previous, status: "superseded", supersededBy: next.id, updatedAt: next.createdAt }),
    next,
  };
}
