import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { detectGoalConflicts } from "../src/goal-conflicts.mjs";

function goal(id, extra = {}) {
  return { id, statement: `Goal ${id}`, status: "active", scopeRefs: [], currentWorkRefs: [], ...extra };
}

describe("multi-goal shared-object conflict detection", () => {
  it("derives an advisory receipt from stable references with attributable basis", () => {
    const conflicts = detectGoalConflicts({
      goals: [
        goal("activation", { currentWorkRefs: [{ type: "work-artifact", id: "onboarding-change" }] }),
        goal("positioning", { scopeRefs: [{ type: "work-artifact", id: "onboarding-change" }] }),
      ],
    });

    assert.equal(conflicts.length, 1);
    assert.deepEqual(conflicts[0].objectRef, { type: "work-artifact", id: "onboarding-change" });
    assert.deepEqual(conflicts[0].goalRefs.map((ref) => ref.id), ["activation", "positioning"]);
    assert.equal(conflicts[0].blocking, false);
    assert.equal(conflicts[0].provenance, "derived");
    assert.deepEqual(conflicts[0].basis.map((item) => item.link).sort(), ["current-work", "scope"]);
    assert.match(conflicts[0].detail, /not proof.+incompatible/i);
  });

  it("uses stored goal-to-object relationships and artifact references without interpreting open labels", () => {
    const conflicts = detectGoalConflicts({
      goals: [goal("a"), goal("b")],
      artifacts: [{ artifactId: "brief", refs: [{ type: "goal", id: "a" }] }],
      workRelationships: [{
        relationshipId: "rel-b", sourceRef: { type: "goal", id: "b" },
        targetRef: { type: "work-artifact", id: "brief" }, kind: "an open label with no host meaning",
      }],
    });
    assert.equal(conflicts.length, 1);
    assert.deepEqual(conflicts[0].goalRefs.map((ref) => ref.id), ["a", "b"]);
    assert.ok(conflicts[0].basis.some((item) => item.link === "an open label with no host meaning"));
  });

  it("does not guess overlap from similar wording and excludes paused, completed, retired, or single-goal work", () => {
    const sameWords = [
      goal("a", { statement: "Rewrite onboarding" }),
      goal("b", { statement: "Rewrite the onboarding" }),
      goal("paused", { status: "paused", scopeRefs: [{ type: "journey", id: "onboarding" }] }),
      goal("done", { status: "completed", scopeRefs: [{ type: "journey", id: "onboarding" }] }),
      goal("retired", { retiredAt: "2026-07-11", scopeRefs: [{ type: "journey", id: "onboarding" }] }),
      goal("active", { scopeRefs: [{ type: "journey", id: "onboarding" }] }),
    ];
    assert.deepEqual(detectGoalConflicts({ goals: sameWords }), []);
  });
});
