import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { founderHeaders } from "../helpers/founder-capability.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "drover-venture-routes-"));
process.env.GTM_IDE_HOME = root;
process.env.GTM_IDE_PERSISTENCE = "json";

const { default: ventureRoutes } = await import("../../src/firm/venture-routes.mjs");
const { createVenture } = await import("../../src/firm/venture-store.mjs");

async function call(pathname, remoteAddress = "127.0.0.1", headers = {}) {
  const req = Readable.from([]);
  req.method = "GET";
  req.url = pathname;
  req.headers = headers;
  Object.defineProperty(req, "socket", { value: { remoteAddress } });
  let status = 0;
  let raw = "";
  const res = { writeHead(next) { status = next; }, end(next) { raw += next ?? ""; } };
  const handled = await ventureRoutes({ req, res, url: new URL(pathname, "http://local") });
  assert.equal(handled, true);
  return { status, body: JSON.parse(raw) };
}

test.after(() => fs.rmSync(root, { recursive: true, force: true }));

test("local repository choices are bounded to the workspace and connected ventures", async () => {
  const connected = fs.mkdtempSync(path.join(os.tmpdir(), "drover-connected-repository-"));
  createVenture({ name: "Connected", repository: connected });

  const res = await call("/api/repositories");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.repositories, [
    { name: path.basename(process.cwd()), path: fs.realpathSync(process.cwd()), source: "workspace" },
    { name: path.basename(connected), path: fs.realpathSync(connected), source: "venture" },
  ]);
  fs.rmSync(connected, { recursive: true, force: true });
});

test("repository choices refuse a non-local peer", async () => {
  const res = await call("/api/repositories", "192.0.2.4");
  assert.equal(res.status, 403);
  assert.match(res.body.error, /only available from Croki on this Mac/i);
});

test("repository choices refuse a remote browser origin through a local proxy", async () => {
  const res = await call("/api/repositories", "127.0.0.1", { referer: "https://example.com/drover" });
  assert.equal(res.status, 403);
});

test("portfolio wall is founder-gated and withholds cross-venture data before proof", async () => {
  delete process.env.GTM_IDE_PORTFOLIO_PROOF_DATE;
  const pathname = "/api/portfolio/wall";
  const blocked = await call(pathname, "127.0.0.1", { "x-gtm-actor": "agent" });
  assert.equal(blocked.status, 403);

  const local = await call(pathname, "127.0.0.1", founderHeaders({ method: "GET", path: pathname }));
  assert.equal(local.status, 200);
  assert.equal(local.body.eligibility.status, "proof-required");
  assert.deepEqual(local.body.groups, []);
});

test("venture export fails closed before proof and unknown ventures 404 after proof", async () => {
  const missingPath = "/api/ventures/not-here/transfer";
  delete process.env.GTM_IDE_PORTFOLIO_PROOF_DATE;
  const proofBlocked = await call(missingPath, "127.0.0.1", founderHeaders({ method: "GET", path: missingPath }));
  assert.equal(proofBlocked.status, 409);
  assert.equal(proofBlocked.body.code, "portfolio_frontier_proof_required");

  process.env.GTM_IDE_PORTFOLIO_PROOF_DATE = "2026-07-14";
  const missing = await call(missingPath, "127.0.0.1", founderHeaders({ method: "GET", path: missingPath }));
  assert.equal(missing.status, 404);
  delete process.env.GTM_IDE_PORTFOLIO_PROOF_DATE;
});
