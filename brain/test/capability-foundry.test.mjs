import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { ensureAgentCreationPolicy, listAgentCreationPolicies } from "../src/agent-policy-store.mjs";
import { createPersonalizedAgent, loadCapabilityFoundry } from "../src/capability-foundry.mjs";
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

    assert.equal(program.status, "ready");
    assert.equal(program.measurementPlan.joinKey, "gtmActionId");
    assert.ok(policy.requiredInputs.includes("productTruth"));
    assert.ok(policy.evidenceRequirements.some((rule) => rule.includes("app.ts:3")));
    assert.equal(created.instance.creationPolicyId, policy.id);
    assert.equal(created.profile.productTruth.length, 1);
    assert.equal(listOutcomePrograms(project.id, options).length, 1);
    assert.equal(loadCapabilityFoundry(project.id, options).instances.length, 1);
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
