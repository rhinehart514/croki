import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { describe, it } from "node:test";

import { founderHeaders } from "../helpers/founder-capability.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "drover-outward-loop-"));
process.env.GTM_IDE_HOME = root;
process.env.GTM_IDE_PERSISTENCE = "json";

const { default: modelRoutes } = await import("../../src/firm/model-routes.mjs");
const { observeHttpReturn } = await import("../../src/firm/outward-actions.mjs");
const { createVenture } = await import("../../src/firm/venture-store.mjs");

async function call(method, pathname, body = null, { headers = {}, deps = {} } = {}) {
  const req = Readable.from(body == null ? [] : [JSON.stringify(body)]);
  req.method = method;
  req.url = pathname;
  req.headers = { "content-type": "application/json", ...founderHeaders({ method, path: pathname }), ...headers };
  let status = 0;
  let raw = "";
  const res = { writeHead(value) { status = value; }, setHeader() {}, end(value) { raw += value ?? ""; } };
  const handled = await modelRoutes({ req, res, url: new URL(pathname, "http://local"), deps });
  return { handled, status, body: raw ? JSON.parse(raw) : null };
}

function plan() {
  return {
    source: "http",
    target: { url: "https://drover.test/launch" },
    purpose: "Confirm the new Product promise is live.",
    windowHours: 24,
    returnConditions: [{ type: "http-status", equals: 200 }, { type: "body-includes", value: "Move faster" }],
  };
}

describe("current outward action loop", () => {
  it("keeps execution founder-only, persists failure, executes once, and records silence before return", async () => {
    const repository = fs.mkdtempSync(path.join(os.tmpdir(), "drover-outward-repo-"));
    fs.writeFileSync(path.join(repository, "package.json"), JSON.stringify({ scripts: { deploy: "node deploy.mjs" } }));
    const venture = createVenture({ name: "Outward loop", repository }, { root, seedFoundingCrew: false });
    const base = `/api/ventures/${venture.id}/outward-actions`;
    const prepared = await call("POST", base, {
      kind: "deploy",
      decisionRef: "decision:ship-one",
      preparedMaterial: { destination: "Croki production" },
      expectedReturn: plan(),
    });
    assert.equal(prepared.status, 201);
    assert.equal(prepared.body.outwardAction.preparedMaterial.deployContract.command, "npm run deploy");
    const actionId = prepared.body.outwardAction.id;
    const executePath = `${base}/${actionId}/execute`;

    const agent = await call("POST", executePath, {}, { headers: { "x-gtm-actor": "agent", "x-gtm-agent": "codex" } });
    assert.equal(agent.status, 403);

    let executions = 0;
    const failed = await call("POST", executePath, {}, { deps: { executeOutwardAction: async () => { executions += 1; return { ok: false, adapter: "test-deploy", error: "Provider backpressure; no deploy occurred." }; } } });
    assert.equal(failed.status, 502);
    assert.equal(failed.body.outwardAction.executionAttempts.length, 1);
    assert.match(failed.body.outwardAction.lastExecutionError, /backpressure/);
    const failedMovement = await call("GET", `/api/ventures/${venture.id}/market-movement`);
    assert.equal(failedMovement.body.marketMovement.actions[0].state, "execution-failed");

    const executed = await call("POST", executePath, {}, { deps: { executeOutwardAction: async () => { executions += 1; return { ok: true, receipt: { adapter: "test-deploy", destination: "Croki production" } }; } } });
    assert.equal(executed.status, 200);
    assert.equal(executed.body.outwardAction.executionAttempts.length, 2);
    assert.equal(executed.body.outwardAction.executorReceipt.adapter, "test-deploy");
    await call("POST", executePath, {}, { deps: { executeOutwardAction: async () => { executions += 1; return { ok: true, receipt: {} }; } } });
    assert.equal(executions, 2, "an executed action was sent through the adapter twice");

    const granted = await call("POST", `${base}/${actionId}/observations`, {});
    assert.equal(granted.status, 201);
    assert.equal(granted.body.observation.target.url, plan().target.url);
    assert.deepEqual(granted.body.observation.authority.denies, ["send", "publish", "deploy", "spend", "canonical-interpretation"]);
    const checkPath = `${base}/${actionId}/observations/${granted.body.observation.id}/check`;
    const silent = await call("POST", checkPath, {}, { deps: { observeOutwardReturn: async () => ({ state: "silence", facts: { status: 200, conditions: [{ matched: false }] } }) } });
    assert.equal(silent.status, 200);
    assert.equal(silent.body.evidence.state, "silence");
    let movement = await call("GET", `/api/ventures/${venture.id}/market-movement`);
    assert.equal(movement.body.marketMovement.actions[0].state, "silent");

    const returned = await call("POST", checkPath, {}, { deps: { observeOutwardReturn: async () => ({ state: "returned", facts: { status: 200, conditions: [{ matched: true }] } }) } });
    assert.equal(returned.body.evidence.state, "returned");
    movement = await call("GET", `/api/ventures/${venture.id}/market-movement`);
    assert.equal(movement.body.marketMovement.actions[0].state, "returned");
    assert.equal(movement.body.marketMovement.actions[0].outcomeRefs.length, 2);
  });

  it("refuses widened observation targets and preserves adapter failure as a recovery state", async () => {
    const repository = fs.mkdtempSync(path.join(os.tmpdir(), "drover-outward-scope-"));
    fs.writeFileSync(path.join(repository, "package.json"), JSON.stringify({ scripts: { deploy: "node deploy.mjs" } }));
    const venture = createVenture({ name: "Scoped observation", repository }, { root, seedFoundingCrew: false });
    const base = `/api/ventures/${venture.id}/outward-actions`;
    const prepared = await call("POST", base, { kind: "deploy", decisionRef: "decision:ship-two", preparedMaterial: { destination: "production" }, expectedReturn: plan() });
    const actionId = prepared.body.outwardAction.id;
    await call("POST", `${base}/${actionId}/execute`, {}, { deps: { executeOutwardAction: async () => ({ ok: true, receipt: { adapter: "test" } }) } });
    const widened = await call("POST", `${base}/${actionId}/observations`, { target: { url: "https://other.test" } });
    assert.equal(widened.status, 403);
    const granted = await call("POST", `${base}/${actionId}/observations`, {});
    const failed = await call("POST", `${base}/${actionId}/observations/${granted.body.observation.id}/check`, {}, { deps: { observeOutwardReturn: async () => ({ state: "failed", error: "Host timed out.", facts: null }) } });
    assert.equal(failed.body.evidence, null);
    const movement = await call("GET", `/api/ventures/${venture.id}/market-movement`);
    assert.equal(movement.body.marketMovement.actions[0].state, "observation-failed");
    assert.match(movement.body.marketMovement.actions[0].latestObservation.lastResult.error, /timed out/);
  });

  it("acquires a durable lease before the adapter so two founder clicks cannot deploy twice", async () => {
    const repository = fs.mkdtempSync(path.join(os.tmpdir(), "drover-outward-lease-"));
    fs.writeFileSync(path.join(repository, "package.json"), JSON.stringify({ scripts: { deploy: "node deploy.mjs" } }));
    const venture = createVenture({ name: "Single execution", repository }, { root, seedFoundingCrew: false });
    const base = `/api/ventures/${venture.id}/outward-actions`;
    const prepared = await call("POST", base, { kind: "deploy", decisionRef: "decision:ship-once", preparedMaterial: { destination: "production" }, expectedReturn: plan() });
    const executePath = `${base}/${prepared.body.outwardAction.id}/execute`;
    let release;
    let began;
    const held = new Promise((resolve) => { release = resolve; });
    const started = new Promise((resolve) => { began = resolve; });
    let executions = 0;
    const deps = { executeOutwardAction: async () => { executions += 1; began(); await held; return { ok: true, receipt: { adapter: "one-shot" } }; } };
    const first = call("POST", executePath, {}, { deps });
    await started;
    const second = await call("POST", executePath, {}, { deps });
    assert.equal(second.status, 409);
    assert.equal(second.body.code, "outward_action_execution_unknown");
    release();
    assert.equal((await first).status, 200);
    assert.equal(executions, 1);
  });
});

it("the HTTP return adapter records exact facts and does not interpret a missing condition", async () => {
  const contract = { target: { url: "http://127.0.0.1/result" }, returnConditions: [{ type: "http-status", equals: 200 }, { type: "body-includes", value: "expected phrase" }] };
  const silent = await observeHttpReturn(contract, {}, { allowInsecure: true, fetch: async () => new Response("different body", { status: 200, headers: { "content-type": "text/plain" } }) });
  assert.equal(silent.state, "silence");
  assert.equal(silent.facts.status, 200);
  assert.equal(silent.facts.conditions[0].matched, true);
  assert.equal(silent.facts.conditions[1].matched, false);
  assert.equal("interpretation" in silent, false);
});
