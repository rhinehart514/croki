// lens-routes.test.mjs — F6 acceptance: GET /api/ventures/:id/lens, PUT /api/ventures/:id/placement,
// and the portfolio door GET/POST /api/ventures. Mirrors the call-harness style of wall-routes.test.mjs.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { founderHeaders } from "../helpers/founder-capability.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "drover-lens-routes-"));
process.env.GTM_IDE_HOME = root;
process.env.GTM_IDE_PERSISTENCE = "json";

const { default: lensRoutes } = await import("../../src/firm/lens-routes.mjs");
const { createVenture } = await import("../../src/firm/venture-store.mjs");
const { listCrew } = await import("../../src/firm/crew.mjs");
const { createBet } = await import("../../src/firm/bet.mjs");
const { setVentureDoc } = await import("../../src/firm/venture-store.mjs");
const { park } = await import("../../src/firm/wall.mjs");

const options = { root };
const venture = createVenture({ name: "Route-guarded lens venture" }, options);

async function call(method, pathname, body = {}, headers = {}) {
  const req = Readable.from([JSON.stringify(body)]);
  req.method = method;
  req.url = pathname;
  req.headers = { "content-type": "application/json", ...founderHeaders({ method, path: pathname }), ...headers };
  let status = 0;
  let raw = "";
  const res = { writeHead(next) { status = next; }, setHeader() {}, end(next) { raw += next ?? ""; } };
  const handled = await lensRoutes({ req, res, url: new URL(pathname, "http://local") });
  assert.equal(handled, true, `route did not claim ${method} ${pathname}`);
  return { status, body: raw ? JSON.parse(raw) : null };
}

test.after(() => fs.rmSync(root, { recursive: true, force: true }));

test("GET the lens for a venture", async () => {
  const bet = createBet({ ventureId: venture.id, intent: "cold outbound to fintech ops" });
  setVentureDoc(venture.id, "bets", bet.id, bet, options);
  park({ ventureId: venture.id, betId: bet.id, effect: { kind: "send" } }, options);

  const res = await call("GET", `/api/ventures/${venture.id}/lens`);
  assert.equal(res.status, 200);
  assert.equal(res.body.lens.ventureId, venture.id);
  assert.ok(res.body.lens.bets.some((b) => b.id === bet.id));
  assert.equal(res.body.lens.wall.count, 1);
  assert.deepEqual(res.body.lens.placement, { positions: {}, revision: 0 });
});

test("GET the lens for an unknown venture 404s", async () => {
  const res = await call("GET", "/api/ventures/no-such-venture/lens");
  assert.equal(res.status, 404);
});

test("PUT placement persists and advances the revision", async () => {
  const res = await call("PUT", `/api/ventures/${venture.id}/placement`, {
    positions: { "bet:1": { x: 5, y: 5 } },
    expectedRevision: 0,
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.placement.revision, 1);
  assert.deepEqual(res.body.placement.positions, { "bet:1": { x: 5, y: 5 } });
});

test("PUT placement with a stale revision 409s", async () => {
  const res = await call("PUT", `/api/ventures/${venture.id}/placement`, {
    positions: { "bet:1": { x: 9, y: 9 } },
    expectedRevision: 0,
  });
  assert.equal(res.status, 409);
});

test("PUT placement for an unknown venture 404s", async () => {
  const res = await call("PUT", "/api/ventures/no-such-venture/placement", {
    positions: {},
    expectedRevision: 0,
  });
  assert.equal(res.status, 404);
});

test("GET /api/ventures lists the portfolio, ungated", async () => {
  const res = await call("GET", "/api/ventures");
  assert.equal(res.status, 200);
  assert.ok(res.body.ventures.some((v) => v.id === venture.id));
});

test("POST /api/ventures from an agent-stamped caller is refused", async () => {
  const res = await call("POST", "/api/ventures", { name: "Should not exist" }, { "x-gtm-actor": "agent" });
  assert.equal(res.status, 403);
});

test("the local Croki page can start a new venture without an unlock ceremony", async () => {
  const res = await call("POST", "/api/ventures", { name: "A new venture" });
  assert.equal(res.status, 200);
  assert.equal(res.body.venture.name, "A new venture");
  assert.ok(res.body.venture.id);

  const list = await call("GET", "/api/ventures");
  assert.ok(list.body.ventures.some((v) => v.id === res.body.venture.id));
});

test("a new founder venture opens with no fictional founding crew", async () => {
  const res = await call("POST", "/api/ventures", { name: "Crewless venture" });
  assert.equal(res.status, 200);
  // Product Law 1 / anti-laws: no permanent AI staff. The venture must not silently imply a pre-existing
  // crew; the first founder direction forms the first participant explicitly.
  assert.deepEqual(listCrew(res.body.venture.id, options), []);
});
