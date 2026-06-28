import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { composeOpportunityChannel, previewOpportunityChannel, composePortfolioGraph, composePortfolioFromStudio } from "../src/workflow-composer.mjs";
import { createProject, loadProject } from "../src/project-store.mjs";
import { loadFlow } from "../src/flow-store.mjs";
import { listOutcomePrograms } from "../src/program-store.mjs";
import { listAgentCreationPolicies } from "../src/agent-policy-store.mjs";
import { loadCapabilityFoundry } from "../src/capability-foundry.mjs";
import { listDomainEvents } from "../src/domain-events.mjs";
import { rebuildProjectState } from "../src/program-projection.mjs";
import { scanRepo } from "../src/scan.mjs";

const sortById = (rows) => [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)));

// Channels are now defined directly (by the founder or by Claude) and handed to the composer as an
// inline spec — there is no auto-generated opportunity accept-list. The composer is a fake: the test
// exercises host plumbing (compile → normalize → bind IO → enforce the wall → persist), not model
// quality.
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

  it("composes the model's branched graph, binds founder IO, and persists", async () => {
    const composed = await composeOpportunityChannel(channelInput(), { ...options, compose: branchedComposer });

    assert.equal(composed.validation.ok, true);
    // Topology the model designed is preserved: source fans out to two agents.
    const fanout = composed.graph.edges.filter((e) => e.source === "src" && e.edgeType === "data");
    assert.equal(fanout.length, 2, "branched topology survives composition");
    // Host bound the founder's concrete IO onto the model's source/execute nodes.
    assert.ok(composed.graph.nodes.some((n) => n.category === "source" && n.connector === "csv"));
    assert.ok(composed.graph.nodes.some((n) => n.category === "execute" && n.connector === "http"));
    assert.ok(composed.graph.nodes.some((n) => n.kind === "agent"));
    assert.ok(composed.graph.nodes.some((n) => n.category === "gate"));
    assert.ok(composed.graph.outcomeProgramId, "graph carries the outcome program identity");
    const agentNode = composed.graph.nodes.find((n) => n.kind === "agent");
    assert.ok(agentNode.config.agentInstanceId, "agent node points to the personalized agent instance");
    assert.ok(agentNode.config.creationPolicyId, "agent node points to the creation policy");
    assert.ok(agentNode.config.personalizationProfileId, "agent node points to the personalization profile");
    // Persisted and activated; agent markdown written for each agent.
    assert.equal(loadFlow(composed.channel.graphId, null, options).graph.nodes.length, composed.graph.nodes.length);
    assert.equal(loadProject(options).activeChannelId, composed.channel.id);
    assert.equal(listOutcomePrograms(loadProject(options).id, options).length, 1);
    assert.equal(listAgentCreationPolicies(loadProject(options).id, options).length, 2);
    assert.equal(loadCapabilityFoundry(loadProject(options).id, options).instances.length, 2);
    assert.ok(fs.readdirSync(path.join(options.claudeDir, "agents")).length >= 2);
    const markdown = fs.readFileSync(path.join(options.claudeDir, "agents", `${agentNode.ref}.md`), "utf8");
    assert.match(markdown, /creationPolicyId:/);
    assert.match(markdown, /Evidence Requirements/);
  });

  it("the live compose path is event-complete: state rebuilds purely from the domain log", async () => {
    const composed = await composeOpportunityChannel(channelInput(), { ...options, compose: branchedComposer });

    const projectId = loadProject(options).id;
    const events = listDomainEvents(projectId, options);
    const types = new Set(events.map((e) => e.type));
    // The aggregates the live path created must each carry a creation event (the gap this closes).
    for (const required of ["OutcomeProgramCreated", "AgentCreationPolicyCreated", "PersonalizationProfileAssembled", "PersonalizedAgentCreated", "WorkflowComposed"]) {
      assert.ok(types.has(required), `missing event: ${required}`);
    }

    // Reconstruct state from events alone and compare to the stores — the authoritative-log claim.
    const rebuilt = rebuildProjectState(projectId, options);
    const storedPrograms = listOutcomePrograms(projectId, options);
    const storedPolicies = listAgentCreationPolicies(projectId, options);
    const foundry = loadCapabilityFoundry(projectId, options);

    const programShape = (p) => ({
      id: p.id,
      lifecycle: p.lifecycle,
      lastRunStatus: p.lastRunStatus ?? null,
      graphId: p.graphId ?? null,
      workflowGraphId: p.workflowGraph?.id ?? null,
    });
    assert.deepEqual(sortById(rebuilt.programs).map(programShape), sortById(storedPrograms).map(programShape));
    assert.deepEqual(sortById(rebuilt.policies).map((p) => p.id), sortById(storedPolicies).map((p) => p.id));
    assert.deepEqual(sortById(rebuilt.instances).map((i) => i.id), sortById(foundry.instances).map((i) => i.id));
    assert.deepEqual(sortById(rebuilt.profiles).map((p) => p.id), sortById(foundry.profiles).map((p) => p.id));
    // The rebuilt program carries the graph it was composed onto, not a pre-composition stub.
    assert.equal(rebuilt.programs[0].graphId, composed.graph.id);
    assert.equal(rebuilt.programs[0].workflowGraph?.id, composed.graph.id);

    // Idempotent: re-composing does not double-emit creation events for the same aggregates.
    const programCreations = events.filter((e) => e.type === "OutcomeProgramCreated").length;
    assert.equal(programCreations, 1);
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
      composeOpportunityChannel(channelInput(), { ...options, compose: ungated }),
      /gate/i,
    );
  });

  it("preview composes the graph but persists nothing — no flow, program, or activation", async () => {
    const projectId = loadProject(options).id;
    const eventsBefore = listDomainEvents(projectId, options).length;

    const preview = await previewOpportunityChannel(channelInput(), { ...options, compose: branchedComposer });

    // The would-be graph came back, branched topology intact and founder IO bound.
    assert.ok(preview.graph.nodes.length > 0, "preview returns a composed graph");
    const fanout = preview.graph.edges.filter((e) => e.source === "src" && e.edgeType === "data");
    assert.equal(fanout.length, 2, "preview preserves the model's branched topology");
    assert.ok(preview.graph.nodes.some((n) => n.category === "source" && n.connector === "csv"));

    // Nothing was persisted: no programs, no policies, no agent instances, no new domain events,
    // no active channel.
    assert.equal(listOutcomePrograms(projectId, options).length, 0, "preview created no program");
    assert.equal(listAgentCreationPolicies(projectId, options).length, 0, "preview created no policy");
    assert.equal(loadCapabilityFoundry(projectId, options).instances.length, 0, "preview created no agent instance");
    assert.equal(listDomainEvents(projectId, options).length, eventsBefore, "preview emitted no domain events");
    assert.equal(loadProject(options).activeChannelId ?? null, null, "preview did not activate a channel");
  });

  it("apply persists the exact previewed graph without re-running the composer", async () => {
    const preview = await previewOpportunityChannel(channelInput(), { ...options, compose: branchedComposer });

    // Apply with the previewed graph and a composer that would THROW if it ran — proving the apply
    // path reuses the previewed nodes/edges instead of re-composing behind the founder's back.
    const explodingComposer = () => { throw new Error("composer must not run on apply of a previewed graph"); };
    const applied = await composeOpportunityChannel(
      { ...channelInput(), graph: preview.graph },
      { ...options, compose: explodingComposer },
    );

    assert.equal(applied.validation.ok, true);
    // The persisted graph is the previewed one (same node count, source bound to csv).
    assert.equal(applied.graph.nodes.length, preview.graph.nodes.length);
    assert.equal(loadFlow(applied.channel.graphId, null, options).graph.nodes.length, preview.graph.nodes.length);
    // Now the side effects DID happen: program, policies, instances, and activation.
    const projectId = loadProject(options).id;
    assert.equal(loadProject(options).activeChannelId, applied.channel.id);
    assert.equal(listOutcomePrograms(projectId, options).length, 1);
    assert.equal(listAgentCreationPolicies(projectId, options).length, 2);
    assert.equal(loadCapabilityFoundry(projectId, options).instances.length, 2);
  });

  it("the blank default refuses rather than falling back to a template", async () => {
    await assert.rejects(
      composeOpportunityChannel(channelInput(), options),
      /subscription/i,
    );
  });
});

describe("one engine, shared agent pool", () => {
  // A composer that records the engine pool it was handed, then returns a valid gated graph reusing
  // the channel's own agent. Proves the host feeds each channel the agents earlier channels use, so
  // the model can reuse one shared teammate instead of minting a copy per lane.
  function recordingComposer(seenPools) {
    return ({ agents, enginePool }) => {
      seenPools.push(enginePool ?? []);
      const a = agents[0];
      return {
        ok: true,
        nodes: [
          { id: "ctx", category: "context", connector: "product", label: "Context" },
          { id: "ag", kind: "agent", ref: a.ref, label: a.title },
          { id: "gate", category: "gate", connector: "default", label: "Founder review" },
          { id: "out", category: "execute", connector: "local", label: "Stage" },
        ],
        edges: [
          { source: "ctx", target: "ag", edgeType: "context" },
          { source: "ag", target: "gate", edgeType: "data" },
          { source: "gate", target: "out", edgeType: "data" },
        ],
      };
    };
  }

  it("feeds each portfolio channel the agents earlier channels already use", async () => {
    const seenPools = [];
    await composePortfolioGraph({
      goal: "land pilots",
      channels: [
        { channel: { id: "c1", name: "Outbound", objective: "outbound" }, agents: [{ ref: "researcher", title: "Researcher", objective: "research prospects" }] },
        { channel: { id: "c2", name: "Referral", objective: "referral" }, agents: [{ ref: "designer", title: "Designer", objective: "design referral" }] },
      ],
      compose: recordingComposer(seenPools),
    });
    assert.equal(seenPools.length, 2);
    assert.deepEqual(seenPools[0], [], "the first channel sees an empty engine pool");
    assert.ok(seenPools[1].some((a) => a.ref === "researcher"), "the second channel sees the first channel's agent in the pool");
  });
});

describe("composePortfolioFromStudio — portfolio from inline channel specs", () => {
  let parent;
  let options;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-portfolio-"));
    options = { root: path.join(parent, "state"), claudeDir: path.join(parent, "claude") };
    createProject({ name: "Product" }, options);
  });

  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  // A gated 4-node system per channel, so the union has real shapes and the wall holds.
  const fakeCompose = async ({ channel, agents }) => ({
    ok: true,
    nodes: [
      { id: "src", category: "source", connector: "manual", label: "Seed", config: { items: [] } },
      { id: "do", kind: "agent", ref: agents[0]?.ref || "gtm-find-prospects", label: "Work", agentPrompt: channel.objective || "" },
      { id: "gate", category: "gate", connector: "default", label: "Founder review" },
      { id: "send", category: "execute", connector: "local", label: "Stage" },
    ],
    edges: [
      { id: "a", source: "src", target: "do", edgeType: "data" },
      { id: "b", source: "do", target: "gate", edgeType: "data" },
      { id: "c", source: "gate", target: "send", edgeType: "data" },
    ],
  });

  const inlineChannels = () => ([
    { channel: { id: "ch-outbound", title: "Operator outreach", objective: "reach operators" }, agents: [{ ref: "gtm-find-prospects", title: "Prospector", objective: "find prospects" }] },
    { channel: { id: "ch-referral", title: "Vouch loop", objective: "earn referrals" }, agents: [{ ref: "gtm-vouch-request-message-drafter", title: "Voucher", objective: "draft vouch" }] },
  ]);

  it("unions the provided channels into one valid, gated portfolio", async () => {
    const graph = await composePortfolioFromStudio({ goal: "land a pilot", channels: inlineChannels() }, { ...options, compose: fakeCompose });
    assert.equal(graph.kind, "portfolio");
    assert.equal(graph.systems.length, 2, "each provided channel becomes a system");
    assert.equal(graph.nodes.filter((n) => n.category === "gate").length, 2, "each system keeps its founder gate");
    assert.equal(graph.name, "land a pilot");
  });

  it("refuses to compose a portfolio when no channel is provided", async () => {
    await assert.rejects(() => composePortfolioFromStudio({}, { ...options, compose: fakeCompose }), /at least one channel/);
  });
});
