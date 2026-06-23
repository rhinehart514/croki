import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createAgentCreationPolicy, listAgentCreationPolicies } from "../src/agent-policy-store.mjs";
import { createPersonalizedAgent, loadCapabilityFoundry } from "../src/capability-foundry.mjs";
import { listDomainEvents } from "../src/domain-events.mjs";
import { saveFlow } from "../src/flow-store.mjs";
import { createProject, loadProject } from "../src/project-store.mjs";
import { createOutcomeProgram, defineMeasurementPlan, listOutcomePrograms, updateOutcomeProgram } from "../src/program-store.mjs";
import { runProgram } from "../src/program-runtime.mjs";
import { makeStepRuntime } from "../src/step-runners.mjs";

describe("program runtime executable domain loop", () => {
  let parent;
  let options;
  let project;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-program-runtime-"));
    options = { root: parent };
    createProject({ name: "GTM IDE" }, options);
    project = loadProject(options);
    project.sharedContext.repository = {
      repo: path.join(parent, "repo"),
      outcome: "meeting_booked",
      evidence: [{ label: "win", file: "app.ts", line: 1, text: "analytics.track('meeting_booked')" }],
    };
  });

  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  it("runs founder outcome through gate feedback into policy v2 and agent instance v2", async () => {
    const program = createOutcomeProgram({
      projectId: project.id,
      name: "Book technical founder calls",
      objective: "Book technical founder calls from grounded product proof.",
      desiredOutcome: { type: "meeting_booked", description: "Book a qualified founder call." },
    }, { ...options, projectId: project.id });
    defineMeasurementPlan(program.id, {
      outcomeEvent: "meeting_booked",
      joinKey: "gtmActionId",
      attributionSource: "product analytics",
    }, { ...options, projectId: project.id });
    const policy = createAgentCreationPolicy({
      projectId: project.id,
      programId: program.id,
      purpose: "Draft grounded founder conversation prompts.",
      requiredInputs: ["programContext", "productTruth", "upstreamItems"],
      requiredOutputs: ["structuredResults", "evidence", "uncertainty"],
      evidenceRequirements: ["Use cited product evidence."],
      evaluationSignals: ["founderDecision", "founderEdit", "runFailure", "observedOutcome"],
      negativeRules: ["Do not use generic compliments."],
      safetyRules: ["External effects must pass through a founder gate."],
    }, { ...options, projectId: project.id });
    const { instance, profile } = createPersonalizedAgent({
      project,
      program,
      policy,
      agentOpportunity: {
        id: "agent-proof-drafter",
        title: "Proof drafter",
        objective: "Draft grounded founder conversation prompts.",
        ref: "proof-drafter",
      },
    }, { ...options, projectId: project.id });
    const graph = {
      id: "program-graph",
      name: "Program graph",
      outcomeProgramId: program.id,
      revision: 1,
      nodes: [
        { id: "seed", category: "source", connector: "manual", label: "Seed", config: { items: [{ id: "lead-1" }, { id: "lead-2" }] } },
        {
          id: "draft",
          kind: "agent",
          ref: instance.ref,
          label: "Draft",
          config: {
            programId: program.id,
            agentInstanceId: instance.id,
            creationPolicyId: policy.id,
            personalizationProfileId: profile.id,
          },
          contract: { accepts: ["id"], emits: ["draft", "evidence", "uncertainty"], minItems: 1 },
        },
        { id: "gate", category: "gate", connector: "default", label: "Founder review", config: {} },
      ],
      edges: [
        { id: "a", source: "seed", target: "draft", edgeType: "data" },
        { id: "b", source: "draft", target: "gate", edgeType: "data" },
      ],
    };
    saveFlow(graph, options);
    updateOutcomeProgram(program.id, { status: "ready", graphId: graph.id }, { ...options, projectId: project.id });

    const stepRuntime = makeStepRuntime({
      agent: async (_node, upstream) => ({
        ok: true,
        items: upstream.map((item) => ({
          id: item.id,
          draft: item.id === "lead-1"
            ? "Loved your impressive work, wanted to connect."
            : "Your repo shows the meeting_booked event, but attribution is still a blind spot.",
          evidence: [{ file: "app.ts", line: 1 }],
          uncertainty: "Attribution has not been proven.",
        })),
      }),
    });

    const pending = await runProgram(program.id, { stepRuntime }, { ...options, projectId: project.id });
    assert.equal(pending.programStatus, "waiting_for_gate");
    assert.deepEqual(pending.result.pendingGates, ["gate"]);

    const learned = await runProgram(program.id, {
      stepRuntime,
      resumeRunId: pending.result.runId,
      decisions: {
        gate: {
          "lead-1": { decision: "reject" },
          "lead-2": {
            decision: "approve",
            editedDraft: "Your product shows the meeting_booked event, and I would frame attribution as the open question.",
          },
        },
      },
    }, { ...options, projectId: project.id });

    assert.equal(learned.programStatus, "learning");
    assert.equal(learned.feedback.signals.length, 2);
    assert.equal(learned.evaluations.length, 1);
    assert.equal(learned.nextVersions.length, 1);

    const programs = listOutcomePrograms(project.id, { ...options, projectId: project.id });
    assert.equal(programs.find((item) => item.id === program.id).status, "learning");

    const policies = listAgentCreationPolicies(project.id, { ...options, projectId: project.id });
    const policyV1 = policies.find((item) => item.id === policy.id);
    const policyV2 = policies.find((item) => item.previousPolicyId === policy.id);
    assert.equal(policyV1.version, 1);
    assert.equal(policyV2.version, 2);
    assert.ok(policyV2.negativeRules.some((rule) => rule.includes("Loved your impressive work")));
    assert.ok(policyV2.positiveRules.some((rule) => rule.includes("meeting_booked")));

    const foundry = loadCapabilityFoundry(project.id, { ...options, projectId: project.id });
    assert.equal(foundry.instances.length, 2);
    const instanceV2 = foundry.instances.find((item) => item.previousInstanceId === instance.id);
    assert.equal(instanceV2.creationPolicyId, policyV2.id);
    assert.equal(foundry.evaluations.length, 2);
    assert.ok(foundry.evaluations.every((evaluation) => evaluation.agentInstanceId === instance.id));

    const events = listDomainEvents(project.id, { ...options, projectId: project.id });
    const eventTypes = new Set(events.map((event) => event.type));
    assert.ok(eventTypes.has("ProgramRunStarted"));
    assert.ok(eventTypes.has("FounderGateOpened"));
    assert.ok(eventTypes.has("FounderRejectedAction"));
    assert.ok(eventTypes.has("FounderEditedAction"));
    assert.ok(eventTypes.has("AgentEvaluated"));
    assert.ok(eventTypes.has("AgentCreationPolicyUpdated"));
    assert.ok(eventTypes.has("NextAgentVersionCreated"));
  });
});
