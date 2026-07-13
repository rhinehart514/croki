// Reconcile a direct canvas run back into the resident conversation that owns the same pipeline.
// The flow ledger is authoritative for what actually ran; the operator transcript is the founder-facing
// account of it. A direct retry must therefore append a correction receipt instead of leaving an older
// failure conclusion as the apparent latest truth. This never starts work or crosses the wall.

import {
  appendOperatorEvent,
  getOperatorSession,
  listOperatorSessions,
  saveOperatorSession,
} from "./operator-store.mjs";

const RECONCILABLE_STATUSES = new Set([
  "ready",
  "failed",
  "interrupted",
  "blocked",
  "waiting_for_input",
  "waiting_for_gate",
]);

export function reconcileDirectRunWithOperator({ projectId, graphId, result }, options = {}) {
  if (!projectId || !graphId || !result?.runId) return null;
  const summary = listOperatorSessions({ ...options, projectId })
    .find((candidate) => candidate.graphId === graphId && RECONCILABLE_STATUSES.has(candidate.status));
  if (!summary) return null;

  const session = getOperatorSession(summary.id, options);
  if (session.lastRunId === result.runId) return session;
  const pendingGates = Array.isArray(result.pendingGates) ? result.pendingGates : [];
  const stagedItems = pendingGates.reduce((count, nodeId) => {
    const items = result.nodes?.[nodeId]?.items;
    return count + (Array.isArray(items) ? items.length : 0);
  }, 0);
  const corrected = appendOperatorEvent({
    ...session,
    lastRunId: result.runId,
    status: pendingGates.length ? "waiting_for_gate" : result.ok === false ? "failed" : "ready",
    error: result.ok === false ? (result.error ?? "The newer run stopped before completion.") : null,
    pendingGate: pendingGates.length
      ? { graphId, runId: result.runId, nodeIds: pendingGates, runResult: result }
      : null,
    // A direct run supersedes the session's prior lifecycle conclusion in one durable write. No stale
    // completion timestamp or unrelated pause payload may contradict the reconciled status.
    completedAt: null,
    summary: null,
    pendingQuestion: null,
    pendingProposal: null,
    pendingIdeas: null,
    pendingCandidates: null,
  }, {
    type: "direct_run_reconciled",
    title: pendingGates.length
      ? `Newer run reached your gate · ${stagedItems || pendingGates.length} item${(stagedItems || pendingGates.length) === 1 ? "" : "s"}`
      : result.ok === false ? "Newer run still needs repair" : "Newer run completed successfully",
    detail: pendingGates.length
      ? "This newer result supersedes the earlier run conclusion; nothing has been released."
      : result.ok === false ? (result.error ?? "The newer run stopped before completion.") : "This newer result supersedes the earlier run conclusion.",
    data: { runId: result.runId, graphId, pendingGates, stagedItems },
  });
  return saveOperatorSession(corrected, options);
}
