import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { founderHeaders } from "../helpers/founder-capability.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "drover-workspace-routes-"));
process.env.GTM_IDE_HOME = root;
process.env.GTM_IDE_PERSISTENCE = "json";
const { default: systemRoutes } = await import("../../src/firm/system-routes.mjs");
const { default: releaseRoutes } = await import("../../src/firm/release-routes.mjs");
const { createVenture } = await import("../../src/firm/venture-store.mjs");
const venture = createVenture({ name: "Workspace routes" }, { root, seedFoundingCrew: false });
const other = createVenture({ name: "Other workspace" }, { root, seedFoundingCrew: false });

async function call(method, pathname, body = {}, headers = {}) {
  const req = Readable.from([JSON.stringify(body)]); req.method = method; req.url = pathname;
  req.headers = { "content-type": "application/json", ...founderHeaders({ method, path: pathname }), ...headers };
  let status = 0; let raw = "";
  const res = { writeHead(next) { status = next; }, setHeader() {}, end(next) { raw += next ?? ""; } };
  const args = { req, res, url: new URL(pathname, "http://local") };
  const handled = pathname.includes("/releases") ? await releaseRoutes(args) : await systemRoutes(args);
  assert.equal(handled, true);
  return { status, body: raw ? JSON.parse(raw) : null };
}

test.after(() => fs.rmSync(root, { recursive: true, force: true }));

test("system and release reads are venture-scoped while signed founder writes succeed", async () => {
  const systemPath = `/api/ventures/${venture.id}/system/mutations`;
  const createdObject = await call("POST", systemPath, { baseRevision: 0, mutations: [{ op: "create-object", id: "product", name: "Fast setup", statement: "Reach value sooner.", territory: "product" }] });
  assert.equal(createdObject.status, 200);
  const releasePath = `/api/ventures/${venture.id}/releases`;
  const createdRelease = await call("POST", releasePath, { baseRevision: createdObject.body.systemIndex.revision, release: { id: "release-one", name: "Setup release", objectRef: "object:product", linkLabel: "Product delta" } });
  assert.equal(createdRelease.status, 201);
  assert.deepEqual((await call("GET", releasePath)).body.releaseIndex.releases[0].relatedObjectRefs, ["object:product"]);
  assert.equal((await call("GET", `/api/ventures/${other.id}/releases`)).body.releaseIndex.releases.length, 0);
});

test("forged agent writes, stale revisions, and cross-venture references fail closed", async () => {
  const systemPath = `/api/ventures/${venture.id}/system/mutations`;
  const forged = await call("POST", systemPath, { baseRevision: 0, mutations: [{ op: "create-object", name: "Forged", territory: "gtm" }] }, { "x-gtm-actor": "agent" });
  assert.equal(forged.status, 403);
  const stale = await call("POST", systemPath, { baseRevision: 0, mutations: [{ op: "create-object", name: "Stale", territory: "gtm" }] });
  assert.equal(stale.status, 409);
  const otherObject = await call("POST", `/api/ventures/${other.id}/system/mutations`, { baseRevision: 0, mutations: [{ op: "create-object", id: "foreign", name: "Foreign", territory: "gtm" }] });
  assert.equal(otherObject.status, 200);
  const current = (await call("GET", `/api/ventures/${venture.id}/system-index`)).body.systemIndex;
  const crossed = await call("POST", systemPath, { baseRevision: current.revision, mutations: [{ op: "create-relationship", fromRef: "object:product", toRef: "object:foreign", label: "must not cross" }] });
  assert.equal(crossed.status, 404);
  const releaseIndex = (await call("GET", `/api/ventures/${venture.id}/releases`)).body.releaseIndex;
  const forgedRelease = await call("POST", `/api/ventures/${venture.id}/releases`, { baseRevision: releaseIndex.revision, release: { name: "Forged release" } }, { "x-gtm-actor": "agent" });
  assert.equal(forgedRelease.status, 403);
});
