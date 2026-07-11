import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  CanvasStructureHistoryConflictError,
  canvasStructureHistoryStore,
} from "../src/canvas-structure-history.mjs";
import { canvasRegionStore } from "../src/canvas-region-store.mjs";
import { objectGraphLayoutStore, PROJECT_CANVAS_LAYOUT_NAMESPACE } from "../src/object-graph-store.mjs";
import { closePersistence } from "../src/persistence.mjs";

describe("durable open-canvas structure history", () => {
  let root;
  let tick;
  let options;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "drover-structure-history-"));
    tick = 0;
    options = { root, backend: "json", now: () => `2026-07-11T12:00:${String(tick++).padStart(2, "0")}.000Z` };
  });
  afterEach(() => {
    closePersistence({ root });
    fs.rmSync(root, { recursive: true, force: true });
  });

  function createRegion() {
    return canvasStructureHistoryStore.applyRegion("p1", "create", null, {
      id: "activation",
      idempotencyKey: "region:create",
      expectedStoreRevision: 0,
      title: "Fix activation",
      createdBy: "founder:jacob",
      revisionAuthor: "founder:jacob",
      position: { x: 10, y: 20 },
      size: { width: 640, height: 420 },
      memberRefs: [{ type: "goal", id: "g1" }],
    }, options);
  }

  it("persists human-readable region receipts and safely undoes and redoes without deleting members", () => {
    const created = createRegion();
    assert.equal(created.history.revision, 2);
    assert.match(created.receipt.summary, /Created region/);
    const revised = canvasStructureHistoryStore.applyRegion("p1", "revise", "activation", {
      idempotencyKey: "region:move-collapse",
      expectedRevision: 0,
      revisionAuthor: "founder:jacob",
      position: { x: 80, y: 90 },
      collapsed: true,
      memberRefs: [{ type: "goal", id: "g1" }, { type: "work-artifact", id: "a1" }],
    }, options);
    assert.match(revised.receipt.summary, /moved, collapsed, changed membership/);

    const undone = canvasStructureHistoryStore.undo("p1", {
      idempotencyKey: "history:undo:move",
      expectedHistoryRevision: revised.history.revision,
      revisionAuthor: "founder:jacob",
    }, options);
    assert.equal(undone.receipt.status, "undone");
    assert.deepEqual(canvasRegionStore.get("p1", "activation", options).position, { x: 10, y: 20 });
    assert.equal(canvasRegionStore.get("p1", "activation", options).collapsed, false);

    const redone = canvasStructureHistoryStore.redo("p1", {
      idempotencyKey: "history:redo:move",
      expectedHistoryRevision: undone.history.revision,
      revisionAuthor: "founder:jacob",
    }, options);
    assert.equal(redone.receipt.status, "applied");
    assert.deepEqual(canvasRegionStore.get("p1", "activation", options).position, { x: 80, y: 90 });

    // Undo creation archives the region authority; it never hard-deletes the stable record or references.
    const undoMoveAgain = canvasStructureHistoryStore.undo("p1", {
      idempotencyKey: "history:undo:move:again",
      expectedHistoryRevision: redone.history.revision,
      revisionAuthor: "founder:jacob",
    }, options);
    const undoCreate = canvasStructureHistoryStore.undo("p1", {
      idempotencyKey: "history:undo:create",
      expectedHistoryRevision: undoMoveAgain.history.revision,
      revisionAuthor: "founder:jacob",
    }, options);
    assert.equal(canvasRegionStore.get("p1", "activation", { ...options, includeArchived: true }).memberRefs[0].id, "g1");
    assert.throws(() => canvasRegionStore.get("p1", "activation", options), /not found/i);

    const redoCreate = canvasStructureHistoryStore.redo("p1", {
      idempotencyKey: "history:redo:create",
      expectedHistoryRevision: undoCreate.history.revision,
      revisionAuthor: "founder:jacob",
    }, options);
    assert.equal(canvasRegionStore.get("p1", "activation", options).title, "Fix activation");
    assert.equal(redoCreate.receipt.status, "applied");
  });

  it("restores exact layout snapshots under CAS and does not overwrite unrecorded divergence", () => {
    const first = canvasStructureHistoryStore.applyLayout("p1", {
      positions: { "anchor:goal:g1": { x: 1, y: 2 } },
      collapsedGroups: ["evidence"],
    }, { idempotencyKey: "layout:first", expectedRevision: 0, revisionAuthor: "founder:jacob" }, options);
    const second = canvasStructureHistoryStore.applyLayout("p1", {
      positions: { "anchor:goal:g1": { x: 30, y: 40 } },
      viewport: { x: 2, y: 3, zoom: 1.2 },
    }, { idempotencyKey: "layout:second", expectedRevision: 1, revisionAuthor: "founder:jacob" }, options);
    const undone = canvasStructureHistoryStore.undo("p1", {
      idempotencyKey: "layout:undo", expectedHistoryRevision: second.history.revision, revisionAuthor: "founder:jacob",
    }, options);
    const restored = objectGraphLayoutStore.loadNamespace("p1", PROJECT_CANVAS_LAYOUT_NAMESPACE, options);
    assert.deepEqual(restored.positions["anchor:goal:g1"], { x: 1, y: 2 });
    assert.deepEqual(restored.collapsedGroups, ["evidence"]);
    assert.equal(undone.receipt.status, "undone");

    objectGraphLayoutStore.mergeNamespace("p1", PROJECT_CANVAS_LAYOUT_NAMESPACE, {
      positions: { "anchor:goal:g1": { x: 999, y: 999 } },
    }, { expectedRevision: restored.revision, idempotencyKey: "outside-history" , ...options });
    assert.throws(() => canvasStructureHistoryStore.redo("p1", {
      idempotencyKey: "layout:redo", expectedHistoryRevision: undone.history.revision, revisionAuthor: "founder:jacob",
    }, options), CanvasStructureHistoryConflictError);
  });

  it("undoes and redoes a parent grouping without changing its child region or shared members", () => {
    const child = createRegion();
    const parent = canvasStructureHistoryStore.applyRegion("p1", "create", null, {
      id: "activation-program",
      idempotencyKey: "region:create-parent",
      expectedStoreRevision: 1,
      title: "Activation program",
      createdBy: "founder:jacob",
      revisionAuthor: "founder:jacob",
      memberRefs: [{ type: "work-region", id: "activation" }, { type: "work-artifact", id: "shared" }],
    }, options);
    const undone = canvasStructureHistoryStore.undo("p1", {
      idempotencyKey: "history:undo-parent",
      expectedHistoryRevision: parent.history.revision,
      revisionAuthor: "founder:jacob",
    }, options);
    assert.equal(canvasRegionStore.get("p1", "activation", options).title, "Fix activation");
    assert.throws(() => canvasRegionStore.get("p1", "activation-program", options), /not found/i);
    assert.deepEqual(canvasRegionStore.get("p1", "activation-program", { ...options, includeArchived: true }).memberRefs, [
      { type: "work-artifact", id: "shared" }, { type: "work-region", id: "activation" },
    ]);
    const redone = canvasStructureHistoryStore.redo("p1", {
      idempotencyKey: "history:redo-parent",
      expectedHistoryRevision: undone.history.revision,
      revisionAuthor: "founder:jacob",
    }, options);
    assert.equal(canvasRegionStore.get("p1", "activation-program", options).title, "Activation program");
    assert.equal(redone.receipt.status, "applied");
    assert.equal(child.region.revision, 0);
  });

  it("deduplicates retries, enforces history CAS, and isolates projects", () => {
    const first = createRegion();
    const retry = createRegion();
    assert.equal(retry.receipt.id, first.receipt.id);
    assert.equal(retry.history.revision, first.history.revision);
    assert.throws(() => canvasStructureHistoryStore.undo("p1", {
      idempotencyKey: "stale-undo", expectedHistoryRevision: 0, revisionAuthor: "founder:jacob",
    }, options), CanvasStructureHistoryConflictError);
    assert.deepEqual(canvasStructureHistoryStore.list("p2", options).entries, []);
  });
});
