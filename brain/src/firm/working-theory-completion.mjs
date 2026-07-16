// The model decides what the venture may mean. The host alone decides whether a broad drive actually
// left the three durable facts promised by the signature interaction.

import crypto from "node:crypto";
import { getCurrentWorkingTheory } from "./architecture-proposals.mjs";
import { listVentureDocs } from "./venture-store.mjs";

function fingerprint(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value ?? null)).digest("hex");
}

function stagedWork(ventureId, options) {
  return listVentureDocs(ventureId, "bets", options).flatMap((bet) => (bet.staged ?? []).map((item) => ({
    id: item.id,
    betId: bet.id,
    fingerprint: fingerprint({ title: item.title, content: item.content, updatedAt: item.updatedAt, stagedAt: item.stagedAt }),
  })));
}

export function captureWorkingTheoryBaseline(ventureId, options = {}) {
  const theory = getCurrentWorkingTheory(ventureId, options);
  return {
    theoryId: theory?.id ?? null,
    theoryWorkRefs: [...(theory?.subjects ?? []), ...(theory?.relationships ?? [])].flatMap((entry) => entry.workRefs ?? []),
    work: new Map(stagedWork(ventureId, options).map((item) => [item.id, item.fingerprint])),
  };
}

export function checkWorkingTheoryCompletion({ ventureId, baseline, outcome, target, required }, options = {}) {
  if (!required) return null;
  const theory = getCurrentWorkingTheory(ventureId, options);
  const repositoryRefs = theory?.sources.filter((source) => source.kind === "repository").map((source) => source.ref) ?? [];
  const anchoredRefs = new Set(theory?.anchors.flatMap((anchor) => anchor.sourceRefs) ?? []);
  const groundingRefs = repositoryRefs.filter((ref) => anchoredRefs.has(ref));
  const theoryChanged = Boolean(theory && theory.id !== baseline.theoryId);
  const selectedTheoryId = target?.theorySubjectId ?? target?.theoryRelationshipId ?? null;
  const correctedSelection = theory?.operations.some((operation) => String(operation.subjectId ?? operation.relationshipId ?? operation.id ?? operation.value?.id ?? operation.subject?.id ?? operation.relationship?.id ?? "") === selectedTheoryId);
  const correctionSatisfied = selectedTheoryId
    ? theoryChanged && theory?.supersedes === baseline.theoryId && correctedSelection
    : theoryChanged;
  const currentWork = stagedWork(ventureId, options);
  const changedWork = currentWork.filter((item) => baseline.work.get(item.id) !== item.fingerprint);
  const theoryWorkRefs = new Set([...(theory?.subjects ?? []), ...(theory?.relationships ?? [])].flatMap((entry) => entry.workRefs ?? []));
  const candidates = selectedTheoryId
    ? currentWork.filter((item) => baseline.theoryWorkRefs.includes(item.id))
    : changedWork;
  const inspectableWorkRefs = candidates.filter((item) => theoryWorkRefs.has(item.id)).map((item) => item.id);
  const facts = {
    grounding: { satisfied: groundingRefs.length > 0, sourceRefs: groundingRefs },
    theory: { satisfied: correctionSatisfied, theoryId: theory?.id ?? null },
    usefulWork: { satisfied: inspectableWorkRefs.length > 0, workRefs: inspectableWorkRefs },
  };
  const missing = [
    facts.grounding.satisfied ? null : "No captured repository source grounds the current read.",
    facts.theory.satisfied ? null : (selectedTheoryId ? "The selected claim was not superseded." : "No new current read was recorded."),
    facts.usefulWork.satisfied ? null : "No new inspectable work is anchored to the current read.",
  ].filter(Boolean);
  const stopped = outcome?.kind === "cancelled" || outcome?.kind === "error";
  return { state: stopped ? "stopped" : (missing.length ? "partial" : "complete"), ...facts, missing };
}
