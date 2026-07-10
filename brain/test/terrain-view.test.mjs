import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  createChannel,
  createProject,
  groundProjectInWorkspace,
} from "../src/project-store.mjs";
import { getOperatingView, getTerrainView } from "../src/operating-view.mjs";
import { addClarity, updateClarity } from "../src/clarity-store.mjs";
import { buildProductModel, saveProductModelStore } from "../src/product-model-store.mjs";
import { crewRosterStore } from "../src/crew-roster-store.mjs";
import { productTruthStore, resultStore } from "../src/gtm-store.mjs";
import { objectGraphLayoutStore, PROJECT_CANVAS_LAYOUT_NAMESPACE } from "../src/object-graph-store.mjs";

function freshRoot() {
  return { root: fs.mkdtempSync(path.join(os.tmpdir(), "terrain-view-")), backend: "json" };
}

function report(repo, scannedAt = new Date().toISOString()) {
  return {
    repo,
    scannedAt,
    headline: "The product records project creation with source context.",
    winEvent: {
      name: "project_created",
      found: true,
      citations: [{ label: "Records project creation", file: "src/events.ts", line: 7, text: "track('project_created')" }],
    },
    analytics: { citations: [{ label: "Analytics client is initialized", file: "src/analytics.ts", line: 2 }] },
    attribution: { citations: [] },
    gaps: [],
  };
}

function ground(name, options, scannedAt) {
  const { project } = createProject({ name }, options);
  const workspace = {
    id: `workspace-${project.id}`,
    repo: `/tmp/${project.id}`,
    outcome: "project_created",
    report: report(`/tmp/${project.id}`, scannedAt),
  };
  return { project: groundProjectInWorkspace(workspace, { ...options, projectId: project.id }), workspace };
}

function saveModel(projectId, options, scannedAt = new Date().toISOString()) {
  const model = buildProductModel({
    projectId,
    groundingRef: { scannedAt, citationCount: 1 },
    generatedBy: "founder",
    things: [{ id: "project", name: "Project", provenance: "derived", evidence: [{ file: "src/events.ts", line: 7 }] }],
  }, options);
  saveProductModelStore({ schemaVersion: 1, projectId, productModels: [model] }, options);
  return model;
}

function snapshotFiles(root) {
  const out = {};
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else out[path.relative(root, file)] = fs.readFileSync(file, "utf8");
    }
  };
  walk(root);
  return out;
}

describe("getTerrainView — deterministic project terrain", () => {
  it("returns an honest empty contract without inventing hypotheses, questions, moves, or crew", () => {
    const options = freshRoot();
    const { project } = createProject({ name: "Empty Terrain" }, options);
    const view = getTerrainView({ projectId: project.id }, options);
    assert.equal(view.schemaVersion, 1);
    assert.equal(view.projectId, project.id);
    assert.deepEqual(view.state, { kind: "empty", stale: false, issues: [] });
    assert.deepEqual(view.product.repository, { path: null, winEvent: null });
    assert.deepEqual(view.product.truths, []);
    assert.equal(view.product.modelRef, null);
    for (const key of ["hypotheses", "questions", "moves", "outcomes", "implications", "crew", "relationships"]) {
      assert.deepEqual(view[key], [], `${key} stays empty`);
    }
  });

  it("persists cited scan truth during first grounding and exposes it on the first terrain read", () => {
    const options = freshRoot();
    const { project } = ground("First Ground", options);
    const view = getTerrainView({ projectId: project.id }, { ...options, runtimeAvailable: false });
    assert.equal(view.product.truths.length, 2);
    assert.equal(view.product.truths[0].projectId, project.id);
    assert.ok(view.product.truths.every((truth) => truth.evidence[0].source.includes(":")));
    assert.deepEqual(view.product.repository, { path: `/tmp/${project.id}`, winEvent: "project_created" });
    assert.equal(view.state.kind, "partial");
    assert.ok(view.state.issues.some((issue) => issue.owner === "terrain-read" && issue.kind === "unavailable"));
    assert.equal(productTruthStore.list({ ...options, projectId: project.id }).length, 2);

    groundProjectInWorkspace({
      id: `workspace-${project.id}`,
      repo: `/tmp/${project.id}`,
      outcome: "project_created",
      report: report(`/tmp/${project.id}`),
    }, { ...options, projectId: project.id });
    assert.equal(productTruthStore.list({ ...options, projectId: project.id }).length, 2, "re-grounding is idempotent");
  });

  it("projects populated product, questions, moves, outcomes, implications, crew, relationships, and geometry", () => {
    const options = freshRoot();
    const { project } = ground("Populated", options);
    const model = saveModel(project.id, options);
    const question = addClarity(project.id, {
      kind: "question",
      text: "Which creation path carries source context?",
      participantRefs: [{ type: "teammate", id: "researcher" }],
      productRefs: [{ type: "productModel", id: model.id }],
    }, options);
    const { channel } = createChannel({
      name: "Creation path study",
      questionId: question.id,
      participantRefs: [{ type: "teammate", id: "researcher" }],
      productRefs: [{ type: "productModel", id: model.id }],
    }, { ...options, projectId: project.id });
    crewRosterStore.add(project.id, { ref: "researcher", name: "Ari" }, options);
    const outcome = resultStore.create({
      projectId: project.id,
      joinKey: "creation-study",
      outcomeKind: "activation",
      body: "The source-bearing path activated.",
      questionId: question.id,
      participantRefs: [{ type: "teammate", id: "researcher" }],
      productRefs: [{ type: "productModel", id: model.id }],
      productImplication: { body: "Keep source context visible during creation.", authorRef: { type: "teammate", id: "researcher" } },
      source: "founder-entered",
    }, options);
    objectGraphLayoutStore.saveNamespace(project.id, PROJECT_CANVAS_LAYOUT_NAMESPACE, {
      positions: { [`anchor:question:${question.id}`]: { x: 10, y: 20 } },
      viewport: { x: 1, y: 2, zoom: 0.8 },
    }, options);
    const view = getTerrainView({ projectId: project.id }, {
      ...options,
      terrainRead: { schemaVersion: 1, id: "read-1", projectId: project.id, generatedAt: new Date().toISOString(), inputFingerprint: "same", hypotheses: [] },
      terrainInputFingerprint: "same",
    });
    assert.equal(view.state.kind, "ready", JSON.stringify(view.state.issues));
    assert.deepEqual(view.product.modelRef, { type: "productModel", id: model.id });
    assert.ok(view.questions.some((item) => item.id === question.id));
    assert.ok(view.moves.some((item) => item.type === "pipeline" && item.id === channel.id));
    assert.deepEqual(view.outcomes, [{ type: "outcome", id: outcome.id }]);
    assert.equal(view.implications.length, 1);
    assert.deepEqual(view.crew, [{ type: "teammate", id: "researcher" }]);
    assert.deepEqual(view.geometry.viewport, { x: 1, y: 2, zoom: 0.8 });
    assert.ok(view.relationships.some((item) => item.kind === "involves" && item.resolved));
  });

  it("reports an isolated owner failure as partial while preserving the remaining terrain", () => {
    const options = freshRoot();
    const { project } = ground("Partial Owner", options);
    saveModel(project.id, options);
    const view = getTerrainView({ projectId: project.id }, {
      ...options,
      terrainRead: { id: "read-partial", projectId: project.id, hypotheses: [] },
      terrainSourceReaders: { questions: () => { throw new Error("clarity unavailable"); } },
    });
    assert.equal(view.product.truths.length, 2);
    assert.equal(view.state.kind, "partial");
    assert.ok(view.state.issues.some((issue) => issue.kind === "unavailable" && issue.owner === "clarity-store"));
  });

  it("marks old truth and a changed read fingerprint stale without hiding deterministic state", () => {
    const options = freshRoot();
    const old = "2025-01-01T00:00:00.000Z";
    const { project } = ground("Stale Terrain", options, old);
    saveModel(project.id, options, old);
    const view = getTerrainView({ projectId: project.id }, {
      ...options,
      terrainRead: { id: "read-old", projectId: project.id, generatedAt: old, inputFingerprint: "old", hypotheses: [] },
      terrainInputFingerprint: "new",
    });
    assert.equal(view.state.stale, true);
    assert.equal(view.state.kind, "ready");
    assert.equal(view.product.truths.length, 2);
    assert.ok(view.state.issues.some((issue) => issue.kind === "stale" && issue.owner === "terrain-read"));
  });

  it("isolates two projects even when the other project is active", () => {
    const options = freshRoot();
    const first = ground("Terrain One", options).project;
    saveModel(first.id, options);
    addClarity(first.id, { id: "shared-question", kind: "question", text: "First question" }, options);
    const second = ground("Terrain Two", options).project;
    saveModel(second.id, options);
    addClarity(second.id, { id: "shared-question", kind: "question", text: "Second question" }, options);
    crewRosterStore.add(second.id, { ref: "second-only", name: "Second" }, options);

    const view = getTerrainView({ projectId: first.id }, {
      ...options,
      terrainRead: { id: "read-one", projectId: first.id, hypotheses: [] },
    });
    assert.equal(view.projectId, first.id);
    assert.ok(view.product.truths.every((truth) => truth.projectId === first.id));
    assert.equal(view.product.repository.path, `/tmp/${first.id}`);
    assert.equal(view.crew.some((item) => item.id === "second-only"), false);
    const questionAnchor = view.relationships.find((item) => item.source?.id === "shared-question" || item.target?.id === "shared-question");
    assert.equal(questionAnchor, undefined);
  });

  it("retains archived questions and foreign or unknown hypothesis refs as unresolved partial context", () => {
    const options = freshRoot();
    const { project } = ground("Unknown Refs", options);
    const model = saveModel(project.id, options);
    const question = addClarity(project.id, { kind: "question", text: "Archived but retained" }, options);
    updateClarity(project.id, question.id, { status: "archived", evidenceRefs: [{ type: "evidence", id: "missing-evidence" }] }, options);
    const localTruth = productTruthStore.list({ ...options, projectId: project.id })[0];
    const view = getTerrainView({ projectId: project.id }, {
      ...options,
      terrainRead: {
        id: "read-refs",
        projectId: project.id,
        hypotheses: [{
          id: "hypothesis-1",
          stance: "opening",
          title: "Creation context",
          claim: "Source context may improve activation.",
          evidenceRefs: [{ type: "productTruth", id: localTruth.id, projectId: "another-project" }],
          productRefs: [{ type: "productModel", id: model.id }], marketRefs: [{ type: "market", id: "unknown-market" }], counterEvidenceRefs: [], crewRefs: [],
        }],
      },
    });
    assert.ok(view.questions.some((item) => item.id === question.id));
    assert.deepEqual(view.terrainReadRef, { type: "terrain-read", id: "read-refs" });
    assert.deepEqual(view.hypotheses[0].ref, { type: "terrain-hypothesis", id: "hypothesis-1" });
    assert.equal(view.hypotheses[0].evidenceRefs[0].id, localTruth.id, "foreign ref is retained for inspection");
    const foreign = view.relationships.find((item) => item.source.id === localTruth.id && item.target.id === "hypothesis-1");
    assert.equal(foreign.resolved, false, "a same-id foreign ref never cross-joins to local truth");
    assert.ok(view.relationships.some((item) => item.source.id === model.id && item.target.id === "hypothesis-1" && item.resolved));
    assert.equal(view.state.kind, "partial");
    assert.ok(view.state.issues.some((issue) => issue.kind === "unresolved"));
  });

  it("does not write any authority while projecting and leaves operating-view compatibility intact", () => {
    const options = freshRoot();
    const { project } = ground("Read Only", options);
    saveModel(project.id, options);
    const before = snapshotFiles(options.root);
    const terrain = getTerrainView({ projectId: project.id }, {
      ...options,
      terrainRead: { id: "read-only", projectId: project.id, hypotheses: [] },
    });
    const after = snapshotFiles(options.root);
    assert.deepEqual(after, before, "terrain GET projection performs zero writes");
    const operating = getOperatingView({ projectId: project.id }, options);
    assert.equal(terrain.product.truths.length, operating.woven.canvas.anchors.filter((item) => item.ref.type === "productTruth").length);
    assert.ok(Array.isArray(operating.lanes));
    assert.ok(operating.woven?.canvas, "legacy response remains available without terrain wrapping");
  });
});
