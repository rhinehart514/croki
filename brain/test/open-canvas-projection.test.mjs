import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loadOpenCanvasProjection, projectOpenCanvas } from "../src/open-canvas-projection.mjs";

const baseCanvas = () => ({
  anchors: [{
    id: "anchor:project:p1", ref: { type: "project", id: "p1" }, kind: "product", label: "Drover",
    body: { id: "p1" }, authority: { owner: "project-store", id: "p1", projectId: "p1" },
  }],
  relationships: [],
  outcomes: [{ id: "market-result" }],
  implications: [],
  state: { kind: "empty", stale: false, issues: [] },
  geometry: { namespace: "project-canvas", positions: { "anchor:project:p1": { x: 11, y: 22 } }, viewport: { x: 4, y: 8, zoom: 0.7 } },
});

function goal(id, extra = {}) {
  return {
    id, projectId: "p1", statement: `Advance ${id}`, status: "active", revision: 0,
    scopeRefs: [], relatedGoalRefs: [], currentWorkRefs: [], createdBy: "founder",
    createdAt: "2026-07-11T00:00:00.000Z", updatedAt: "2026-07-11T00:00:00.000Z", ...extra,
  };
}

function artifact(id, kind, extra = {}) {
  return {
    id: `${id}:r1`, artifactId: id, projectId: "p1", lineageId: id, revision: 1, kind,
    title: id, status: "active", content: {}, contentType: "application/json", format: "json",
    provenance: "generated", refs: [], parentRefs: [], evidence: [], createdBy: { type: "model-worker", workerId: "worker" },
    modelReceipts: [], toolReceipts: [], createdAt: "2026-07-11T00:00:00.000Z", updatedAt: "2026-07-11T00:00:00.000Z", ...extra,
  };
}

function region(id, extra = {}) {
  return {
    id, projectId: "p1", title: `Region ${id}`, purpose: "Keep related work together",
    memberRefs: [{ type: "goal", id: "activation" }], position: { x: 120, y: 80 },
    size: { width: 720, height: 480 }, collapsed: false, founderPlaced: true, revision: 0,
    createdBy: "founder", revisionAuthor: "founder", createdAt: "2026-07-11T00:00:00.000Z",
    updatedAt: "2026-07-11T00:00:00.000Z", ...extra,
  };
}

describe("open canvas authority projection", () => {
  it("adds stable open anchors, neutral authority receipts, facets, and capabilities without changing geometry", () => {
    const canvas = baseCanvas();
    const geometryBefore = structuredClone(canvas.geometry);
    const projected = projectOpenCanvas(canvas, {
      projectId: "p1",
      goals: [goal("activation")],
      artifacts: [
        artifact("fact-1", "fact", { provenance: "grounded", modelReceipts: [{ provider: "anthropic", requestId: "a" }] }),
        artifact("inference-1", "inference", { provenance: "inferred" }),
        artifact("decision-1", "decision", { provenance: "founder-stated" }),
        artifact("outcome-1", "outcome", { provenance: "grounded" }),
        artifact("strange-1", "constellation_map_v14", { contentType: "application/vnd.unknown+json" }),
      ],
    });

    assert.deepEqual(projected.geometry, geometryBefore);
    assert.deepEqual(canvas.geometry, geometryBefore, "the input canvas is not mutated");
    assert.deepEqual(
      projected.anchors.filter((item) => item.ref.type === "work-artifact").map((item) => item.kind),
      ["decision", "fact", "inference", "outcome", "constellation_map_v14"],
    );
    const unknown = projected.anchors.find((item) => item.ref.id === "strange-1");
    assert.equal(unknown.facets.contentType, "application/vnd.unknown+json");
    assert.equal(unknown.capabilities.revise, true);
    const fact = projected.anchors.find((item) => item.ref.id === "fact-1");
    assert.equal(fact.authority.owner, "work-artifact-store");
    assert.equal(Object.hasOwn(fact.authority, "provider"), false);
    assert.equal(fact.body.modelReceipts[0].provider, "anthropic", "provider attribution remains on the source receipt");
    assert.equal(projected.state.kind, "ready");
    assert.deepEqual(projected.outcomes, [{ id: "market-result" }], "existing outcome authority stays distinct and untouched");
  });

  it("projects isolated product changes as first-class reviewable code differences", () => {
    const projected = projectOpenCanvas(baseCanvas(), {
      projectId: "p1",
      productChanges: [{
        id: "change-1.md", projectId: "p1", title: "Improve activation copy", status: "ready-for-review",
        provider: "codex", model: "gpt-5.5-codex", diff: "--- a/app.ts\n+++ b/app.ts\n-old\n+new",
        capturedAt: "2026-07-11T00:00:00.000Z", reviewRevision: null,
      }],
    });
    const change = projected.anchors.find((item) => item.ref?.type === "product-change");
    assert.equal(change.kind, "code-change");
    assert.equal(change.body.diff.includes("+new"), true);
    assert.equal(change.facets.provider, "codex");
    assert.equal(change.capabilities.review, true);
    assert.equal(change.authority.owner, "product-change-receipts");
  });

  it("references shared work once across goals and does not duplicate existing anchors", () => {
    const canvas = baseCanvas();
    canvas.anchors.push({ id: "already-there", ref: { type: "work-artifact", id: "shared" }, kind: "document" });
    const projected = projectOpenCanvas(canvas, {
      projectId: "p1",
      goals: [
        goal("a", { currentWorkRefs: [{ type: "work-artifact", id: "shared" }] }),
        goal("b", { currentWorkRefs: [{ type: "work-artifact", id: "shared" }] }),
      ],
      artifacts: [artifact("shared", "document")],
    });

    assert.equal(projected.anchors.filter((item) => item.ref?.type === "work-artifact" && item.ref.id === "shared").length, 1);
    const ties = projected.relationships.filter((item) => item.kind === "current-work" && item.target.id === "shared");
    assert.deepEqual(ties.map((item) => item.source.id).sort(), ["a", "b"]);
    assert.ok(ties.every((item) => item.resolved));
    assert.equal(projected.conflicts.length, 1);
    assert.equal(projected.conflicts[0].blocking, false);
    assert.equal(projected.state.kind, "ready", "advisory overlap does not degrade or block the canvas");
    const shared = projected.anchors.find((item) => item.ref?.type === "work-artifact" && item.ref.id === "shared");
    assert.equal(shared.facets.goalConflicts[0].goalCount, 2);
    assert.ok(projected.anchors.filter((item) => item.ref?.type === "goal")
      .every((item) => item.facets.goalConflicts[0].objectRef.id === "shared"));
  });

  it("projects only a founder decision for the exact current shared-object receipt as resolved", () => {
    const input = {
      projectId: "p1",
      goals: [
        goal("a", { currentWorkRefs: [{ type: "work-artifact", id: "shared" }] }),
        goal("b", { currentWorkRefs: [{ type: "work-artifact", id: "shared" }] }),
      ],
      artifacts: [artifact("shared", "document")],
      conflictDecisions: [{
        conflictId: "goal-conflict:work-artifact:shared",
        objectRef: { type: "work-artifact", id: "shared" },
        goalRefs: [{ type: "goal", id: "b" }, { type: "goal", id: "a" }],
        resolution: "acknowledge-coexistence",
        decidedBy: { type: "founder", id: "jacob" },
        revision: 0,
      }],
    };
    const resolved = projectOpenCanvas(baseCanvas(), input);
    assert.equal(resolved.conflicts[0].status, "resolved");
    assert.equal(resolved.conflicts[0].resolution.decidedBy.id, "jacob");
    assert.equal(resolved.anchors.find((item) => item.ref.id === "shared").facets.goalConflicts[0].status, "resolved");
    assert.equal(resolved.state.kind, "ready", "a decision receipt still cannot block unrelated work");

    const changed = projectOpenCanvas(baseCanvas(), {
      ...input,
      goals: [...input.goals, goal("c", { currentWorkRefs: [{ type: "work-artifact", id: "shared" }] })],
    });
    assert.equal(changed.conflicts[0].status, "needs-founder", "a changed goal set requires a fresh founder call");
    assert.equal(changed.conflicts[0].resolution, undefined);
  });

  it("projects work regions as spatial records with non-owning member references", () => {
    const projected = projectOpenCanvas(baseCanvas(), {
      projectId: "p1",
      goals: [goal("activation")],
      regions: [region("activation")],
    });
    assert.deepEqual(projected.regions[0].position, { x: 120, y: 80 });
    const anchor = projected.anchors.find((item) => item.ref.type === "work-region");
    assert.equal(anchor.label, "Region activation");
    assert.equal(anchor.authority.owner, "canvas-region-store");
    const membership = projected.relationships.find((item) => item.kind === "contains");
    assert.deepEqual(membership.source, { type: "work-region", id: "activation" });
    assert.deepEqual(membership.target, { type: "goal", id: "activation" });
    assert.equal(membership.resolved, true);
  });

  it("keeps open relation kinds and reports unresolved refs instead of inventing anchors", () => {
    const projected = projectOpenCanvas(baseCanvas(), {
      projectId: "p1",
      goals: [goal("a"), goal("b", { scopeRefs: [{ type: "journey", id: "missing" }] })],
      goalRelations: [{
        id: "rel-1", projectId: "p1", sourceRef: { type: "goal", id: "a" }, targetRef: { type: "goal", id: "b" },
        kind: "shares a surprising buyer", basis: [{ type: "reasoning", statement: "Same buyer" }],
        provenance: "inferred", createdBy: "codex", revision: 0,
      }],
      artifacts: [artifact("claim", "claim")],
      workRelationships: [{
        id: "work-rel:r1", relationshipId: "work-rel", projectId: "p1", revision: 1,
        sourceRef: { type: "work-artifact", id: "claim" }, targetRef: { type: "research", id: "not-loaded" },
        kind: "complicates_without_disproving", basis: [], provenance: "speculative", createdBy: { type: "model-worker", workerId: "codex" },
      }],
    });

    const goalRelation = projected.relationships.find((item) => item.kind === "shares a surprising buyer");
    const workRelation = projected.relationships.find((item) => item.kind === "complicates_without_disproving");
    assert.equal(goalRelation.resolved, true);
    assert.equal(goalRelation.disposition, "proposed");
    assert.equal(goalRelation.capabilities.revise, true);
    assert.deepEqual(goalRelation.receipt.recordRef, { type: "goal-relation", id: "rel-1" });
    assert.equal(workRelation.resolved, false);
    assert.equal(workRelation.disposition, "proposed");
    assert.equal(workRelation.capabilities.history, true);
    assert.equal(projected.anchors.some((item) => item.ref?.id === "not-loaded" || item.ref?.id === "missing"), false);
    assert.equal(projected.state.kind, "partial");
    assert.equal(projected.state.issues.filter((item) => item.kind === "unresolved").length, 2);
  });

  it("excludes retired and foreign records by default, with foreign scope made explicit", () => {
    const projected = projectOpenCanvas(baseCanvas(), {
      projectId: "p1",
      goals: [goal("active"), goal("retired", { retiredAt: "2026-07-11T01:00:00.000Z" }), { ...goal("foreign"), projectId: "p2" }],
      artifacts: [artifact("retired-artifact", "note", { retiredAt: "2026-07-11T01:00:00.000Z" })],
    });
    assert.deepEqual(projected.anchors.filter((item) => item.ref.type === "goal").map((item) => item.ref.id), ["active"]);
    assert.ok(projected.state.issues.some((item) => item.kind === "project-mismatch" && item.projectId === "p2"));
    const withRetired = projectOpenCanvas(baseCanvas(), {
      projectId: "p1", goals: [goal("retired", { retiredAt: "2026-07-11T01:00:00.000Z" })],
    }, { includeRetired: true });
    assert.ok(withRetired.anchors.some((item) => item.ref.id === "retired"));
  });

  it("is deterministic for unordered inputs and an idempotent projection", () => {
    const input = {
      projectId: "p1",
      goals: [goal("z"), goal("a")],
      artifacts: [artifact("z", "note"), artifact("a", "note")],
    };
    const first = projectOpenCanvas(baseCanvas(), input);
    const reordered = projectOpenCanvas(baseCanvas(), { ...input, goals: [...input.goals].reverse(), artifacts: [...input.artifacts].reverse() });
    assert.deepEqual(first, reordered);
    assert.deepEqual(projectOpenCanvas(first, input), first);
  });

  it("loads through injected project-scoped readers without assuming an active project", () => {
    const calls = [];
    const readers = Object.fromEntries([
      ["readGoals", [goal("loaded")]],
      ["readGoalRelations", []],
      ["readArtifacts", [artifact("loaded-work", "document")]],
      ["readWorkRelationships", []],
    ].map(([name, result]) => [name, (projectId, options) => { calls.push({ name, projectId, options }); return result; }]));
    const projected = loadOpenCanvasProjection({ projectId: "p1", canvas: baseCanvas() }, readers);
    assert.equal(projected.anchors.some((item) => item.ref.id === "loaded"), true);
    assert.equal(projected.anchors.some((item) => item.ref.id === "loaded-work"), true);
    assert.ok(calls.every((call) => call.projectId === "p1" && call.options.includeRetired === false));
    assert.throws(() => loadOpenCanvasProjection({ projectId: "p1", canvas: baseCanvas() }, {}), /injected readGoals/);
  });
});
