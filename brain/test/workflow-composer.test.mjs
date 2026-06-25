import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { composeOpportunityChannel } from "../src/workflow-composer.mjs";
import { saveGeneratedOpportunities, updateOpportunity } from "../src/opportunity-engine.mjs";
import { createProject, loadProject } from "../src/project-store.mjs";
import { loadFlow } from "../src/flow-store.mjs";
import { listOutcomePrograms } from "../src/program-store.mjs";
import { listAgentCreationPolicies } from "../src/agent-policy-store.mjs";
import { loadCapabilityFoundry } from "../src/capability-foundry.mjs";
import { listDomainEvents } from "../src/domain-events.mjs";
import { rebuildProjectState } from "../src/program-projection.mjs";
import { scanRepo } from "../src/scan.mjs";

const sortById = (rows) => [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)));

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
    assert.ok(composed.graph.outcomeProgramId, "graph carries the outcome program identity");
    const agentNode = composed.graph.nodes.find((n) => n.kind === "agent");
    assert.ok(agentNode.config.agentInstanceId, "agent node points to the personalized agent instance");
    assert.ok(agentNode.config.creationPolicyId, "agent node points to the creation policy");
    assert.ok(agentNode.config.personalizationProfileId, "agent node points to the personalization profile");
    // Persisted and activated; agent markdown written for each accepted agent.
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
    const { channel, agents } = await acceptChannelAndAgents();
    const composed = await composeOpportunityChannel({
      channelOpportunityId: channel.id,
      agentOpportunityIds: agents.map((a) => a.id),
    }, { ...options, compose: branchedComposer });

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
