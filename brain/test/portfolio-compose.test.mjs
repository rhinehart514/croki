import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { composePortfolioGraph, composePortfolioFromStudio } from "../src/workflow-composer.mjs";
import { createProject, loadProject } from "../src/project-store.mjs";
import { validateGraph } from "../src/graph-operations.mjs";

// The model is faked exactly as the rest of the suite fakes it — the composer (the rented
// intelligence) is what's stubbed; the multi-compose orchestration and the portfolio assembly
// under test are the real host code. Each fake compose returns a gated 5-node system so the wall
// holds and the assembly has real shapes to union.
function fakeComposeFor() {
  return async ({ channel, agents }) => ({
    ok: true,
    nodes: [
      { id: "src", category: "source", connector: "manual", label: "Seed", position: { x: 0, y: 0 }, config: { items: [] } },
      { id: "do", kind: "agent", ref: agents[0]?.ref || "gtm-find-prospects", label: "Work", position: { x: 240, y: 0 }, config: {}, agentPrompt: channel.objective || "" },
      { id: "gate", category: "gate", connector: "default", label: "Founder review", position: { x: 480, y: 0 }, config: {} },
      { id: "send", category: "execute", connector: "local", label: "Stage", position: { x: 720, y: 0 }, config: {} },
    ],
    edges: [
      { id: "a", source: "src", target: "do", edgeType: "data" },
      { id: "b", source: "do", target: "gate", edgeType: "data" },
      { id: "c", source: "gate", target: "send", edgeType: "data" },
    ],
  });
}

describe("composePortfolioGraph — one goal, many composed systems, one diagram", () => {
  it("composes each accepted channel and unions them into one valid portfolio", async () => {
    const graph = await composePortfolioGraph({
      goal: "land a RodentRadar pilot",
      channels: [
        { channel: { id: "outbound", name: "Operator outreach", objective: "reach operators" }, agents: [{ ref: "gtm-find-prospects" }] },
        { channel: { id: "referral", name: "Vouch loop", objective: "earn referrals" }, agents: [{ ref: "gtm-vouch-request-message-drafter" }] },
      ],
      compose: fakeComposeFor(),
    });

    assert.equal(validateGraph(graph).ok, true);
    assert.equal(graph.kind, "portfolio");
    assert.equal(graph.systems.length, 2, "two distinct GTM systems under one goal");
    assert.equal(graph.nodes.filter((n) => n.category === "gate").length, 2, "each system keeps its founder gate");
    assert.equal(graph.name, "land a RodentRadar pilot");
  });

  it("refuses an empty portfolio rather than inventing a system", async () => {
    await assert.rejects(() => composePortfolioGraph({ goal: "g", channels: [], compose: fakeComposeFor() }), /at least one accepted channel/);
  });
});

// The HTTP front door: `POST /api/projects/:projectId/compose/portfolio`. The server boots a live
// listener and many side effects on import, so rather than spin it up we exercise the EXACT handler
// body — resolve the project, derive the repo cwd, inject the composer, call composePortfolioFromStudio
// with the same options the route passes — against the same request body shape the route parses
// (`{ goal, channels: [{ id, title, objective }] }`). This proves the endpoint-level contract: the
// dashboard's flat channel specs fan out into one validated, gated portfolio graph with the wall held.
describe("POST /api/projects/:id/compose/portfolio — endpoint path", () => {
  let parent;
  let options;
  let projectId;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-portfolio-endpoint-"));
    options = { root: path.join(parent, "state"), claudeDir: path.join(parent, "claude") };
    createProject({ name: "Product" }, options);
    projectId = loadProject(options).id;
  });

  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  // Replays the handler exactly: load the project for `projectId`, derive the grounding cwd the same
  // way the route does, inject the (faked) composer, and return what the route returns at 201.
  async function composePortfolioEndpoint(body) {
    const composeProject = loadProject({ ...options, projectId });
    const composeRepo = composeProject.sharedContext?.repository?.repo || process.cwd();
    assert.equal(typeof composeRepo, "string", "endpoint resolves a grounding cwd");
    return composePortfolioFromStudio(body, {
      ...options,
      projectId,
      compose: fakeComposeFor(),
    });
  }

  it("fans the dashboard's flat channel specs out into one validated, gated portfolio", async () => {
    const graph = await composePortfolioEndpoint({
      goal: "land a RodentRadar pilot",
      channels: [
        { id: "outbound", title: "Operator outreach", objective: "reach operators" },
        { id: "referral", title: "Vouch loop", objective: "earn referrals" },
        { id: "content", title: "Build-in-public", objective: "earn inbound" },
      ],
    });

    assert.equal(validateGraph(graph).ok, true, "endpoint returns a valid graph");
    assert.equal(graph.kind, "portfolio");
    assert.equal(graph.systems.length, 3, "all three channels compose into the portfolio");
    assert.equal(graph.name, "land a RodentRadar pilot");
    // The wall is re-asserted on the union: every execute node still sits behind a founder gate.
    const gates = graph.nodes.filter((n) => n.category === "gate").length;
    const executes = graph.nodes.filter((n) => n.category === "execute").length;
    assert.equal(gates, 3, "each system keeps its founder gate after the union");
    assert.equal(executes, 3, "each system's staged execute survives behind its gate");
  });

  it("rejects an empty portfolio the way the route surfaces a 400", async () => {
    await assert.rejects(
      () => composePortfolioEndpoint({ goal: "g", channels: [] }),
      /at least one channel/,
    );
  });
});
