import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { after, describe, it } from "node:test";

import { createGoal, goalStore } from "../src/goal-store.mjs";
import { createOpenCanvasRoutes } from "../src/routes/open-canvas.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "goal-relation-route-"));
const options = { root, backend: "json" };
after(() => fs.rmSync(root, { recursive: true, force: true }));

createGoal({ projectId: "p1", id: "g1", statement: "Activation", createdBy: "founder", idempotencyKey: "goal:g1" }, options);
createGoal({ projectId: "p1", id: "g2", statement: "Retention", createdBy: "founder", idempotencyKey: "goal:g2" }, options);

const handle = createOpenCanvasRoutes({
  projectReader: async () => ({ id: "p1" }),
  goals: goalStore,
  optionsForProject: () => options,
});

async function request(pathname, { method = "GET", body } = {}) {
  const req = Readable.from(body == null ? [] : [JSON.stringify(body)]);
  req.method = method;
  req.headers = body == null ? {} : { "content-type": "application/json" };
  const response = { status: null, payload: null };
  const res = {
    writeHead(status) { response.status = status; },
    end(value) { response.payload = JSON.parse(value); },
  };
  await handle({ req, res, url: new URL(pathname, "http://drover.local") });
  return response;
}

describe("goal relationship direct routes", () => {
  it("reads one addressed goal rather than returning the full collection", async () => {
    const result = await request("/api/projects/p1/goals/g1");
    assert.equal(result.status, 200);
    assert.equal(result.payload.goal.id, "g1");
    assert.equal(result.payload.goal.statement, "Activation");
    assert.equal(result.payload.goals, undefined);
  });

  it("uses the same goal authority for read, immutable history, CAS revision, retirement, and restore", async () => {
    const base = "/api/projects/p1/goal-relations/gr-1";
    const created = await request("/api/projects/p1/goal-relations", { method: "POST", body: {
      id: "gr-1", sourceRef: { type: "goal", id: "g1" }, targetRef: { type: "goal", id: "g2" },
      kind: "supports", label: "Activation supports retention", basis: ["Shared first value"],
      provenance: "inferred", createdBy: "model:claude", idempotencyKey: "relation:create",
    } });
    assert.equal(created.status, 201);
    assert.equal((await request(base)).payload.relation.revision, 0);
    const revised = await request(base, { method: "PATCH", body: {
      expectedRevision: 0, kind: "depends-on", label: "Retention needs activation",
      basis: ["Founder reviewed the dependency"], provenance: "founder-stated",
      revisionAuthor: "founder", idempotencyKey: "relation:revise",
    } });
    assert.equal(revised.status, 200);
    const stale = await request(base, { method: "PATCH", body: {
      expectedRevision: 0, label: "Stale", revisionAuthor: "founder", idempotencyKey: "relation:stale",
    } });
    assert.equal(stale.status, 409);
    assert.equal((await request(`${base}/retire`, { method: "POST", body: {
      expectedRevision: 1, revisionAuthor: "founder", idempotencyKey: "relation:retire",
    } })).status, 200);
    const restored = await request(`${base}/restore`, { method: "POST", body: {
      expectedRevision: 2, revisionAuthor: "founder", idempotencyKey: "relation:restore",
    } });
    assert.equal(restored.payload.relation.revision, 3);
    const history = await request(`${base}/history`);
    assert.deepEqual(history.payload.history.map((entry) => entry.revision), [0, 1, 2, 3]);
    assert.equal(history.payload.history[0].label, "Activation supports retention");
    assert.equal(history.payload.history[3].label, "Retention needs activation");
  });
});
