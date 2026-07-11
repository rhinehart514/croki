// Pure, advisory detection of active goals which touch the same durable object.
// Similar goal language is deliberately ignored: only stored references and relationships count.

const ACTIVE_GOAL_STATUSES = new Set(["active", "needs-founder", "waiting"]);

function clean(value) { return String(value ?? "").trim(); }
function stableRef(value, fallbackType = null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const type = clean(value.type ?? value.kind ?? fallbackType).toLowerCase();
  const id = clean(value.id ?? value.ref ?? value.key);
  return type && id ? { type, id } : null;
}
function refKey(ref) { return ref?.type && ref?.id ? `${ref.type}:${ref.id}` : null; }
function receipt(source, recordId, link, objectRef) { return { source, recordId, link, objectRef }; }

function addTouch(touches, goalId, objectRef, evidence) {
  if (!objectRef || objectRef.type === "goal" || !goalId) return;
  const key = refKey(objectRef);
  if (!key) return;
  const byGoal = touches.get(key) ?? new Map();
  const entry = byGoal.get(goalId) ?? { goalId, objectRef, basis: [] };
  const signature = JSON.stringify(evidence);
  if (!entry.basis.some((item) => JSON.stringify(item) === signature)) entry.basis.push(evidence);
  byGoal.set(goalId, entry);
  touches.set(key, byGoal);
}

function otherEndpoint(relation, goalId) {
  const source = stableRef(relation?.sourceRef);
  const target = stableRef(relation?.targetRef);
  if (source?.type === "goal" && source.id === goalId) return target;
  if (target?.type === "goal" && target.id === goalId) return source;
  return null;
}

/** Return deterministic, non-blocking receipts for active goals sharing durable objects. */
export function detectGoalConflicts(input = {}) {
  const goals = (Array.isArray(input.goals) ? input.goals : [])
    .filter((goal) => !goal?.retiredAt && ACTIVE_GOAL_STATUSES.has(clean(goal?.status) || "active"))
    .sort((a, b) => clean(a?.id).localeCompare(clean(b?.id)));
  const goalsById = new Map(goals.map((goal) => [clean(goal.id), goal]));
  const touches = new Map();

  for (const goal of goals) {
    const goalId = clean(goal.id);
    for (const raw of goal.scopeRefs ?? []) {
      const objectRef = stableRef(raw);
      addTouch(touches, goalId, objectRef, receipt("goal-store", goalId, "scope", objectRef));
    }
    for (const raw of goal.currentWorkRefs ?? []) {
      const objectRef = stableRef(raw);
      addTouch(touches, goalId, objectRef, receipt("goal-store", goalId, "current-work", objectRef));
    }
  }

  for (const relation of Array.isArray(input.workRelationships) ? input.workRelationships : []) {
    if (relation?.retiredAt) continue;
    for (const goalId of goalsById.keys()) {
      const objectRef = otherEndpoint(relation, goalId);
      if (!objectRef) continue;
      addTouch(touches, goalId, objectRef, receipt(
        "work-artifact-store", clean(relation.relationshipId ?? relation.id),
        clean(relation.kind) || "related", objectRef,
      ));
    }
  }

  for (const artifact of Array.isArray(input.artifacts) ? input.artifacts : []) {
    if (artifact?.retiredAt) continue;
    const objectRef = stableRef({ type: "work-artifact", id: artifact.artifactId ?? artifact.id });
    for (const raw of [...(artifact.refs ?? []), ...(artifact.parentRefs ?? [])]) {
      const goalRef = stableRef(raw);
      if (goalRef?.type !== "goal" || !goalsById.has(goalRef.id)) continue;
      addTouch(touches, goalRef.id, objectRef, receipt(
        "work-artifact-store", clean(artifact.artifactId ?? artifact.id), "artifact-reference", objectRef,
      ));
    }
  }

  return [...touches.entries()]
    .filter(([, byGoal]) => byGoal.size > 1)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, byGoal]) => {
      const entries = [...byGoal.values()].sort((a, b) => a.goalId.localeCompare(b.goalId));
      const objectRef = entries[0].objectRef;
      const goalRefs = entries.map((entry) => ({ type: "goal", id: entry.goalId }));
      const labels = entries.map((entry) => clean(goalsById.get(entry.goalId)?.statement) || entry.goalId);
      return {
        id: `goal-conflict:${encodeURIComponent(objectRef.type)}:${encodeURIComponent(objectRef.id)}`,
        kind: "shared-object", objectRef, goalRefs, goalCount: goalRefs.length,
        status: "needs-founder", blocking: false,
        summary: `${goalRefs.length} active goals share ${objectRef.type} ${objectRef.id}`,
        detail: `${labels.join("; ")} all touch this object. Shared context is not proof that their changes are incompatible.`,
        provenance: "derived",
        basis: entries.flatMap((entry) => entry.basis.map((basis) => ({ goalRef: { type: "goal", id: entry.goalId }, ...basis }))),
      };
    });
}

export default detectGoalConflicts;
