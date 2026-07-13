import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { reconcileDirectRunWithOperator } from "../src/operator-run-reconciliation.mjs";
import { createOperatorSession, getOperatorSession, saveOperatorSession } from "../src/operator-store.mjs";

describe("direct run conversation reconciliation", () => {
  let root;
  let options;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), "drover-run-reconcile-")); options = { root }; });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it("corrects an older failed conclusion when a newer run reaches the founder gate", () => {
    const created = createOperatorSession({ goal: "Get the first customers", projectId: "p1" }, options);
    saveOperatorSession({ ...created, graphId: "g1", status: "failed", error: "The source was empty." }, options);

    const reconciled = reconcileDirectRunWithOperator({
      projectId: "p1",
      graphId: "g1",
      result: {
        runId: "run-new",
        ok: true,
        pendingGates: ["gate"],
        nodes: { gate: { items: [{ id: "a" }, { id: "b" }] } },
      },
    }, options);

    assert.equal(reconciled.status, "waiting_for_gate");
    assert.equal(reconciled.error, null);
    assert.equal(reconciled.pendingGate.runId, "run-new");
    assert.equal(reconciled.events.at(-1).type, "direct_run_reconciled");
    assert.match(reconciled.events.at(-1).title, /2 items/);
    assert.equal(getOperatorSession(created.id, options).lastRunId, "run-new");
  });

  it("does not rewrite in-flight, terminal, or unrelated founder-decision states", () => {
    for (const status of ["running", "resolving_gate", "completed", "cancelled", "waiting_for_proposal", "waiting_for_ideas", "waiting_for_candidates"]) {
      const created = createOperatorSession({ goal: `Keep moving ${status}`, projectId: "p1" }, options);
      saveOperatorSession({ ...created, graphId: `g-${status}`, status }, options);
      assert.equal(
        reconcileDirectRunWithOperator({ projectId: "p1", graphId: `g-${status}`, result: { runId: `r-${status}`, ok: true, pendingGates: [] } }, options),
        null,
        status,
      );
    }
  });

  it("atomically clears lifecycle fields contradicted by the newer direct run", () => {
    const created = createOperatorSession({ goal: "Repair the run", projectId: "p1" }, options);
    saveOperatorSession({
      ...created,
      graphId: "g1",
      status: "waiting_for_input",
      error: "old error",
      summary: "old conclusion",
      completedAt: "2026-01-01T00:00:00.000Z",
      pendingQuestion: { question: "retry?" },
      pendingProposal: { id: "stale" },
      pendingIdeas: { ideas: [] },
      pendingCandidates: { candidates: [] },
    }, options);

    const reconciled = reconcileDirectRunWithOperator({
      projectId: "p1",
      graphId: "g1",
      result: { runId: "run-new", ok: true, pendingGates: [] },
    }, options);

    assert.equal(reconciled.status, "ready");
    for (const field of ["error", "summary", "completedAt", "pendingQuestion", "pendingProposal", "pendingIdeas", "pendingCandidates", "pendingGate"]) {
      assert.equal(reconciled[field], null, field);
    }
    assert.equal(getOperatorSession(created.id, options).events.at(-1).type, "direct_run_reconciled");
  });
});
