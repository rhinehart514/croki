import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  CanvasRegionConflictError,
  archiveCanvasRegion,
  createCanvasRegion,
  getCanvasRegion,
  listCanvasRegions,
  reopenCanvasRegion,
  reviseCanvasRegion,
} from "../src/canvas-region-store.mjs";
import { closePersistence, persistence } from "../src/persistence.mjs";

describe("canvas region authority", () => {
  let root;
  let tick;
  let options;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "drover-regions-"));
    tick = 0;
    options = { root, backend: "json", now: () => `2026-07-11T00:00:${String(tick++).padStart(2, "0")}.000Z` };
  });
  afterEach(() => {
    closePersistence({ root });
    fs.rmSync(root, { recursive: true, force: true });
  });

  const create = (overrides = {}) => createCanvasRegion("p1", {
    idempotencyKey: "create-activation",
    expectedStoreRevision: 0,
    title: "Fix activation",
    purpose: "Understand and repair the first-session drop",
    memberRefs: [{ type: "goal", id: "activation" }, { type: "work-artifact", id: "journey" }],
    position: { x: 120, y: 80 },
    size: { width: 720, height: 480 },
    createdBy: "founder:jacob",
    revisionAuthor: "founder:jacob",
    ...overrides,
  }, options);

  it("persists open spatial grouping with stable refs and deterministic idempotency", () => {
    const first = create({ id: undefined });
    const duplicate = create({ id: undefined });
    assert.match(first.id, /^region-/);
    assert.deepEqual(duplicate, first);
    assert.equal(first.founderPlaced, true);
    assert.deepEqual(first.memberRefs, [
      { type: "goal", id: "activation" },
      { type: "work-artifact", id: "journey" },
    ]);
    assert.deepEqual(listCanvasRegions("p1", options), [first]);
  });

  it("supports title, purpose, membership, geometry, size, and collapsed revisions under CAS", () => {
    const first = create();
    const next = reviseCanvasRegion("p1", first.id, {
      idempotencyKey: "revise-activation",
      expectedRevision: 0,
      revisionAuthor: "founder:jacob",
      title: "Repair activation",
      purpose: "Get invited teammates through the first useful moment",
      memberRefs: [{ type: "goal", id: "activation" }],
      position: { x: 240, y: 160 },
      size: { width: 800, height: 520 },
      collapsed: true,
    }, options);
    assert.equal(next.revision, 1);
    assert.equal(next.collapsed, true);
    assert.deepEqual(next.position, { x: 240, y: 160 });
    assert.throws(() => reviseCanvasRegion("p1", first.id, {
      idempotencyKey: "stale",
      expectedRevision: 0,
      revisionAuthor: "founder:jacob",
      title: "Stale title",
    }, options), CanvasRegionConflictError);
  });

  it("never lets automatic layout overwrite deliberate founder placement", () => {
    const first = create();
    assert.throws(() => reviseCanvasRegion("p1", first.id, {
      idempotencyKey: "auto-move",
      expectedRevision: 0,
      revisionAuthor: "system:layout",
      placementMode: "automatic",
      position: { x: 999, y: 999 },
    }, options), /cannot overwrite founder placement/i);
    assert.deepEqual(getCanvasRegion("p1", first.id, options).position, { x: 120, y: 80 });

    const automatic = create({
      id: "region-auto",
      idempotencyKey: "create-auto",
      expectedStoreRevision: 1,
      placementMode: "automatic",
      revisionAuthor: "system:layout",
      createdBy: "system:layout",
    });
    const moved = reviseCanvasRegion("p1", automatic.id, {
      idempotencyKey: "move-auto",
      expectedRevision: 0,
      revisionAuthor: "system:layout",
      placementMode: "automatic",
      position: { x: 400, y: 300 },
    }, options);
    assert.deepEqual(moved.position, { x: 400, y: 300 });
    assert.equal(moved.founderPlaced, false);
  });

  it("archives and reopens only the region without deleting member authorities", () => {
    const first = create();
    persistence(options).set("goals", "p1", { projectId: "p1", revision: 1, goals: [{ id: "activation" }] });
    const archived = archiveCanvasRegion("p1", first.id, {
      idempotencyKey: "archive",
      expectedRevision: 0,
      revisionAuthor: "founder:jacob",
    }, options);
    assert.ok(archived.archivedAt);
    assert.deepEqual(listCanvasRegions("p1", options), []);
    assert.equal(persistence(options).get("goals", "p1").goals[0].id, "activation");
    const reopened = reopenCanvasRegion("p1", first.id, {
      idempotencyKey: "reopen",
      expectedRevision: 1,
      revisionAuthor: "founder:jacob",
    }, options);
    assert.equal(reopened.archivedAt, undefined);
    assert.equal(reopened.revision, 2);
  });

  it("isolates projects and rejects resolvable foreign member references", () => {
    create();
    assert.throws(() => getCanvasRegion("p2", "region-auto", options), /not found/i);
    persistence(options).set("goals", "p2", { projectId: "p2", revision: 1, goals: [{ id: "foreign" }] });
    assert.throws(() => createCanvasRegion("p1", {
      idempotencyKey: "foreign-member",
      expectedStoreRevision: 1,
      title: "Bad region",
      memberRefs: [{ type: "goal", id: "foreign" }],
      createdBy: "founder:jacob",
      revisionAuthor: "founder:jacob",
    }, options), /belongs to project p2/i);
  });

  it("supports one non-owning region grouping layer and rejects dangling, cyclic, or deeper nesting", () => {
    const child = create({ id: "child", memberRefs: [{ type: "goal", id: "activation" }] });
    const parent = create({
      id: "parent",
      idempotencyKey: "create-parent",
      expectedStoreRevision: 1,
      title: "Activation directions",
      memberRefs: [{ type: "work-region", id: child.id }, { type: "work-artifact", id: "shared" }],
    });
    assert.deepEqual(parent.memberRefs, [
      { type: "work-artifact", id: "shared" },
      { type: "work-region", id: "child" },
    ]);

    assert.throws(() => reviseCanvasRegion("p1", child.id, {
      idempotencyKey: "nest-too-deep",
      expectedRevision: 0,
      revisionAuthor: "founder:jacob",
      memberRefs: [{ type: "work-region", id: parent.id }],
    }, options), /one grouping layer|cannot contain itself/i);
    assert.throws(() => create({
      id: "dangling",
      idempotencyKey: "create-dangling",
      expectedStoreRevision: 2,
      memberRefs: [{ type: "work-region", id: "missing" }],
    }), /not found/i);
    assert.throws(() => reviseCanvasRegion("p1", parent.id, {
      idempotencyKey: "self-cycle",
      expectedRevision: 0,
      revisionAuthor: "founder:jacob",
      memberRefs: [{ type: "work-region", id: parent.id }],
    }, options), /cannot contain itself/i);
  });
});
