import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { reviseAgentPolicyFromFeedback } from "./agent-policy-store.mjs";
import { appendGateJudgments } from "./shared-judgments.mjs";

const SCHEMA_VERSION = 1;

function now() {
  return new Date().toISOString();
}

function root(options = {}) {
  return options.root || process.env.GTM_IDE_HOME || path.join(os.homedir(), ".gtm-ide");
}

function safeId(value) {
  return String(value || "default").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-|-$/g, "").slice(0, 90) || "default";
}

function fileFor(projectId, options = {}) {
  return path.join(root(options), "feedback-ledger", `${safeId(projectId)}.json`);
}

function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

function emptyLedger(projectId) {
  return { schemaVersion: SCHEMA_VERSION, projectId, signals: [] };
}

export function loadFeedbackLedger(projectId = "default", options = {}) {
  const file = fileFor(projectId, options);
  if (!fs.existsSync(file)) return emptyLedger(projectId);
  const stored = JSON.parse(fs.readFileSync(file, "utf8"));
  if (stored?.schemaVersion === SCHEMA_VERSION && Array.isArray(stored.signals)) return stored;
  return {
    ...emptyLedger(projectId),
    ...stored,
    schemaVersion: SCHEMA_VERSION,
    signals: Array.isArray(stored?.signals) ? stored.signals : [],
  };
}

export function saveFeedbackLedger(ledger, options = {}) {
  const durable = {
    ...ledger,
    schemaVersion: SCHEMA_VERSION,
    signals: Array.isArray(ledger.signals) ? ledger.signals : [],
  };
  write(fileFor(durable.projectId, options), durable);
  return durable;
}

function signal(input) {
  return {
    id: `signal-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
    observedAt: now(),
    ...input,
  };
}

function policyIdsForGraph(graph) {
  return [...new Set((graph?.nodes ?? [])
    .filter((node) => node.kind === "agent" && node.config?.creationPolicyId)
    .map((node) => node.config.creationPolicyId))];
}

export function normalizeRunFeedback({ projectId = "default", graph, result } = {}) {
  const policyIds = policyIdsForGraph(graph);
  const signals = [];
  const nodes = result?.nodes ?? {};
  for (const [nodeId, nodeResult] of Object.entries(nodes)) {
    if (nodeResult?.category === "gate") {
      for (const item of nodeResult.items ?? []) {
        if (item.approvalStatus === "approved") {
          signals.push(signal({
            projectId,
            graphId: graph?.id ?? result?.graphId ?? null,
            runId: result?.runId ?? null,
            nodeId,
            type: item.editedFrom ? "FounderEdit" : "FounderApproval",
            summary: item.editedFrom
              ? `Changed "${String(item.editedFrom).slice(0, 120)}" to "${String(item.draft || "").slice(0, 120)}"`
              : String(item.draft || item.name || "Approved gated item").slice(0, 160),
            itemId: item.id ?? null,
            policyIds,
          }));
        } else if (item.approvalStatus === "rejected") {
          signals.push(signal({
            projectId,
            graphId: graph?.id ?? result?.graphId ?? null,
            runId: result?.runId ?? null,
            nodeId,
            type: "FounderRejection",
            summary: String(item.draft || item.name || "Rejected gated item").slice(0, 160),
            itemId: item.id ?? null,
            policyIds,
          }));
        }
      }
    }
    // Only a GENUINE step failure is a learning signal. A node that is `blocked` (waiting on a gate
    // pause or a failed upstream) or `blind` (honest measurement gap) is not the agent's fault, so
    // banking it as RunFailure floods the policy with noise and spawns junk agent revisions. The
    // earlier flood of identical "Waiting for at least 1 input item" loops came from exactly this.
    if (nodeResult?.ok === false && nodeResult.error && !nodeResult.blocked && !nodeResult.blind) {
      signals.push(signal({
        projectId,
        graphId: graph?.id ?? result?.graphId ?? null,
        runId: result?.runId ?? null,
        nodeId,
        type: "RunFailure",
        summary: String(nodeResult.error).slice(0, 200),
        policyIds,
      }));
    }
  }
  return signals;
}

export function recordFeedbackSignals(signals = [], options = {}) {
  const projectId = options.projectId || signals.find((item) => item.projectId)?.projectId || "default";
  if (!signals.length) return loadFeedbackLedger(projectId, options);
  const ledger = loadFeedbackLedger(projectId, options);
  return saveFeedbackLedger({
    ...ledger,
    signals: [...ledger.signals, ...signals].slice(-1000),
  }, options);
}

export function recordFeedbackSignalsFromRun({ projectId = "default", graph, result } = {}, options = {}) {
  // Also bank the founder's gate decisions in the shared taste ledger both rigs read (HARNESS.md
  // invariant 4). Never let taste capture break the run.
  try {
    appendGateJudgments({ projectId, graph, result }, options);
  } catch {
    // capture is best-effort; a write failure must not interrupt feedback recording
  }
  const signals = normalizeRunFeedback({ projectId, graph, result });
  const ledger = recordFeedbackSignals(signals, { ...options, projectId });
  const byPolicy = new Map();
  for (const item of signals) {
    for (const policyId of item.policyIds ?? []) {
      if (!byPolicy.has(policyId)) byPolicy.set(policyId, []);
      byPolicy.get(policyId).push(item);
    }
  }
  const updatedPolicies = [];
  for (const [policyId, policySignals] of byPolicy.entries()) {
    updatedPolicies.push(reviseAgentPolicyFromFeedback(policyId, policySignals, { ...options, projectId }));
  }
  return { ledger, signals, updatedPolicies };
}
