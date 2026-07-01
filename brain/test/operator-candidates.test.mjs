import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { createOperatorSession, getOperatorSession } from "../src/operator-store.mjs";
import {
  operatorTools,
  resolveOperatorCandidates,
  resumeOperatorSession,
  runOperatorSession,
} from "../src/operator-runtime.mjs";
import { assertSafeTool, safeOperatorTools } from "../src/operator-mcp.mjs";

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

// A gated, buildable shape (source → draft agent → founder gate → execute → measure) so a picked
// candidate reaches the gate on the fake step runtime, keyless.
function shape(id, label) {
  return {
    id,
    label,
    rationale: `The ${label} shape.`,
    nodes: [
      { id: "src", category: "source", connector: "manual", label: "Input", config: { items: [{ id: "lead-1", name: "Ada" }] } },
      { id: "draft", kind: "agent", ref: "drafter", label: "Draft", contract: { accepts: [], emits: ["draft_note"], minItems: 1 } },
      { id: "gate", category: "gate", connector: "default", label: "Founder review" },
      { id: "out", category: "execute", connector: "local", label: "Stage" },
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

const fakeStepRuntime = {
  async agent() {
    return { ok: true, items: [{ id: "lead-1", name: "Ada", draft_note: "Hi Ada — saw your work." }] };
  },
  async skill() { return { ok: true, items: [] }; },
  async code() { return { ok: true, items: [] }; },
};

describe("operator propose_candidates + founder pick", () => {
  let parent;
  let options;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-operator-candidates-"));
    options = { root: path.join(parent, "state") };
  });

  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  it("exposes propose_candidates as an operator tool, safe on the agent surface", () => {
    assert.ok(operatorTools.some((tool) => tool.name === "propose_candidates"));
    assert.doesNotThrow(() => assertSafeTool("propose_candidates"));
    assert.ok(safeOperatorTools().some((tool) => tool.name === "propose_candidates"));
  });

  it("an AMBIGUOUS goal PAUSES with 2–3 candidate shapes — nothing runs or builds", async () => {
    const session = createOperatorSession({ goal: "get more pest-control owners", projectId: "default" }, options);

    const composeCandidates = async () => ({ ok: true, ambiguous: true, candidates: [shape("outbound", "Outbound"), shape("content", "Content")] });
    const paused = await runOperatorSession(session.id, {
      options: { ...options, composeCandidates, stepRuntime: fakeStepRuntime },
      client: fakeClient([{ content: [{ type: "tool_use", id: "cand", name: "propose_candidates", input: {} }] }]),
    });

    assert.equal(paused.status, "waiting_for_candidates");
    assert.ok(paused.pendingCandidates, "the session carries the pending candidates");
    assert.equal(paused.pendingCandidates.candidates.length, 2);
    assert.deepEqual(paused.pendingCandidates.candidates.map((c) => c.id), ["outbound", "content"]);
    assert.ok(paused.events.some((event) => event.type === "candidates_proposed"));
    // No pipeline was built: the session has no graph yet.
    assert.equal(paused.graphId ?? null, null, "sketching a fork builds nothing");
  });

  it("a plain resume is refused while candidates wait — the founder must pick", async () => {
    const session = createOperatorSession({ goal: "get more owners", projectId: "default" }, options);
    const composeCandidates = async () => ({ ok: true, ambiguous: true, candidates: [shape("a", "A"), shape("b", "B")] });
    await runOperatorSession(session.id, {
      options: { ...options, composeCandidates, stepRuntime: fakeStepRuntime },
      client: fakeClient([{ content: [{ type: "tool_use", id: "c", name: "propose_candidates", input: {} }] }]),
    });
    assert.throws(() => resumeOperatorSession(session.id, "just go", { options }), /Pick one of the proposed candidate/);
  });

  it("the founder's pick builds the chosen shape and drives it to the founder gate — a founder act", async () => {
    const session = createOperatorSession({ goal: "get more owners", projectId: "default" }, options);
    const composeCandidates = async () => ({ ok: true, ambiguous: true, candidates: [shape("outbound", "Outbound"), shape("content", "Content")] });
    const paused = await runOperatorSession(session.id, {
      options: { ...options, composeCandidates, stepRuntime: fakeStepRuntime },
      client: fakeClient([{ content: [{ type: "tool_use", id: "c", name: "propose_candidates", input: {} }] }]),
    });
    assert.equal(paused.status, "waiting_for_candidates");

    const built = await resolveOperatorCandidates(session.id, { pick: "content" }, { options: { ...options, stepRuntime: fakeStepRuntime } });

    // The pick built the chosen shape and stopped at the founder gate — nothing sent.
    assert.equal(built.status, "waiting_for_gate");
    assert.equal(built.pendingCandidates, null);
    assert.ok(built.graphId, "the picked candidate is now a real pipeline");
    assert.ok(built.pendingGate?.nodeIds?.includes("gate"), "the built run paused at the composed gate");
    assert.ok(built.events.some((event) => event.type === "candidates_resolved"));
  });

  it("a clear goal (not ambiguous) does NOT pause — it tells the operator to build directly", async () => {
    const session = createOperatorSession({ goal: "email the 3 owners who replied", projectId: "default" }, options);
    const composeCandidates = async () => ({ ok: true, ambiguous: false, candidates: [] });
    const done = await runOperatorSession(session.id, {
      options: { ...options, composeCandidates, stepRuntime: fakeStepRuntime },
      client: fakeClient([
        { content: [{ type: "tool_use", id: "c", name: "propose_candidates", input: {} }] },
        { content: [{ type: "tool_use", id: "d", name: "complete", input: { outcome: "achieved", summary: "One clear shape noted." } }] },
      ]),
    });
    assert.notEqual(done.status, "waiting_for_candidates");
    assert.equal(done.pendingCandidates ?? null, null);
  });

  it("resolving candidates requires a session actually holding proposed candidates", async () => {
    const session = createOperatorSession({ goal: "No candidates yet.", projectId: "default" }, options);
    await assert.rejects(() => resolveOperatorCandidates(session.id, { pick: "x" }, { options }), /no proposed candidate/i);
  });
});
