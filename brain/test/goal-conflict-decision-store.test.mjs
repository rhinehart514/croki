import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  GoalConflictDecisionConflictError,
  goalConflictDecisionHistory,
  listGoalConflictDecisions,
  recordGoalConflictDecision,
} from "../src/goal-conflict-decision-store.mjs";

let root;
let options;
const surfaced = {
  id: "goal-conflict:work-artifact:shared",
  objectRef: { type: "work-artifact", id: "shared" },
  goalRefs: [{ type: "goal", id: "positioning" }, { type: "goal", id: "activation" }],
};

function write(extra = {}) {
  return {
    idempotencyKey: "resolve:first",
    expectedStoreRevision: 0,
    resolution: "keep-separate",
    decidedBy: { type: "founder", id: "jacob" },
    ...extra,
  };
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "goal-conflict-decisions-"));
  options = { root, backend: "json", now: () => "2026-07-11T12:00:00.000Z" };
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe("goal conflict decision authority", () => {
  it("records an attributable, project-scoped founder decision and replays one mutation exactly", () => {
    const first = recordGoalConflictDecision("p1", surfaced, write(), options);
    assert.equal(first.storeRevision, 1);
    assert.equal(first.decision.resolution, "keep-separate");
    assert.deepEqual(first.decision.decidedBy, { type: "founder", id: "jacob" });
    assert.deepEqual(first.decision.goalRefs.map((ref) => ref.id), ["activation", "positioning"]);

    const replay = recordGoalConflictDecision("p1", surfaced, write(), options);
    assert.deepEqual(replay.decision, first.decision);
    assert.equal(listGoalConflictDecisions("p1", options).decisions.length, 1);
    assert.deepEqual(listGoalConflictDecisions("p2", options), { projectId: "p2", storeRevision: 0, decisions: [] });
  });

  it("keeps immutable revision history and requires exact optimistic revisions", () => {
    recordGoalConflictDecision("p1", surfaced, write(), options);
    const revised = recordGoalConflictDecision("p1", surfaced, write({
      idempotencyKey: "resolve:second",
      expectedStoreRevision: 1,
      expectedDecisionRevision: 0,
      resolution: "choose-goal",
      chosenGoalRef: { type: "goal", id: "activation" },
      note: "Activation owns the product change.",
    }), options);
    assert.equal(revised.decision.revision, 1);
    assert.equal(revised.decision.chosenGoalRef.id, "activation");
    assert.deepEqual(goalConflictDecisionHistory("p1", surfaced.id, options).map((item) => item.resolution), ["keep-separate", "choose-goal"]);

    assert.throws(() => recordGoalConflictDecision("p1", surfaced, write({
      idempotencyKey: "resolve:stale-store", expectedStoreRevision: 1, expectedDecisionRevision: 1,
    }), options), (error) => error instanceof GoalConflictDecisionConflictError && error.actualRevision === 2);
    assert.throws(() => recordGoalConflictDecision("p1", surfaced, write({
      idempotencyKey: "resolve:stale-head", expectedStoreRevision: 2, expectedDecisionRevision: 0,
    }), options), (error) => error instanceof GoalConflictDecisionConflictError && error.actualRevision === 1);
  });

  it("refuses model attribution, invalid choices, and idempotency-key reuse", () => {
    assert.throws(() => recordGoalConflictDecision("p1", surfaced, write({
      decidedBy: { type: "model-worker", id: "codex" },
    }), options), /identify the founder/i);
    assert.throws(() => recordGoalConflictDecision("p1", surfaced, write({
      resolution: "choose-goal", chosenGoalRef: { type: "goal", id: "unrelated" },
    }), options), /one of the goals/i);
    recordGoalConflictDecision("p1", surfaced, write(), options);
    assert.throws(() => recordGoalConflictDecision("p1", surfaced, write({ resolution: "acknowledge-coexistence" }), options), /already used/i);
  });
});
