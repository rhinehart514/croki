import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { executeDomainCommand } from "../src/domain-commands.mjs";
import { listAgentCreationPolicies } from "../src/agent-policy-store.mjs";
import { loadCapabilityFoundry } from "../src/capability-foundry.mjs";
import { listDomainEvents } from "../src/domain-events.mjs";
import { saveFlow } from "../src/flow-store.mjs";
import { createProject, loadProject } from "../src/project-store.mjs";
import { listOutcomePrograms } from "../src/program-store.mjs";
import { runProgram } from "../src/program-runtime.mjs";
import { rebuildProjectState, projectState } from "../src/program-projection.mjs";
import { makeStepRuntime } from "../src/step-runners.mjs";

// Keep only the domain-meaningful fields; write-time timestamps legitimately differ between the
// store write and the event append, so they are not part of the "rebuildable state" contract.
const sortById = (rows) => [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)));
const programShape = (p) => ({
  id: p.id,
  status: p.status,
  graphId: p.graphId ?? null,
  workflowGraphId: p.workflowGraph?.id ?? null,
  measurementPlan: p.measurementPlan ?? {},
});
const policyShape = (p) => ({ id: p.id, version: p.version, previousPolicyId: p.previousPolicyId ?? null, positiveRules: p.positiveRules, negativeRules: p.negativeRules });
const instanceShape = (i) => ({ id: i.id, version: i.version, previousInstanceId: i.previousInstanceId ?? null, creationPolicyId: i.creationPolicyId, ref: i.ref });

describe("program projection — events are the authoritative history", () => {
  let parent;
  let options;
  let project;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-projection-"));
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

  it("the pure fold is deterministic and ignores narration-only events", () => {
    const events = [
      { type: "OutcomeProgramCreated", aggregateId: "p1", data: { id: "p1", status: "draft" } },
      { type: "ProgramRunStarted", aggregateId: "p1", data: { graphId: "g1" } }, // narration: no state change
      { type: "ProgramStatusChanged", aggregateId: "p1", data: { status: "learning" } },
    ];
    const a = projectState(events);
    const b = projectState(events);
    assert.equal(a.programs.get("p1").status, "learning");
    assert.deepEqual([...a.programs.keys()], [...b.programs.keys()]);
  });

  it("rebuilds current program/policy/agent state purely from the event log after a full loop", async () => {
    const cmd = (name, input) => executeDomainCommand(name, { ...input, projectId: project.id }, { ...options, projectId: project.id });

    const program = await cmd("CreateOutcomeProgram", {
      name: "Book technical founder calls",
      objective: "Book technical founder calls from grounded product proof.",
      desiredOutcome: { type: "meeting_booked", description: "Book a qualified founder call." },
    });
    await cmd("DefineMeasurementPlan", {
      programId: program.id,
      measurementPlan: { outcomeEvent: "meeting_booked", joinKey: "gtmActionId", attributionSource: "product analytics" },
    });
    const policy = await cmd("CreateAgentCreationPolicy", {
      programId: program.id,
      purpose: "Draft grounded founder conversation prompts.",
      requiredInputs: ["programContext", "productTruth", "upstreamItems"],
      requiredOutputs: ["structuredResults", "evidence", "uncertainty"],
      evidenceRequirements: ["Use cited product evidence."],
      evaluationSignals: ["founderDecision", "founderEdit", "runFailure", "observedOutcome"],
      negativeRules: ["Do not use generic compliments."],
      safetyRules: ["External effects must pass through a founder gate."],
    });
    const { instance, profile } = await cmd("CreatePersonalizedAgent", {
      project,
      program,
      policy,
      agentOpportunity: { id: "agent-proof-drafter", title: "Proof drafter", objective: "Draft grounded founder conversation prompts.", ref: "proof-drafter" },
    });

    const graph = {
      id: "program-graph",
      name: "Program graph",
      outcomeProgramId: program.id,
      revision: 1,
      nodes: [
        { id: "seed", category: "source", connector: "manual", label: "Seed", config: { items: [{ id: "lead-1" }, { id: "lead-2" }] } },
        {
          id: "draft", kind: "agent", ref: instance.ref, label: "Draft",
          config: { programId: program.id, agentInstanceId: instance.id, creationPolicyId: policy.id, personalizationProfileId: profile.id },
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
    await cmd("ComposeProgramWorkflow", { programId: program.id, graphId: graph.id });

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
    await runProgram(program.id, {
      stepRuntime,
      resumeRunId: pending.result.runId,
      decisions: {
        gate: {
          "lead-1": { decision: "reject" },
          "lead-2": { decision: "approve", editedDraft: "Your product shows the meeting_booked event, and I would frame attribution as the open question." },
        },
      },
    }, { ...options, projectId: project.id });

    // ── The reconciliation: rebuild purely from events, compare to the stored snapshots ──
    const rebuilt = rebuildProjectState(project.id, { ...options, projectId: project.id });

    const storedPrograms = listOutcomePrograms(project.id, { ...options, projectId: project.id });
    const storedPolicies = listAgentCreationPolicies(project.id, { ...options, projectId: project.id });
    const foundry = loadCapabilityFoundry(project.id, { ...options, projectId: project.id });

    // The loop actually compounded — there must be a v2 policy and a v2 agent to rebuild.
    assert.equal(storedPolicies.length, 2);
    assert.equal(foundry.instances.length, 2);

    assert.deepEqual(sortById(rebuilt.programs).map(programShape), sortById(storedPrograms).map(programShape));
    assert.deepEqual(sortById(rebuilt.policies).map(policyShape), sortById(storedPolicies).map(policyShape));
    assert.deepEqual(sortById(rebuilt.instances).map(instanceShape), sortById(foundry.instances).map(instanceShape));
    assert.deepEqual(sortById(rebuilt.profiles).map((p) => p.id), sortById(foundry.profiles).map((p) => p.id));
    assert.equal(rebuilt.evaluations.length, foundry.evaluations.length);

    // And the rebuilt program reflects the terminal status, proving status transitions are events.
    assert.equal(rebuilt.programs.find((p) => p.id === program.id).status, "learning");
    assert.equal(rebuilt.programs.find((p) => p.id === program.id).workflowGraph?.id, graph.id);

    // Sanity: the event log carries a creation event for every aggregate the stores hold.
    const events = listDomainEvents(project.id, { ...options, projectId: project.id });
    const types = new Set(events.map((e) => e.type));
    for (const required of ["OutcomeProgramCreated", "AgentCreationPolicyCreated", "PersonalizedAgentCreated", "AgentCreationPolicyUpdated", "NextAgentVersionCreated", "ProgramStatusChanged"]) {
      assert.ok(types.has(required), `missing event: ${required}`);
    }
  });
});
