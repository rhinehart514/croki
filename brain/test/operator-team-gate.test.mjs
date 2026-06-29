import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { saveFlow } from "../src/flow-store.mjs";
import { createTeam, addMember } from "../src/team-store.mjs";
import {
  createOperatorSession,
  getOperatorSession,
  saveOperatorSession,
} from "../src/operator-store.mjs";
import {
  operatorTools,
  resolveOperatorGate,
  runOperatorSession,
} from "../src/operator-runtime.mjs";

// Drives one model turn per response, like the anthropic adapter expects.
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

// A composer fake that returns a discovered (self-sourcing agent) entry -> founder gate -> execute ->
// measure graph so the run reaches a gate. A discovered entry relaxes the pre-gate field contracts
// (source-entry.mjs), so the best-effort agent chain runs without a manual seed. No model, no network.
function fakeComposer({ agents }) {
  const agent = agents[0] ?? { ref: "drafter", title: "Drafter" };
  return {
    ok: true,
    nodes: [
      // A provided source seeded with one row, a draft agent (open contract so it runs keyless on the
      // fake step runtime), a founder gate, a staged execute, and measure.
      { id: "src", category: "source", connector: "manual", label: "Input", config: { items: [{ id: "lead-1", name: "Ada" }] } },
      { id: "draft", kind: "agent", ref: agent.ref, label: agent.title, contract: { accepts: [], emits: ["draft_note"], minItems: 1 } },
      { id: "gate", category: "gate", connector: "default", label: "Founder review" },
      { id: "out", category: "execute", connector: "local", label: "Stage output" },
      { id: "meas", category: "measure", connector: "default", label: "Measure" },
    ],
    edges: [
      { source: "src", target: "draft", edgeType: "data" },
      { source: "draft", target: "gate", edgeType: "data" },
      { source: "gate", target: "out", edgeType: "data" },
      { source: "out", target: "meas", edgeType: "data" },
    ],
  };
}

// A step runtime fake so the self-sourcing agent node yields a draft item the gate can hold for review.
const fakeStepRuntime = {
  async agent() {
    return { ok: true, items: [{ id: "lead-1", name: "Ada", draft_note: "Hi Ada — saw your work." }] };
  },
  async skill() { return { ok: true, items: [] }; },
  async code() { return { ok: true, items: [] }; },
};

describe("autonomous operator + role-gated shared release", () => {
  let parent;
  let options;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-operator-team-gate-"));
    const repo = path.join(parent, "repo");
    fs.mkdirSync(repo);
    fs.writeFileSync(path.join(repo, "app.ts"), 'analytics.track("project_created", { projectId });\n');
    options = { root: path.join(parent, "state"), claudeDir: path.join(parent, "claude"), cwd: repo };
    // Use the implicit "default" project so the session's projectId matches what the run path reads;
    // composition and the derived-source/feedback loaders all resolve against "default".
  });

  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  it("exposes compose_and_run as an operator tool", () => {
    assert.ok(operatorTools.some((tool) => tool.name === "compose_and_run"));
  });

  // JOB 2 — the operator composes a workflow for a goal and drives it to the gate in ONE pass.
  it("drives a goal end-to-end: composes the workflow, runs it, and stops at the founder gate", async () => {
    const session = createOperatorSession({
      goal: "Land a design-partner pilot for the product.",
      projectId: "default",
    }, options);

    const paused = await runOperatorSession(session.id, {
      // Fake compose + evaluate + step runtime so the whole drive runs offline and keyless.
      options: { ...options, compose: fakeComposer, evaluate: async () => ({ ok: false }), stepRuntime: fakeStepRuntime },
      client: fakeClient([{
        content: [{ type: "tool_use", id: "go", name: "compose_and_run", input: {} }],
      }]),
    });

    // Reached the shared founder gate autonomously, in a single drive.
    assert.equal(paused.status, "waiting_for_gate");
    assert.ok(paused.pendingGate?.nodeIds?.includes("gate"), "the run paused at the composed gate");

    // The work is VISIBLE: composing -> running -> per-node -> reached-gate events all landed.
    const types = paused.events.map((event) => event.type);
    assert.ok(types.includes("operator_composing"), "emitted a composing event");
    assert.ok(types.includes("operator_workflow_composed"), "emitted a workflow_composed event");
    assert.ok(types.includes("operator_running"), "emitted a running event");
    assert.ok(types.includes("operator_node_start"), "emitted per-node start events");
    assert.ok(types.includes("operator_reached_gate"), "emitted a reached-gate event");
  });

  // JOB 1 — the gate is a shared TEAM queue: only an owner/approver may release, a member cannot.
  // The wall is never weakened — nothing sends without an authorized human release.
  describe("role-gated release at the shared gate", () => {
    function sessionAtGate(teamId) {
      // A minimal graph that lands at a gate, with a session stamped to the team that owns it.
      const graph = {
        id: "gate-flow",
        name: "Gate flow",
        version: "1",
        nodes: [
          { id: "ctx", category: "context", connector: "product", label: "Prepared", position: { x: 0, y: 0 }, config: { name: "Artifact" } },
          { id: "gate", category: "gate", connector: "default", label: "Founder gate", position: { x: 200, y: 0 }, config: {} },
          { id: "meas", category: "measure", connector: "default", label: "Measure", position: { x: 400, y: 0 }, config: {} },
        ],
        edges: [
          { id: "a", source: "ctx", target: "gate", edgeType: "data" },
          { id: "b", source: "gate", target: "meas", edgeType: "data" },
        ],
      };
      saveFlow(graph, options);
      let session = createOperatorSession({ goal: "Run to the gate.", graphId: graph.id, projectId: "default", teamId }, options);
      return session;
    }

    async function reachGate(session) {
      const paused = await runOperatorSession(session.id, {
        options,
        client: fakeClient([{ content: [{ type: "tool_use", id: "run", name: "run_loop", input: {} }] }]),
      });
      assert.equal(paused.status, "waiting_for_gate");
      return paused;
    }

    it("blocks a member from releasing the send, allows an owner/approver", async () => {
      const team = createTeam({
        name: "GTM team",
        owner: { userId: "founder", name: "Founder" },
      }, options);
      addMember(team.id, { userId: "viewer", name: "Viewer", role: "member" }, options);
      addMember(team.id, { userId: "approver", name: "Approver", role: "approver" }, options);

      const session = sessionAtGate(team.id);
      await reachGate(session);

      // A plain member is refused — the wall holds. Nothing continued downstream.
      await assert.rejects(
        () => resolveOperatorGate(session.id, { approvals: { gate: true }, userId: "viewer" }, { options }),
        (err) => err.code === "gate_release_forbidden" && err.status === 403,
        "a member must not be able to release a send",
      );
      const stillWaiting = getOperatorSession(session.id, options);
      assert.equal(stillWaiting.status, "waiting_for_gate", "a refused release leaves the gate intact");

      // An approver is allowed — the gate clears and the run continues, stamped with who released it.
      const resolved = await resolveOperatorGate(session.id, { approvals: { gate: true }, userId: "approver" }, { options });
      assert.notEqual(resolved.status, "waiting_for_gate");
      const releaseEvent = resolved.events.find((event) => event.type === "gate_resolved");
      assert.equal(releaseEvent?.data?.releasedBy?.userId, "approver", "the release records who cleared it");
    });

    it("lets a solo founder release their own personal-team session unchanged", async () => {
      // No team stamped → resolves to the founder's personal team where the founder is owner. The
      // single-user path is untouched: the founder always passes.
      const session = sessionAtGate(null);
      await reachGate(session);
      const resolved = await resolveOperatorGate(session.id, { approvals: { gate: true } }, { options });
      assert.notEqual(resolved.status, "waiting_for_gate", "the solo founder releases without a wall in the way");
    });
  });
});
