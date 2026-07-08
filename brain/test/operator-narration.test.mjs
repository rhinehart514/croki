import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { createOperatorSession } from "../src/operator-store.mjs";
import { runOperatorSession } from "../src/operator-runtime.mjs";

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

// An embodied pipeline: a source, a drafting AGENT that carries a SECRET prompt (which must NEVER reach
// any surfaced event), the founder gate, a gated capability, and a measure step. The agent produces four
// items so the done beat can be checked for the count.
const NODES = [
  { id: "src", category: "source", connector: "manual", label: "Input", config: { items: [{ id: "lead-1", name: "Ada" }] } },
  { id: "draft", kind: "agent", ref: "outreach-writer", label: "Outreach writer", agentPrompt: "SECRET-PROMPT-XYZ" },
  { id: "gate", category: "gate", connector: "default", label: "Founder review" },
  { id: "out", category: "execute", connector: "gmail", label: "Send" },
  { id: "meas", category: "measure", connector: "default", label: "Measure" },
];
const EDGES = [
  { source: "src", target: "draft", edgeType: "data" },
  { source: "draft", target: "gate", edgeType: "data" },
  { source: "gate", target: "out", edgeType: "data" },
  { source: "out", target: "meas", edgeType: "data" },
];

const ALLOWED_DATA_KEYS = new Set(["ref", "nodeId", "phase", "itemCount", "category", "label"]);

describe("per-teammate first-person narration during a run", () => {
  let parent;
  let options;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-narration-"));
    options = { root: path.join(parent, "state") };
  });

  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  it("each working teammate speaks first-person beats carrying its ref — no prompt leak, wall intact", async () => {
    const session = createOperatorSession({ goal: "get more owners", projectId: "default" }, options);
    const compose = async () => ({ ok: true, nodes: NODES, edges: EDGES });
    const stepRuntime = {
      async agent() { return { ok: true, items: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }] }; },
      async skill() { return { ok: true, items: [] }; },
      async code() { return { ok: true, items: [] }; },
    };

    const done = await runOperatorSession(session.id, {
      options: { ...options, compose, stepRuntime },
      client: fakeClient([{ content: [{ type: "tool_use", id: "car", name: "compose_and_run", input: { goal: "get more owners" } }] }]),
    });

    const beats = done.events.filter((e) => e.type === "teammate_said");

    // (a) the teammate speaks, with its ref on the beat — a start beat and a done beat.
    const forWriter = beats.filter((e) => e.data?.ref === "outreach-writer");
    assert.ok(forWriter.length >= 1, "the drafting teammate speaks at least one first-person beat");
    assert.ok(forWriter.some((e) => e.data?.phase === "start"), "a start beat opens the teammate's work");
    const doneBeat = forWriter.find((e) => e.data?.phase === "done");
    assert.ok(doneBeat, "a done beat closes the teammate's work");

    // (b) the done beat names the count the founder is about to review.
    assert.match(doneBeat.title, /4/, "the done beat carries the item count");

    // (c) NO surfaced event leaks the raw prompt, and every crew beat's data is a strict subset of the
    // allowed founder-safe keys — proof the beat never rides prompt/soul internals.
    for (const e of done.events) {
      assert.ok(!(e.title ?? "").includes("SECRET-PROMPT-XYZ"), `event title leaked the prompt: ${e.type}`);
      assert.ok(!(e.detail ?? "").includes("SECRET-PROMPT-XYZ"), `event detail leaked the prompt: ${e.type}`);
    }
    for (const e of beats) {
      for (const key of Object.keys(e.data ?? {})) {
        assert.ok(ALLOWED_DATA_KEYS.has(key), `teammate_said.data carried a disallowed key: ${key}`);
      }
    }

    // (d) machinery stays quiet: the source node produced a plain machinery step, never a crew beat.
    const srcStart = done.events.find((e) => e.type === "operator_node_start" && e.data?.nodeId === "src");
    assert.ok(srcStart, "the source node emits a machinery step, not a teammate beat");
    assert.ok(!beats.some((e) => e.data?.nodeId === "src"), "the source node never speaks as a teammate");

    // (e) WALL: the run stopped at the founder gate, nothing sent.
    assert.equal(done.status, "waiting_for_gate");
    assert.ok(done.pendingGate?.nodeIds?.includes("gate"), "the run paused at the composed founder gate");
  });

  // DEGRADE proof: with NO narrator injected (options.root set — the standard unit-run shape), the beats
  // are exactly the deterministic templates. This pins zero churn: the model-written beat is off in units.
  it("with no narrator injected, the beats stay the deterministic templates", async () => {
    const session = createOperatorSession({ goal: "get more owners", projectId: "default" }, options);
    const compose = async () => ({ ok: true, nodes: NODES, edges: EDGES });
    const stepRuntime = {
      async agent() { return { ok: true, items: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }] }; },
      async skill() { return { ok: true, items: [] }; },
      async code() { return { ok: true, items: [] }; },
    };

    const done = await runOperatorSession(session.id, {
      options: { ...options, compose, stepRuntime },
      client: fakeClient([{ content: [{ type: "tool_use", id: "car", name: "compose_and_run", input: { goal: "get more owners" } }] }]),
    });

    const forWriter = done.events.filter((e) => e.type === "teammate_said" && e.data?.ref === "outreach-writer");
    const start = forWriter.find((e) => e.data?.phase === "start");
    const doneBeat = forWriter.find((e) => e.data?.phase === "done");
    // The draft node carries no category, so narrateStart/narrateDone hit their default branch — today's
    // exact template strings (label-based start, count-based done).
    assert.equal(start.title, "On it — Outreach writer.");
    assert.equal(doneBeat.title, "Found 4 worth a look.");
  });

  // The model-written beat: inject a fake narrator (never a subprocess) and assert its line becomes the
  // teammate_said title, while the machinery/gate events are untouched.
  it("an injected narrator's line becomes the teammate_said title; machinery/gate unchanged", async () => {
    const session = createOperatorSession({ goal: "get more owners", projectId: "default" }, options);
    const compose = async () => ({ ok: true, nodes: NODES, edges: EDGES });
    const stepRuntime = {
      async agent() { return { ok: true, items: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }] }; },
      async skill() { return { ok: true, items: [] }; },
      async code() { return { ok: true, items: [] }; },
    };
    // A fixed in-character line per phase — the wiring proof, no model involved.
    const teammateNarrator = async ({ phase }) =>
      phase === "start" ? "I'm hunting for the owners nobody else noticed." : "Four ready — the sharp ones are up top.";

    const done = await runOperatorSession(session.id, {
      options: { ...options, compose, stepRuntime, teammateNarrator },
      client: fakeClient([{ content: [{ type: "tool_use", id: "car", name: "compose_and_run", input: { goal: "get more owners" } }] }]),
    });

    const forWriter = done.events.filter((e) => e.type === "teammate_said" && e.data?.ref === "outreach-writer");
    const start = forWriter.find((e) => e.data?.phase === "start");
    const doneBeat = forWriter.find((e) => e.data?.phase === "done");
    assert.equal(start.title, "I'm hunting for the owners nobody else noticed.");
    assert.equal(doneBeat.title, "Four ready — the sharp ones are up top.");

    // The machinery, source step, and gate are untouched — the injected voice never rides them.
    const srcStart = done.events.find((e) => e.type === "operator_node_start" && e.data?.nodeId === "src");
    assert.ok(srcStart, "the source node still emits a machinery step");
    assert.ok(!srcStart.title.includes("owners nobody"), "the injected voice never rides a machinery event");
    assert.equal(done.status, "waiting_for_gate");
    assert.ok(done.pendingGate?.nodeIds?.includes("gate"), "the run still paused at the founder gate");
  });
});
