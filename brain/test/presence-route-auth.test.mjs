// presence-route-auth.test.mjs — EXPERIMENT-MACHINE-SPEC rail 1, FIX 2c: the presence WRITE is founder-
// authorized. Marking "present" REMOVES the away-hold (it lets a standing pattern auto-approve a
// possibly-outward item unattended), so an agent-stamped POST cannot drop the hold. Marking AWAY only
// ADDS a hold, so it stays open. The GET (the indicator read) removes no hold and stays open.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { founderHeaders } from "./helpers/founder-capability.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "drover-presence-auth-"));
process.env.GTM_IDE_HOME = root;
process.env.GTM_IDE_PERSISTENCE = "json";

const { default: presenceRoutes } = await import("../src/routes/presence.mjs");
const { getPresence, __resetPresence } = await import("../src/presence.mjs");

async function call(method, body = {}, headers = {}) {
  const req = Readable.from([JSON.stringify(body)]);
  req.method = method;
  req.url = "/api/presence";
  req.headers = { "content-type": "application/json", ...founderHeaders({ method, path: "/api/presence" }), ...headers };
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

test("a local page POST can mark the founder present without an unlock ceremony", async () => {
  __resetPresence();
  const before = getPresence();
  assert.equal(before.present, false, "starts away (conservative default)");

  const res = await call("POST", {} /* heartbeat */);
  assert.equal(res.status, 200);
  assert.equal(getPresence().present, true, "the local page heartbeat marks present");
});

test("an agent-stamped POST cannot mark the founder present", async () => {
  __resetPresence();
  const res = await call("POST", {}, { "x-gtm-actor": "agent" });
  assert.equal(res.status, 403, "an agent-stamped heartbeat is refused");
  assert.equal(getPresence().present, false);
});

test("marking AWAY is always allowed — a caller can only make the system MORE conservative", async () => {
  __resetPresence();
  // Mark present from the local page first.
  await call("POST", {});
  assert.equal(getPresence().present, true);
  // An unstamped { away: true } is allowed (it adds a hold, never removes one).
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
