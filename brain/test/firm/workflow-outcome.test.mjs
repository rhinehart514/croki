import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeWorkflowOutcome } from "../../src/firm/workflow-outcome.mjs";

describe("WorkflowOutcome", () => {
  it("normalizes provider terminal strings at one boundary", () => {
    const table = new Map([["done", "completed"], ["waiting", "paused"], ["budget", "budget-exhausted"], ["aborted", "cancelled"], ["error", "failed"]]);
    for (const [input, expected] of table) assert.equal(normalizeWorkflowOutcome(input).kind, expected, input);
  });

  it("never accepts a running state", () => {
    assert.throws(() => normalizeWorkflowOutcome("running"), (error) => error.code === "workflow_outcome_invalid");
  });
});
