import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { composeNakedGraph, composeGraphForChannel } from "../src/workflow-composer.mjs";
import { createProject, loadProject } from "../src/project-store.mjs";
import { loadFlow } from "../src/flow-store.mjs";
import { scanRepo } from "../src/scan.mjs";

// Channels are defined directly (by the founder or by Claude) and handed to the composer as an
// inline spec. The composer is a fake: the test exercises host plumbing (normalize → bind IO →
// enforce the wall → persist), not model quality. The naked path persists a runnable gated flow with
// no outcome program, policy, or capability foundry.
function channelInput(overrides = {}) {
  return {
    title: "Referral loop",
    objective: "loop",
    input: { type: "csv", csv: "id,name\n1,Ada" },
    output: { type: "api", endpoint: "https://example.com/send" },
    agents: [
      { ref: "researcher", title: "Researcher", objective: "research", prompt: "Research." },
      { ref: "relevance-analyst", title: "Relevance analyst", objective: "qualify", prompt: "Qualify." },
    ],
    ...overrides,
  };
}

// A BRANCHED graph — deliberately not a linear skeleton — to prove the host preserves whatever
// topology the model designs.
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

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-compose-"));
    const repo = path.join(parent, "repo");
    fs.mkdirSync(repo);
    fs.writeFileSync(path.join(repo, "app.ts"), 'analytics.track("project_created", { projectId, source });\n');
    options = { root: path.join(parent, "state"), claudeDir: path.join(parent, "claude") };
    createProject({ name: "Product" }, options);
    scanRepo(repo, { winEvent: "project_created" });
  });

  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  it("composes the model's branched graph, binds founder IO, and persists a runnable flow", async () => {
    const composed = await composeNakedGraph(channelInput(), { ...options, compose: branchedComposer });

    assert.equal(composed.validation.ok, true);
    // Topology the model designed is preserved: source fans out to two agents.
    const fanout = composed.graph.edges.filter((e) => e.source === "src" && e.edgeType === "data");
    assert.equal(fanout.length, 2, "branched topology survives composition");
    // Host bound the founder's concrete IO onto the model's source/execute nodes.
    assert.ok(composed.graph.nodes.some((n) => n.category === "source" && n.connector === "csv"));
    assert.ok(composed.graph.nodes.some((n) => n.category === "execute" && n.connector === "http"));
    assert.ok(composed.graph.nodes.some((n) => n.kind === "agent"));
    assert.ok(composed.graph.nodes.some((n) => n.category === "gate"));
    // Naked path: no outcome program identity, agents run inline (agentPrompt), no on-disk artifacts.
    assert.equal(composed.graph.outcomeProgramId ?? null, null, "no outcome program in the naked path");
    assert.equal(composed.program ?? null, null, "no program returned");
    // Persisted as a runnable flow.
    assert.equal(loadFlow(composed.channel.graphId, null, options).graph.nodes.length, composed.graph.nodes.length);
  });

  it("enforces the wall: rejects an execute node that is not behind a founder gate", async () => {
    const ungated = () => ({
      ok: true,
      nodes: [
        { id: "src", category: "source", connector: "manual", label: "Input" },
        { id: "out", category: "execute", connector: "local", label: "Send" },
      ],
      edges: [{ source: "src", target: "out", edgeType: "data" }],
    });
    await assert.rejects(
      composeNakedGraph(channelInput(), { ...options, compose: ungated }),
      /gate/i,
    );
  });

  it("the blank default refuses rather than falling back to a template", async () => {
    await assert.rejects(
      composeNakedGraph(channelInput(), options),
      /subscription/i,
    );
  });

  it("the pure compose path returns nodes/edges without persisting", async () => {
    const before = loadProject(options).channels?.length ?? 0;
    const { nodes, edges } = await composeGraphForChannel({
      channel: { id: "c1", title: "Referral loop", objective: "loop" },
      agents: channelInput().agents,
      input: { type: "csv", csv: "id,name\n1,Ada" },
      output: { type: "api", endpoint: "https://example.com/send" },
      compose: branchedComposer,
    });
    assert.ok(nodes.length > 0 && edges.length > 0, "pure path returns a composed graph");
    assert.ok(nodes.some((n) => n.category === "gate"), "the wall holds on the pure path");
    assert.equal(loadProject(options).channels?.length ?? 0, before, "pure path persists nothing");
  });
});
