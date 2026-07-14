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

const root = fs.mkdtempSync(path.join(os.tmpdir(), "drover-wall-routes-"));
process.env.GTM_IDE_HOME = root;
process.env.GTM_IDE_PERSISTENCE = "json";

const { default: firmRoutes } = await import("../../src/firm/routes.mjs");
const { claimFounderSession, founderBootstrapCode } = await import("../../src/routes/session-guard.mjs");
const { createVenture } = await import("../../src/firm/venture-store.mjs");
const { park } = await import("../../src/firm/wall.mjs");
const { __resetPresence, markPresent } = await import("../../src/presence.mjs");

const options = { root };
const venture = createVenture({ name: "Route-guarded venture" }, options);
const other = createVenture({ name: "Other venture" }, options);

function browserCookie() {
  let value = "";
  claimFounderSession({ headers: {} }, { setHeader(_name, next) { value = next; } }, founderBootstrapCode());
  return value.split(";")[0];
}

async function call(method, pathname, body = {}, headers = {}) {
  const req = Readable.from([JSON.stringify(body)]);
  req.method = method;
  req.headers = { "content-type": "application/json", ...headers };
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

test("a tokenless decide POST is refused", async () => {
  const item = park({ ventureId: venture.id, effect: { kind: "send" } }, options);
  const res = await call("POST", `/api/ventures/${venture.id}/wall/${item.id}/decide`, { decision: "kill" });
  assert.equal(res.status, 403);
});

test("an agent-stamped decide POST is refused even with a founder cookie", async () => {
  const item = park({ ventureId: venture.id, effect: { kind: "send" } }, options);
  const res = await call(
    "POST",
    `/api/ventures/${venture.id}/wall/${item.id}/decide`,
    { decision: "kill" },
    { cookie: browserCookie(), "x-gtm-actor": "agent" },
  );
  assert.equal(res.status, 403);
});

test("cross-venture decide 404s — venture B's item cannot be decided under venture A's route", async () => {
  const item = park({ ventureId: other.id, effect: { kind: "send" } }, options);
  const res = await call(
    "POST",
    `/api/ventures/${venture.id}/wall/${item.id}/decide`,
    { decision: "kill" },
    { cookie: browserCookie() },
  );
  assert.equal(res.status, 404);
});

test("the authenticated founder browser can release an item through the route — the route wires a real executor", async () => {
  __resetPresence();
  markPresent("test");
  const item = park({ ventureId: venture.id, effect: { kind: "send", message: "shipped", to: "lead@example.com" } }, options);
  const res = await call(
    "POST",
    `/api/ventures/${venture.id}/wall/${item.id}/decide`,
    { decision: "release" },
    { cookie: browserCookie() },
  );
  // The route now wires decideWithExecution -> a real executor (effect-executors.mjs), so a release
  // actually reaches message-send.mjs instead of throwing "cannot release without an executeEffect
  // executor". No Gmail credential is connected in this test venture, so the SEND itself refuses
  // honestly (executionError, never a throw) — proving the executor was truly invoked, not merely
  // present.
  assert.equal(res.status, 200);
  assert.equal(res.body.receipt.decision, "release");
  assert.ok(res.body.receipt.releasedAt);
  assert.equal(res.body.receipt.executionResult.ok, false);
  assert.match(res.body.receipt.executionResult.executionError, /No connected Gmail account/i);
});

test("the authenticated founder browser can kill an item through the route", async () => {
  const { createBet } = await import("../../src/firm/bet.mjs");
  const { setVentureDoc, getVentureDoc } = await import("../../src/firm/venture-store.mjs");
  const bet = createBet({ ventureId: venture.id, intent: "cold outbound to fintech ops" });
  setVentureDoc(venture.id, "bets", bet.id, bet, options);
  const item = park({ ventureId: venture.id, betId: bet.id, effect: { kind: "kill-proposal" } }, options);

  const res = await call(
    "POST",
    `/api/ventures/${venture.id}/wall/${item.id}/decide`,
    { decision: "kill", note: "cold list, no signal" },
    { cookie: browserCookie() },
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
    { cookie: browserCookie() },
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
    { cookie: browserCookie() },
  );
  assert.equal(res.status, 409);
  assert.match(res.body.error, /second explicit founder authorization/i);

  // Authorize, then release — now it reaches the real executor. "deploy" is not itself a recognized
  // effect kind in effect-executors.mjs's switch (only "product-change"/"message"/"send" are), so this
  // proves the executor was truly invoked (not stubbed) via its own honest unrecognized-kind refusal.
  await call(
    "POST",
    `/api/ventures/${venture.id}/wall/${item.id}/decide`,
    { decision: "authorize-deploy" },
    { cookie: browserCookie() },
  );
  const released = await call(
    "POST",
    `/api/ventures/${venture.id}/wall/${item.id}/decide`,
    { decision: "release" },
    { cookie: browserCookie() },
  );
  assert.equal(released.status, 400);
  assert.match(released.body.error, /No executor is wired for effect kind "deploy"/);
});

test("self-approval is still refused through the real route — tokenless and agent-stamped release both fail before the executor", async () => {
  const item = park({ ventureId: venture.id, effect: { kind: "send", message: "hi" } }, options);
  const tokenless = await call("POST", `/api/ventures/${venture.id}/wall/${item.id}/decide`, { decision: "release" });
  assert.equal(tokenless.status, 403);
  const agentStamped = await call(
    "POST",
    `/api/ventures/${venture.id}/wall/${item.id}/decide`,
    { decision: "release" },
    { cookie: browserCookie(), "x-gtm-actor": "agent" },
  );
  assert.equal(agentStamped.status, 403);
  // Still queued — neither caller reached the executor.
  const stillQueued = (await call("GET", `/api/ventures/${venture.id}/wall`)).body.queue;
  assert.ok(stillQueued.some((entry) => entry.id === item.id));
});
