// The operator build-and-SHIP door — compose_microproduct. The deployable twin of compose_and_run:
// it asks the (fake here) producer to cut a microproduct (spec + files) from the scanned product,
// composes a graph whose deploy step is an `execute` node behind a founder `gate`, and runs it to that
// gate. NOTHING deploys: the run stops at the gate, and the deploy connector itself refuses to ship
// without BOTH the gate stamp AND an explicit founder deploy confirmation that composition/runs can't
// forge. No model, no network — the producer and the run runtime are injected/keyless.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { loadFlow } from "../src/flow-store.mjs";
import { createOperatorSession } from "../src/operator-store.mjs";
import { operatorTools, executeOperatorTool, launchOperatorSession, resolveOperatorGate } from "../src/operator-runtime.mjs";
import { safeOperatorTools, assertSafeTool } from "../src/operator-mcp.mjs";
import { run as runDeployConnector } from "../src/connectors/execute/deploy.mjs";
import { OUTWARD_RELEASE } from "../src/graph.mjs";

// A keyless client whose only job is to let the post-gate operator relaunch finish cleanly (it
// returns a single `complete` turn). resolveOperatorGate fires a background relaunch when the gate
// resolves with no new pending gate; this keeps that fire-and-forget work from rejecting in tests.
function completingClient() {
  let index = 0;
  return {
    messages: {
      async create() {
        index += 1;
        if (index > 1) throw new Error("Unexpected extra model turn.");
        return { content: [{ type: "tool_use", id: "done", name: "complete", input: { outcome: "achieved", summary: "Resolved." } }] };
      },
    },
  };
}

// A fake producer that returns a small static landing microproduct in the live producer's
// { ok, artifactSpec, artifactFiles } shape. No subscription, no network.
function fakeProducer({ goal } = {}) {
  return {
    ok: true,
    artifactSpec: { name: "rodent-radar-demo", kind: "landing", summary: "A demo landing page.", entry: "index.html" },
    artifactFiles: [
      { path: "index.html", contents: `<!doctype html><title>${goal || "Demo"}</title>` },
      { path: "README.md", contents: "# Demo\n" },
    ],
  };
}

describe("compose_microproduct — the operator build-and-ship door", () => {
  let parent;
  let options;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-operator-microproduct-"));
    const repo = path.join(parent, "repo");
    fs.mkdirSync(repo);
    fs.writeFileSync(path.join(repo, "app.ts"), 'analytics.track("project_created", { projectId });\n');
    options = { root: path.join(parent, "state"), claudeDir: path.join(parent, "claude"), cwd: repo };
  });

  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  it("is exposed to the operator model as a naked tool", () => {
    assert.ok(operatorTools.some((tool) => tool.name === "compose_microproduct"));
  });

  it("composes a build → founder gate → deploy graph and stops at the gate, deploying nothing", async () => {
    const session = createOperatorSession({
      goal: "Ship a demo landing page for design-partner pilots.",
      projectId: "default",
    }, options);

    const execution = await executeOperatorTool(
      session,
      { id: "mp-1", name: "compose_microproduct", input: { title: "Pilot demo" } },
      { ...options, produceMicroproduct: fakeProducer },
    );

    // The run reached the founder gate autonomously and stopped there.
    assert.equal(execution.session.status, "waiting_for_gate");
    assert.equal(execution.pause, true);
    assert.ok(execution.session.pendingGate?.nodeIds?.includes("deploy-gate"), "paused at the composed deploy gate");

    // The composed graph IS the build-and-ship topology, behind the wall.
    const graphId = execution.session.graphId;
    assert.ok(graphId, "the session adopted the composed microproduct channel");
    const { graph } = loadFlow(graphId, null, options);
    const deploy = graph.nodes.find((node) => node.category === "execute");
    assert.ok(deploy, "the graph has a deploy execute node");
    assert.equal(deploy.connector, "deploy", "the deploy node uses the wall-graduating deploy connector");
    const gate = graph.nodes.find((node) => node.category === "gate");
    assert.ok(gate, "the graph has a founder gate");
    // The gate is upstream of the deploy on the only path — the send wall, structurally.
    assert.ok(
      graph.edges.some((edge) => edge.source === gate.id && edge.target === deploy.id),
      "the deploy node sits directly behind the founder gate",
    );

    // GATE PROOF (run side): the deploy node never ran — nothing was deployed or staged-live.
    const runNodes = execution.result.nodes ?? {};
    assert.ok(!runNodes[deploy.id] || runNodes[deploy.id].itemCount === 0, "the deploy node did not execute before the gate");
    assert.equal(execution.result.pendingGates.includes("deploy-gate"), true);
  });

  it("builds the artifact locally and stages a previewable microproduct at the gate (not raw file text)", async () => {
    const session = createOperatorSession({ goal: "Ship a demo landing page.", projectId: "default" }, options);
    const execution = await executeOperatorTool(
      session,
      { id: "mp-prev", name: "compose_microproduct", input: { title: "Pilot demo" } },
      { ...options, produceMicroproduct: fakeProducer },
    );
    assert.equal(execution.session.status, "waiting_for_gate");
    // The item the founder reviews at the gate carries a BUILT preview (entry file + file list + local
    // build dir), produced by buildMicroproduct before the gate — not just the raw producer files.
    const gateItem = execution.result.nodes["deploy-gate"]?.items?.[0];
    assert.ok(gateItem, "the gate holds the staged microproduct item");
    assert.ok(gateItem.preview, "the staged item carries a built preview");
    assert.equal(gateItem.preview.exists, true);
    assert.equal(gateItem.preview.entry, "index.html", "the preview found the static entry file");
    assert.ok(gateItem.preview.files.includes("index.html"));
    // The build leg never deploys — the run still stopped at the gate.
    assert.equal(execution.pause, true);
  });

  it("threads the founder's explicit deploy confirmation through resolveOperatorGate past GUARD 2", async () => {
    const session = createOperatorSession({ goal: "Ship a demo landing page.", projectId: "default" }, options);
    const execution = await executeOperatorTool(
      session,
      { id: "mp-confirm", name: "compose_microproduct", input: { title: "Pilot demo" } },
      { ...options, produceMicroproduct: fakeProducer },
    );
    const graphId = execution.session.graphId;

    // The founder approves the gate AND explicitly confirms the deploy (deployConfirmed:true). The deploy
    // node now gets PAST GUARD 2 — it no longer refuses for a missing authorization; it instead fails at
    // the live SHIP runner (no BYO git remote configured), proving the confirmation threaded all the way
    // to the connector. Nothing is faked-shipped: the live runner is honest scaffolding, not yet wired.
    const runtime = { options, client: completingClient() };
    await resolveOperatorGate(
      execution.session.id,
      { approvals: { "deploy-gate": true }, deployConfirmed: true },
      runtime,
    );
    await launchOperatorSession(execution.session.id, runtime);
    const confirmedRun = loadFlow(graphId, null, options).runs.at(-1).result;
    const deployNode = confirmedRun.nodes.deploy ?? confirmedRun.nodes[Object.keys(confirmedRun.nodes).find((k) => k.startsWith("deploy") && k !== "deploy-gate")];
    assert.ok(deployNode, "the deploy node ran on resume");
    assert.notEqual(deployNode.meta?.reason, "missing_founder_deploy_authorization", "the founder confirmation cleared GUARD 2");
    assert.match(deployNode.items?.[0]?.error ?? deployNode.error ?? "", /config\.repo|BYO deploy/i);
  });

  it("a normal gate approval WITHOUT a deploy confirmation never deploys (GUARD 2 fail-safe, end-to-end)", async () => {
    const session = createOperatorSession({ goal: "Ship a demo landing page.", projectId: "default" }, options);
    const execution = await executeOperatorTool(
      session,
      { id: "mp-noconfirm", name: "compose_microproduct", input: { title: "Pilot demo" } },
      { ...options, produceMicroproduct: fakeProducer },
    );
    const graphId = execution.session.graphId;
    const runtime = { options, client: completingClient() };
    await resolveOperatorGate(
      execution.session.id,
      { approvals: { "deploy-gate": true } }, // approved, but the founder did NOT confirm a deploy
      runtime,
    );
    await launchOperatorSession(execution.session.id, runtime);
    const run = loadFlow(graphId, null, options).runs.at(-1).result;
    const deployNode = run.nodes.deploy;
    assert.ok(deployNode, "the deploy node ran on resume");
    assert.equal(deployNode.ok, false, "deploy refused without the explicit founder confirmation");
    assert.equal(deployNode.meta.reason, "missing_founder_deploy_authorization");
    assert.ok((deployNode.items ?? []).every((i) => i.deployed === false), "nothing shipped");
  });

  it("refuses to compose when the producer returns no files (never an empty deploy)", async () => {
    const session = createOperatorSession({ goal: "Ship something.", projectId: "default" }, options);
    await assert.rejects(
      () => executeOperatorTool(
        session,
        { id: "mp-2", name: "compose_microproduct", input: {} },
        { ...options, produceMicroproduct: () => ({ ok: true, artifactFiles: [] }) },
      ),
      /no files to stage/,
    );
  });
});

// GATE PROOF (connector side): even WITH gate-approved items, the deploy connector ships nothing unless
// an explicit founder deploy confirmation is present in the run context — and that confirmation can come
// only from the founder-input run path, never from composition or a run. So the door cannot deploy.
describe("compose_microproduct — the deploy node cannot ship without the founder gate + confirmation", () => {
  it("refuses to deploy a gate-approved item when no founder deploy authorization is supplied", async () => {
    const node = {
      id: "deploy",
      category: "execute",
      connector: "deploy",
      config: { target: "staged" },
      runtime: { outwardRelease: OUTWARD_RELEASE },
    };
    const approvedItem = { id: "art-1", approved: true, artifactSpec: { name: "x" }, artifactFiles: [{ path: "index.html", contents: "<html>" }] };
    // No context.deployAuthorization — exactly the state a run/composition can produce.
    const result = await runDeployConnector(node, [approvedItem], {});
    assert.equal(result.ok, false, "deploy refuses without an explicit founder confirmation");
    assert.ok(result.items.every((item) => item.deployed === false), "nothing was deployed");
    assert.match(result.error, /explicit founder/i);
  });

  it("the agent MCP surface exposes compose_microproduct but would refuse any deploy-named tool", () => {
    const exposed = safeOperatorTools().map((tool) => tool.name);
    assert.ok(exposed.includes("compose_microproduct"), "the build-and-ship door is reachable by the agent");
    // The structural guard: a real deploy/publish/send tool name is refused exposure to the subprocess.
    assert.throws(() => assertSafeTool("deploy_microproduct"), /outbound\/approval verb/);
    assert.throws(() => assertSafeTool("publish_microproduct"), /outbound\/approval verb/);
  });
});
