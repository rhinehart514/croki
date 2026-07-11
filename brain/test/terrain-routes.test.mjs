import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import net from "node:net";

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "terrain-routes-"));
process.env.GTM_IDE_HOME = HOME;
process.env.GTM_IDE_PERSISTENCE = "json";
process.env.HOST = "127.0.0.1";
const probe = net.createServer();
probe.listen(0, "127.0.0.1");
await once(probe, "listening");
const PORT = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
process.env.PORT = String(PORT);

const { createProject, groundProjectInWorkspace } = await import("../src/project-store.mjs");
const { createTerrainRoutes, terrainReadInputForProject } = await import("../src/routes/terrain.mjs");
const { server } = await import("../src/server.mjs");
if (!server.listening) await once(server, "listening");
const base = `http://127.0.0.1:${PORT}`;

after(async () => {
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(HOME, { recursive: true, force: true });
});

describe("project terrain routes", () => {
  it("serves the canonical project-scoped GET and returns cited truth on the first read", async () => {
    const { project } = createProject({ name: "Route Ground" });
    groundProjectInWorkspace({
      id: "route-ground-workspace",
      repo: "/tmp/route-ground",
      outcome: "project_created",
      report: {
        repo: "/tmp/route-ground",
        scannedAt: new Date().toISOString(),
        headline: "Creation is recorded.",
        winEvent: { name: "project_created", citations: [{ label: "Records creation", file: "src/app.ts", line: 4 }] },
        analytics: { citations: [] }, attribution: { citations: [] }, gaps: [],
      },
    }, { projectId: project.id });

    const response = await fetch(`${base}/api/projects/${project.id}/terrain`);
    assert.equal(response.status, 200);
    const terrain = await response.json();
    assert.equal(terrain.schemaVersion, 1);
    assert.equal(terrain.projectId, project.id);
    assert.equal(terrain.product.truths.length, 1);
    assert.equal(terrain.product.truths[0].evidence[0].source, "src/app.ts:4");
    assert.deepEqual(terrain.hypotheses, [], "GET does not invoke the rented reader");
  });

  it("does not fall back to the active project for an unknown project id", async () => {
    const response = await fetch(`${base}/api/projects/not-a-project/terrain`);
    assert.equal(response.status, 404);
    assert.match((await response.json()).error, /Project not found/);
  });

  it("returns the TerrainRead wire contract from the provider-neutral POST seam", async () => {
    let received = null;
    const handler = createTerrainRoutes({
      terrainReadInput: (projectId, { model, focusRef }) => ({ projectId, model, focusRef }),
      runTerrainRead: async (input) => {
        received = input;
        return { ok: true, meta: { provider: "codex" }, terrainRead: {
          schemaVersion: 1,
          id: "injected-read",
          projectId: input.projectId,
          generatedAt: "2026-07-10T00:00:00.000Z",
          inputFingerprint: "fixture",
          runtime: { id: "fixture", model: input.model },
          hypotheses: [],
        } };
      },
    });
    const injectedServer = http.createServer(async (req, res) => {
      const url = new URL(req.url, "http://127.0.0.1");
      if (!(await handler({ req, res, url }))) res.writeHead(404).end();
    });
    injectedServer.listen(0, "127.0.0.1");
    await once(injectedServer, "listening");
    const injectedBase = `http://127.0.0.1:${injectedServer.address().port}`;
    try {
      const response = await fetch(`${injectedBase}/api/projects/project-a/terrain/read`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "gpt-fixture", focusRef: { type: "question", id: "q-1" } }),
      });
      assert.equal(response.status, 200);
      const read = await response.json();
      assert.equal(read.projectId, "project-a");
      assert.equal(read.runtime.model, "gpt-fixture");
      assert.equal("terrainRead" in read, false, "the HTTP response is TerrainRead, not the runtime wrapper");
      assert.deepEqual(received.focusRef, { type: "question", id: "q-1" });
    } finally {
      injectedServer.closeAllConnections?.();
      await new Promise((resolve) => injectedServer.close(resolve));
    }
  });

  it("returns distinct project-scoped crew positions from the advisory POST seam", async () => {
    let received = null;
    const handler = createTerrainRoutes({
      terrainReadInput: (projectId, { model, focusRef }) => ({
        projectId, model, focusRef, crew: [{ ref: "activation-lead" }, { ref: "market-skeptic" }],
      }),
      runTerrainCrew: async (input) => {
        received = input;
        return { ok: true, terrainCrew: {
          schemaVersion: 1,
          projectId: input.projectId,
          hypothesisRef: { type: "terrain-hypothesis", id: input.hypothesis.id },
          generatedAt: "2026-07-10T00:00:00.000Z",
          runtime: { id: "codex", model: input.model },
          positions: [
            { id: "position-1", participantRef: "activation-lead", claim: "Test the first-run surface.", evidenceRefs: [], disagreesWith: ["market-skeptic"] },
            { id: "position-2", participantRef: "market-skeptic", claim: "Test whether the surface travels.", evidenceRefs: [], disagreesWith: ["activation-lead"] },
          ],
        } };
      },
    });
    const injectedServer = http.createServer(async (req, res) => {
      const url = new URL(req.url, "http://127.0.0.1");
      if (!(await handler({ req, res, url }))) res.writeHead(404).end();
    });
    injectedServer.listen(0, "127.0.0.1");
    await once(injectedServer, "listening");
    const injectedBase = `http://127.0.0.1:${injectedServer.address().port}`;
    try {
      const hypothesis = { id: "h-1", claim: "A project brief could become an entry point.", evidenceRefs: [], counterEvidenceRefs: [] };
      const response = await fetch(`${injectedBase}/api/projects/project-a/terrain/crew`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "gpt-fixture", hypothesis }),
      });
      assert.equal(response.status, 200);
      const read = await response.json();
      assert.equal(read.positions.length, 2);
      assert.notEqual(read.positions[0].claim, read.positions[1].claim);
      assert.equal(received.focusRef, "terrain-hypothesis:h-1");
      assert.deepEqual(received.hypothesis, hypothesis);
    } finally {
      injectedServer.closeAllConnections?.();
      await new Promise((resolve) => injectedServer.close(resolve));
    }
  });

  it("assembles only the requested project's linked scan and project-scoped authorities", () => {
    const projects = new Map([
      ["project-a", { id: "project-a", sharedContext: { repository: { workspaceId: "workspace-a", repo: "/repo/a" } } }],
      ["project-b", { id: "project-b", sharedContext: { repository: { workspaceId: "workspace-b", repo: "/repo/b" } } }],
    ]);
    const workspaceCalls = [];
    const scopedCalls = [];
    const input = terrainReadInputForProject("project-b", {
      model: "gpt-project-b",
      focusRef: { type: "question", id: "q-b" },
      projectReader: ({ projectId }) => projects.get(projectId),
      workspaceReader: (id) => {
        workspaceCalls.push(id);
        return { id, repo: `/repo/${id.at(-1)}`, report: { repo: `/repo/${id.at(-1)}`, scannedAt: "2026-07-10T10:00:00.000Z" } };
      },
      productModelReader: (projectId) => ({ id: `model-${projectId}`, projectId, version: 2 }),
      truthReader: (projectId) => {
        scopedCalls.push(["truth", projectId]);
        return [{ id: "truth-b", projectId, statement: "B is cited", evidence: [{ source: "src/b.ts:7" }] }];
      },
      marketReader: (projectId) => {
        scopedCalls.push(["market", projectId]);
        return [{ id: "market-b", projectId }];
      },
      outcomeReader: (projectId) => [{ id: "outcome-b", projectId, joinKey: "join-b" }],
      implicationReader: (projectId) => [{ id: "implication-b", projectId }],
      feedbackReader: (projectId) => ({
        projectId,
        signals: [{ id: "signal-b", observedAt: "2026-07-10T11:00:00.000Z" }],
        decisions: [{ id: "decision-b", kind: "terrain.keep", createdAt: "2026-07-10T12:00:00.000Z" }],
      }),
      crewReader: (projectId) => [{ ref: "agent-b", projectId }],
      capabilityReader: () => ({ tools: [{ serverId: "search", toolName: "read" }], agents: [{ ref: "agent-a" }, { ref: "agent-b" }] }),
    });

    assert.deepEqual(workspaceCalls, ["workspace-b"]);
    assert.deepEqual(scopedCalls, [["truth", "project-b"], ["market", "project-b"]]);
    assert.equal(input.cwd, "/repo/b");
    assert.equal(input.scan.repo, "/repo/b");
    assert.equal(input.productModel.projectId, "project-b");
    assert.deepEqual(input.evidenceRecords, [{ id: "truth-b", projectId: "project-b", file: "src/b.ts", line: 7, text: "B is cited" }]);
    assert.deepEqual(input.marketRecords.map((record) => record.projectId), ["project-b"]);
    assert.deepEqual(input.joinedOutcomes.map((record) => record.projectId), ["project-b"]);
    assert.deepEqual(input.implications.map((record) => record.projectId), ["project-b"]);
    assert.deepEqual(input.crew.map((member) => member.projectId), ["project-b"]);
    assert.deepEqual(input.capabilities.agents, [{ ref: "agent-b" }]);
    assert.equal(input.latestFounderTerrainDecisionAt, "2026-07-10T12:00:00.000Z");
    assert.deepEqual(input.focusRef, { type: "question", id: "q-b" });
  });

  it("keeps missing optional project authorities honestly empty", () => {
    const input = terrainReadInputForProject("empty-project", {
      projectReader: ({ projectId }) => ({ id: projectId, sharedContext: { repository: {} } }),
      productModelReader: () => { throw new Error("missing model store"); },
      truthReader: () => { throw new Error("missing truth store"); },
      marketReader: () => { throw new Error("missing market store"); },
      outcomeReader: () => { throw new Error("missing outcomes"); },
      implicationReader: () => { throw new Error("missing implications"); },
      feedbackReader: () => { throw new Error("missing feedback"); },
      crewReader: () => { throw new Error("missing crew"); },
      capabilityReader: () => { throw new Error("missing capabilities"); },
    });
    assert.equal(input.scan, null);
    assert.equal(input.productModel, null);
    assert.deepEqual(input.evidenceRecords, []);
    assert.deepEqual(input.marketRecords, []);
    assert.deepEqual(input.joinedOutcomes, []);
    assert.deepEqual(input.implications, []);
    assert.deepEqual(input.crew, []);
    assert.equal(input.capabilities, null);
    assert.deepEqual(input.founderDecisions, []);
  });
});
