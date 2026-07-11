import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { after, describe, it } from "node:test";

import { createOpenCanvasRoutes } from "../src/routes/open-canvas.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "goal-conflict-route-"));
after(() => fs.rmSync(root, { recursive: true, force: true }));

const goals = ["activation", "positioning"].map((id) => ({
  id,
  projectId: "p1",
  statement: id,
  status: "active",
  scopeRefs: [],
  currentWorkRefs: [{ type: "work-artifact", id: "shared" }],
}));
const goalReader = { list: () => goals };
const workReader = { list: () => [], listRelationships: () => [] };
const authorizeFounderDecision = (req) => {
  if (req.headers["x-gtm-actor"] === "agent") {
    const error = new Error("A model cannot resolve a founder conflict decision.");
    error.status = 403;
    throw error;
  }
};
const handle = createOpenCanvasRoutes({
  projectReader: async () => ({ id: "p1" }),
  goals: goalReader,
  work: workReader,
  authorizeFounderDecision,
  optionsForProject: () => ({ root, backend: "json", now: () => "2026-07-11T12:00:00.000Z" }),
});
const guardedHandle = createOpenCanvasRoutes({
  projectReader: async () => ({ id: "p1" }),
  goals: goalReader,
  work: workReader,
  optionsForProject: () => ({ root: path.join(root, "guarded"), backend: "json" }),
});

async function request(pathname, { method = "GET", body, headers = {}, handler = handle } = {}) {
  const req = Readable.from(body == null ? [] : [JSON.stringify(body)]);
  req.method = method;
  req.headers = { ...(body == null ? {} : { "content-type": "application/json" }), ...headers };
  const response = { status: null, payload: null };
  const res = {
    writeHead(status) { response.status = status; },
    end(value) { response.payload = JSON.parse(value); },
  };
  const claimed = await handler({ req, res, url: new URL(pathname, "http://drover.local") });
  return { claimed, ...response };
}

describe("goal conflict decision routes", () => {
  it("re-derives the surfaced receipt, refuses a model write, and exposes founder history", async () => {
    const conflictId = "goal-conflict:work-artifact:shared";
    const input = {
      idempotencyKey: "decision:first",
      expectedStoreRevision: 0,
      resolution: "choose-goal",
      chosenGoalRef: { type: "goal", id: "activation" },
      decidedBy: { type: "founder", id: "jacob" },
    };
    const refused = await request(`/api/projects/p1/goal-conflict-decisions/${encodeURIComponent(conflictId)}`, {
      method: "POST", body: input, headers: { "x-gtm-actor": "agent" },
    });
    assert.equal(refused.status, 403);
    assert.match(refused.payload.error, /model cannot resolve/i);

    const recorded = await request(`/api/projects/p1/goal-conflict-decisions/${encodeURIComponent(conflictId)}`, { method: "POST", body: input });
    assert.equal(recorded.status, 200);
    assert.deepEqual(recorded.payload.decision.objectRef, { type: "work-artifact", id: "shared" });
    assert.deepEqual(recorded.payload.decision.goalRefs.map((ref) => ref.id), ["activation", "positioning"]);

    const listed = await request("/api/projects/p1/goal-conflict-decisions");
    assert.equal(listed.status, 200);
    assert.equal(listed.payload.storeRevision, 1);
    assert.equal(listed.payload.decisions.length, 1);
    const history = await request(`/api/projects/p1/goal-conflict-decisions/${encodeURIComponent(conflictId)}/history`);
    assert.equal(history.status, 200);
    assert.equal(history.payload.history[0].decidedBy.id, "jacob");
  });

  it("cannot record a decision for a receipt the current durable references do not surface", async () => {
    const missing = await request("/api/projects/p1/goal-conflict-decisions/goal-conflict%3Awork-artifact%3Amissing", {
      method: "POST",
      body: {
        idempotencyKey: "decision:missing", expectedStoreRevision: 1,
        resolution: "keep-separate", decidedBy: { type: "founder", id: "jacob" },
      },
    });
    assert.equal(missing.status, 404);
    assert.match(missing.payload.error, /not found/i);
  });

  it("requires the browser-minted founder session on the real route", async () => {
    const refused = await request("/api/projects/p1/goal-conflict-decisions/goal-conflict%3Awork-artifact%3Ashared", {
      method: "POST",
      handler: guardedHandle,
      body: {
        idempotencyKey: "decision:raw", expectedStoreRevision: 0,
        resolution: "keep-separate", decidedBy: { type: "founder", id: "forged" },
      },
    });
    assert.equal(refused.status, 403);
    assert.match(refused.payload.error, /Drover page|browser session/i);
  });
});
