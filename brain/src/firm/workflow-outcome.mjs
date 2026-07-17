export const WORKFLOW_OUTCOME_KINDS = Object.freeze([
  "completed",
  "paused",
  "budget-exhausted",
  "cancelled",
  "failed",
]);

const ALIASES = new Map([
  ["completed", "completed"], ["complete", "completed"], ["success", "completed"], ["succeeded", "completed"], ["done", "completed"],
  ["paused", "paused"], ["waiting", "paused"], ["needs-founder", "paused"], ["needs_input", "paused"],
  ["budget-exhausted", "budget-exhausted"], ["budget_exhausted", "budget-exhausted"], ["budget", "budget-exhausted"], ["max-budget", "budget-exhausted"], ["max_budget_usd", "budget-exhausted"],
  ["cancelled", "cancelled"], ["canceled", "cancelled"], ["stopped", "cancelled"], ["aborted", "cancelled"],
  ["failed", "failed"], ["failure", "failed"], ["error", "failed"],
]);

function text(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function fail(message, code = "workflow_outcome_invalid") {
  throw Object.assign(new Error(message), { code, status: 400 });
}

export function normalizeWorkflowOutcome(value, { at = new Date().toISOString() } = {}) {
  const supplied = typeof value === "string" ? { kind: value } : (value ?? {});
  const raw = text(supplied.kind ?? supplied.status ?? supplied.stopReason)?.toLowerCase();
  const kind = ALIASES.get(raw);
  if (!kind) fail(`Unsupported workflow outcome: ${raw ?? "missing"}.`);
  return Object.freeze({
    kind,
    summary: text(supplied.summary ?? supplied.message ?? supplied.reason),
    terminalReason: text(supplied.terminalReason ?? supplied.stopReason ?? supplied.reason),
    providerKind: raw,
    at: text(supplied.at) ?? at,
  });
}

export function isWorkflowOutcome(value) {
  return WORKFLOW_OUTCOME_KINDS.includes(value?.kind);
}
