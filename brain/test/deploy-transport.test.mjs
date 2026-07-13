// deploy-transport.test.mjs — the live ship-runner map (Area 5, MOVE 1) and its wall discipline.
//
// deploy-transport.mjs builds the deploy-runner map the host injects onto a run's context.deployRunners,
// the mirror of gmail-transport's defaultSendRunners. These tests pin: the map only ever carries the HOW
// (a runner function), never the WHETHER (the two founder authorizations the deploy connector checks
// first); the Vercel runner is present ONLY when an MCP deploy function is injected (honest-empty
// otherwise, never a fake runner); and a runner in the map still cannot ship past the wall — a run with a
// wired runner but no founder deploy confirmation refuses.

import { test } from "node:test";
import assert from "node:assert/strict";

import { createVercelRunner, defaultDeployRunners } from "../src/connectors/execute/deploy-transport.mjs";
import { run as runDeploy } from "../src/connectors/execute/deploy.mjs";
import { OUTWARD_RELEASE, runGraph } from "../src/graph.mjs";

const FOUNDER_AUTH = { confirmed: true, releasedBy: "founder-jacob" };
const RELEASED_RUNTIME = { outwardRelease: OUTWARD_RELEASE, deployAuthorization: FOUNDER_AUTH };
const approvedItem = (over = {}) => ({ gtmActionId: "a1", approved: true, artifactSpec: { name: "demo" }, ...over });

// ─── defaultDeployRunners: honest-empty until a hosted runner is wired ────────────────────────

test("defaultDeployRunners is honestly empty when no MCP deploy function is wired (BYO is deploy.mjs's own default)", () => {
  const runners = defaultDeployRunners();
  assert.deepEqual(runners, {}, "no fabricated hosted runner — BYO git-push is the deploy connector's default");
});

test("defaultDeployRunners exposes a vercel runner ONLY when an MCP deploy function is injected", () => {
  const runners = defaultDeployRunners({ vercel: { deployToVercel: async () => ({ ok: true, url: "https://x.vercel.app" }) } });
  assert.equal(typeof runners.vercel, "function", "a wired Vercel account yields a live runner");
});

test("createVercelRunner returns null with no injected function (so the map omits the slot)", () => {
  assert.equal(createVercelRunner({}), null);
  assert.equal(createVercelRunner(), null);
});

// ─── The Vercel runner is pure plumbing over the injected MCP function ─────────────────────────

test("createVercelRunner hands the built worktree + artifact to the injected MCP function and normalizes its answer", async () => {
  let seen = null;
  const runner = createVercelRunner({
    deployToVercel: async (args) => { seen = args; return { ok: true, url: "https://demo.vercel.app", detail: "shipped" }; },
  });
  const node = { config: { target: "staged" } };
  const item = { buildWorktree: "/tmp/worktree", artifactSpec: { name: "demo" }, artifactFiles: [{ path: "index.html", contents: "<html>" }] };
  const out = await runner(node, item, {});
  assert.equal(out.ok, true);
  assert.equal(out.url, "https://demo.vercel.app");
  assert.equal(out.runner, "vercel");
  assert.equal(seen.repo, "/tmp/worktree", "the runner passed the build worktree to the MCP function");
  assert.deepEqual(seen.artifactFiles, item.artifactFiles);
});

test("createVercelRunner reports an honest failure (never throws, never a fake live) when the MCP function fails", async () => {
  const runner = createVercelRunner({ deployToVercel: async () => { throw new Error("mcp exploded"); } });
  const out = await runner({ config: {} }, approvedItem(), {});
  assert.equal(out.ok, false);
  assert.match(out.error, /mcp exploded/);

  const runner2 = createVercelRunner({ deployToVercel: async () => ({ ok: false, error: "quota" }) });
  const out2 = await runner2({ config: {} }, approvedItem(), {});
  assert.equal(out2.ok, false);
  assert.match(out2.error, /quota/);
});

// ─── THE WALL: a wired runner is only the HOW — it never becomes the WHETHER ───────────────────

test("WALL — a run with a wired Vercel runner but NO founder deploy confirmation still refuses to ship", async () => {
  let calls = 0;
  const vercel = async () => { calls += 1; return { ok: true, url: "https://x.vercel.app", runner: "vercel" }; };
  // The deploy connector reads the confirmation ONLY from node.runtime; a context-supplied runner cannot
  // supply it. So even with the runner wired, an unauthorized deploy refuses and the runner never fires.
  const node = { id: "deploy", category: "execute", connector: "deploy", config: { runner: "vercel" }, runtime: { outwardRelease: OUTWARD_RELEASE } };
  const result = await runDeploy(node, [approvedItem()], { deployRunners: { vercel } });
  assert.equal(result.ok, false);
  assert.equal(calls, 0, "the runner must never fire without the founder deploy confirmation");
  assert.equal(result.meta.reason, "missing_founder_deploy_authorization");
});

test("WALL — with BOTH authorizations, the wired Vercel runner ships via context.deployRunners", async () => {
  let calls = 0;
  const vercel = async () => { calls += 1; return { ok: true, url: "https://demo.vercel.app", runner: "vercel" }; };
  const node = { id: "deploy", category: "execute", connector: "deploy", config: { runner: "vercel" }, runtime: RELEASED_RUNTIME };
  const result = await runDeploy(node, [approvedItem()], { deployRunners: { vercel } });
  assert.equal(result.ok, true);
  assert.equal(calls, 1);
  assert.equal(result.items[0].deploymentUrl, "https://demo.vercel.app");
});

// ─── runGraph threads deployRunners onto context in exact parity with sendRunners ─────────────

function vercelDeployGraph(deployImplUnused) {
  return {
    id: "vercel-thread-flow",
    nodes: [
      { id: "art", category: "source", connector: "manual", label: "Built microproduct",
        config: { items: [{ artifactSpec: { name: "demo" }, artifactFiles: [{ path: "index.html", contents: "<html>" }] }] } },
      { id: "gate", category: "gate", connector: "default", label: "Deploy gate", config: {} },
      { id: "deploy", category: "execute", connector: "deploy", label: "Deploy", config: { runner: "vercel" } },
    ],
    edges: [
      { id: "e1", source: "art", target: "gate", edgeType: "data" },
      { id: "e2", source: "gate", target: "deploy", edgeType: "data" },
    ],
  };
}

test("THREADING — deployRunners passed to runGraph reaches the deploy connector's context (parity with sendRunners)", async () => {
  let calls = 0;
  const vercel = async () => { calls += 1; return { ok: true, url: "https://x.vercel.app", runner: "vercel" }; };
  const run = await runGraph(vercelDeployGraph(), {
    approvals: { gate: true },
    outwardRelease: OUTWARD_RELEASE,
    deployAuthorization: FOUNDER_AUTH,
    deployRunners: { vercel },
  });
  assert.equal(run.nodes.deploy.ok, true, "the founder-confirmed deploy shipped via the threaded runner");
  assert.equal(calls, 1, "the context-threaded Vercel runner fired exactly once");
  assert.equal(run.nodes.deploy.items[0].deploymentUrl, "https://x.vercel.app");
});

test("THREADING — a deployRunner threaded onto context does NOT authorize a deploy (no confirmation → refuse)", async () => {
  let calls = 0;
  const vercel = async () => { calls += 1; return { ok: true, url: "https://x.vercel.app", runner: "vercel" }; };
  // Runner wired, gate approved, but NO deployAuthorization opt — exactly what a run without the founder's
  // explicit confirm produces. The runner is the HOW; the WHETHER is still absent, so nothing ships.
  const run = await runGraph(vercelDeployGraph(), { approvals: { gate: true }, outwardRelease: OUTWARD_RELEASE, deployRunners: { vercel } });
  assert.equal(run.nodes.deploy.ok, false, "no founder confirmation → refuse, even with a runner wired");
  assert.equal(calls, 0, "the threaded runner never fired");
  assert.equal(run.nodes.deploy.meta.reason, "missing_founder_deploy_authorization");
});
