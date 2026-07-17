// agent-drive-initiation.test.mjs — the MCP/agent door may CONTINUE or steer existing founder-authorized
// work, but it may NEVER initiate fresh work with no founder lineage (FIRM-SPEC rail #1; STATE.md
// initiation law; docs/design/REBUILD-HANDOFF.md "Fix the MCP fresh-drive gap").
//
// An agent-stamped POST /drive (x-gtm-actor: agent) must target an existing bet — a betId to resume, or
// a branchFrom / intent:"branch" to diverge from a named parent. An agent-stamped drive carrying only a
// goal (no betId, no branch target) is a fresh start with no founder direction behind it, and is refused
// (403) before any runtime runs. A founder-stamped fresh drive is still allowed — only the founder starts
// new work.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { founderHeaders } from "../helpers/founder-capability.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "firm-agent-drive-"));
process.env.GTM_IDE_HOME = root;
process.env.GTM_IDE_PERSISTENCE = "json";

const { default: workRoutes } = await import("../../src/firm/work-routes.mjs");
const { createVenture, setVentureDoc, listVentureDocs } = await import("../../src/firm/venture-store.mjs");
const { createBet } = await import("../../src/firm/bet.mjs");
const { applyFirmConfiguration, getFirmConfiguration } = await import("../../src/firm/configuration.mjs");

const options = { root };

// A runtime that records whether the drive actually began; the initiation gate must refuse a fresh
// agent goal BEFORE this ever runs.
function countingRuntime(counter) {
  return {
    id: "counting-runtime",
    label: "Counting runtime",
    async drive() { counter.calls += 1; return { kind: "completed", summary: "ran" }; },
  };
}

async function call(method, pathname, body, { agent = false, deps = {} } = {}) {
  const req = Readable.from(body == null ? [] : [JSON.stringify(body)]);
  req.method = method;
  req.url = pathname;
  req.headers = founderHeaders({ method, path: pathname });
  if (agent) req.headers["x-gtm-actor"] = "agent";
  let status = 0;
  let raw = "";
  const res = { writeHead(next) { status = next; }, setHeader() {}, end(next) { raw += next ?? ""; } };
  await workRoutes({ req, res, url: new URL(pathname, "http://local"), deps });
  return { status, body: raw ? JSON.parse(raw) : null };
}

function seedVenture(name) {
  const venture = createVenture({ name }, options);
  const initial = getFirmConfiguration(venture.id, options);
  applyFirmConfiguration({
    ventureId: venture.id,
    expectedRevision: initial.revision,
    configuration: { ...initial, agents: [{ ref: "yara", name: "Yara", activation: "direct" }] },
  }, options);
  const bet = createBet({ ventureId: venture.id, intent: "First outreach to 20 shops", teammateRef: "yara" });
  setVentureDoc(venture.id, "bets", bet.id, bet, options);
  return { venture, bet };
}

test.after(() => fs.rmSync(root, { recursive: true, force: true }));

test("an agent-stamped drive with only a fresh goal is refused before any work begins", async () => {
  const { venture } = seedVenture("Fresh agent goal");
  const counter = { calls: 0 };
  const response = await call("POST", `/api/ventures/${venture.id}/drive`, {
    teammateRef: "yara",
    goal: "Start a brand-new outreach campaign from scratch",
  }, { agent: true, deps: { runtime: countingRuntime(counter) } });

  assert.equal(response.status, 403, "a fresh agent-initiated drive must be refused");
  assert.match(response.body.error, /existing founder-authorized work|only the founder can start fresh/i);
  assert.equal(counter.calls, 0, "the runtime must never run for a refused fresh agent drive");
});

test("an agent-stamped drive may RESUME an existing founder-authored bet", async () => {
  const { venture, bet } = seedVenture("Agent resume");
  const counter = { calls: 0 };
  const response = await call("POST", `/api/ventures/${venture.id}/drive`, {
    teammateRef: "yara",
    goal: "Continue the outreach — next inward move",
    betId: bet.id,
  }, { agent: true, deps: { runtime: countingRuntime(counter) } });

  assert.equal(response.status, 200, "resuming a founder-created bet is allowed for the agent door");
  assert.equal(counter.calls, 1, "the drive ran because it continued existing founder work");
});

test("an agent-stamped drive may BRANCH from an existing founder-authored bet", async () => {
  const { venture, bet } = seedVenture("Agent branch");
  const counter = { calls: 0 };
  const response = await call("POST", `/api/ventures/${venture.id}/drive`, {
    teammateRef: "yara",
    goal: "Try another angle",
    branchFrom: bet.id,
  }, { agent: true, deps: { runtime: countingRuntime(counter) } });

  assert.equal(response.status, 200, "diverging from a founder-created bet is allowed for the agent door");
  const child = listVentureDocs(venture.id, "bets", options).find((b) => b.forkedFrom === bet.id);
  assert.ok(child, "the branch forked a child from the founder-authored parent");
  assert.equal(counter.calls, 1);
});

test("a founder-stamped drive with only a fresh goal is still allowed — only the founder starts work", async () => {
  const { venture } = seedVenture("Founder fresh goal");
  const counter = { calls: 0 };
  const response = await call("POST", `/api/ventures/${venture.id}/drive`, {
    teammateRef: "yara",
    goal: "Start a brand-new outreach campaign from scratch",
  }, { agent: false, deps: { runtime: countingRuntime(counter) } });

  assert.equal(response.status, 200, "the founder may always begin fresh work");
  assert.equal(counter.calls, 1);
});
