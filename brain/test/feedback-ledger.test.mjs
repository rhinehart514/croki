import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  correctFounderDecision,
  loadFeedbackLedger,
  loadFounderDecisions,
  normalizeRunDecisionReceipts,
  normalizeRunFeedback,
  recordFeedbackSignals,
  recordFeedbackSignalsFromRun,
  recordFounderDecision,
  saveFeedbackLedger,
} from "../src/feedback-ledger.mjs";
import { appendGateJudgments } from "../src/shared-judgments.mjs";

function sandbox() {
  return { root: fs.mkdtempSync(path.join(os.tmpdir(), "gtm-feedback-receipts-")) };
}

describe("normalizeRunFeedback — only genuine failures bank RunFailure", () => {
  const graph = { id: "g", nodes: [], edges: [] };

  it("does not bank a RunFailure for a node blocked by a gate pause", () => {
    const result = {
      runId: "r1", graphId: "g",
      nodes: {
        downstream: { nodeId: "downstream", ok: false, blocked: true, error: 'Waiting for approval at "Review".' },
      },
    };
    const signals = normalizeRunFeedback({ graph, result });
    assert.equal(signals.filter((s) => s.type === "RunFailure").length, 0);
  });

  it("does not bank a RunFailure for a blind measurement node", () => {
    const result = {
      runId: "r2", graphId: "g",
      nodes: {
        measure: { nodeId: "measure", ok: false, blind: true, error: "Measurement is blind without source." },
      },
    };
    const signals = normalizeRunFeedback({ graph, result });
    assert.equal(signals.filter((s) => s.type === "RunFailure").length, 0);
  });

  it("still banks a RunFailure for a genuine step error", () => {
    const result = {
      runId: "r3", graphId: "g",
      nodes: {
        agent: { nodeId: "agent", ok: false, error: "The model step threw." },
      },
    };
    const signals = normalizeRunFeedback({ graph, result });
    const failures = signals.filter((s) => s.type === "RunFailure");
    assert.equal(failures.length, 1);
    assert.equal(failures[0].summary, "The model step threw.");
  });

  it("banks FounderApproval for an approved gated item", () => {
    const result = {
      runId: "r4", graphId: "g",
      nodes: {
        gate: { nodeId: "gate", category: "gate", items: [{ approvalStatus: "approved", draft: "Hi there", name: "Acme" }] },
      },
    };
    const signals = normalizeRunFeedback({ graph, result });
    assert.equal(signals.filter((s) => s.type === "FounderApproval").length, 1);
  });
});

describe("feedback-ledger — append-only founder decision receipts", () => {
  it("banks gate calls under deterministic source ids with exact context and nullable question fields", () => {
    const options = sandbox();
    try {
      const result = {
        runId: "run-1",
        questionId: "question-1",
        productRefs: [{ type: "product-element", id: "activation" }],
        evidenceRefs: [{ type: "product-truth", id: "truth-1" }],
        nodes: { review: { category: "gate", items: [
          { id: "a", agentRef: "maya", draft: "Warm note", approvalStatus: "approved" },
          { id: "b", agentRef: "noah", draft: "Stiff note", approvalStatus: "rejected" },
          { id: "c", agentRef: "maya", draft: "Founder rewrite", editedFrom: "Model draft", approvalStatus: "approved" },
        ] } },
      };
      const normalized = normalizeRunDecisionReceipts({ projectId: "alpha", graph: { id: "graph-1" }, result });
      assert.deepEqual(normalized.map((item) => item.kind), ["gate.approved", "gate.rejected", "gate.edited"]);
      assert.deepEqual(normalized[2].value, { from: "Model draft", to: "Founder rewrite" });

      const first = recordFeedbackSignalsFromRun({ projectId: "alpha", graph: { id: "graph-1" }, result }, options);
      assert.equal(first.signals.length, 3, "the existing observational signal path remains intact");
      const receipts = loadFounderDecisions("alpha", options);
      assert.equal(receipts.length, 3);
      assert.equal(receipts[0].questionId, "question-1");
      assert.deepEqual(receipts[0].participantRefs, [{ type: null, id: "maya" }]);
      assert.deepEqual(receipts[0].evidenceRefs, [{ type: "product-truth", id: "truth-1" }]);
      assert.deepEqual(receipts[0].productRefs, [{ type: "product-element", id: "activation" }]);
      assert.ok(receipts[0].contextRefs.some((ref) => ref.type === "run" && ref.id === "run-1"));

      recordFeedbackSignalsFromRun({ projectId: "alpha", graph: { id: "graph-1" }, result }, options);
      assert.equal(loadFounderDecisions("alpha", options).length, 3, "source replay is idempotent");
    } finally {
      fs.rmSync(options.root, { recursive: true, force: true });
    }
  });

  it("appends corrections without rewriting their superseded receipts", () => {
    const options = sandbox();
    try {
      const first = recordFounderDecision({
        projectId: "alpha", kind: "branch.selected", value: "Speed-first",
        sourceRef: { type: "branch-choice", id: "choice-1" },
      }, options);
      const retry = recordFounderDecision({
        projectId: "alpha", kind: "branch.selected", value: "Speed-first",
        sourceRef: { type: "branch-choice", id: "choice-1" },
      }, options);
      assert.equal(retry.appended, false);
      assert.equal(retry.receipt.id, first.receipt.id);

      correctFounderDecision("alpha", first.receipt.id, {
        kind: "branch.selected", value: "Control-first",
        sourceRef: { type: "branch-correction", id: "choice-1-correction-1" },
      }, options);
      const receipts = loadFounderDecisions("alpha", options);
      assert.deepEqual(receipts.map((item) => item.value), ["Speed-first", "Control-first"]);
      assert.equal(receipts[1].supersedesId, receipts[0].id);
      assert.equal(receipts[0].questionId, null);
      assert.deepEqual(receipts[0].participantRefs, []);
      assert.deepEqual(receipts[0].evidenceRefs, []);
      assert.deepEqual(receipts[0].productRefs, []);
      assert.throws(() => recordFounderDecision({
        projectId: "alpha", kind: "branch.selected", value: "Silent rewrite",
        sourceRef: { type: "branch-choice", id: "choice-1" },
      }, options), /append a correction/);
    } finally {
      fs.rmSync(options.root, { recursive: true, force: true });
    }
  });

  it("never caps the decision partition when the observational signal window rolls", () => {
    const options = sandbox();
    try {
      const decisions = Array.from({ length: 1005 }, (_, index) => ({
        id: `decision-${index}`, projectId: "alpha", kind: "test.call", value: index,
        questionId: null, contextRefs: [], participantRefs: [], evidenceRefs: [], productRefs: [],
        createdAt: new Date(index).toISOString(),
      }));
      saveFeedbackLedger({ schemaVersion: 1, projectId: "alpha", signals: [], decisions }, options);
      recordFeedbackSignals(Array.from({ length: 1005 }, (_, index) => ({
        id: `signal-${index}`, projectId: "alpha", type: "Observation", summary: String(index),
      })), { ...options, projectId: "alpha" });
      const ledger = loadFeedbackLedger("alpha", options);
      assert.equal(ledger.signals.length, 1000);
      assert.equal(ledger.decisions.length, 1005);
    } finally {
      fs.rmSync(options.root, { recursive: true, force: true });
    }
  });

  it("projects legacy feedback/shared calls additively, idempotently, and project-scoped", () => {
    const options = sandbox();
    try {
      saveFeedbackLedger({ schemaVersion: 1, projectId: "alpha", signals: [{
        id: "legacy-signal", projectId: "alpha", graphId: "old-graph", runId: "old-run",
        type: "FounderApproval", summary: "Legacy wording", observedAt: "2026-01-01T00:00:00.000Z",
      }] }, options);
      appendGateJudgments({ projectId: "alpha", graph: { id: "shared-graph" }, result: {
        runId: "shared-run", nodes: { review: { category: "gate", items: [
          { id: "shared-item", draft: "Shared wording", approvalStatus: "approved" },
        ] } },
      } }, options);
      appendGateJudgments({ projectId: "beta", graph: { id: "beta-graph" }, result: {
        runId: "beta-run", nodes: { review: { category: "gate", items: [
          { id: "beta-item", draft: "Beta wording", approvalStatus: "approved" },
        ] } },
      } }, options);

      const first = loadFounderDecisions("alpha", options);
      assert.deepEqual(first.map((item) => item.value).sort(), ["Legacy wording", "Shared wording"]);
      assert.ok(first.every((item) => item.compatibility?.synthesized));
      saveFeedbackLedger(loadFeedbackLedger("alpha", options), options);
      const second = loadFounderDecisions("alpha", options);
      assert.deepEqual(second.map((item) => item.id), first.map((item) => item.id));
      assert.deepEqual(loadFounderDecisions("beta", options).map((item) => item.value), ["Beta wording"]);
    } finally {
      fs.rmSync(options.root, { recursive: true, force: true });
    }
  });
});
