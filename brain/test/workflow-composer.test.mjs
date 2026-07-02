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

  it("enforces the wall on EVERY path: rejects a diamond that routes one branch around the gate", async () => {
    // A gate exists upstream of the execute node on ONE branch, but a sibling branch reaches the
    // same execute node WITHOUT passing through it. exists-a-gate-ancestor would wrongly pass; the
    // all-paths wall must reject — one ungated branch into an execute node is an ungated send.
    const diamondBypass = () => ({
      ok: true,
      nodes: [
        { id: "src", category: "source", connector: "manual", label: "Input" },
        { id: "gate", category: "gate", connector: "default", label: "Founder review" },
        { id: "out", category: "execute", connector: "local", label: "Send" },
      ],
      edges: [
        { source: "src", target: "gate", edgeType: "data" },
        { source: "gate", target: "out", edgeType: "data" },
        { source: "src", target: "out", edgeType: "data" }, // the ungated bypass branch
      ],
    });
    await assert.rejects(
      composeNakedGraph(channelInput(), { ...options, compose: diamondBypass }),
      /every path/i,
    );
  });

  it("the blank default refuses rather than falling back to a template", async () => {
    await assert.rejects(
      composeNakedGraph(channelInput(), options),
      /subscription/i,
    );
  });

  it("mcp and switch nodes survive composition with their edges and predicates intact", async () => {
    // The reproduced live bug: an X-post graph lost its engagement-reading mcp node and its
    // redeemed-vs-not switch during normalization, orphaning measure. Both kinds are in the
    // compose instruction and the runtime supports both — they must survive to the persisted flow.
    const withMcpAndSwitch = ({ agents }) => ({
      ok: true,
      nodes: [
        { id: "src", category: "source", connector: "manual", label: "Input" },
        { id: "draft", kind: "agent", ref: agents[0].ref, label: "Draft the post" },
        { id: "gate", category: "gate", connector: "default", label: "Founder review" },
        { id: "out", category: "execute", connector: "local", label: "Stage the post" },
        { id: "engagement", kind: "mcp", ref: "x-api/read_engagement", label: "Read engagement" },
        { id: "route", kind: "switch", label: "Redeemed vs not" },
        { id: "meas", category: "measure", connector: "default", label: "Measure" },
        { id: "followup", kind: "agent", ref: agents[1].ref, label: "Follow up" },
      ],
      edges: [
        { source: "src", target: "draft", edgeType: "data" },
        { source: "draft", target: "gate", edgeType: "data" },
        { source: "gate", target: "out", edgeType: "data" },
        { source: "out", target: "engagement", edgeType: "data" },
        { source: "engagement", target: "route", edgeType: "data" },
        { id: "route-redeemed", source: "route", target: "meas", edgeType: "data", predicate: { field: "redeemed", op: "eq", value: true } },
        { id: "route-silent", source: "route", target: "followup", edgeType: "data" },
      ],
    });
    const composed = await composeNakedGraph(channelInput(), { ...options, compose: withMcpAndSwitch });
    assert.equal(composed.validation.ok, true);
    const byId = Object.fromEntries(composed.graph.nodes.map((n) => [n.id, n]));
    assert.equal(byId.engagement?.kind, "mcp", "the mcp node survives normalization");
    assert.equal(byId.engagement?.ref, "x-api/read_engagement");
    assert.equal(byId.route?.kind, "switch", "the switch node survives normalization");
    assert.ok(composed.graph.edges.some((e) => e.source === "engagement" && e.target === "route"), "edges touching mcp/switch survive");
    const redeemed = composed.graph.edges.find((e) => e.id === "route-redeemed");
    assert.deepEqual(redeemed?.predicate, { field: "redeemed", op: "eq", value: true }, "the switch edge keeps its routing predicate");
    assert.ok(composed.graph.edges.some((e) => e.target === "meas"), "measure is not orphaned");
  });

  it("a truly unknown kind is kept and clearly marked unrunnable — never silently deleted", async () => {
    const withUnknownKind = ({ agents }) => ({
      ok: true,
      nodes: [
        { id: "src", category: "source", connector: "manual", label: "Input" },
        { id: "draft", kind: "agent", ref: agents[0].ref, label: "Draft" },
        { id: "gate", category: "gate", connector: "default", label: "Founder review" },
        { id: "out", category: "execute", connector: "local", label: "Stage" },
        { id: "ping", kind: "webhook", ref: "notify-me", label: "Ping me", config: { url: "https://example.com/hook" } },
      ],
      edges: [
        { source: "src", target: "draft", edgeType: "data" },
        { source: "draft", target: "gate", edgeType: "data" },
        { source: "gate", target: "out", edgeType: "data" },
        { source: "out", target: "ping", edgeType: "data" },
      ],
    });
    const composed = await composeNakedGraph(channelInput(), { ...options, compose: withUnknownKind });
    assert.equal(composed.validation.ok, true, "the surviving graph still validates and persists");
    const ping = composed.graph.nodes.find((n) => n.id === "ping");
    assert.ok(ping, "the unknown-kind node is kept, not deleted");
    assert.equal(ping.config.declaredKind, "webhook", "what the model asked for is preserved on the node");
    assert.equal(ping.config.declaredRef, "notify-me");
    assert.equal(ping.config.url, "https://example.com/hook", "the node's own config is preserved");
    assert.match(ping.config.unrunnable, /will not run/, "the node says plainly that it cannot run");
    assert.ok(composed.graph.edges.some((e) => e.source === "out" && e.target === "ping"), "its edges survive too");
  });

  it("with no founder input, a self-standing composed source keeps doing what it was designed to do", async () => {
    // The bindIO bug: with no founder input, the first non-agent source was flattened into
    // connector "manual" with items: [] — an empty paste-a-list stub that stalls the run. A
    // model-designed api source (e.g. pulling releases) must keep its connector and endpoint.
    const withApiSource = ({ agents }) => ({
      ok: true,
      nodes: [
        { id: "releases", category: "source", connector: "api", label: "New releases", config: { endpoint: "https://api.example.com/releases" } },
        { id: "draft", kind: "agent", ref: agents[0].ref, label: "Draft" },
        { id: "gate", category: "gate", connector: "default", label: "Founder review" },
        { id: "out", category: "execute", connector: "local", label: "Stage" },
      ],
      edges: [
        { source: "releases", target: "draft", edgeType: "data" },
        { source: "draft", target: "gate", edgeType: "data" },
        { source: "gate", target: "out", edgeType: "data" },
      ],
    });
    const composed = await composeNakedGraph(
      channelInput({ input: undefined, output: undefined }),
      { ...options, compose: withApiSource },
    );
    const source = composed.graph.nodes.find((n) => n.id === "releases");
    assert.equal(source.connector, "api", "the composed source keeps its own connector");
    assert.equal(source.config.endpoint, "https://api.example.com/releases", "and its own endpoint");
    assert.equal(source.config.items, undefined, "no empty founder list is stamped over it");
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
