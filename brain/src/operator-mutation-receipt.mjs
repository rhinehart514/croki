// A founder action is complete only when the durable record proves the corresponding mutation happened.
// This is a truth boundary over existing events, not a new workflow contract: it never constrains what the
// crew builds, only prevents prose from impersonating a successful write.

const DURABLE_WORK_EVENTS = new Set([
  "model_artifact_recorded",
  "goal_recorded",
  "goal_relation_recorded",
  "work_relationship_recorded",
  "operator_workflow_composed",
  "run_completed",
  "product_change_composed",
  "graph_changes_proposed",
]);

function eventsAfterRequirement(session, requirement) {
  const events = session?.events ?? [];
  const boundary = requirement.afterEventSequence;
  if (Number.isSafeInteger(boundary) && boundary >= 0) {
    return events.filter((event) => {
      const sequence = Number(event?.sequence);
      return Number.isSafeInteger(sequence) && sequence > boundary;
    });
  }

  // Event-id boundaries are stable while the boundary remains retained. If it has already aged out and
  // there is no monotonic sequence, fail closed: the durable record cannot prove a later mutation.
  if (requirement.afterEventId) {
    const index = events.findIndex((event) => event?.id === requirement.afterEventId);
    return index >= 0 ? events.slice(index + 1) : [];
  }

  // Backward compatibility for persisted requirements written before monotonic/event-id boundaries.
  const legacyCount = Number(requirement.afterEventCount);
  return events.slice(Number.isSafeInteger(legacyCount) && legacyCount >= 0 ? legacyCount : 0);
}

export function mutationRequirementSatisfied(session) {
  const requirement = session?.requiredMutation;
  if (!requirement) return true;
  const events = eventsAfterRequirement(session, requirement);
  if (requirement.kind === "pipeline") {
    return Boolean(session.graphId) && events.some((event) => event.type === "operator_workflow_composed" || event.type === "run_completed");
  }
  if (requirement.kind === "run") return events.some((event) => event.type === "run_completed");
  return events.some((event) => DURABLE_WORK_EVENTS.has(event.type));
}

export function unmetMutationMessage(session) {
  const kind = session?.requiredMutation?.kind;
  if (kind === "pipeline") return "I did not create or run the requested pipeline. No pipeline was stored, so there is nothing staged at your wall yet.";
  if (kind === "run") return "I did not run the requested work. No new run receipt exists, so nothing reached your wall.";
  return "I did not save useful work from that request. Nothing new was added to the canvas.";
}
