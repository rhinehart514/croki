import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { composeOpportunityChannel } from "../src/workflow-composer.mjs";
import { saveGeneratedOpportunities, updateOpportunity } from "../src/opportunity-engine.mjs";
import { createProject, loadProject } from "../src/project-store.mjs";
import { loadFlow } from "../src/flow-store.mjs";
import { scanRepo } from "../src/scan.mjs";

// Ideator and composer are both fakes: the test exercises host plumbing (accept → compose →
// normalize → bind IO → enforce the wall → persist), not model quality.
const fakeIdeate = async () => ({ ok: true, items: [
  { type: "channel", title: "Referral loop", objective: "loop", rationale: "real", origin: "derived",
    evidence: [{ label: "win", file: "app.ts", line: 1, text: "project_created" }] },
  { type: "agent", title: "Researcher", objective: "research", rationale: "needed", provider: "claude", prompt: "Research." },
  { type: "agent", title: "Relevance analyst", objective: "qualify", rationale: "needed", provider: "codex", prompt: "Qualify." },
] });

// A BRANCHED graph — deliberately not the old linear skeleton — to prove the host preserves
// whatever topology the model designs.
function branchedComposer({ agents }) {
  const [a1, a2] = agents;
  return {
    ok: true,
    nodes: [
      { id: "ctx", category: "context", connector: "product", label: "Context" },
      { id: "src", category: "source", connector: "manual", label: "Input" },
      { id: "a1", kind: "agent", ref: a1.ref, label: a1.title },
      { id: "a2", kind: "agent", ref: a2.ref, label: a2.title },
      { id: "gate", category: "gate", connector: "default", label: "Founder review" },
      { id: "out", category: "execute", connector: "local", label: "Stage output" },
      { id: "meas", category: "measure", connector: "default", label: "Measure" },
    ],
    edges: [
      { source: "ctx", target: "a1", edgeType: "context" },
      { source: "ctx", target: "a2", edgeType: "context" },
      { source: "src", target: "a1", edgeType: "data" },
      { source: "src", target: "a2", edgeType: "data" },
      { source: "a1", target: "gate", edgeType: "data" },
      { source: "a2", target: "gate", edgeType: "data" },
      { source: "gate", target: "out", edgeType: "data" },
      { source: "out", target: "meas", edgeType: "data" },
      { source: "meas", target: "ctx", edgeType: "feedback" },
    ],
  };
}

describe("model-composed workflow (no fixed skeleton)", () => {
  let parent;
  let options;
  let report;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-compose-"));
    const repo = path.join(parent, "repo");
    fs.mkdirSync(repo);
    fs.writeFileSync(path.join(repo, "app.ts"), 'analytics.track("project_created", { projectId, source });\n');
    options = { root: path.join(parent, "state"), claudeDir: path.join(parent, "claude") };
    createProject({ name: "Product" }, options);
    report = scanRepo(repo, { winEvent: "project_created" });
  });

  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  async function acceptChannelAndAgents() {
    const studio = await saveGeneratedOpportunities(report, { ...options, ideate: fakeIdeate });
    const channel = studio.items.find((item) => item.type === "channel");
    const agents = studio.items.filter((item) => item.type === "agent").slice(0, 2);
    updateOpportunity(channel.id, { status: "accepted", input: { type: "csv", csv: "id,name\n1,Ada" }, output: { type: "api", endpoint: "https://example.com/send" } }, options);
    for (const agent of agents) updateOpportunity(agent.id, { status: "accepted" }, options);
    return { channel, agents };
  }

  it("composes the model's branched graph, binds founder IO, and persists", async () => {
    const { channel, agents } = await acceptChannelAndAgents();
    const composed = await composeOpportunityChannel({
      channelOpportunityId: channel.id,
      agentOpportunityIds: agents.map((a) => a.id),
    }, { ...options, compose: branchedComposer });

    assert.equal(composed.validation.ok, true);
    // Topology the model designed is preserved: source fans out to two agents.
    const fanout = composed.graph.edges.filter((e) => e.source === "src" && e.edgeType === "data");
    assert.equal(fanout.length, 2, "branched topology survives composition");
    // Host bound the founder's concrete IO onto the model's source/execute nodes.
    assert.ok(composed.graph.nodes.some((n) => n.category === "source" && n.connector === "csv"));
    assert.ok(composed.graph.nodes.some((n) => n.category === "execute" && n.connector === "http"));
    assert.ok(composed.graph.nodes.some((n) => n.kind === "agent"));
    assert.ok(composed.graph.nodes.some((n) => n.category === "gate"));
    // Persisted and activated; agent markdown written for each accepted agent.
    assert.equal(loadFlow(composed.channel.graphId, null, options).graph.nodes.length, composed.graph.nodes.length);
    assert.equal(loadProject(options).activeChannelId, composed.channel.id);
    assert.ok(fs.readdirSync(path.join(options.claudeDir, "agents")).length >= 2);
  });

  it("enforces the wall: rejects an execute node that is not behind a founder gate", async () => {
    const { channel, agents } = await acceptChannelAndAgents();
    const ungated = () => ({
      ok: true,
      nodes: [
        { id: "src", category: "source", connector: "manual", label: "Input" },
        { id: "out", category: "execute", connector: "local", label: "Send" },
      ],
      edges: [{ source: "src", target: "out", edgeType: "data" }],
    });
    await assert.rejects(
      composeOpportunityChannel({ channelOpportunityId: channel.id, agentOpportunityIds: agents.map((a) => a.id) }, { ...options, compose: ungated }),
      /gate/i,
    );
  });

  it("the blank default refuses rather than falling back to a template", async () => {
    const { channel, agents } = await acceptChannelAndAgents();
    await assert.rejects(
      composeOpportunityChannel({ channelOpportunityId: channel.id, agentOpportunityIds: agents.map((a) => a.id) }, options),
      /subscription/i,
    );
  });
});
