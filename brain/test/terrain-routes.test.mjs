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
const { createTerrainRoutes } = await import("../src/routes/terrain.mjs");
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

  it("leaves POST terrain reading explicitly unconnected until Lane A is injected", async () => {
    const projectId = (await (await fetch(`${base}/api/projects`)).json()).activeProjectId;
    const response = await fetch(`${base}/api/projects/${projectId}/terrain/read`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "fixture-model" }),
    });
    assert.equal(response.status, 501);
    assert.match((await response.json()).error, /not connected/);
  });

  it("exposes the injected POST seam without changing deterministic GET", async () => {
    const handler = createTerrainRoutes({
      runTerrainRead: async ({ projectId, model, focusRef }) => ({
        schemaVersion: 1,
        id: "injected-read",
        projectId,
        generatedAt: "2026-07-10T00:00:00.000Z",
        inputFingerprint: "fixture",
        runtime: { id: "fixture", model },
        focusRef,
        hypotheses: [],
      }),
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
      assert.deepEqual(read.focusRef, { type: "question", id: "q-1" });
    } finally {
      injectedServer.closeAllConnections?.();
      await new Promise((resolve) => injectedServer.close(resolve));
    }
  });
});
