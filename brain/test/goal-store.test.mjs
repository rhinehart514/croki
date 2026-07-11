import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  GoalConflictError,
  GOAL_STATUSES,
  changeGoalStatus,
  createGoal,
  createGoalRelation,
  getGoal,
  getGoalRelation,
  getGoalRelationHistory,
  listGoalRelations,
  listGoals,
  normalizeGoal,
  normalizeGoalRelation,
  retireGoal,
  retireGoalRelation,
  restoreGoalRelation,
  restoreGoal,
  reviseGoal,
  reviseGoalRelation,
} from "../src/goal-store.mjs";
import { closePersistence } from "../src/persistence.mjs";
import { createWorkArtifact } from "../src/work-artifact-store.mjs";

function clock() {
  let tick = 0;
  return () => new Date(Date.UTC(2026, 6, 11, 12, 0, tick++)).toISOString();
}

describe("goal-store — multi-goal authority", () => {
  let root;
  let options;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "drover-goals-"));
    options = { root, backend: "json", now: clock(), actor: "founder" };
  });

  afterEach(() => {
    closePersistence(options);
    fs.rmSync(root, { recursive: true, force: true });
  });

  function makeGoal(id, projectId = "p1", extra = {}) {
    return createGoal({
      id,
      projectId,
      statement: `Advance ${id}`,
      createdBy: "founder",
      idempotencyKey: `create:${projectId}:${id}`,
      ...extra,
    }, options);
  }

  it("starts honestly empty and holds zero-to-many goals without a mission singleton", () => {
    assert.deepEqual(listGoals("p1", options), []);
    const first = makeGoal("activation");
    const second = makeGoal("design-partners");
    assert.deepEqual(listGoals("p1", options).map((goal) => goal.id), [first.id, second.id]);
    assert.equal(Object.hasOwn(first, "mission"), false);
    assert.equal(Object.hasOwn(first, "topGoal"), false);
  });

  it("persists durable statements, optional desired change, open stable scope, origin, and work refs", () => {
    const goal = makeGoal("onboarding", "p1", {
      statement: "  Make onboarding legible  ",
      desiredChange: "  A founder recognizes value in two minutes  ",
      scopeRefs: [
        { type: "product-object", id: "onboarding" },
        { id: "onboarding", type: "product-object" },
        { type: "journey", id: "first-run" },
      ],
      originRef: { type: "founder-request", id: "request-7" },
      currentWorkRefs: [{ type: "code-diff", id: "diff-2" }],
    });
    assert.equal(goal.statement, "Make onboarding legible");
    assert.equal(goal.desiredChange, "A founder recognizes value in two minutes");
    assert.deepEqual(goal.scopeRefs, [
      { type: "journey", id: "first-run" },
      { type: "product-object", id: "onboarding" },
    ]);
    assert.deepEqual(goal.originRef, { type: "founder-request", id: "request-7" });
    assert.deepEqual(goal.currentWorkRefs, [{ type: "code-diff", id: "diff-2" }]);
    assert.equal(goal.revision, 0);
    assert.equal(goal.createdAt, goal.updatedAt);
  });

  it("normalizes deterministically and rejects malformed authority fields", () => {
    const raw = {
      id: "g",
      projectId: "p1",
      statement: "  Learn the market  ",
      scopeRefs: [{ type: "Market", id: "b" }, { type: "market", id: "a" }, { type: "market", id: "a" }],
      currentWorkRefs: [],
      createdBy: "founder",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    assert.deepEqual(normalizeGoal(raw), normalizeGoal(structuredClone(raw)));
    assert.deepEqual(normalizeGoal(raw).scopeRefs, [{ type: "market", id: "a" }, { type: "market", id: "b" }]);
    assert.throws(() => normalizeGoal({ ...raw, statement: " " }), /statement is required/);
    assert.throws(() => normalizeGoal({ ...raw, status: "backlog" }), /Unknown goal status/);
    assert.throws(() => normalizeGoal({ ...raw, scopeRefs: [{ type: "x", id: "1", projectId: "p2" }] }), /belongs to project p2/);
  });

  it("supports dozens of independently addressable concurrent goals", () => {
    for (let index = 0; index < 64; index += 1) makeGoal(`goal-${String(index).padStart(2, "0")}`);
    const goals = listGoals("p1", options);
    assert.equal(goals.length, 64);
    assert.equal(new Set(goals.map((goal) => goal.id)).size, 64);
    assert.ok(goals.every((goal) => goal.status === "active" && goal.revision === 0));
  });

  it("supports every behavioral status while goals move independently", () => {
    assert.deepEqual(GOAL_STATUSES, [
      "active", "needs-founder", "waiting", "paused", "completed", "abandoned", "failed", "stale",
    ]);
    const goals = GOAL_STATUSES.map((status, index) => {
      const goal = makeGoal(`status-${index}`);
      if (status === "active") return goal;
      return changeGoalStatus(goal.id, status, {
        projectId: "p1",
        expectedRevision: 0,
        idempotencyKey: `status:${index}`,
        statusReason: `Now ${status}`,
      }, options);
    });
    assert.deepEqual(goals.map((goal) => goal.status), GOAL_STATUSES);
    assert.ok(goals.find((goal) => goal.status === "completed").completedAt);
    assert.equal(getGoal("status-0", { ...options, projectId: "p1" }).revision, 0);
    assert.equal(getGoal("status-1", { ...options, projectId: "p1" }).revision, 1);
  });

  it("revises one goal without changing another and rejects conflicting stale revisions", () => {
    const first = makeGoal("first");
    const second = makeGoal("second");
    const revised = reviseGoal(first.id, { statement: "First, revised" }, {
      ...options,
      projectId: "p1",
      expectedRevision: first.revision,
      idempotencyKey: "revise:first",
    });
    assert.equal(revised.revision, 1);
    assert.equal(getGoal(second.id, { ...options, projectId: "p1" }).revision, 0);
    assert.throws(() => reviseGoal(first.id, { statement: "A conflicting write" }, {
      ...options,
      projectId: "p1",
      expectedRevision: 0,
      idempotencyKey: "revise:first:conflict",
    }), /Stale goal first revision.*current 1/);
    assert.equal(getGoal(first.id, { ...options, projectId: "p1" }).statement, "First, revised");
  });

  it("requires optimistic revisions for mutations", () => {
    const goal = makeGoal("guarded");
    assert.throws(() => reviseGoal(goal.id, { statement: "unguarded" }, {
      ...options, projectId: "p1", idempotencyKey: "unguarded",
    }), /expectedRevision is required/);
    assert.throws(() => changeGoalStatus(goal.id, "paused", {
      projectId: "p1", idempotencyKey: "unguarded-status",
    }, options), /expectedRevision is required/);
  });

  it("makes create and mutations durably idempotent and rejects key reuse for different work", () => {
    const createInput = {
      projectId: "p1",
      statement: "Retry safely",
      createdBy: "codex",
      idempotencyKey: "request:create:retry",
    };
    const first = createGoal(createInput, options);
    const retried = createGoal(createInput, options);
    assert.deepEqual(retried, first);
    assert.equal(listGoals("p1", options).length, 1);

    const revised = reviseGoal(first.id, { desiredChange: "One durable result" }, {
      ...options, projectId: "p1", expectedRevision: 0, idempotencyKey: "request:revise:retry",
    });
    const retriedRevision = reviseGoal(first.id, { desiredChange: "One durable result" }, {
      ...options, projectId: "p1", expectedRevision: 0, idempotencyKey: "request:revise:retry",
    });
    assert.deepEqual(retriedRevision, revised);
    assert.equal(getGoal(first.id, { ...options, projectId: "p1" }).revision, 1);
    assert.throws(() => reviseGoal(first.id, { desiredChange: "Different work" }, {
      ...options, projectId: "p1", expectedRevision: 0, idempotencyKey: "request:revise:retry",
    }), /already used for a different mutation/);
  });

  it("creates open, explicit goal-to-goal relations and projects related refs without copying goals", () => {
    const source = makeGoal("source");
    const target = makeGoal("target");
    const relation = createGoalRelation({
      id: "relation-1",
      projectId: "p1",
      sourceRef: { type: "goal", id: source.id },
      targetRef: { type: "goal", id: target.id },
      kind: "shares discovery with",
      label: "One market read",
      basis: [
        { type: "founder-statement", id: "statement-4" },
        { statement: "Both goals touch the same audience", provenance: "inferred" },
      ],
      provenance: "founder-stated",
      createdBy: "founder",
      idempotencyKey: "create:relation-1",
    }, options);
    assert.equal(relation.kind, "shares discovery with");
    assert.equal(relation.basis.length, 2);
    assert.deepEqual(getGoal(source.id, { ...options, projectId: "p1" }).relatedGoalRefs, [{ type: "goal", id: target.id }]);
    assert.deepEqual(getGoal(target.id, { ...options, projectId: "p1" }).relatedGoalRefs, [{ type: "goal", id: source.id }]);
    assert.equal(listGoalRelations("p1", options).length, 1);
    assert.equal(Object.hasOwn(relation, "sourceGoal"), false);
    assert.equal(Object.hasOwn(relation, "targetGoal"), false);
    assert.throws(() => createGoal({
      projectId: "p1",
      statement: "Implicit relationship",
      relatedGoalRefs: [{ type: "goal", id: target.id }],
      idempotencyKey: "implicit-relation",
    }, options), /createGoalRelation/);
  });

  it("normalizes relation bases deterministically and keeps relation kinds open", () => {
    const relation = {
      id: "r",
      projectId: "p1",
      sourceGoalId: "a",
      targetGoalId: "b",
      kind: "an entirely new relation",
      basis: [{ type: "receipt", id: "z" }, { type: "receipt", id: "a" }],
      provenance: "speculative",
      createdBy: "founder",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    assert.deepEqual(normalizeGoalRelation(relation), normalizeGoalRelation(structuredClone(relation)));
    assert.deepEqual(normalizeGoalRelation(relation).basis, [{ type: "receipt", id: "a" }, { type: "receipt", id: "z" }]);
    assert.throws(() => normalizeGoalRelation({ ...relation, basis: [] }), /non-empty basis/);
    assert.throws(() => normalizeGoalRelation({ ...relation, targetGoalId: "a" }), /relate to itself/);
  });

  it("revises and retires relations with their own optimistic revisions", () => {
    makeGoal("a");
    makeGoal("b");
    const relation = createGoalRelation({
      id: "ab", projectId: "p1", sourceGoalId: "a", targetGoalId: "b", kind: "supports",
      basis: ["Founder connected these goals"], provenance: "founder-stated", idempotencyKey: "relation:ab",
    }, options);
    const retriedCreate = createGoalRelation({
      id: "ab", projectId: "p1", sourceGoalId: "a", targetGoalId: "b", kind: "supports",
      basis: ["Founder connected these goals"], provenance: "founder-stated", idempotencyKey: "relation:ab",
    }, options);
    assert.deepEqual(retriedCreate, relation);
    assert.equal(listGoalRelations("p1", options).length, 1);
    const revised = reviseGoalRelation(relation.id, { kind: "conflicts with", basis: [{ type: "decision", id: "d1" }] }, {
      ...options, projectId: "p1", expectedRevision: 0, idempotencyKey: "relation:ab:revise",
    });
    const retriedRevision = reviseGoalRelation(relation.id, { kind: "conflicts with", basis: [{ type: "decision", id: "d1" }] }, {
      ...options, projectId: "p1", expectedRevision: 0, idempotencyKey: "relation:ab:revise",
    });
    assert.deepEqual(retriedRevision, revised);
    assert.equal(revised.kind, "conflicts with");
    assert.equal(revised.revision, 1);
    assert.throws(() => reviseGoalRelation(relation.id, { label: "stale" }, {
      ...options, projectId: "p1", expectedRevision: 0, idempotencyKey: "relation:ab:stale",
    }), /Stale goal relation/);
    const retired = retireGoalRelation(relation.id, {
      projectId: "p1", expectedRevision: 1, idempotencyKey: "relation:ab:retire",
    }, options);
    assert.ok(retired.retiredAt);
    const restored = restoreGoalRelation(relation.id, {
      projectId: "p1", expectedRevision: 2, idempotencyKey: "relation:ab:restore",
    }, options);
    assert.equal(restored.revision, 3);
    assert.equal(restored.retiredAt, undefined);
    assert.deepEqual(getGoalRelationHistory(relation.id, { ...options, projectId: "p1" }).map((item) => item.revision), [0, 1, 2, 3]);
    assert.equal(restoreGoalRelation(relation.id, {
      projectId: "p1", expectedRevision: 2, idempotencyKey: "relation:ab:restore",
    }, options).revision, 3, "restore retries remain idempotent");
    assert.throws(() => restoreGoalRelation(relation.id, {
      projectId: "p1", expectedRevision: 3, idempotencyKey: "relation:ab:restore-again",
    }, options), /not retired/);
    assert.equal(listGoalRelations("p1", options).length, 1);
    assert.equal(listGoalRelations("p1", { ...options, includeRetired: true }).length, 1);
    assert.equal(getGoal("a", { ...options, projectId: "p1" }).relatedGoalRefs.length, 1);
  });

  it("refuses cross-project reads, mutations, references, and relation endpoints", () => {
    const p1 = makeGoal("private-p1", "p1");
    makeGoal("private-p2", "p2");
    assert.throws(() => getGoal(p1.id, { ...options, projectId: "p2" }), /belongs to project p1/);
    assert.throws(() => reviseGoal(p1.id, { statement: "crossed" }, {
      ...options, projectId: "p2", expectedRevision: 0, idempotencyKey: "cross-revise",
    }), /belongs to project p1/);
    assert.throws(() => createGoal({
      projectId: "p1", statement: "Bad ref", scopeRefs: [{ type: "goal", id: "private-p2", projectId: "p2" }],
      idempotencyKey: "bad-ref",
    }, options), /belongs to project p2/);
    assert.throws(() => createGoalRelation({
      projectId: "p1", sourceGoalId: "private-p1", targetGoalId: "private-p2", kind: "supports",
      basis: ["No"], provenance: "inferred", idempotencyKey: "cross-relation",
    }, options), /belongs to project p2/);
    createWorkArtifact("p2", { id: "foreign-work", kind: "brief", content: {}, createdBy: { type: "founder", id: "founder" } }, options);
    assert.throws(() => createGoal({
      projectId: "p1", statement: "Untagged foreign work", currentWorkRefs: [{ type: "work-artifact", id: "foreign-work" }],
      createdBy: "founder", idempotencyKey: "foreign-work-ref",
    }, options), /work-artifact:foreign-work belongs to project p2/);
    assert.equal(listGoals("p1", options).length, 1);
    assert.equal(listGoals("p2", options).length, 1);
  });

  it("retires goals as tombstones instead of destructively deleting them", () => {
    const goal = makeGoal("retire-me");
    const retired = retireGoal(goal.id, {
      projectId: "p1", expectedRevision: 0, idempotencyKey: "retire:goal",
    }, options);
    assert.ok(retired.retiredAt);
    assert.equal(retired.revision, 1);
    assert.deepEqual(listGoals("p1", options), []);
    assert.equal(listGoals("p1", { ...options, includeRetired: true }).length, 1);
    assert.ok(getGoal(goal.id, { ...options, projectId: "p1" }).retiredAt);
    assert.throws(() => reviseGoal(goal.id, { statement: "resurrected by edit" }, {
      ...options, projectId: "p1", expectedRevision: 1, idempotencyKey: "edit-retired",
    }), /is retired/);
    const restored = restoreGoal(goal.id, {
      projectId: "p1", expectedRevision: 1, idempotencyKey: "restore:goal",
    }, options);
    assert.equal(restored.retiredAt, undefined);
    assert.equal(restored.revision, 2);
    assert.equal(listGoals("p1", options).length, 1);
  });

  it("returns frozen clones whose mutation cannot alter durable state", () => {
    const created = makeGoal("immutable", "p1", { scopeRefs: [{ type: "object", id: "one" }] });
    assert.equal(Object.isFrozen(created), true);
    assert.equal(Object.isFrozen(created.scopeRefs), true);
    assert.throws(() => { created.statement = "mutated"; }, TypeError);
    assert.throws(() => { created.scopeRefs.push({ type: "object", id: "two" }); }, TypeError);
    const firstRead = getGoal(created.id, { ...options, projectId: "p1" });
    const secondRead = getGoal(created.id, { ...options, projectId: "p1" });
    assert.notEqual(firstRead, secondRead);
    assert.equal(secondRead.statement, "Advance immutable");
    assert.deepEqual(secondRead.scopeRefs, [{ type: "object", id: "one" }]);
  });

  it("reloads goals, statuses, relations, tombstones, revisions, and idempotency receipts from persistence", () => {
    const first = makeGoal("reload-a");
    makeGoal("reload-b");
    changeGoalStatus(first.id, "waiting", {
      projectId: "p1", expectedRevision: 0, idempotencyKey: "reload:status", statusReason: "Market reply",
    }, options);
    const relation = createGoalRelation({
      id: "reload-relation", projectId: "p1", sourceGoalId: "reload-a", targetGoalId: "reload-b",
      kind: "depends on", basis: [{ type: "evidence", id: "e1" }], provenance: "grounded",
      idempotencyKey: "reload:relation",
    }, options);
    retireGoalRelation(relation.id, {
      projectId: "p1", expectedRevision: 0, idempotencyKey: "reload:relation:retire",
    }, options);

    closePersistence(options);
    const reloadedOptions = { root, backend: "json", now: clock(), actor: "founder" };
    const reloaded = getGoal(first.id, { ...reloadedOptions, projectId: "p1" });
    assert.equal(reloaded.status, "waiting");
    assert.equal(reloaded.revision, 1);
    assert.equal(listGoals("p1", reloadedOptions).length, 2);
    assert.equal(listGoalRelations("p1", { ...reloadedOptions, includeRetired: true }).length, 1);
    assert.ok(getGoalRelation(relation.id, { ...reloadedOptions, projectId: "p1" }).retiredAt);

    const replayed = changeGoalStatus(first.id, "waiting", {
      projectId: "p1", expectedRevision: 0, idempotencyKey: "reload:status", statusReason: "Market reply",
    }, reloadedOptions);
    assert.equal(replayed.revision, 1);
    assert.equal(getGoal(first.id, { ...reloadedOptions, projectId: "p1" }).revision, 1);
  });

  it("records an actor on every write and preserves the original creator", () => {
    assert.throws(() => createGoal({
      projectId: "compat", statement: "Unattributed", idempotencyKey: "actor:missing",
    }, { root, backend: "json" }), /mutation actor\/revisionAuthor/i);
    const goal = createGoal({
      id: "authored", projectId: "p1", statement: "Authored", createdBy: "founder",
      idempotencyKey: "actor:create",
    }, { ...options, actor: "founder:jacob" });
    const revised = reviseGoal(goal.id, { statement: "Authored again", createdBy: "codex" }, {
      ...options, projectId: "p1", expectedRevision: 0, idempotencyKey: "actor:revise",
    });
    assert.equal(revised.createdBy, "founder");
    assert.equal(revised.revisionAuthor, "codex");
  });

  it("lets exactly one interleaved authority writer win without erasing unrelated goals", () => {
    makeGoal("base");
    let winner;
    const staleOptions = {
      ...options,
      beforeCommit() {
        winner = createGoal({
          id: "winner", projectId: "p1", statement: "Winner", createdBy: "codex",
          idempotencyKey: "concurrent:winner",
        }, { ...options, beforeCommit: undefined });
      },
    };
    assert.throws(() => createGoal({
      id: "loser", projectId: "p1", statement: "Loser", createdBy: "claude",
      idempotencyKey: "concurrent:loser",
    }, staleOptions), (error) => error instanceof GoalConflictError
      && error.code === "GOAL_CONFLICT"
      && error.expectedRevision === 1
      && error.actualRevision === 2);
    assert.equal(winner.id, "winner");
    assert.deepEqual(listGoals("p1", options).map((goal) => goal.id), ["base", "winner"]);
  });

  it("guards relation creates with authority CAS even without a caller-supplied revision", () => {
    makeGoal("left");
    makeGoal("right");
    makeGoal("third");
    let winner;
    assert.throws(() => createGoalRelation({
      id: "loser-relation", projectId: "p1", sourceGoalId: "left", targetGoalId: "right",
      kind: "supports", basis: ["stale reasoning"], provenance: "inferred",
      createdBy: "claude", idempotencyKey: "relation-cas:loser",
    }, {
      ...options,
      beforeCommit() {
        winner = createGoalRelation({
          id: "winner-relation", projectId: "p1", sourceGoalId: "left", targetGoalId: "third",
          kind: "tests", basis: ["winning reasoning"], provenance: "inferred",
          createdBy: "codex", idempotencyKey: "relation-cas:winner",
        }, { ...options, beforeCommit: undefined });
      },
    }), (error) => error instanceof GoalConflictError && error.actualRevision === 4);
    assert.equal(winner.id, "winner-relation");
    assert.deepEqual(listGoalRelations("p1", options).map((relation) => relation.id), ["winner-relation"]);
    assert.equal(listGoals("p1", options).length, 3);
  });

  it("demotes unsupported strong relation provenance and rejects corrupt loaded invariants", () => {
    makeGoal("left");
    makeGoal("right");
    const relation = createGoalRelation({
      id: "unsupported-proof", projectId: "p1", sourceGoalId: "left", targetGoalId: "right",
      kind: "supports", basis: ["Model reasoning only"], provenance: "proven",
      createdBy: "codex", idempotencyKey: "provenance:demote",
    }, options);
    assert.equal(relation.declaredProvenance, "proven");
    assert.equal(relation.provenance, "inferred");

    const file = path.join(root, "goals", fs.readdirSync(path.join(root, "goals"))[0]);
    const corrupt = JSON.parse(fs.readFileSync(file, "utf8"));
    corrupt.goals.push(structuredClone(corrupt.goals[0]));
    fs.writeFileSync(file, JSON.stringify(corrupt));
    closePersistence(options);
    assert.throws(() => listGoals("p1", options), /Duplicate goal id/);
  });
});
