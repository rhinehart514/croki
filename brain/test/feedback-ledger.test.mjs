import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeRunFeedback } from "../src/feedback-ledger.mjs";

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
