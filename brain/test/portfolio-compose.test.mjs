import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { composePortfolioGraph } from "../src/workflow-composer.mjs";
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
