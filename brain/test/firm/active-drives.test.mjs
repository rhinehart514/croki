import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { founderHeaders } from "../helpers/founder-capability.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "drover-active-drives-"));
process.env.GTM_IDE_HOME = root;
process.env.GTM_IDE_PERSISTENCE = "json";

const { default: workRoutes } = await import("../../src/firm/work-routes.mjs");
const { createVenture, getVentureDoc, setVentureDoc } = await import("../../src/firm/venture-store.mjs");
const { createBet } = await import("../../src/firm/bet.mjs");
const { __resetActiveDrives } = await import("../../src/firm/active-drives.mjs");

function routeCall(method, pathname, body = null, deps = {}) {
  const req = Readable.from(body == null ? [] : [JSON.stringify(body)]);
  req.method = method;
  req.url = pathname;
  req.headers = { "content-type": "application/json", ...founderHeaders({ method, path: pathname }) };
  let status = 0;
  let raw = "";
  const res = { writeHead(next) { status = next; }, setHeader() {}, end(next) { raw += next ?? ""; } };
  return workRoutes({ req, res, url: new URL(pathname, "http://local"), deps })
    .then(() => ({ status, body: raw ? JSON.parse(raw) : null }));
}

async function waitForActive(pathname) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const response = await routeCall("GET", pathname);
    if (response.body?.drives?.length) return response;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("The test drive never became active.");
}

test.after(() => {
  __resetActiveDrives();
  fs.rmSync(root, { recursive: true, force: true });
});

test("a host-authorized abort stops one active provider drive and keeps the bet's partial evidence", async () => {
  // Opt out of the founding-crew seed: this test drives an ad-hoc teammate ("researcher") to exercise
  // abort + partial-evidence mechanics over an otherwise-empty venture, relying on the empty-config
  // first-participant formation path. With the four founding characters seeded, the config is already
  // formed and a drive to a fifth, unconfigured ref is (correctly) gated — that gate is Phase-4 direction-
  // routing's concern, not this abort mechanics test's.
  const venture = createVenture({ name: "Stoppable work" }, { root, seedFoundingCrew: false });
  const bet = createBet({ ventureId: venture.id, intent: "Inspect the product", teammateRef: "researcher" });
  setVentureDoc(venture.id, "bets", bet.id, bet, { root });
  const runtime = {
    id: "abortable-test-runtime",
    label: "Abortable test runtime",
    supportsAbort: true,
    async drive(ctx) {
      ctx.onText("A useful partial finding.");
      return new Promise((resolve) => {
        if (ctx.signal.aborted) resolve({ kind: "cancelled" });
        else ctx.signal.addEventListener("abort", () => resolve({ kind: "cancelled" }), { once: true });
      });
    },
  };
  const drivePath = `/api/ventures/${venture.id}/drive`;
  const drivePromise = routeCall("POST", drivePath, {
    teammateRef: "researcher",
    betId: bet.id,
    goal: "Inspect and report",
  }, { runtime });

  const activePath = `/api/ventures/${venture.id}/drives/active`;
  const active = await waitForActive(activePath);
  assert.equal(active.status, 200);
  assert.equal(active.body.drives[0].abortSupported, true);

  const driveId = active.body.drives[0].id;
  const stopped = await routeCall("POST", `/api/ventures/${venture.id}/drives/${driveId}/abort`, {});
  assert.equal(stopped.status, 200);
  assert.ok(stopped.body.drive.abortRequestedAt);

  const result = await drivePromise;
  assert.equal(result.status, 200);
  assert.equal(result.body.outcome.kind, "cancelled");
  assert.deepEqual((await routeCall("GET", activePath)).body.drives, []);

  const retained = getVentureDoc(venture.id, "bets", bet.id, { root });
  assert.equal(retained.endedAt, null);
  assert.ok(retained.events.some((event) => event.type === "text" && /partial finding/i.test(event.detail)));
  assert.ok(retained.events.some((event) => event.type === "work_stopped"));
});

test("abort is founder-only and cross-venture drive ids fail closed", async () => {
  const venture = createVenture({ name: "Abort guard" }, { root });
  const other = createVenture({ name: "Other venture" }, { root });
  const pathFor = (ventureId) => `/api/ventures/${ventureId}/drives/drive-does-not-exist/abort`;

  const missing = await routeCall("POST", pathFor(venture.id), {});
  assert.equal(missing.status, 404);
  const crossVenture = await routeCall("POST", pathFor(other.id), {});
  assert.equal(crossVenture.status, 404);

  const pathname = pathFor(venture.id);
  const req = Readable.from(["{}"]) ;
  req.method = "POST";
  req.url = pathname;
  req.headers = { "x-gtm-actor": "agent" };
  let status = 0;
  const res = { writeHead(next) { status = next; }, setHeader() {}, end() {} };
  await workRoutes({ req, res, url: new URL(pathname, "http://local") });
  assert.equal(status, 403);
});
