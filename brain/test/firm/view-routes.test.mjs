// view-routes.test.mjs — the saved-views HTTP seam (Law 12). Mirrors the call-harness style of
// lens-routes.test.mjs: founder writes carry a host capability; reads are ungated; cross-venture and
// unknown-venture refs fail closed with real status codes.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { founderHeaders } from "../helpers/founder-capability.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "drover-view-routes-"));
process.env.GTM_IDE_HOME = root;
process.env.GTM_IDE_PERSISTENCE = "json";

const { default: viewRoutes } = await import("../../src/firm/view-routes.mjs");
const { createVenture, setVentureDoc } = await import("../../src/firm/venture-store.mjs");

const options = { root };
const venture = createVenture({ name: "Route-guarded views venture" }, options);
setVentureDoc(venture.id, "bets", "bet-a", { id: "bet-a", ventureId: venture.id, intent: "ship a" }, options);
setVentureDoc(venture.id, "outcomes", "outcome-1", { id: "outcome-1", ventureId: venture.id, body: "real reply" }, options);

async function call(method, pathname, body = {}, headers = {}) {
  const req = Readable.from([JSON.stringify(body)]);
  req.method = method;
  req.url = pathname;
  req.headers = { "content-type": "application/json", ...founderHeaders({ method, path: pathname }), ...headers };
  let status = 0;
  let raw = "";
  const res = { writeHead(next) { status = next; }, setHeader() {}, end(next) { raw += next ?? ""; } };
  const handled = await viewRoutes({ req, res, url: new URL(pathname, "http://local") });
  assert.equal(handled, true, `route did not claim ${method} ${pathname}`);
  return { status, body: raw ? JSON.parse(raw) : null };
}

test.after(() => fs.rmSync(root, { recursive: true, force: true }));

test("POST saves a live view, GET reopens it with the arrangement + scope (no positions)", async () => {
  const saved = await call("POST", `/api/ventures/${venture.id}/views`, {
    kind: "live",
    name: "Bets in flight",
    arrangement: "orbital-atlas",
    rootRefs: ["bet:bet-a", "outcome:outcome-1"],
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.view.kind, "live");
  assert.equal(JSON.stringify(saved.body.view).includes("position"), false);

  const reopened = await call("GET", `/api/ventures/${venture.id}/views/${saved.body.view.id}`);
  assert.equal(reopened.status, 200);
  assert.equal(reopened.body.reopened.arrangement, "orbital-atlas");
  assert.deepEqual(reopened.body.reopened.rootRefs, ["bet:bet-a", "outcome:outcome-1"]);

  const listed = await call("GET", `/api/ventures/${venture.id}/views`);
  assert.equal(listed.status, 200);
  assert.ok(listed.body.views.some((v) => v.id === saved.body.view.id));
});

test("POST captures a snapshot that fails visibly once a pinned ref drifts", async () => {
  const captured = await call("POST", `/api/ventures/${venture.id}/views`, {
    kind: "snapshot",
    name: "How it looked",
    rootRefs: ["outcome:outcome-1"],
  });
  assert.equal(captured.status, 200);
  assert.equal(captured.body.view.kind, "snapshot");

  const intact = await call("GET", `/api/ventures/${venture.id}/views/${captured.body.view.id}`);
  assert.equal(intact.body.reopened.intact, true);

  setVentureDoc(venture.id, "outcomes", "outcome-1", { id: "outcome-1", ventureId: venture.id, body: "changed" }, options);
  const drifted = await call("GET", `/api/ventures/${venture.id}/views/${captured.body.view.id}`);
  assert.equal(drifted.body.reopened.intact, false);
  assert.deepEqual(drifted.body.reopened.stale, [{ ref: "outcome:outcome-1", state: "stale" }]);
});

test("a founder capability is required to save a view", async () => {
  const req = Readable.from([JSON.stringify({ name: "No auth", arrangement: "orbital-atlas", rootRefs: ["bet:bet-a"] })]);
  req.method = "POST";
  req.url = `/api/ventures/${venture.id}/views`;
  req.headers = { "content-type": "application/json", "x-gtm-actor": "agent" };
  let status = 0;
  let raw = "";
  const res = { writeHead(next) { status = next; }, setHeader() {}, end(next) { raw += next ?? ""; } };
  await viewRoutes({ req, res, url: new URL(req.url, "http://local") });
  assert.equal(status, 403, "an agent cannot save a founder view");
});

test("a cross-venture ref fails closed with a 404", async () => {
  const res = await call("POST", `/api/ventures/${venture.id}/views`, {
    kind: "live",
    name: "Steal",
    arrangement: "orbital-atlas",
    rootRefs: ["bet:bet-does-not-exist"],
  });
  assert.equal(res.status, 404);
});

test("an unknown venture 404s", async () => {
  const res = await call("GET", "/api/ventures/no-such-venture/views");
  assert.equal(res.status, 404);
});

test("DELETE removes a saved view; POST promotes a finding with source-view provenance", async () => {
  const saved = await call("POST", `/api/ventures/${venture.id}/views`, {
    kind: "live", name: "Temp", arrangement: "orbital-atlas", rootRefs: ["bet:bet-a"],
  });
  const finding = await call("POST", `/api/ventures/${venture.id}/findings`, {
    viewId: saved.body.view.id,
    statement: "a and its reply cohere.",
    subjectRefs: ["bet:bet-a"],
    condition: "established",
  });
  assert.equal(finding.status, 200);
  assert.equal(finding.body.finding.provenance.sourceViewRef, `view:${saved.body.view.id}`);
  assert.equal(finding.body.finding.condition, "established", "a founder-route promotion can establish");

  const del = await call("DELETE", `/api/ventures/${venture.id}/views/${saved.body.view.id}`);
  assert.equal(del.status, 200);
  assert.equal(del.body.deleted, true);
  const gone = await call("DELETE", `/api/ventures/${venture.id}/views/${saved.body.view.id}`);
  assert.equal(gone.status, 404);
});
