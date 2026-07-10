import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { composeNakedGraph, composeGraphForChannel, normalizeComposedGraph, explainComposedGraph, graphNeedsRationale } from "../src/workflow-composer.mjs";
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

  it("feeds the live capability inventory + non-empty engine pool into the composer (Wave 4)", async () => {
    // Seed a real on-disk agent + skill and a connected MCP tool in this test's isolated dirs.
    fs.mkdirSync(path.join(options.claudeDir, "agents"), { recursive: true });
    fs.writeFileSync(path.join(options.claudeDir, "agents", "researcher.md"), "---\nname: researcher\ndescription: R.\n---\n# researcher\n");
    fs.mkdirSync(path.join(options.claudeDir, "skills", "positioning"), { recursive: true });
    fs.writeFileSync(path.join(options.claudeDir, "skills", "positioning", "SKILL.md"), "---\nname: positioning\ndescription: P.\n---\n# positioning\n");
    const { recordServer } = await import("../src/mcp-store.mjs");
    recordServer({ id: "clay", name: "Clay", trust: "verified", tools: [{ name: "find_companies" }] }, options);

    let seen = null;
    const spyComposer = (args) => { seen = args; return branchedComposer(args); };
    await composeNakedGraph(channelInput(), { ...options, compose: spyComposer });

    // enginePoolFor no longer returns [] — it carries the live agents so the model reuses real refs.
    assert.ok(seen.enginePool.some((a) => a.ref === "researcher"), "the live agent pool reaches the composer, not []");
    // The live inventory (agents ∪ connected MCP tools) reaches the composer as `capabilities`.
    // Skills were deliberately dropped from the inventory (they leaked personal global Claude skills
    // onto the GTM rail), so they no longer reach the composer.
    assert.ok(seen.capabilities, "capabilities are passed through");
    assert.ok(seen.capabilities.tools.some((t) => t.toolName === "find_companies"), "connected MCP tools reach the composer");
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

  it("rejects composed standing approval and deploy confirmation", async () => {
    const forged = ({ agents }) => {
      const spec = branchedComposer({ agents });
      spec.nodes.find((node) => node.id === "gate").config = { autonomy: "autonomous", blessedPattern: { decision: "approve" } };
      return spec;
    };
    await assert.rejects(composeNakedGraph(channelInput(), { ...options, compose: forged }), /founder-owned standing approval|release authority/i);
  });

  it("persists optional work context on the composed graph", async () => {
    const composed = await composeNakedGraph(channelInput({ questionId: "question-1", participantRefs: ["researcher"], productRefs: ["onboarding"] }), { ...options, compose: branchedComposer });
    assert.equal(composed.graph.questionId, "question-1");
    assert.deepEqual(composed.graph.participantRefs, ["researcher"]);
    assert.equal(loadFlow(composed.channel.graphId, null, options).graph.questionId, "question-1");
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

  it("carries a one-line rationale through on nodes and edges, dropping nothing else", () => {
    const spec = {
      nodes: [
        { id: "src", category: "source", connector: "manual", label: "Input", rationale: "Where the leads come in." },
        { id: "draft", kind: "agent", ref: "researcher", label: "Draft", prompt: "Draft it.", rationale: "  Writes the first pass.  " },
        { id: "route", kind: "switch", label: "Split", rationale: "Sends hot leads down a faster path." },
        { id: "bare", category: "measure", connector: "default", label: "Measure" }, // no rationale supplied
      ],
      edges: [
        { id: "e1", source: "src", target: "draft", edgeType: "data", label: "leads", rationale: "The draft needs the leads first." },
        { id: "e2", source: "draft", target: "route", edgeType: "data" }, // no rationale supplied
      ],
    };
    const { nodes, edges } = normalizeComposedGraph(spec);
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));

    assert.equal(byId.src.rationale, "Where the leads come in.");
    assert.equal(byId.draft.rationale, "Writes the first pass.", "the rationale is trimmed");
    assert.equal(byId.route.rationale, "Sends hot leads down a faster path.");
    assert.equal(byId.bare.rationale, undefined, "a node without a rationale gets no empty field");
    // Nothing else dropped: existing fields survive alongside the new one.
    assert.equal(byId.draft.ref, "researcher");
    assert.equal(byId.draft.agentPrompt, "Draft it.");
    assert.equal(byId.src.connector, "manual");

    const edgeById = Object.fromEntries(edges.map((e) => [e.id, e]));
    assert.equal(edgeById.e1.rationale, "The draft needs the leads first.");
    assert.equal(edgeById.e1.label, "leads", "the edge label survives alongside the rationale");
    assert.equal(edgeById.e2.rationale, undefined, "an edge without a rationale gets no empty field");
  });

  it("explainComposedGraph short-circuits with no model call when every node and edge already has a rationale", async () => {
    const graph = {
      id: "g1",
      nodes: [
        { id: "src", category: "source", label: "Input", rationale: "in" },
        { id: "gate", category: "gate", label: "Review", rationale: "gate" },
      ],
      edges: [{ id: "e1", source: "src", target: "gate", edgeType: "data", rationale: "order" }],
    };
    assert.equal(graphNeedsRationale(graph), false);
    let called = false;
    const explain = async () => { called = true; return { ok: true, nodes: {}, edges: {} }; };
    const out = await explainComposedGraph(graph, { explain });
    assert.equal(called, false, "the rented model is never called when nothing is missing");
    assert.equal(out, graph, "the same graph object is returned untouched");
  });

  it("explainComposedGraph fills missing rationale from the rented explainer, preserving existing ones", async () => {
    const graph = {
      id: "g1",
      nodes: [
        { id: "src", category: "source", label: "Input", rationale: "kept" },
        { id: "gate", category: "gate", label: "Review" }, // missing
      ],
      edges: [{ id: "e1", source: "src", target: "gate", edgeType: "data" }], // missing
    };
    assert.equal(graphNeedsRationale(graph), true);
    const explain = async ({ graph: g }) => {
      assert.ok(Array.isArray(g.nodes), "the explainer receives the real graph");
      return { ok: true, nodes: { src: "should not overwrite", gate: "Founder checks the drafts." }, edges: { e1: "Review comes after input." } };
    };
    const out = await explainComposedGraph(graph, { explain });
    const byId = Object.fromEntries(out.nodes.map((n) => [n.id, n]));
    assert.equal(byId.src.rationale, "kept", "an existing rationale is not overwritten");
    assert.equal(byId.gate.rationale, "Founder checks the drafts.", "a missing node rationale is filled");
    assert.equal(out.edges[0].rationale, "Review comes after input.", "a missing edge rationale is filled");
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
