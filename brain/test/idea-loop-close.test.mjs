// The idea loop, closed in PRODUCTION — not just at the unit boundary.
//
// Phase 2 repair: three legs of the idea-taste loop existed but had no live caller, so the headline
// "idea decisions teach which angles bite" never fired outside a unit test. These tests drive the real
// operator entry points and assert the loop closes:
//   1. READ side — a past kill reaches the next ideation round's taste (memoryFor folds idea taste).
//   2. The operator founder-pick path banks IdeaKill/IdeaKeep on the feedback rail (resolveOperatorIdeas).
//   3. compose_and_run wires the built channel back onto its idea, so the run's gate outcome closes the
//      loop onto the idea (idea-derivation fires in production, not only after a manual attachBuildWiring).

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { createOperatorSession } from "../src/operator-store.mjs";
import { runOperatorSession, resolveOperatorIdeas } from "../src/operator-runtime.mjs";
import { createGtmIdea, getGtmIdea } from "../src/idea-store.mjs";
import { loadFeedbackLedger, recordIdeaDecisions } from "../src/feedback-ledger.mjs";

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

function fakeBar() {
  return async function bar({ idea }) {
    const pitch = typeof idea === "string" ? idea : idea?.pitch || "";
    const killed = /scarcity/.test(pitch);
    return {
      barScore: killed ? 2.1 : 7.4,
      verdict: killed ? "killed" : "survived",
      killed,
      axes: { showable: killed ? 2 : 8, demo_is_core: killed ? 3 : 7, loop_able: 6, edge: 6, differentiation: 6, distinctiveness: 6 },
    };
  };
}

function fakeDistinct() {
  return { available: true, batch_distinctiveness: 0.8, verdict: "DISTINCT", huddled: false };
}

// A composer that lands at a founder gate with one staged draft, so compose_and_run reaches the gate
// offline. Mirrors the fake in operator-team-gate.test.mjs.
function fakeComposer({ agents }) {
  const agent = agents[0] ?? { ref: "drafter", title: "Drafter" };
  return {
    ok: true,
    nodes: [
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

const fakeStepRuntime = {
  async agent() {
    return { ok: true, items: [{ id: "lead-1", name: "Ada", draft_note: "Hi Ada — saw your work." }] };
  },
  async skill() { return { ok: true, items: [] }; },
  async code() { return { ok: true, items: [] }; },
};

describe("idea loop — closed in production", () => {
  let parent;
  let options;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-idea-loop-"));
    const repo = path.join(parent, "repo");
    fs.mkdirSync(repo);
    fs.writeFileSync(path.join(repo, "app.ts"), 'analytics.track("project_created", { projectId });\n');
    options = { root: path.join(parent, "state"), claudeDir: path.join(parent, "claude"), cwd: repo };
  });

  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  // LEG 1 — the READ side is live: a past kill reaches the next ideation round's taste. The generator
  // spy captures the taste the ideate move actually handed it; before the repair this carried no killed
  // angle because memoryFor never loaded the IdeaKill signals.
  it("folds a past kill into the next ideation round's taste (read side is live)", async () => {
    recordIdeaDecisions({
      projectId: "default",
      decisions: [{ idea: { id: "old-1", angle: "scarcity-first", pitch: "Hoard the only invite.", killed: true }, decision: "kill" }],
    }, options);

    let captured = null;
    const spyGenerator = async ({ taste, angle }) => {
      captured = taste;
      return { ideas: [`A concrete move from the ${angle} angle.`] };
    };

    const session = createOperatorSession({ goal: "Get 5 pilot conversations.", projectId: "default" }, options);
    const paused = await runOperatorSession(session.id, {
      options: { ...options, ideaGenerator: spyGenerator, ideaBar: fakeBar(), ideaDistinct: fakeDistinct },
      client: fakeClient([{ content: [{ type: "tool_use", id: "i", name: "ideate", input: {} }] }]),
    });

    assert.equal(paused.status, "waiting_for_ideas");
    assert.ok(captured, "the generator received a taste object");
    assert.ok(captured.ideaTaste, "the taste carried idea taste from the feedback rail");
    assert.ok(
      captured.ideaTaste.killedAngles.some((a) => a.angle === "scarcity-first"),
      "the previously killed angle reached the next ideation round",
    );
  });

  // LEG 2 — the founder-pick path banks taste. A kill/keep made through the operator pause must bank an
  // IdeaKill/IdeaKeep on the same feedback rail the standalone route uses, or the operator path teaches
  // nothing.
  it("banks IdeaKill/IdeaKeep when the founder resolves the operator pause", async () => {
    const session = createOperatorSession({ goal: "Land a design partner.", projectId: "default" }, options);
    const paused = await runOperatorSession(session.id, {
      options: { ...options, ideaGenerator: async ({ angle }) => ({ ideas: [`Move from ${angle}.`] }), ideaBar: fakeBar(), ideaDistinct: fakeDistinct },
      client: fakeClient([{ content: [{ type: "tool_use", id: "i", name: "ideate", input: {} }] }]),
    });
    const survivors = paused.pendingIdeas.ideas;
    const buildId = survivors[0].id;
    const killId = survivors[1]?.id ?? null;

    resolveOperatorIdeas(session.id, { build: buildId, kill: killId ? [killId] : [] }, {
      options,
      client: fakeClient([{ content: [{ type: "tool_use", id: "done", name: "complete", input: { outcome: "achieved", summary: "Built the pick." } }] }]),
    });

    const ledger = loadFeedbackLedger("default", options);
    assert.ok(ledger.signals.some((s) => s.type === "IdeaKeep" && s.ideaId === buildId), "the pick banked an IdeaKeep");
    if (killId) {
      assert.ok(ledger.signals.some((s) => s.type === "IdeaKill" && s.ideaId === killId), "the kill banked an IdeaKill");
    }
    // Founder decisions, never AgentAction records the crystallizer could freeze into a tool.
    assert.ok(ledger.signals.filter((s) => s.type === "IdeaKill" || s.type === "IdeaKeep").every((s) => s.type !== "AgentAction"));

    await new Promise((resolve) => setTimeout(resolve, 20));
  });

  // LEG 3 — compose_and_run wires the built channel back onto the picked idea, so the run's gate outcome
  // closes the loop. Before the repair nothing bound the channel id, so the idea never carried an outcome.
  it("wires the built channel onto its idea and records the run outcome back (loop-close deriver fires)", async () => {
    const idea = createGtmIdea({
      projectId: "default",
      goal: "Land pilots",
      angle: "asset-first",
      pitch: "Turn the repo into a public scorecard.",
      barScore: 7.4,
      verdict: "survived",
      buildWiring: { kind: "compose_and_run", goal: "Land pilots", title: "Land pilots" },
    }, options);
    assert.equal(idea.buildWiring.channelId, undefined, "the idea starts unbound to any channel");

    const session = createOperatorSession({ goal: "Land pilots", projectId: "default" }, options);
    const paused = await runOperatorSession(session.id, {
      options: { ...options, compose: fakeComposer, evaluate: async () => ({ ok: false }), stepRuntime: fakeStepRuntime },
      client: fakeClient([{ content: [{ type: "tool_use", id: "go", name: "compose_and_run", input: { goal: "Land pilots", idea_id: idea.id } }] }]),
    });

    assert.equal(paused.status, "waiting_for_gate");
    const bound = getGtmIdea(idea.id, options);
    assert.equal(bound.buildWiring.channelId, paused.graphId, "the built channel's id is wired onto the idea");
    assert.ok(bound.outcome, "the run's gate outcome closed the loop onto the idea");
    assert.equal(bound.outcome.reachedGate, true);
  });
});
