// presence-route-auth.test.mjs — EXPERIMENT-MACHINE-SPEC rail 1, FIX 2c: the presence WRITE is founder-
// authenticated. Marking "present" REMOVES the away-hold (it lets a standing pattern auto-approve a
// possibly-outward item unattended), so it must carry the founder browser session — a raw/tokenless or
// agent-stamped POST cannot drop the hold. Marking AWAY only ADDS a hold, so it stays open. The GET (the
// indicator read) removes no hold and stays open.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "drover-presence-auth-"));
process.env.GTM_IDE_HOME = root;
process.env.GTM_IDE_PERSISTENCE = "json";

const { default: presenceRoutes } = await import("../src/routes/presence.mjs");
const { claimFounderSession, founderBootstrapCode } = await import("../src/routes/session-guard.mjs");
const { getPresence, __resetPresence } = await import("../src/presence.mjs");

function browserCookie() {
  let value = "";
  claimFounderSession({ headers: {} }, { setHeader(_name, next) { value = next; } }, founderBootstrapCode());
  return value.split(";")[0];
}

async function call(method, body = {}, headers = {}) {
  const req = Readable.from([JSON.stringify(body)]);
  req.method = method;
  req.headers = { "content-type": "application/json", ...headers };
  let status = 0;
  let raw = "";
  const res = {
    writeHead() {},
    setHeader() {},
    end(next) { raw += next ?? ""; },
  };
  // json() uses res.end(status?) — mirror server's json helper shape: it calls res.writeHead + res.end.
  res.writeHead = (next) => { status = next; };
  const handled = await presenceRoutes({ req, res, url: new URL("/api/presence", "http://local") });
  return { handled, status, body: raw ? JSON.parse(raw) : null };
}

test.after(() => fs.rmSync(root, { recursive: true, force: true }));

test("a tokenless POST cannot mark the founder present — the away-hold is not dropped", async () => {
  __resetPresence();
  const before = getPresence();
  assert.equal(before.present, false, "starts away (conservative default)");

  const res = await call("POST", {} /* heartbeat */);
  assert.equal(res.status, 403, "a tokenless heartbeat is refused");
  assert.equal(getPresence().present, false, "still away — the safety hold was not dropped");
});

test("an agent-stamped POST cannot mark the founder present", async () => {
  __resetPresence();
  const res = await call("POST", {}, { cookie: browserCookie(), "x-gtm-actor": "agent" });
  assert.equal(res.status, 403, "even with a cookie, an agent-stamped heartbeat is refused");
  assert.equal(getPresence().present, false);
});

test("the authenticated founder browser CAN mark present", async () => {
  __resetPresence();
  const res = await call("POST", {}, { cookie: browserCookie() });
  assert.equal(res.status, 200);
  assert.equal(getPresence().present, true, "the founder browser heartbeat marks present");
});

test("marking AWAY is always allowed — a caller can only make the system MORE conservative", async () => {
  __resetPresence();
  // Mark present with the founder cookie first.
  await call("POST", {}, { cookie: browserCookie() });
  assert.equal(getPresence().present, true);
  // A tokenless { away: true } is allowed (it adds a hold, never removes one).
  const res = await call("POST", { away: true });
  assert.equal(res.status, 200);
  assert.equal(getPresence().present, false, "away dropped the founder to the held state");
});

test("the GET indicator read stays open (removes no hold)", async () => {
  __resetPresence();
  const req = Readable.from([""]);
  req.method = "GET";
  req.headers = {};
  let status = 0; let raw = "";
  const res = { writeHead(n) { status = n; }, setHeader() {}, end(n) { raw += n ?? ""; } };
  await presenceRoutes({ req, res, url: new URL("/api/presence", "http://local") });
  assert.equal(status, 200);
  assert.equal(JSON.parse(raw).state, "away");
});
