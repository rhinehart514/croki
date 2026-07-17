import crypto from "node:crypto";
import { normalizeWorkflowOutcome } from "./workflow-outcome.mjs";

function text(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function fail(message, code = "workflow_execution_receipt_invalid") {
  throw Object.assign(new Error(message), { code, status: 400 });
}

function immutable(value) {
  if (Array.isArray(value)) value.forEach(immutable);
  else if (value && typeof value === "object") Object.values(value).forEach(immutable);
  return Object.freeze(value);
}

export function createWorkflowExecutionReceipt({
  id = null,
  ventureId,
  runId,
  betRef,
  workflowContractRef = null,
  outcome,
  eventRefs = [],
  workRefs = [],
  decisionRefs = [],
  outcomeRefs = [],
  runtime = null,
  modelRevision = null,
  createdAt = new Date().toISOString(),
} = {}) {
  const normalized = normalizeWorkflowOutcome(outcome, { at: createdAt });
  if (!text(ventureId) || !text(runId) || !String(betRef ?? "").startsWith("bet:")) {
    fail("A workflow execution receipt needs venture, run, and authoritative bet refs.");
  }
  const receiptId = text(id) ?? `workflow-receipt-${crypto.createHash("sha256").update(`${ventureId}\0${runId}\0${normalized.at}`).digest("hex").slice(0, 20)}`;
  return immutable({
    id: receiptId,
    ventureId: text(ventureId),
    runRef: `run:${text(runId)}`,
    betRef: text(betRef),
    workflowContractRef: text(workflowContractRef),
    terminal: normalized,
    eventRefs: [...new Set(eventRefs)],
    workRefs: [...new Set(workRefs)],
    decisionRefs: [...new Set(decisionRefs)],
    outcomeRefs: [...new Set(outcomeRefs)],
    runtime: runtime ? structuredClone(runtime) : null,
    modelRevision: Number.isInteger(modelRevision) && modelRevision >= 0 ? modelRevision : null,
    createdAt,
  });
}

export function projectExecutionTrail(run, receipt = null) {
  if (!run?.id) fail("Execution trail projection needs a run.");
  if (!receipt) return { state: "unknown", terminal: null, reason: "No durable settlement receipt was captured." };
  if (receipt.runRef !== `run:${run.id}`) fail("Execution receipt belongs to another run.", "workflow_execution_receipt_cross_scope");
  return { state: receipt.terminal.kind, terminal: receipt.terminal, reason: receipt.terminal.summary ?? receipt.terminal.terminalReason };
}
