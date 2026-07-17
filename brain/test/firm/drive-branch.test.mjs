// Covers the deterministic HTTP fork verb the immersive shell's "try another approach" wires to:
// POST /api/ventures/:id/drive with branchFrom (or intent:"branch") seeds a genuinely distinct child
// bet from the named parent BEFORE the drive begins, then scopes the drive to that child. The point is
// that a sibling is guaranteed structurally — not left to prompt-level phrasing inside the loop.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { founderHeaders } from "../helpers/founder-capability.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "firm-drive-branch-"));
process.env.GTM_IDE_HOME = root;
process.env.GTM_IDE_PERSISTENCE = "json";

const { default: workRoutes } = await import("../../src/firm/work-routes.mjs");
const { createVenture, setVentureDoc, listVentureDocs } = await import("../../src/firm/venture-store.mjs");
const { createBet } = await import("../../src/firm/bet.mjs");
const { applyFirmConfiguration, getFirmConfiguration } = await import("../../src/firm/configuration.mjs");

const options = { root };

async function call(method, pathname, body = null, deps = {}) {
  const req = Readable.from(body == null ? [] : [JSON.stringify(body)]);
  req.method = method;
  req.url = pathname;
  req.headers = founderHeaders({ method, path: pathname });
  let status = 0;
  let raw = "";
  const res = { writeHead(next) { status = next; }, setHeader() {}, end(next) { raw += next ?? ""; } };
  const handled = await workRoutes({ req, res, url: new URL(pathname, "http://local"), deps });
  return { handled, status, body: raw ? JSON.parse(raw) : null };
}

function seedVenture(name) {
  const venture = createVenture({ name }, options);
  const initial = getFirmConfiguration(venture.id, options);
  applyFirmConfiguration({
    ventureId: venture.id,
    expectedRevision: initial.revision,
    configuration: { ...initial, agents: [{ ref: "yara", name: "Yara", activation: "direct" }] },
  }, options);
  const parent = createBet({ ventureId: venture.id, intent: "First outreach to 20 shops", teammateRef: "yara" });
  setVentureDoc(venture.id, "bets", parent.id, parent, options);
  return { venture, parent };
}

test.after(() => fs.rmSync(root, { recursive: true, force: true }));

test("branchFrom deterministically forks a child bet and scopes the drive to it", async () => {
  const { venture, parent } = seedVenture("Branch venture");
  const response = await call("POST", `/api/ventures/${venture.id}/drive`, {
    goal: "Try another approach to first outreach",
    branchFrom: parent.id,
  }, {
    runtime: {
      id: "branch-runtime",
      label: "Branch runtime",
      async drive() { return { kind: "completed", summary: "branched" }; },
    },
  });

  assert.equal(response.status, 200);
  const bets = listVentureDocs(venture.id, "bets", options);
  const child = bets.find((bet) => bet.forkedFrom === parent.id);
  assert.ok(child, "a child bet forked from the parent must exist");
  assert.equal(child.intent, "Try another approach to first outreach");
  assert.equal(child.teammateRef, "yara");
  assert.notEqual(child.id, parent.id);
  // The founder direction is attributed to the freshly forked child, never the parent — proving the
  // drive was scoped to the new sibling.
  const messages = (await call("GET", `/api/ventures/${venture.id}/conversation`)).body.messages;
  assert.equal(messages[0].betId, child.id);
});

test("intent:branch with betId is an equivalent fork verb", async () => {
  const { venture, parent } = seedVenture("Intent branch venture");
  const response = await call("POST", `/api/ventures/${venture.id}/drive`, {
    goal: "Diverge from this",
    intent: "branch",
    betId: parent.id,
  }, {
    runtime: {
      id: "branch-runtime-2",
      label: "Branch runtime 2",
      async drive() { return { kind: "completed", summary: "branched" }; },
    },
  });

  assert.equal(response.status, 200);
  const child = listVentureDocs(venture.id, "bets", options).find((bet) => bet.forkedFrom === parent.id);
  assert.ok(child, "intent:branch must also fork a child from the named bet");
  assert.equal(child.intent, "Diverge from this");
});

test("branchFrom an unknown bet fails closed without driving", async () => {
  const { venture } = seedVenture("Missing parent venture");
  let runtimeCalls = 0;
  const response = await call("POST", `/api/ventures/${venture.id}/drive`, {
    goal: "Branch from nothing",
    branchFrom: "bet-does-not-exist",
  }, {
    runtime: {
      id: "must-not-run",
      label: "Must not run",
      async drive() { runtimeCalls += 1; return { kind: "completed" }; },
    },
  });

  assert.equal(response.status, 404);
  assert.match(response.body.error, /to branch from/i);
  assert.equal(runtimeCalls, 0);
});
