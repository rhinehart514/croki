import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";

import { founderHeaders } from "../helpers/founder-capability.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "drover-portfolio-routes-"));
process.env.GTM_IDE_HOME = root;
process.env.GTM_IDE_PERSISTENCE = "json";

const { default: ventureRoutes } = await import("../../src/firm/venture-routes.mjs");
const { PORTFOLIO_PROOF_ENV } = await import("../../src/firm/portfolio-frontier.mjs");
const { createVenture, openVenture } = await import("../../src/firm/venture-store.mjs");
const { createVentureTransfer } = await import("../../src/firm/venture-transfer.mjs");
const { park } = await import("../../src/firm/wall.mjs");

function directory(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

async function call(method, pathname, body = null, { headers = {}, authorized = true } = {}) {
  const req = Readable.from(body == null ? [] : [JSON.stringify(body)]);
  req.method = method;
  req.url = pathname;
  req.headers = {
    ...(body == null ? {} : { "content-type": "application/json" }),
    ...(authorized ? founderHeaders({ method, path: pathname }) : {}),
    ...headers,
  };
  Object.defineProperty(req, "socket", { value: { remoteAddress: "127.0.0.1" } });
  let status = 0;
  let raw = "";
  const responseHeaders = {};
  const res = {
    setHeader(name, value) { responseHeaders[name.toLowerCase()] = value; },
    writeHead(next, nextHeaders = {}) {
      status = next;
      for (const [name, value] of Object.entries(nextHeaders)) responseHeaders[name.toLowerCase()] = value;
    },
    end(next) { raw += next ?? ""; },
  };
  const handled = await ventureRoutes({ req, res, url: new URL(pathname, "http://local") });
  assert.equal(handled, true);
  return { status, headers: responseHeaders, body: raw ? JSON.parse(raw) : null };
}

test.after(() => {
  delete process.env[PORTFOLIO_PROOF_ENV];
  fs.rmSync(root, { recursive: true, force: true });
});

test("portfolio wall is founder-authorized and withholds all groups before outside-founder proof", async () => {
  delete process.env[PORTFOLIO_PROOF_ENV];
  const gated = await call("GET", "/api/portfolio/wall");
  assert.equal(gated.status, 200);
  assert.equal(gated.body.eligibility.status, "proof-required");
  assert.deepEqual(gated.body.groups, []);

  const unstamped = await call("GET", "/api/portfolio/wall", null, { authorized: false });
  assert.equal(unstamped.status, 403);
  const agent = await call("GET", "/api/portfolio/wall", null, { headers: { "x-gtm-actor": "agent" } });
  assert.equal(agent.status, 403);
});

test("an activated portfolio wall returns a read-only venture-grouped pending projection", async () => {
  process.env[PORTFOLIO_PROOF_ENV] = "2026-07-14";
  const venture = createVenture({ name: "Route wall venture", repository: directory("drover-route-wall-repo-") });
  const item = park({ ventureId: venture.id, effect: { kind: "send", message: "Review me" } });

  const response = await call("GET", "/api/portfolio/wall");
  assert.equal(response.status, 200);
  assert.equal(response.body.eligibility.status, "eligible");
  assert.deepEqual(response.body.groups[0].venture, { id: venture.id, name: venture.name });
  assert.equal(response.body.groups[0].items[0].id, item.id);
  assert.equal(response.body.groups[0].items[0].context.ventureId, venture.id);
});

test("transfer export is an authorized, proof-gated file with a cross-venture 404", async () => {
  process.env[PORTFOLIO_PROOF_ENV] = "2026-07-14";
  const venture = createVenture({ name: "Movable venture", repository: directory("drover-route-export-repo-") });
  const exported = await call("GET", `/api/ventures/${venture.id}/transfer`);
  assert.equal(exported.status, 200);
  assert.equal(exported.body.transfer.format, "drover-venture-transfer");
  assert.equal(exported.body.transfer.venture.manifest.id, venture.id);
  assert.match(exported.headers["content-disposition"], /^attachment; filename="movable-venture\.drover\.json"$/);

  const missing = await call("GET", "/api/ventures/not-this-venture/transfer");
  assert.equal(missing.status, 404);
  assert.equal(missing.body.code, "venture_not_found");
});

test("transfer import requires destination rebind and refuses cross-venture content before writing", async () => {
  process.env[PORTFOLIO_PROOF_ENV] = "2026-07-14";
  const sourceRoot = directory("drover-route-import-source-");
  const sourceVenture = createVenture(
    { name: "Imported venture", repository: directory("drover-route-import-source-repo-") },
    { root: sourceRoot },
  );
  const transfer = createVentureTransfer(sourceVenture.id, { root: sourceRoot });

  const missingRebind = await call("POST", "/api/ventures/import", { transfer });
  assert.equal(missingRebind.status, 400);
  assert.equal(missingRebind.body.code, "venture_repository_rebind_required");

  const tampered = structuredClone(transfer);
  tampered.venture.documents.bets.push({
    id: "foreign-bet",
    ventureId: "foreign-venture",
    intent: "cross scope",
  });
  const destinationRepository = directory("drover-route-import-destination-repo-");
  const rejected = await call("POST", "/api/ventures/import", {
    transfer: tampered,
    repository: destinationRepository,
  });
  assert.equal(rejected.status, 404);
  assert.equal(rejected.body.code, "venture_transfer_cross_scope");
  assert.equal(openVenture(sourceVenture.id), null);

  const imported = await call("POST", "/api/ventures/import", {
    transfer,
    repository: destinationRepository,
  });
  assert.equal(imported.status, 200);
  assert.equal(imported.body.venture.id, sourceVenture.id);
  assert.equal(imported.body.venture.repository, fs.realpathSync(destinationRepository));
  assert.equal(imported.body.receipt.providerResume, "cold");
});
