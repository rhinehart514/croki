import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { defaultGraphTemplate } from "../src/graph.mjs";
import { saveFlow } from "../src/flow-store.mjs";
import { createOperatorSession, getOperatorSession, saveOperatorSession } from "../src/operator-store.mjs";
import { operatorTools, resolveOperatorGate, resolveOperatorProposal, runOperatorSession } from "../src/operator-runtime.mjs";
import { loadFlow } from "../src/flow-store.mjs";
import { createProject, loadProject } from "../src/project-store.mjs";
import { createOutcomeProgram } from "../src/program-store.mjs";
import { loadCapabilityFoundry } from "../src/capability-foundry.mjs";

function fakeClient(responses) {
  let index = 0;
  return {
    messages: {
      async create() {
        const response = responses[index];
        index += 1;
        if (!response) throw new Error("Unexpected extra model turn.");
        return response;
      },
    },
  };
}

describe("resident GTM operator runtime", () => {
  let parent;
  let options;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-operator-runtime-"));
    options = { root: parent };
    saveFlow(defaultGraphTemplate(), options);
  });

  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  it("rejects direct agent graph patches and leaves the graph untouched", async () => {
    assert.ok(!operatorTools.some((tool) => tool.name === "patch_graph"), "patch_graph must not be exposed to the operator model");
    assert.ok(operatorTools.some((tool) => tool.name === "propose_graph_changes"), "proposal graph edits remain available");
    const graphId = defaultGraphTemplate().id;
    const baseNodeCount = loadFlow(graphId, null, options).graph.nodes.length;
    const session = createOperatorSession({
      goal: "Narrow the ICP to Western New York.",
      graphId,
    }, options);
    const client = fakeClient([
      {
        content: [{
          type: "tool_use",
          id: "tool-1",
          name: "patch_graph",
          input: {
            rationale: "The founder explicitly requested a regional ICP.",
            operations: [{
              type: "update_node",
              nodeId: "ctx-icp",
              patch: { config: { geography: "Western New York" } },
            }],
          },
        }],
      },
      {
        content: [{
          type: "tool_use",
          id: "tool-2",
          name: "propose_graph_changes",
          input: {
            rationale: "The founder should review the regional ICP change.",
            operations: [{
              type: "update_node",
              nodeId: "ctx-icp",
              patch: { config: { geography: "Western New York" } },
            }],
          },
        }],
      },
    ]);
    const paused = await runOperatorSession(session.id, { client, options });
    assert.equal(paused.status, "waiting_for_proposal");
    assert.equal(loadFlow(graphId, null, options).graph.nodes.length, baseNodeCount);
    assert.ok(paused.events.some((event) => event.type === "graph_patch_rejected"));
    assert.ok(paused.events.some((event) => event.type === "graph_proposed"));
  });

  it("fails honestly when no runtime is available, naming both options", async () => {
    const session = createOperatorSession({ goal: "Work the goal.", graphId: defaultGraphTemplate().id }, options);
    const priorKey = process.env.ANTHROPIC_API_KEY;
    const priorDisable = process.env.GTM_IDE_DISABLE_CLAUDE_CODE;
    delete process.env.ANTHROPIC_API_KEY;
    process.env.GTM_IDE_DISABLE_CLAUDE_CODE = "1";
    try {
      const failed = await runOperatorSession(session.id, { options });
      assert.equal(failed.status, "failed");
      assert.match(failed.error, /Claude Code/);
      assert.match(failed.error, /ANTHROPIC_API_KEY/);
      assert.ok(failed.events.some((event) => event.type === "session_failed"));
    } finally {
      if (priorKey === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = priorKey;
      if (priorDisable === undefined) delete process.env.GTM_IDE_DISABLE_CLAUDE_CODE;
      else process.env.GTM_IDE_DISABLE_CLAUDE_CODE = priorDisable;
    }
  });

  it("records which runtime drove the session", async () => {
    const session = createOperatorSession({ goal: "Note the runtime.", graphId: defaultGraphTemplate().id }, options);
    const completed = await runOperatorSession(session.id, {
      options,
      client: fakeClient([{
        content: [{ type: "tool_use", id: "t", name: "complete", input: { outcome: "achieved", summary: "done" } }],
      }]),
    });
    assert.equal(completed.runtime, "anthropic");
  });

  it("captures the runtime session id and threads it back on the next drive (chat memory)", async () => {
    const session = createOperatorSession({ goal: "Remember across drives.", graphId: defaultGraphTemplate().id }, options);

    // First drive: a runtime that establishes an SDK session and reports its id.
    const firstCtx = {};
    const establishing = {
      id: "fake-cc",
      label: "Fake Claude Code",
      isAvailable: () => ({ ok: true }),
      drive: async (ctx) => {
        firstCtx.runtimeSessionId = ctx.runtimeSessionId;
        ctx.onRuntimeSession("sdk-session-1");
        return { kind: "completed", summary: "established" };
      },
    };
    await runOperatorSession(session.id, { options, runtime: establishing });
    const afterFirst = getOperatorSession(session.id, options);
    assert.equal(firstCtx.runtimeSessionId, null, "the first drive has no prior session to resume");
    assert.equal(afterFirst.runtimeSessionId, "sdk-session-1", "the captured session id is persisted durably");

    // A real resume re-enters from a runnable status (e.g. after a founder gate); mirror that.
    saveOperatorSession({ ...getOperatorSession(session.id, options), status: "ready" }, options);

    // Second drive: the stored id is handed to the runtime so it can resume the conversation.
    const secondCtx = {};
    const resuming = {
      id: "fake-cc",
      label: "Fake Claude Code",
      isAvailable: () => ({ ok: true }),
      drive: async (ctx) => {
        secondCtx.runtimeSessionId = ctx.runtimeSessionId;
        return { kind: "completed", summary: "resumed" };
      },
    };
    await runOperatorSession(session.id, { options, runtime: resuming });
    assert.equal(secondCtx.runtimeSessionId, "sdk-session-1", "the next drive resumes the same conversation");
  });

  it("pauses at a founder gate and resumes the exact run after approval", async () => {
    const graph = {
      id: "gate-session",
      name: "Gate session",
      version: "1",
      nodes: [
        { id: "ctx", category: "context", connector: "product", label: "Prepared", position: { x: 0, y: 0 }, config: { name: "Exact artifact" } },
        { id: "gate", category: "gate", connector: "default", label: "Founder gate", position: { x: 200, y: 0 }, config: {} },
        { id: "measure", category: "measure", connector: "default", label: "Measure", position: { x: 400, y: 0 }, config: {} },
      ],
      edges: [
        { id: "a", source: "ctx", target: "gate", edgeType: "data" },
        { id: "b", source: "gate", target: "measure", edgeType: "data" },
      ],
    };
    saveFlow(graph, options);
    const session = createOperatorSession({ goal: "Run to the gate.", graphId: graph.id }, options);
    const paused = await runOperatorSession(session.id, {
      options,
      client: fakeClient([{
        content: [{ type: "tool_use", id: "tool-run", name: "run_loop", input: {} }],
      }]),
    });
    assert.equal(paused.status, "waiting_for_gate");
    assert.equal(paused.pendingGate.nodeIds[0], "gate");

    const resolved = await resolveOperatorGate(session.id, {
      approvals: { gate: true },
    }, {
      options,
      client: fakeClient([{
        content: [{
          type: "tool_use",
          id: "tool-done",
          name: "complete",
          input: { outcome: "achieved", summary: "The approved artifact continued through measure." },
        }],
      }]),
    });
    assert.equal(resolved.status, "ready");
    await new Promise((resolve) => setTimeout(resolve, 20));
    const completed = getOperatorSession(session.id, options);
    assert.equal(completed.status, "completed");
    assert.ok(completed.events.some((event) => event.type === "gate_resolved"));
  });

  it("stages proposed graph changes for review without applying them, then commits on accept", async () => {
    const graphId = defaultGraphTemplate().id;
    const baseNodeCount = loadFlow(graphId, null, options).graph.nodes.length;
    const session = createOperatorSession({ goal: "Add a research step.", graphId }, options);
    const proposeOp = {
      type: "add_node",
      node: { id: "proposed-source", category: "source", connector: "manual", label: "Proposed source", position: { x: 0, y: 320 }, config: {} },
    };
    const paused = await runOperatorSession(session.id, {
      options,
      client: fakeClient([{
        content: [{
          type: "tool_use", id: "tool-propose", name: "propose_graph_changes",
          input: { rationale: "The founder should see this before it lands.", operations: [proposeOp] },
        }],
      }]),
    });

    // Paused for review; nothing applied yet.
    assert.equal(paused.status, "waiting_for_proposal");
    assert.equal(paused.pendingProposal.operations.length, 1);
    assert.ok(paused.pendingProposal.preview.nodes.some((node) => node.id === "proposed-source"), "preview carries the would-be node");
    assert.equal(loadFlow(graphId, null, options).graph.nodes.length, baseNodeCount, "the live graph is untouched while staged");
    assert.ok(paused.events.some((event) => event.type === "graph_proposed"));

    // Accept → the exact ops apply and the operator resumes.
    const resolved = await resolveOperatorProposal(session.id, { accept: true }, {
      options,
      client: fakeClient([{
        content: [{ type: "tool_use", id: "tool-done", name: "complete", input: { outcome: "achieved", summary: "Added the step the founder accepted." } }],
      }]),
    });
    assert.equal(resolved.status, "ready");
    assert.equal(resolved.pendingProposal, null);
    const committed = loadFlow(graphId, null, options).graph;
    assert.equal(committed.nodes.length, baseNodeCount + 1, "accept applied the staged op");
    assert.ok(committed.nodes.some((node) => node.id === "proposed-source"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(getOperatorSession(session.id, options).status, "completed");
  });

  it("discards proposed graph changes on reject, leaving the graph untouched", async () => {
    const graphId = defaultGraphTemplate().id;
    const baseNodeCount = loadFlow(graphId, null, options).graph.nodes.length;
    const session = createOperatorSession({ goal: "Maybe add a step.", graphId }, options);
    const paused = await runOperatorSession(session.id, {
      options,
      client: fakeClient([{
        content: [{
          type: "tool_use", id: "tool-propose", name: "propose_graph_changes",
          input: { rationale: "Optional extra source.", operations: [{ type: "add_node", node: { id: "maybe-source", category: "source", connector: "manual", label: "Maybe", position: { x: 0, y: 360 }, config: {} } }] },
        }],
      }]),
    });
    assert.equal(paused.status, "waiting_for_proposal");

    const resolved = await resolveOperatorProposal(session.id, { accept: false }, {
      options,
      client: fakeClient([{
        content: [{ type: "tool_use", id: "tool-done", name: "complete", input: { outcome: "achieved", summary: "Left the graph as it was." } }],
      }]),
    });
    assert.equal(resolved.status, "ready");
    assert.equal(resolved.pendingProposal, null);
    assert.equal(loadFlow(graphId, null, options).graph.nodes.length, baseNodeCount, "reject changed nothing");
    assert.ok(resolved.events.some((event) => event.type === "graph_proposal_discarded"));
  });

  it("builds agents for the program the session is bound to, even when the model omits the id", async () => {
    // Two programs exist; the session is bound to the OLDER one. The model calls
    // create_personalized_agents WITHOUT a programId — the deterministic resolver must target the
    // bound program, not the newest (which the old `programs.at(-1)` fallback would have picked).
    createProject({ name: "GTM IDE" }, options);
    const project = loadProject(options);
    const target = createOutcomeProgram({ projectId: project.id, name: "Bound program", objective: "The one the founder opened." }, { ...options, projectId: project.id });
    createOutcomeProgram({ projectId: project.id, name: "Newer decoy program", objective: "Created after — must NOT receive the agent." }, { ...options, projectId: project.id });

    const session = createOperatorSession({
      goal: "Build the first agent for the bound program.",
      projectId: project.id,
      programId: target.id,
    }, options);

    const completed = await runOperatorSession(session.id, {
      options,
      client: fakeClient([
        { content: [{
          type: "tool_use", id: "t1", name: "create_personalized_agents",
          input: { agents: [{ id: "opp-1", title: "Outreach drafter", objective: "Draft a grounded note", ref: "outreach-drafter" }] },
        }] },
        { content: [{ type: "tool_use", id: "t2", name: "complete", input: { outcome: "achieved", summary: "Built the first agent." } }] },
      ]),
    });

    assert.equal(completed.status, "completed");
    const foundry = loadCapabilityFoundry(project.id, { ...options, projectId: project.id });
    assert.equal(foundry.instances.length, 1);
    assert.equal(foundry.instances[0].programId, target.id, "agent must attach to the bound program, not the newest");
  });

  it("tolerates the agent field shapes a live model actually sends", async () => {
    // Regression for the live run: the model passed agents as { ref, purpose } with no objective or
    // title, and the policy required a purpose, so creation hard-failed. The handler must derive
    // purpose/job/ref/title from reasonable synonyms instead of crashing.
    createProject({ name: "GTM IDE" }, options);
    const project = loadProject(options);
    const program = createOutcomeProgram({ projectId: project.id, name: "Field-shape program", objective: "x" }, { ...options, projectId: project.id });
    const session = createOperatorSession({ goal: "Build agents.", projectId: project.id, programId: program.id }, options);

    const completed = await runOperatorSession(session.id, {
      options,
      client: fakeClient([
        { content: [{
          type: "tool_use", id: "t1", name: "create_personalized_agents",
          input: { agents: [
            { ref: "outreach-drafter", purpose: "Draft a grounded first-contact note" },         // no objective/title
            { name: "Prospect Researcher", description: "Find founders with a now-trigger" },       // no ref/purpose/objective
          ] },
        }] },
        { content: [{ type: "tool_use", id: "t2", name: "complete", input: { outcome: "achieved", summary: "Built two agents." } }] },
      ]),
    });

    assert.equal(completed.status, "completed");
    assert.ok(!completed.events.some((event) => event.type === "tool_failed"), "no tool should fail on these shapes");
    const foundry = loadCapabilityFoundry(project.id, { ...options, projectId: project.id });
    assert.equal(foundry.instances.length, 2);
    assert.ok(foundry.instances.every((instance) => instance.ref && instance.job), "every agent has a ref and a job");
  });
});
