// wall-routes.test.mjs — F3 acceptance: the HTTP surface. GET /api/ventures/:id/wall,
// POST /api/ventures/:id/wall/:item/decide — founder-gated, agent-stamped callers rejected,
// cross-venture 404s. Mirrors the call-harness style of founder-authority-route-guards.test.mjs and
// presence-route-auth.test.mjs (a Readable request body, a writeHead/end res double).

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { founderHeaders } from "../helpers/founder-capability.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "drover-wall-routes-"));
process.env.GTM_IDE_HOME = root;
process.env.GTM_IDE_PERSISTENCE = "json";

const { default: firmRoutes } = await import("../../src/firm/routes.mjs");
const { createVenture } = await import("../../src/firm/venture-store.mjs");
const { park } = await import("../../src/firm/wall.mjs");
const { __resetPresence, markPresent } = await import("../../src/presence.mjs");

const options = { root };
const venture = createVenture({ name: "Route-guarded venture" }, options);
const other = createVenture({ name: "Other venture" }, options);

async function call(method, pathname, body = {}, headers = {}) {
  const req = Readable.from([JSON.stringify(body)]);
  req.method = method;
  req.url = pathname;
  req.headers = { "content-type": "application/json", ...founderHeaders({ method, path: pathname }), ...headers };
  let status = 0;
  let raw = "";
  const res = { writeHead(next) { status = next; }, setHeader() {}, end(next) { raw += next ?? ""; } };
  const handled = await firmRoutes({ req, res, url: new URL(pathname, "http://local") });
  assert.equal(handled, true, `route did not claim ${method} ${pathname}`);
  return { status, body: raw ? JSON.parse(raw) : null };
}

test.after(() => fs.rmSync(root, { recursive: true, force: true }));

test("GET the wall queue for a venture", async () => {
  const item = park({ ventureId: venture.id, effect: { kind: "send", message: "hi" } }, options);
  const res = await call("GET", `/api/ventures/${venture.id}/wall`);
  assert.equal(res.status, 200);
  assert.ok(res.body.queue.some((entry) => entry.id === item.id));
});

test("a local page decide POST does not need an unlock session", async () => {
  const item = park({ ventureId: venture.id, effect: { kind: "send" } }, options);
  const res = await call("POST", `/api/ventures/${venture.id}/wall/${item.id}/decide`, { decision: "reject" });
  assert.equal(res.status, 200);
  assert.equal(res.body.receipt.decision, "reject");
});

test("an agent-stamped decide POST is refused", async () => {
  const item = park({ ventureId: venture.id, effect: { kind: "send" } }, options);
  const res = await call(
    "POST",
    `/api/ventures/${venture.id}/wall/${item.id}/decide`,
    { decision: "kill" },
    { "x-gtm-actor": "agent" },
  );
  assert.equal(res.status, 403);
});

test("cross-venture decide 404s — venture B's item cannot be decided under venture A's route", async () => {
  const item = park({ ventureId: other.id, effect: { kind: "send" } }, options);
  const res = await call(
    "POST",
    `/api/ventures/${venture.id}/wall/${item.id}/decide`,
    { decision: "kill" },
    {},
  );
  assert.equal(res.status, 404);
});

test("the local founder page can release an item through the route — the route wires a real executor", async () => {
  __resetPresence();
  markPresent("test");
  const item = park({ ventureId: venture.id, effect: { kind: "send", message: "shipped", to: "lead@example.com" } }, options);
  const res = await call(
    "POST",
    `/api/ventures/${venture.id}/wall/${item.id}/decide`,
    { decision: "release" },
    {},
  );
  // The route now wires decideWithExecution -> a real executor (effect-executors.mjs), so a release
  // actually reaches message-send.mjs instead of throwing "cannot release without an executeEffect
  // executor". No Gmail credential is connected in this test venture, so the SEND fails honestly — and
  // a failed send is NOT recorded as a completed release: the route reports 502 and the item stays
  // queued for the founder to reconnect and retry, never a fake success.
  assert.equal(res.status, 502);
  assert.match(res.body.error, /No connected Gmail account/i);
  const stillQueued = (await call("GET", `/api/ventures/${venture.id}/wall`)).body.queue;
  const failed = stillQueued.find((entry) => entry.id === item.id);
  assert.ok(failed, "a failed send stays queued for retry, never consumed as released");
  assert.equal(failed.decision, null);
  assert.match(failed.lastExecutionError, /No connected Gmail account/i);
});

test("the local founder page can kill an item through the route", async () => {
  const { createBet } = await import("../../src/firm/bet.mjs");
  const { setVentureDoc, getVentureDoc } = await import("../../src/firm/venture-store.mjs");
  const bet = createBet({ ventureId: venture.id, intent: "cold outbound to fintech ops" });
  setVentureDoc(venture.id, "bets", bet.id, bet, options);
  const item = park({ ventureId: venture.id, betId: bet.id, effect: { kind: "kill-proposal" } }, options);

  const res = await call(
    "POST",
    `/api/ventures/${venture.id}/wall/${item.id}/decide`,
    { decision: "kill", note: "cold list, no signal" },
    {},
  );
  assert.equal(res.status, 200);
  assert.equal(res.body.receipt.decision, "kill");
  const ended = getVentureDoc(venture.id, "bets", bet.id, options);
  assert.ok(ended.endedAt);
  assert.equal(ended.endedBy, "founder");
});

// The three gates below prove the real executor wiring (decideWithExecution) never loosened anything
// wall.decide() already enforces: away still holds a release before the executor is ever reached,
// deploy still needs its second explicit act, and self-approval is still refused — now exercised
// through the SAME route a real founder browser calls, not a bench test of wall.mjs in isolation.

test("away still holds a release through the real route — the executor is never reached", async () => {
  __resetPresence(); // fresh reset -> away (no heartbeat yet)
  const item = park({ ventureId: venture.id, effect: { kind: "send", message: "hi", to: "lead@example.com" } }, options);
  const res = await call(
    "POST",
    `/api/ventures/${venture.id}/wall/${item.id}/decide`,
    { decision: "release" },
    {},
  );
  assert.equal(res.status, 409);
  assert.match(res.body.error, /away/i);
  // Confirm the item is still queued — no execution, no partial release.
  const stillQueued = (await call("GET", `/api/ventures/${venture.id}/wall`)).body.queue;
  assert.ok(stillQueued.some((entry) => entry.id === item.id));
});

test("deploy still needs its second explicit act through the real route — release refuses without it", async () => {
  __resetPresence();
  markPresent("test");
  const item = park({ ventureId: venture.id, effect: { kind: "deploy", diff: "d1", environment: "prod" } }, options);
  const res = await call(
    "POST",
    `/api/ventures/${venture.id}/wall/${item.id}/decide`,
    { decision: "release" },
    {},
  );
  assert.equal(res.status, 409);
  assert.match(res.body.error, /second explicit founder authorization/i);

  // Authorize, then release — now it reaches the real executor. The deploy branch exists and is
  // fail-closed: no deploy provider is configured for this venture, so it returns an honest ok:false.
  // decide() refuses to record that as a completed release — the route reports 502 and the deploy
  // stays queued, never a fake success and never a dead "unrecognized kind" throw.
  await call(
    "POST",
    `/api/ventures/${venture.id}/wall/${item.id}/decide`,
    { decision: "authorize-deploy" },
    {},
  );
  const released = await call(
    "POST",
    `/api/ventures/${venture.id}/wall/${item.id}/decide`,
    { decision: "release" },
    {},
  );
  assert.equal(released.status, 502);
  assert.match(released.body.error, /No deploy provider is configured/);
  const stillQueued = (await call("GET", `/api/ventures/${venture.id}/wall`)).body.queue;
  assert.ok(stillQueued.some((entry) => entry.id === item.id), "the unshipped deploy stays queued");
});

test("self-approval is still refused through the real route — agent-stamped release fails before the executor", async () => {
  const item = park({ ventureId: venture.id, effect: { kind: "send", message: "hi" } }, options);
  const agentStamped = await call(
    "POST",
    `/api/ventures/${venture.id}/wall/${item.id}/decide`,
    { decision: "release" },
    { "x-gtm-actor": "agent" },
  );
  assert.equal(agentStamped.status, 403);
  // Still queued — the agent caller never reached the executor.
  const stillQueued = (await call("GET", `/api/ventures/${venture.id}/wall`)).body.queue;
  assert.ok(stillQueued.some((entry) => entry.id === item.id));
});
