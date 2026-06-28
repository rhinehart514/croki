import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { ensureAgentCreationPolicy, listAgentCreationPolicies } from "../src/agent-policy-store.mjs";
import { createPersonalizedAgent, loadCapabilityFoundry } from "../src/capability-foundry.mjs";
import { ensureGraphAgents } from "../src/program-compiler.mjs";
import { recordFeedbackSignalsFromRun } from "../src/feedback-ledger.mjs";
import { ensureOutcomeProgramForChannel, listOutcomePrograms } from "../src/program-store.mjs";

describe("outcome program and capability foundry", () => {
  let parent;
  let options;
  let project;
  let channel;
  let agent;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-foundry-"));
    options = { root: parent, projectId: "project-a" };
    project = {
      id: "project-a",
      name: "GTM IDE",
      sharedContext: {
        version: 7,
        repository: {
          evidence: [{ label: "win", file: "app.ts", line: 3, text: "analytics.track(\"meeting_booked\")" }],
        },
        founderTaste: {
          policies: ["Be concrete."],
          rejectedPatterns: ["generic compliment"],
        },
        outcomes: [],
        productFeedback: [],
        experiments: [],
      },
    };
    channel = {
      id: "channel-design-partners",
      title: "Technical founder design partners",
      objective: "Book technical founder conversations.",
      rationale: "The product is built for founders operating GTM like code.",
      status: "accepted",
      evidence: project.sharedContext.repository.evidence,
      output: { outcomeEvent: "meeting_booked", joinKey: "gtmActionId" },
    };
    agent = {
      id: "agent-proof-extraction",
      title: "Proof Extraction Agent",
      objective: "Extract product-specific proof for a founder conversation.",
      provider: "claude",
      ref: "proof-extraction",
      prompt: "Find real proof.",
      evidence: project.sharedContext.repository.evidence,
    };
  });

  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  it("creates a durable program, policy, personalization profile, and agent instance", () => {
    const program = ensureOutcomeProgramForChannel(project, channel, options);
    const policy = ensureAgentCreationPolicy({ project, program, agentOpportunity: agent }, options);
    const created = createPersonalizedAgent({ project, program, policy, agentOpportunity: agent }, options);

    assert.equal(program.lifecycle, "active");
    assert.equal(program.measurementPlan.joinKey, "gtmActionId");
    assert.ok(policy.requiredInputs.includes("productTruth"));
    assert.ok(policy.evidenceRequirements.some((rule) => rule.includes("app.ts:3")));
    assert.equal(created.instance.creationPolicyId, policy.id);
    assert.equal(created.profile.productTruth.length, 1);
    assert.equal(listOutcomePrograms(project.id, options).length, 1);
    assert.equal(loadCapabilityFoundry(project.id, options).instances.length, 1);
  });

  it("persists the agent definition to disk at the instance's artifactPath", () => {
    const program = ensureOutcomeProgramForChannel(project, channel, options);
    const policy = ensureAgentCreationPolicy({ project, program, agentOpportunity: agent }, options);
    const created = createPersonalizedAgent({ project, program, policy, agentOpportunity: agent }, options);

    assert.ok(created.instance.artifactPath, "instance keeps an artifactPath");
    assert.equal(path.isAbsolute(created.instance.artifactPath), true);
    assert.ok(created.instance.artifactPath.includes("capability-foundry"), "definition lives under the foundry root, not a new home");
    assert.equal(fs.existsSync(created.instance.artifactPath), true, "the definition file actually exists");
    const md = fs.readFileSync(created.instance.artifactPath, "utf8");
    assert.match(md, /name: proof-extraction/);
    assert.match(md, /Extract product-specific proof/);
  });

  it("mints a real teammate for every agent the graph reaches for (build, don't just pick)", () => {
    const program = ensureOutcomeProgramForChannel(project, channel, options);
    // A graph that reaches for a teammate no declared opportunity ever compiled — a content motion's
    // Content Strategist, dropped by the composer. It has no agentInstanceId yet.
    const graph = {
      id: "graph-content",
      nodes: [
        { id: "research", kind: "agent", ref: "content-research", label: "Content Strategist", contract: { accepts: ["productTruth"], emits: ["angles"] } },
        { id: "gate", category: "gate", kind: "tool" },
        { id: "publish", category: "execute", kind: "agent", ref: "content-publish", label: "Distribution Planner" },
      ],
      edges: [],
    };
    const before = loadCapabilityFoundry(project.id, options).instances.length;
    const ensured = ensureGraphAgents({ project, program, graph }, options);

    // Both reached-for agents are now real, personalized instances with on-disk definitions.
    assert.equal(ensured.agents.length, 2, "both reached-for agents were minted");
    const refs = ensured.agents.map((a) => a.instance.ref).sort();
    assert.deepEqual(refs, ["content-publish", "content-research"]);
    assert.equal(loadCapabilityFoundry(project.id, options).instances.length, before + 2);
    for (const a of ensured.agents) assert.equal(fs.existsSync(a.instance.artifactPath), true, "definition written to disk");

    // The graph nodes now carry their instance — they're teammates, not generic steps.
    const researchNode = ensured.graph.nodes.find((n) => n.id === "research");
    assert.ok(researchNode.config.agentInstanceId, "the node is now backed by a minted instance");
    assert.equal(ensured.graph.outcomeProgramId, program.id);

    // Idempotent: re-running mints nothing new (the node already carries its instance).
    const again = ensureGraphAgents({ project, program, graph: ensured.graph }, options);
    assert.equal(again.agents.length, 0, "a second pass mints nothing — already real");
  });

  it("shares one agent instance across channels instead of copying it per program", () => {
    // One engine, many channels: a second channel reaching for the same agent ref must reuse the
    // instance the first channel already minted — not mint a private copy. This is what lets the
    // canvas draw Prospect Researcher once with fan-out edges instead of a duplicate per lane.
    const program1 = ensureOutcomeProgramForChannel(project, channel, options);
    const channel2 = { ...channel, id: "channel-referrals", title: "Referral loop", objective: "Turn pilots into referrals." };
    const program2 = ensureOutcomeProgramForChannel(project, channel2, options);
    assert.notEqual(program1.id, program2.id, "two distinct programs");

    const policy = ensureAgentCreationPolicy({ project, program: program1, agentOpportunity: agent }, options);
    const first = createPersonalizedAgent({ project, program: program1, policy, agentOpportunity: agent }, options);
    // The second channel reaches for the same ref under the same policy — it must resolve to the
    // exact same instance, and the store must hold one, not two.
    const second = createPersonalizedAgent({ project, program: program2, policy, agentOpportunity: agent }, options);

    assert.equal(second.instance.id, first.instance.id, "same ref + policy resolves to one shared instance");
    assert.equal(second.instance.lineageId, first.instance.lineageId, "shared lineage keyed by ref, not program");
    assert.ok(!first.instance.id.includes(program1.id), "instance id is not namespaced to the creating program");
    const refInstances = loadCapabilityFoundry(project.id, options).instances.filter((i) => i.ref === agent.ref);
    assert.equal(refInstances.length, 1, "the agent exists once for the whole project, shared by both channels");
  });

  it("turns founder feedback into a new agent creation policy version", () => {
    const program = ensureOutcomeProgramForChannel(project, channel, options);
    const policy = ensureAgentCreationPolicy({ project, program, agentOpportunity: agent }, options);
    const created = createPersonalizedAgent({ project, program, policy, agentOpportunity: agent }, options);
    const graph = {
      id: "graph-a",
      nodes: [
        { id: "agent", kind: "agent", ref: agent.ref, config: { creationPolicyId: policy.id } },
        { id: "gate", category: "gate" },
      ],
    };
    const result = {
      runId: "run-a",
      graphId: "graph-a",
      nodes: {
        gate: {
          category: "gate",
          ok: true,
          items: [
            { id: "1", approvalStatus: "rejected", draft: "Loved your impressive work, wanted to connect." },
            { id: "2", approvalStatus: "approved", editedFrom: "Generic proof.", draft: "Your repo shows the win event but attribution is blind." },
          ],
        },
      },
    };

    const recorded = recordFeedbackSignalsFromRun({ projectId: project.id, graph, result }, options);
    const policies = listAgentCreationPolicies(project.id, options);
    const original = policies.find((item) => item.id === policy.id);
    const updated = policies.find((item) => item.previousPolicyId === policy.id);

    assert.equal(created.instance.ref, "proof-extraction");
    assert.equal(recorded.signals.length, 2);
    assert.equal(original.version, 1);
    assert.equal(updated.version, 2);
    assert.ok(updated.negativeRules.some((rule) => rule.includes("Loved your impressive work")));
    assert.ok(updated.positiveRules.some((rule) => rule.includes("attribution is blind")));
  });
});
