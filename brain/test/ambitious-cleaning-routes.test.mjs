import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "ambitious-cleaning-routes-"));
const REPO = path.join(HOME, "approved-repo");
fs.mkdirSync(path.join(REPO, "stray", "research"), { recursive: true });
fs.writeFileSync(path.join(REPO, "stray", "research", "verified-account-footprint.csv"), "domain,confidence\na.test,verified\nb.test,verified\n");
process.env.GTM_IDE_HOME = HOME;
process.env.GTM_IDE_PERSISTENCE = "json";
process.env.GTM_IDE_FOUNDER_CODE = "ambitious-founder";
process.env.HOST = "127.0.0.1";
delete process.env.GTM_IDE_ENABLE_LEGACY_MACHINERY;

const probe = net.createServer();
probe.listen(0, "127.0.0.1");
await once(probe, "listening");
process.env.PORT = String(probe.address().port);
await new Promise((resolve) => probe.close(resolve));

const { createProject, updateSharedContext } = await import("../src/project-store.mjs");
const { createWorkArtifact, listWorkArtifacts, loadWorkArtifactStore } = await import("../src/work-artifact-store.mjs");
const { gtmPathStore, runStore } = await import("../src/gtm-store.mjs");
const { server } = await import("../src/server.mjs");
if (!server.listening) await once(server, "listening");
const BASE = `http://127.0.0.1:${process.env.PORT}`;

createProject({ id: "ambitious", name: "Ambitious" });
updateSharedContext({ repository: { repo: REPO, outcome: "customer_won" } }, { projectId: "ambitious" });

after(async () => {
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(HOME, { recursive: true, force: true });
});
async function cookie() {
  const response = await fetch(`${BASE}/api/founder-session`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: "ambitious-founder" }),
  });
  return (response.headers.get("set-cookie") ?? "").match(/gtm_session=[^;]+/)?.[0] ?? "";
}

async function post(url, body, founderCookie = "") {
  const response = await fetch(`${BASE}${url}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(founderCookie ? { cookie: founderCookie } : {}) },
    body: JSON.stringify(body),
  });
  return { response, payload: await response.json() };
}

describe("ambitious cleaning active routes", () => {
  it("scouts read-only, requires founder confirmation, and promotes evidence as ordinary canvas work", async () => {
    const discovered = await post("/api/projects/ambitious/context/discover", { question: "Do we have an installed base to displace?" });
    assert.equal(discovered.response.status, 200);
    assert.equal(discovered.payload.candidates[0].shape.rows, 2);
    assert.equal(listWorkArtifacts("ambitious").length, 0, "discovery persisted nothing");

    const denied = await post("/api/projects/ambitious/context/promote", {
      candidate: discovered.payload.candidates[0], expectedStoreRevision: discovered.payload.workArtifactStoreRevision,
    });
    assert.equal(denied.response.status, 403);

    const promoted = await post("/api/projects/ambitious/context/promote", {
      candidate: discovered.payload.candidates[0],
      expectedStoreRevision: discovered.payload.workArtifactStoreRevision,
      idempotencyKey: "accept-context-route",
    }, await cookie());
    assert.equal(promoted.response.status, 201);
    assert.equal(promoted.payload.artifact.kind, "context-evidence");
    assert.equal(promoted.payload.artifact.status, "accepted");
  });

  it("greenlights into the flow store only", async () => {
    const artifact = createWorkArtifact("ambitious", {
      id: "route-experiment",
      kind: "experiment-proposal",
      status: "proposed",
      content: { intent: "Test an incumbent migration offer." },
      expectedStoreRevision: loadWorkArtifactStore("ambitious").revision,
      createdBy: { type: "founder", id: "founder" },
      idempotencyKey: "route-experiment-create",
    });
    const greenlit = await post(`/api/projects/ambitious/work-artifacts/${artifact.artifactId}/greenlight`, {
      expectedArtifactRevision: artifact.revision,
      idempotencyKey: "route-experiment-greenlight",
    }, await cookie());

    assert.equal(greenlit.response.status, 201);
    assert.equal(greenlit.payload.artifact.status, "greenlit");
    assert.ok(greenlit.payload.flow.id);
    assert.ok(greenlit.payload.run.id);
    assert.equal(gtmPathStore.list({ projectId: "ambitious" }).length, 0);
    assert.equal(runStore.list({ projectId: "ambitious" }).length, 0);
  });

  it("keeps retired machinery out of the default product surface", async () => {
    const semanticGraph = await fetch(`${BASE}/api/projects/ambitious/object-graph`);
    assert.equal(semanticGraph.status, 410);
    for (const route of ["/api/signal-weights", "/api/reallocation", "/api/projects/ambitious/operation-plan"]) {
      const response = await fetch(`${BASE}${route}`);
      assert.equal(response.status, 404, route);
    }
  });
});
