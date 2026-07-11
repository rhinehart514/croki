import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { once } from "node:events";

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "open-canvas-routes-"));
process.env.GTM_IDE_HOME = HOME;
process.env.GTM_IDE_PERSISTENCE = "json";
process.env.HOST = "127.0.0.1";
const probe = net.createServer();
probe.listen(0, "127.0.0.1");
await once(probe, "listening");
const PORT = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
process.env.PORT = String(PORT);

const { createProject } = await import("../src/project-store.mjs");
const { closePersistence } = await import("../src/persistence.mjs");
const { createOpenCanvasRoutes } = await import("../src/routes/open-canvas.mjs");
const { server } = await import("../src/server.mjs");
if (!server.listening) await once(server, "listening");
const serverBase = `http://127.0.0.1:${PORT}`;

const projectA = createProject({ id: "canvas-a", name: "Canvas A" }).project;
const projectB = createProject({ id: "canvas-b", name: "Canvas B" }).project;
const projectWork = createProject({ id: "canvas-work", name: "Canvas Work" }).project;

const projectLoads = [];
const routeHandler = createOpenCanvasRoutes({
  projectReader(options) {
    projectLoads.push(options.projectId);
    return import("../src/project-store.mjs").then(({ loadProject }) => loadProject(options));
  },
});
const isolatedServer = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  if (!(await routeHandler({ req, res, url }))) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Not found." }));
  }
});
isolatedServer.listen(0, "127.0.0.1");
await once(isolatedServer, "listening");
const isolatedBase = `http://127.0.0.1:${isolatedServer.address().port}`;

after(async () => {
  isolatedServer.closeAllConnections?.();
  await new Promise((resolve) => isolatedServer.close(resolve));
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
  closePersistence();
  fs.rmSync(HOME, { recursive: true, force: true });
});

async function request(pathname, { method = "GET", body, key, base = isolatedBase } = {}) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (key) headers["idempotency-key"] = key;
  const response = await fetch(`${base}${pathname}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { response, payload: await response.json() };
}

function founder() {
  return { type: "founder", id: "founder" };
}

describe("open-canvas project routes", () => {
  it("loads every addressed project, isolates records, and lists dozens of independent goals", async () => {
    for (let index = 0; index < 40; index += 1) {
      const id = `goal-${String(index).padStart(2, "0")}`;
      const { response } = await request(`/api/projects/${projectA.id}/goals`, {
        method: "POST",
        key: `create:${id}`,
        body: { id, statement: `Advance ${id}`, createdBy: "founder" },
      });
      assert.equal(response.status, 201);
    }
    await request(`/api/projects/${projectB.id}/goals`, {
      method: "POST", key: "create:private-b", body: { id: "private-b", statement: "Only B", createdBy: "founder" },
    });

    const listed = await request(`/api/projects/${projectA.id}/goals`);
    assert.equal(listed.response.status, 200);
    assert.equal(listed.payload.goals.length, 40);
    assert.ok(listed.payload.goals.every((goal) => goal.projectId === projectA.id));
    assert.ok(projectLoads.every(Boolean));
    assert.ok(projectLoads.includes(projectA.id) && projectLoads.includes(projectB.id));

    const crossed = await request(`/api/projects/${projectB.id}/goals/goal-00`, {
      method: "PATCH", key: "cross-project", body: { expectedRevision: 0, statement: "Crossed", revisionAuthor: "founder" },
    });
    assert.equal(crossed.response.status, 404);
    assert.equal(crossed.payload.error, "Record not found in this project.");
    assert.doesNotMatch(crossed.payload.error, /canvas-a/);
    const unknown = await request("/api/projects/not-a-project/goals");
    assert.equal(unknown.response.status, 404);
  });

  it("creates, revises, changes status, relates, and retires goals with validation and conflict mapping", async () => {
    const status = await request(`/api/projects/${projectA.id}/goals/goal-00/status`, {
      method: "POST", key: "status:goal-00", body: { expectedRevision: 0, status: "waiting", statusReason: "Outside evidence", revisionAuthor: "founder" },
    });
    assert.equal(status.response.status, 200);
    assert.equal(status.payload.goal.status, "waiting");

    const stale = await request(`/api/projects/${projectA.id}/goals/goal-00/status`, {
      method: "POST", key: "status:stale", body: { expectedRevision: 0, status: "paused", revisionAuthor: "founder" },
    });
    assert.equal(stale.response.status, 409);
    const retry = await request(`/api/projects/${projectA.id}/goals/goal-00/status`, {
      method: "POST", key: "status:goal-00", body: { expectedRevision: 0, status: "waiting", statusReason: "Outside evidence", revisionAuthor: "founder" },
    });
    assert.equal(retry.response.status, 200);
    assert.equal(retry.payload.goal.revision, 1);

    const invalid = await request(`/api/projects/${projectA.id}/goals/goal-01/status`, {
      method: "POST", key: "status:unknown", body: { expectedRevision: 0, status: "made-up", revisionAuthor: "founder" },
    });
    assert.equal(invalid.response.status, 400);
    const unguarded = await request(`/api/projects/${projectA.id}/goals/goal-01`, {
      method: "PATCH", body: { expectedRevision: 0, statement: "No retry key" },
    });
    assert.equal(unguarded.response.status, 400);

    const relation = await request(`/api/projects/${projectA.id}/goal-relations`, {
      method: "POST",
      key: "relation:create",
      body: {
        id: "relation-open-kind",
        sourceGoalId: "goal-00",
        targetGoalId: "goal-01",
        kind: "shares a strange new proof shape with",
        basis: ["Founder connected them"],
        provenance: "founder-stated",
        createdBy: "founder",
      },
    });
    assert.equal(relation.response.status, 201);
    assert.equal(relation.payload.relation.kind, "shares a strange new proof shape with");
    const revised = await request(`/api/projects/${projectA.id}/goal-relations/relation-open-kind`, {
      method: "PATCH", key: "relation:revise", body: { expectedRevision: 0, label: "Shared evidence", revisionAuthor: "founder" },
    });
    assert.equal(revised.response.status, 200);
    const retiredRelation = await request(`/api/projects/${projectA.id}/goal-relations/relation-open-kind/retire`, {
      method: "POST", key: "relation:retire", body: { expectedRevision: 1, revisionAuthor: "founder" },
    });
    assert.equal(retiredRelation.response.status, 200);
    assert.equal((await request(`/api/projects/${projectA.id}/goal-relations`)).payload.relations.length, 0);
    assert.equal((await request(`/api/projects/${projectA.id}/goal-relations?includeRetired=true`)).payload.relations.length, 1);

    const retiredGoal = await request(`/api/projects/${projectA.id}/goals/goal-02/retire`, {
      method: "POST", key: "goal:retire", body: { expectedRevision: 0, revisionAuthor: "founder" },
    });
    assert.equal(retiredGoal.response.status, 200);
    assert.ok(retiredGoal.payload.goal.retiredAt);
    const restoredGoal = await request(`/api/projects/${projectA.id}/goals/goal-02/restore`, {
      method: "POST", key: "goal:restore", body: { expectedRevision: 1, revisionAuthor: "founder" },
    });
    assert.equal(restoredGoal.response.status, 200);
    assert.equal(restoredGoal.payload.goal.retiredAt, undefined);
    assert.equal(restoredGoal.payload.goal.revision, 2);
  });

  it("supports open work kinds, immutable history, branching, retirement, restoration, and retry conflicts", async () => {
    const create = await request(`/api/projects/${projectWork.id}/work-artifacts`, {
      method: "POST", key: "artifact:create", body: {
        expectedStoreRevision: 0,
        id: "artifact-a",
        kind: "unknown-map-from-the-future",
        contentType: "application/vnd.unknown+json",
        status: "waiting-under-a-tree",
        content: { answer: 1 },
        createdBy: founder(),
      },
    });
    assert.equal(create.response.status, 201);
    assert.equal(create.payload.artifact.kind, "unknown-map-from-the-future");
    const replay = await request(`/api/projects/${projectWork.id}/work-artifacts`, {
      method: "POST", key: "artifact:create", body: {
        expectedStoreRevision: 0, id: "artifact-a", kind: "unknown-map-from-the-future",
        contentType: "application/vnd.unknown+json", status: "waiting-under-a-tree",
        content: { answer: 1 }, createdBy: founder(),
      },
    });
    assert.equal(replay.response.status, 201);
    assert.equal(replay.payload.artifact.id, create.payload.artifact.id);
    const keyConflict = await request(`/api/projects/${projectWork.id}/work-artifacts`, {
      method: "POST", key: "artifact:create", body: {
        expectedStoreRevision: 1, id: "artifact-a", kind: "different", content: "different", createdBy: founder(),
      },
    });
    assert.equal(keyConflict.response.status, 409);

    const revised = await request(`/api/projects/${projectWork.id}/work-artifacts/artifact-a`, {
      method: "PATCH", key: "artifact:revise", body: {
        expectedArtifactRevision: 1, content: { answer: 2 }, createdBy: founder(),
      },
    });
    assert.equal(revised.payload.artifact.revision, 2);
    const stale = await request(`/api/projects/${projectWork.id}/work-artifacts/artifact-a`, {
      method: "PATCH", key: "artifact:stale", body: {
        expectedArtifactRevision: 1, content: { answer: 3 }, createdBy: founder(),
      },
    });
    assert.equal(stale.response.status, 409);
    const fetched = await request(`/api/projects/${projectWork.id}/work-artifacts/artifact-a`);
    assert.equal(fetched.payload.artifact.content.answer, 2);
    const history = await request(`/api/projects/${projectWork.id}/work-artifacts/artifact-a/history`);
    assert.deepEqual(history.payload.history.map((revision) => revision.revision), [1, 2]);

    const branch = await request(`/api/projects/${projectWork.id}/work-artifacts/artifact-a/branch`, {
      method: "POST", key: "artifact:branch", body: {
        expectedArtifactRevision: 2, id: "artifact-b", content: { answer: "alternative" }, createdBy: founder(),
      },
    });
    assert.equal(branch.response.status, 201);
    assert.equal(branch.payload.artifact.lineageId, "artifact-a");
    const retired = await request(`/api/projects/${projectWork.id}/work-artifacts/artifact-b/retire`, {
      method: "POST", key: "artifact:retire", body: {
        expectedArtifactRevision: 1, reason: "Keep the branch reversible", createdBy: founder(),
      },
    });
    assert.ok(retired.payload.artifact.retiredAt);
    const restored = await request(`/api/projects/${projectWork.id}/work-artifacts/artifact-b/restore`, {
      method: "POST", key: "artifact:restore", body: { expectedArtifactRevision: 2, createdBy: founder() },
    });
    assert.equal(restored.payload.artifact.revision, 3);
    assert.equal(restored.payload.artifact.retiredAt, undefined);
    assert.equal((await request(`/api/projects/${projectWork.id}/work-artifacts`)).payload.artifacts.length, 2);

    const missing = await request(`/api/projects/${projectWork.id}/work-artifacts/missing/history`);
    assert.equal(missing.response.status, 404);
  });

  it("creates, revises, retires, restores, and reads work relationship history", async () => {
    const relationship = await request(`/api/projects/${projectWork.id}/work-relationships`, {
      method: "POST", key: "work-relation:create", body: {
        expectedStoreRevision: 5,
        id: "work-edge",
        sourceRef: { type: "work-artifact", id: "artifact-a" },
        targetRef: { type: "work-artifact", id: "artifact-b" },
        kind: "unrecognized-yet-valid-relationship",
        basis: [{ reasoning: "The founder connected these alternatives" }],
        provenance: "founder-stated",
        createdBy: founder(),
      },
    });
    assert.equal(relationship.response.status, 201);
    assert.equal(relationship.payload.relationship.kind, "unrecognized-yet-valid-relationship");
    assert.equal((await request(`/api/projects/${projectWork.id}/work-relationships/work-edge`)).response.status, 200);

    const revised = await request(`/api/projects/${projectWork.id}/work-relationships/work-edge`, {
      method: "PATCH", key: "work-relation:revise", body: {
        expectedRelationshipRevision: 1, kind: "complicates", basis: [], provenance: "proven", createdBy: founder(),
      },
    });
    assert.equal(revised.payload.relationship.provenance, "speculative");
    const retired = await request(`/api/projects/${projectWork.id}/work-relationships/work-edge/retire`, {
      method: "POST", key: "work-relation:retire", body: { expectedRelationshipRevision: 2, createdBy: founder() },
    });
    assert.ok(retired.payload.relationship.retiredAt);
    assert.equal((await request(`/api/projects/${projectWork.id}/work-relationships`)).payload.relationships.length, 0);
    const restored = await request(`/api/projects/${projectWork.id}/work-relationships/work-edge/restore`, {
      method: "POST", key: "work-relation:restore", body: { expectedRelationshipRevision: 3, createdBy: founder() },
    });
    assert.equal(restored.payload.relationship.revision, 4);
    const history = await request(`/api/projects/${projectWork.id}/work-relationships/work-edge/history`);
    assert.deepEqual(history.payload.history.map((revision) => revision.revision), [1, 2, 3, 4]);
  });

  it("reads, revises, retires, restores, and retains goal relationship history", async () => {
    const created = await request(`/api/projects/${projectA.id}/goal-relations`, {
      method: "POST", key: "goal-relation:create", body: {
        id: "goal-edge-history",
        sourceRef: { type: "goal", id: "goal-00" },
        targetRef: { type: "goal", id: "goal-01" },
        kind: "supports", label: "Shared activation work",
        basis: ["The founder connected these goals"], provenance: "founder-stated", createdBy: "founder",
      },
    });
    assert.equal(created.response.status, 201);
    assert.equal((await request(`/api/projects/${projectA.id}/goal-relations/goal-edge-history`)).payload.relation.revision, 0);
    const revised = await request(`/api/projects/${projectA.id}/goal-relations/goal-edge-history`, {
      method: "PATCH", key: "goal-relation:revise", body: {
        expectedRevision: 0, revisionAuthor: "founder", kind: "depends-on", label: "Needs the activation proof",
        basis: ["The dependency was made explicit"],
      },
    });
    assert.equal(revised.payload.relation.revision, 1);
    const retired = await request(`/api/projects/${projectA.id}/goal-relations/goal-edge-history/retire`, {
      method: "POST", key: "goal-relation:retire", body: { expectedRevision: 1, revisionAuthor: "founder" },
    });
    assert.ok(retired.payload.relation.retiredAt);
    const restored = await request(`/api/projects/${projectA.id}/goal-relations/goal-edge-history/restore`, {
      method: "POST", key: "goal-relation:restore", body: { expectedRevision: 2, revisionAuthor: "founder" },
    });
    assert.equal(restored.payload.relation.revision, 3);
    assert.equal(restored.payload.relation.retiredAt, undefined);
    const history = await request(`/api/projects/${projectA.id}/goal-relations/goal-edge-history/history`);
    assert.deepEqual(history.payload.history.map((revision) => revision.revision), [0, 1, 2, 3]);
  });

  it("creates, moves, collapses, archives, and reopens canvas regions without touching members", async () => {
    const created = await request(`/api/projects/${projectA.id}/canvas-regions`, {
      method: "POST", key: "region:create", body: {
        expectedStoreRevision: 0,
        id: "activation-region",
        title: "Fix activation",
        purpose: "Keep the evidence and alternatives together",
        memberRefs: [{ type: "goal", id: "goal-00" }, { type: "goal", id: "goal-01" }],
        position: { x: 120, y: 80 },
        size: { width: 720, height: 480 },
        createdBy: "founder",
        revisionAuthor: "founder",
      },
    });
    assert.equal(created.response.status, 201);
    assert.equal(created.payload.region.founderPlaced, true);

    const moved = await request(`/api/projects/${projectA.id}/canvas-regions/activation-region`, {
      method: "PATCH", key: "region:move", body: {
        expectedRevision: 0, revisionAuthor: "founder", position: { x: 240, y: 180 }, collapsed: true,
      },
    });
    assert.equal(moved.response.status, 200);
    assert.equal(moved.payload.region.collapsed, true);
    const stale = await request(`/api/projects/${projectA.id}/canvas-regions/activation-region`, {
      method: "PATCH", key: "region:stale", body: { expectedRevision: 0, revisionAuthor: "founder", title: "Stale" },
    });
    assert.equal(stale.response.status, 409);

    const archived = await request(`/api/projects/${projectA.id}/canvas-regions/activation-region/archive`, {
      method: "POST", key: "region:archive", body: { expectedRevision: 1, revisionAuthor: "founder" },
    });
    assert.equal(archived.response.status, 200);
    assert.equal((await request(`/api/projects/${projectA.id}/canvas-regions`)).payload.regions.length, 0);
    assert.equal((await request(`/api/projects/${projectA.id}/goals`)).payload.goals.length, 40);
    const reopened = await request(`/api/projects/${projectA.id}/canvas-regions/activation-region/reopen`, {
      method: "POST", key: "region:reopen", body: { expectedRevision: 2, revisionAuthor: "founder" },
    });
    assert.equal(reopened.response.status, 200);
    assert.equal(reopened.payload.region.archivedAt, undefined);
    assert.equal((await request(`/api/projects/${projectA.id}/canvas-regions`)).payload.regions.length, 1);

    const structureHistory = await request(`/api/projects/${projectA.id}/canvas-history`);
    assert.equal(structureHistory.response.status, 200);
    assert.deepEqual(structureHistory.payload.entries.map((entry) => entry.operation), ["create", "revise", "archive", "reopen"]);
    assert.match(structureHistory.payload.entries[1].summary, /moved, collapsed/i);
    const undone = await request(`/api/projects/${projectA.id}/canvas-history/undo`, {
      method: "POST", key: "history:undo:reopen", body: {
        expectedHistoryRevision: structureHistory.payload.revision,
        revisionAuthor: "founder",
      },
    });
    assert.equal(undone.response.status, 200);
    assert.equal(undone.payload.receipt.status, "undone");
    assert.equal((await request(`/api/projects/${projectA.id}/canvas-regions`)).payload.regions.length, 0);
    const redone = await request(`/api/projects/${projectA.id}/canvas-history/redo`, {
      method: "POST", key: "history:redo:reopen", body: {
        expectedHistoryRevision: undone.payload.history.revision,
        revisionAuthor: "founder",
      },
    });
    assert.equal(redone.response.status, 200);
    assert.equal(redone.payload.receipt.status, "applied");
    assert.equal((await request(`/api/projects/${projectA.id}/canvas-regions`)).payload.regions.length, 1);
  });

  it("is registered in the production server dispatch", async () => {
    const listed = await request(`/api/projects/${projectA.id}/goals?includeRetired=true`, { base: serverBase });
    assert.equal(listed.response.status, 200);
    assert.equal(listed.payload.goals.length, 40);
    assert.ok(listed.payload.goals.some((goal) => goal.id === "goal-02" && !goal.retiredAt && goal.revision === 2));
  });

  it("claims matched API paths and returns JSON for unsupported methods", async () => {
    // DELETE is not a supported verb on a goal record; the route must claim the path and answer with
    // a 405 JSON body rather than falling through to the static SPA shell (which would be a 200 HTML).
    const unsupported = await request(`/api/projects/${projectA.id}/goals/goal-00`, {
      method: "DELETE",
      base: serverBase,
    });
    assert.equal(unsupported.response.status, 405);
    assert.match(unsupported.response.headers.get("content-type") ?? "", /application\/json/);
    assert.equal(unsupported.payload.error, "Method not allowed.");
  });
});
