// microproduct-deploy.test.mjs — the gated deploy leg + its non-negotiable invariant.
//
// The wall GRADUATES: a microproduct deploys ONLY after an explicit founder gate approval,
// NEVER from composition and NEVER from a run. No silent send/deploy path may exist. These
// tests pin both authorizations the deploy connector requires and prove deploy is unforgeable.

import { test } from "node:test";
import assert from "node:assert/strict";

import * as deploy from "../src/connectors/execute/deploy.mjs";
import { getConnector, defaultGraphTemplate } from "../src/connectors/registry.mjs";
import { runGraph } from "../src/graph.mjs";

const node = (config = {}, runtime = undefined) => ({
  id: "exe-deploy",
  category: "execute",
  connector: "deploy",
  config,
  ...(runtime ? { runtime } : {}),
});

// An explicit founder deploy authorization — the connector mirror of revision.mjs `confirmation === true`.
const FOUNDER_AUTH = { confirmed: true, releasedBy: "founder-jacob" };

const approvedItem = (over = {}) => ({
  gtmActionId: "gtm-deploy-1",
  approved: true,
  artifactSpec: { kind: "landing-page", title: "RodentRadar demo" },
  ...over,
});

// A deploy runner that records it was called and never touches the real world.
const fakeRunner = () => {
  let calls = 0;
  const impl = async () => { calls += 1; return { ok: true, url: "https://demo.example.dev", runner: "test" }; };
  return { impl, get calls() { return calls; } };
};

// ─── GATE PROOF: deploy without an explicit founder authorization is REFUSED ──────────────────

test("GATE PROOF — deploy is refused without an explicit founder deploy authorization (nothing ships)", async () => {
  const runner = fakeRunner();
  // Approved items present, BUT no founder deploy authorization on the run path.
  const result = await deploy.run(node({ deployImpl: runner.impl }), [approvedItem()], {});
  assert.equal(result.ok, false);
  assert.equal(runner.calls, 0, "the deploy runner must NEVER be invoked without founder authorization");
  assert.equal(result.meta.deployed, 0);
  assert.equal(result.meta.reason, "missing_founder_deploy_authorization");
  assert.match(result.error, /explicit founder deploy authorization|never from composition and never from a run/i);
  assert.ok(result.items.every((i) => i.deployed === false && i.live !== true));
  assert.match(result.items[0].deployStatus, /only after an explicit founder gate approval/i);
});

test("an unconfirmed authorization (confirmed !== true) is treated as no authorization", async () => {
  const runner = fakeRunner();
  const result = await deploy.run(
    node({ deployImpl: runner.impl }, { deployAuthorization: { confirmed: false, releasedBy: "x" } }),
    [approvedItem()],
    {},
  );
  assert.equal(result.ok, false);
  assert.equal(runner.calls, 0);
  assert.equal(result.meta.reason, "missing_founder_deploy_authorization");
});

// ─── INVARIANT: composition cannot forge a deploy past the gate ───────────────────────────────

test("INVARIANT — a config-forged authorization (composition's only reach) does NOT authorize a deploy", async () => {
  const runner = fakeRunner();
  // Composition writes node.config. If it could authorize a deploy from config, the wall would fall.
  // The connector reads authorization ONLY from node.runtime (host-rebuilt each run), never config or context.
  const result = await deploy.run(
    node({ deployImpl: runner.impl, deployAuthorization: { confirmed: true, releasedBy: "composed-graph" }, approved: true }),
    [approvedItem()],
    {},
  );
  assert.equal(result.ok, false, "config-sourced authorization must be ignored — composition can never deploy");
  assert.equal(runner.calls, 0);
  assert.equal(result.meta.reason, "missing_founder_deploy_authorization");
});

// ─── Both authorizations present → the founder-approved microproduct ships ────────────────────

test("with founder authorization AND gate-approved items, the microproduct ships via the runner", async () => {
  const runner = fakeRunner();
  const result = await deploy.run(
    node({ deployImpl: runner.impl }, { deployAuthorization: FOUNDER_AUTH }),
    [approvedItem()],
    {},
  );
  assert.equal(result.ok, true);
  assert.equal(runner.calls, 1);
  assert.equal(result.meta.deployed, 1);
  const item = result.items[0];
  assert.equal(item.deployed, true);
  assert.equal(item.live, true);
  assert.equal(item.executionStatus, "deployed");
  assert.equal(item.deploymentUrl, "https://demo.example.dev");
  assert.equal(item.deployedBy, "founder-jacob");
  assert.equal(item.outputKind, "artifact");
});

test("the deploy authorization is NOT honored from the run context — that surface is composition-forgeable", async () => {
  // resolveContext maps any upstream node's emitted { type:"context", id:"deployAuthorization" } item
  // onto context.deployAuthorization, so a composed graph could self-supply it. The connector reads the
  // confirmation ONLY from node.runtime (host-rebuilt every run), so a context-supplied auth ships nothing.
  const runner = fakeRunner();
  const result = await deploy.run(
    node({ deployImpl: runner.impl }),
    [approvedItem()],
    { deployAuthorization: FOUNDER_AUTH },
  );
  assert.equal(result.ok, false, "a context-supplied authorization must never deploy");
  assert.equal(runner.calls, 0, "the deploy runner must never fire on a context-supplied authorization");
  assert.equal(result.meta.reason, "missing_founder_deploy_authorization");
});

// ─── Gate stamp still required even WITH founder deploy authorization ──────────────────────────

test("authorized, but only gate-approved items ship — unapproved artifacts are dropped, never deployed", async () => {
  const runner = fakeRunner();
  const result = await deploy.run(
    node({ deployImpl: runner.impl }, { deployAuthorization: FOUNDER_AUTH }),
    [
      approvedItem({ gtmActionId: "ok" }),
      { gtmActionId: "pending", approved: false, artifactSpec: {} },
      { gtmActionId: "undecided", artifactSpec: {} },
    ],
    {},
  );
  assert.equal(runner.calls, 1, "only the one gate-approved item reaches the runner");
  assert.equal(result.meta.deployed, 1);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].gtmActionId, "ok");
});

test("authorized with NO approved items ships nothing (honest no-op, not a failure)", async () => {
  const runner = fakeRunner();
  const result = await deploy.run(
    node({ deployImpl: runner.impl }, { deployAuthorization: FOUNDER_AUTH }),
    [{ gtmActionId: "pending", approved: false }],
    {},
  );
  assert.equal(result.ok, true);
  assert.equal(runner.calls, 0);
  assert.equal(result.meta.deployed, 0);
});

// ─── Hosted Vercel fallback ───────────────────────────────────────────────────────────────────

test("the hosted Vercel fallback runs only when wired, and only after both authorizations pass", async () => {
  let vercelCalls = 0;
  const vercelRunner = async () => { vercelCalls += 1; return { ok: true, url: "https://demo.vercel.app", runner: "vercel" }; };
  // Authorized + approved + runner "vercel" wired via context.deployRunners.vercel (the MCP-backed slot).
  const ok = await deploy.run(
    node({ runner: "vercel" }, { deployAuthorization: FOUNDER_AUTH }),
    [approvedItem()],
    { deployRunners: { vercel: vercelRunner } },
  );
  assert.equal(ok.ok, true);
  assert.equal(vercelCalls, 1);
  assert.equal(ok.items[0].deploymentUrl, "https://demo.vercel.app");

  // Without a wired Vercel runner, the fallback is an honest blocked no-op — never a fake deploy.
  const blocked = await deploy.run(
    node({ runner: "vercel" }, { deployAuthorization: FOUNDER_AUTH }),
    [approvedItem()],
    {},
  );
  assert.equal(blocked.ok, false);
  assert.equal(blocked.items[0].deployed, false);
  assert.match(blocked.items[0].error, /no Vercel MCP runner is wired/i);
});

// ─── The live gate seam: runGraph threads the founder deploy confirmation onto node.runtime ───────
//
// GUARD 2 used to be structurally unreachable in the live run path — graph.mjs built node.runtime as
// only { approved, decisions } and never carried a deploy authorization, so even a genuine founder gate
// approval ALWAYS hit `missing_founder_deploy_authorization`. These tests pin the threading: a normal
// approval still refuses (fail-safe), and only an explicit founder deploy authorization passed to
// runGraph reaches the connector. The authorization rides node.runtime, which graph.mjs rebuilds from
// runGraph opts every run — composition (which writes only node.config) can never forge it.

function deployThreadGraph(deployImpl) {
  return {
    id: "deploy-thread-flow",
    nodes: [
      {
        id: "art", category: "source", connector: "manual", label: "Built microproduct",
        config: { items: [{ artifactSpec: { name: "demo" }, artifactFiles: [{ path: "index.html", contents: "<html>" }] }] },
      },
      { id: "gate", category: "gate", connector: "default", label: "Deploy gate", config: {} },
      { id: "deploy", category: "execute", connector: "deploy", label: "Deploy", config: { deployImpl } },
    ],
    edges: [
      { id: "e1", source: "art", target: "gate", edgeType: "data" },
      { id: "e2", source: "gate", target: "deploy", edgeType: "data" },
    ],
  };
}

test("GATE SEAM — a normal gate approval with NO deploy confirmation still refuses to deploy (fail-safe)", async () => {
  let calls = 0;
  const graph = deployThreadGraph(async () => { calls += 1; return { ok: true, url: "https://x.dev", runner: "test" }; });
  const run = await runGraph(graph, { approvals: { gate: true } });
  assert.equal(run.nodes.gate.pendingReview, false, "the gate approved the item");
  assert.equal(run.nodes.deploy.ok, false, "but the deploy refuses without an explicit founder confirmation");
  assert.equal(calls, 0, "the deploy runner never fired");
  assert.equal(run.nodes.deploy.meta.reason, "missing_founder_deploy_authorization");
});

test("GATE SEAM — an explicit founder deploy authorization passed to runGraph threads onto node.runtime and ships", async () => {
  let calls = 0;
  const graph = deployThreadGraph(async () => { calls += 1; return { ok: true, url: "https://x.dev", runner: "test" }; });
  const run = await runGraph(graph, { approvals: { gate: true }, deployAuthorization: FOUNDER_AUTH });
  assert.equal(run.nodes.deploy.ok, true, "the founder-confirmed deploy ships");
  assert.equal(calls, 1, "the deploy runner fired exactly once");
  assert.equal(run.nodes.deploy.meta.deployed, 1);
  assert.equal(run.nodes.deploy.items[0].deployedBy, "founder-jacob");
});

// ─── Registry + meta wall ─────────────────────────────────────────────────────────────────────

test("declares the wall in its meta and demands explicit deploy confirmation", () => {
  assert.equal(deploy.meta.category, "execute");
  assert.equal(deploy.meta.outputKind, "artifact");
  for (const verb of ["deploy_without_approval", "deploy_from_composition", "deploy_from_run"]) {
    assert.ok(deploy.meta.blocked.includes(verb), `expected blocked verb: ${verb}`);
  }
  assert.ok(deploy.meta.approvalRequired.includes("explicit_deploy_confirmation"));
});

test("registered in the execute family without disturbing the default template", () => {
  const connector = getConnector("execute", "deploy");
  assert.ok(connector, "deploy connector should resolve from the registry");
  assert.equal(connector.meta.id, "deploy");
  // The other execute connectors still resolve.
  assert.ok(getConnector("execute", "local"));
  assert.ok(getConnector("execute", "http"));
  assert.ok(getConnector("execute", "artifact"));
  // The default template is untouched — still a single local execute node, no deploy node.
  const exeNodes = defaultGraphTemplate().nodes.filter((n) => n.category === "execute");
  assert.equal(exeNodes.length, 1);
  assert.equal(exeNodes[0].connector, "local");
});
