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
import {
  listOutcomePrograms,
  loadProgramStore,
  migrateProgram,
  saveProgramStore,
} from "../src/program-store.mjs";
import { runProgram } from "../src/program-runtime.mjs";
import { listProductModels } from "../src/product-model-store.mjs";
import { rebuildProjectState, projectState } from "../src/program-projection.mjs";
import { makeStepRuntime } from "../src/step-runners.mjs";

// Keep only the domain-meaningful fields; write-time timestamps legitimately differ between the
// store write and the event append, so they are not part of the "rebuildable state" contract.
const sortById = (rows) => [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)));
const programShape = (p) => ({
  id: p.id,
  lifecycle: p.lifecycle,
  lastRunStatus: p.lastRunStatus ?? null,
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
      { type: "OutcomeProgramCreated", aggregateId: "p1", data: { id: "p1", lifecycle: "draft", lastRunStatus: null } },
      { type: "ProgramRunStarted", aggregateId: "p1", data: { graphId: "g1" } }, // narration: no state change
      { type: "ProgramStatusChanged", aggregateId: "p1", data: { lastRunStatus: "learning" } },
    ];
    const a = projectState(events);
    const b = projectState(events);
    // The run outcome lands in lastRunStatus; lifecycle stays as created.
    assert.equal(a.programs.get("p1").lastRunStatus, "learning");
    assert.equal(a.programs.get("p1").lifecycle, "draft");
    assert.deepEqual([...a.programs.keys()], [...b.programs.keys()]);
  });

  it("folds legacy single-status events through the migration map (back-compat)", () => {
    // A log written before the status split: OutcomeProgramCreated carried a single `status`, and
    // ProgramStatusChanged carried a run value as `data.status`.
    const events = [
      { type: "OutcomeProgramCreated", aggregateId: "p1", data: { id: "p1", status: "draft" } },
      { type: "WorkflowComposed", aggregateId: "p1", data: { graphId: "g1" } },
      { type: "ProgramStatusChanged", aggregateId: "p1", data: { status: "running" } },
      { type: "ProgramStatusChanged", aggregateId: "p1", data: { status: "learning" } },
    ];
    const program = projectState(events).programs.get("p1");
    // Create split the legacy status and backfilled the lineage triplet.
    assert.equal(program.lineageId, "p1");
    assert.equal(program.previousProgramId, null);
    assert.equal(program.version, 1);
    // WorkflowComposed moved lifecycle to active; the run values landed on lastRunStatus.
    assert.equal(program.lifecycle, "active");
    assert.equal(program.lastRunStatus, "learning");

    // A legacy lifecycle value carried by ProgramStatusChanged still moves lifecycle.
    const retired = projectState([
      { type: "OutcomeProgramCreated", aggregateId: "p2", data: { id: "p2", status: "active" } },
      { type: "ProgramStatusChanged", aggregateId: "p2", data: { status: "retired" } },
    ]).programs.get("p2");
    assert.equal(retired.lifecycle, "retired");
    assert.equal(retired.lastRunStatus, null);
  });

  it("migrates a legacy on-disk program store (single status → split + lineage)", () => {
    // Hand-write a schemaVersion-1 store with the legacy single `status` and no lineage triplet.
    const projectId = "legacy-project";
    const file = path.join(parent, "programs", `${projectId}.json`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify({
      schemaVersion: 1,
      projectId,
      programs: [
        { id: "legacy-running", status: "running" },
        { id: "legacy-ready", status: "ready" },
        { id: "legacy-retired", status: "retired" },
        { id: "legacy-paused", status: "paused" },
      ],
    }, null, 2)}\n`);

    const loaded = loadProgramStore(projectId, options);
    assert.equal(loaded.schemaVersion, 2);
    const byId = Object.fromEntries(loaded.programs.map((p) => [p.id, p]));
    assert.deepEqual(
      { lifecycle: byId["legacy-running"].lifecycle, lastRunStatus: byId["legacy-running"].lastRunStatus },
      { lifecycle: "active", lastRunStatus: "running" },
    );
    assert.deepEqual(
      { lifecycle: byId["legacy-ready"].lifecycle, lastRunStatus: byId["legacy-ready"].lastRunStatus },
      { lifecycle: "active", lastRunStatus: null },
    );
    assert.deepEqual(
      { lifecycle: byId["legacy-retired"].lifecycle, lastRunStatus: byId["legacy-retired"].lastRunStatus },
      { lifecycle: "retired", lastRunStatus: null },
    );
    assert.deepEqual(
      { lifecycle: byId["legacy-paused"].lifecycle, lastRunStatus: byId["legacy-paused"].lastRunStatus },
      { lifecycle: "active", lastRunStatus: null },
    );
    // Lineage triplet backfilled, legacy single status dropped.
    for (const program of loaded.programs) {
      assert.equal(program.lineageId, program.id);
      assert.equal(program.previousProgramId, null);
      assert.equal(program.version, 1);
      assert.equal("status" in program, false);
    }

    // Idempotent: persisting the migrated store and reloading yields the same split shape.
    saveProgramStore(loaded, options);
    const reloaded = loadProgramStore(projectId, options);
    assert.equal(reloaded.schemaVersion, 2);
    assert.deepEqual(reloaded.programs.map((p) => p.lifecycle).sort(), ["active", "active", "active", "retired"]);
    // Re-running migrateProgram on an already-migrated record changes nothing.
    assert.deepEqual(migrateProgram(reloaded.programs[0]), reloaded.programs[0]);
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

    // And the rebuilt program reflects the terminal run outcome (lastRunStatus) while lifecycle
    // stays founder-controlled at "active" — proving both status transitions are events.
    const rebuiltProgram = rebuilt.programs.find((p) => p.id === program.id);
    assert.equal(rebuiltProgram.lastRunStatus, "learning");
    assert.equal(rebuiltProgram.lifecycle, "active");
    assert.equal(rebuiltProgram.workflowGraph?.id, graph.id);

    // Sanity: the event log carries a creation event for every aggregate the stores hold.
    const events = listDomainEvents(project.id, { ...options, projectId: project.id });
    const types = new Set(events.map((e) => e.type));
    for (const required of ["OutcomeProgramCreated", "AgentCreationPolicyCreated", "PersonalizedAgentCreated", "AgentCreationPolicyUpdated", "NextAgentVersionCreated", "ProgramStatusChanged"]) {
      assert.ok(types.has(required), `missing event: ${required}`);
    }
  });

  it("rebuilds the ProductModel aggregate purely from events: derive → revise → record-signal", async () => {
    const cmd = (name, input) => executeDomainCommand(name, { ...input, projectId: project.id }, { ...options, projectId: project.id });

    // A fake generator standing in for the rented intelligence — returns the four bags; the host
    // stamps ids/versions/provenance and demotes the evidence-free "derived" guess.
    const generate = async () => ({
      ok: true,
      meta: { blank: false },
      model: {
        things: [
          { name: "Project", kind: "entity", summary: "A work record", provenance: "derived", evidence: [{ label: "win", file: "app.ts", line: 1, text: "track('project_created')" }] },
          { name: "Operator", kind: "actor", summary: "Who runs it", provenance: "derived", evidence: [] }, // demoted to speculative
        ],
        relationships: [{ from: "Operator", to: "Project", label: "creates", provenance: "speculative" }],
        userGoals: [{ actor: "Operator", goal: "ship faster", provenance: "speculative" }],
        states: [{ thingId: "Project", name: "draft", provenance: "speculative" }],
      },
    });

    const derived = await executeDomainCommand("DeriveProductModel", { projectId: project.id, grounding: {} }, { ...options, projectId: project.id, generate });
    assert.equal(derived.version, 1);
    assert.equal(derived.generatedBy, "claude");
    assert.equal(derived.things.length, 2);
    assert.equal(derived.things.find((t) => t.name === "Operator").provenance, "speculative");

    const revised = await cmd("ReviseProductModel", {
      modelId: derived.id,
      things: [
        { name: "Project", kind: "entity", summary: "A work record (edited)", provenance: "derived", evidence: [{ label: "win", file: "app.ts", line: 1, text: "track('project_created')" }] },
      ],
    });
    assert.equal(revised.id, derived.id);
    assert.equal(revised.version, 2);
    assert.equal(revised.previousModelId, derived.id);
    assert.equal(revised.lineageId, derived.lineageId);

    const pinned = await cmd("RecordProductSignal", {
      modelId: derived.id,
      signalId: "signal-real-customer",
      target: { kind: "thing", id: "thing-project" },
      type: "ObservedOutcome",
      summary: "A real operator created a project",
    });
    assert.equal(pinned.pinnedSignals.length, 1);
    assert.equal(pinned.pinnedSignals[0].signalId, "signal-real-customer");

    // ── The reconciliation: rebuild purely from events, compare to the stored snapshot ──
    const rebuilt = rebuildProjectState(project.id, { ...options, projectId: project.id });
    const stored = listProductModels(project.id, { ...options, projectId: project.id });
    assert.equal(stored.length, 1);
    assert.equal(rebuilt.productModels.length, 1);
    assert.deepEqual(rebuilt.productModels, stored);

    // The terminal model reflects the revision (version 2) AND the pinned signal survives rebuild.
    const rebuiltModel = rebuilt.productModels[0];
    assert.equal(rebuiltModel.version, 2);
    assert.equal(rebuiltModel.things.length, 1);
    assert.equal(rebuiltModel.pinnedSignals.length, 1);
    assert.equal(rebuiltModel.pinnedSignals[0].signalId, "signal-real-customer");

    // The event log carries all three product-model event types.
    const events = listDomainEvents(project.id, { ...options, projectId: project.id });
    const types = new Set(events.map((e) => e.type));
    for (const required of ["ProductModelDerived", "ProductModelRevised", "ProductSignalRecorded"]) {
      assert.ok(types.has(required), `missing event: ${required}`);
    }
  });
});
