import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createWorkflowExecutionReceipt, projectExecutionTrail } from "../../src/firm/workflow-execution-receipt.mjs";

describe("WorkflowExecutionReceipt", () => {
  it("creates an immutable non-market settlement receipt", () => {
    const receipt = createWorkflowExecutionReceipt({ ventureId: "venture-one", runId: "run-one", betRef: "bet:bet-one", outcome: { kind: "done", summary: "Provider turn settled." }, runtime: { id: "codex" } });
    assert.equal(receipt.terminal.kind, "completed");
    assert.equal(receipt.outcomeKind, undefined);
    assert.throws(() => { receipt.runtime.id = "changed"; }, TypeError);
  });

  it("renders an interrupted trail as unknown rather than failed or done", () => {
    assert.equal(projectExecutionTrail({ id: "run-one" }).state, "unknown");
    const receipt = createWorkflowExecutionReceipt({ ventureId: "venture-one", runId: "run-one", betRef: "bet:bet-one", outcome: "cancelled" });
    assert.equal(projectExecutionTrail({ id: "run-one" }, receipt).state, "cancelled");
  });
});
