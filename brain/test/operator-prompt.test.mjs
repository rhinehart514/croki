import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { systemPrompt } from "../src/operator-prompt.mjs";

const session = { goal: "get 5 users", projectId: "p1" };
const workspace = { repo: "~/x", outcome: "signup" };

describe("operator system prompt taste block", () => {
  it("degrades to the original generic taste line", () => {
    const prompt = systemPrompt(session, workspace, [], null);
    assert.ok(prompt.includes("Learn and match the founder's taste"));
    assert.ok(prompt.includes("The wall is absolute"));
    assert.ok(prompt.includes("never approve a gate yourself"));
  });

  it("injects distilled taste without weakening wall language", () => {
    const distilled = {
      rules: ['Match the voice the founder approved (e.g. "warm note").'],
      observed: { approved: 1, rejected: 0, edits: 0, killedAngles: 0, keptAngles: 0 },
    };
    const prompt = systemPrompt(session, workspace, [], distilled);
    assert.ok(prompt.includes("Match the voice the founder approved"));
    assert.ok(!prompt.includes("Learn and match the founder's taste"));
    assert.ok(prompt.includes("The wall is absolute"));
    assert.ok(prompt.includes("never approve"));
    assert.ok(prompt.includes("the approval gate still decides what actually sends"));
  });

  it("keeps ambient framing while injecting distilled taste", () => {
    const distilled = {
      rules: ['Match the voice the founder approved (e.g. "warm note").'],
      observed: { approved: 1, rejected: 0, edits: 0, killedAngles: 0, keptAngles: 0 },
    };
    const ambient = { kind: "ambient", standingBrief: "react to churn", projectId: "p1" };
    const prompt = systemPrompt(ambient, workspace, [], distilled);
    assert.ok(prompt.includes("AMBIENT"));
    assert.ok(prompt.includes("What the founder has taught you so far"));
  });

  it("instructs out-loud human first-person beats without weakening the wall", () => {
    const prompt = systemPrompt(session, workspace, [], null);
    // Narration guidance is present.
    assert.ok(prompt.includes("Think out loud"));
    assert.ok(prompt.includes("first-person"));
    // The wall survives the rewrite unchanged.
    assert.ok(prompt.includes("The wall is absolute"));
    assert.ok(prompt.includes("never approve a gate yourself"));
    assert.ok(prompt.includes("stops at the gate"));
  });

  it("keeps open work native and reserves candidate shapes for real executable forks", () => {
    const prompt = systemPrompt(session, workspace, [], null);
    assert.ok(prompt.includes("dozens of independent goals"));
    assert.ok(prompt.includes("durable open work"));
    assert.ok(prompt.includes("propose_candidates"));
    assert.ok(prompt.includes("genuinely distinct executable pipeline shapes"));
    assert.ok(prompt.includes("many goals need none"));
    assert.ok(prompt.includes("status \"partial\""));
    assert.ok(prompt.includes("expectedArtifactRevision"));
  });

  it("names terrain, question, and pipeline focus on the same canvas without guessing", () => {
    const terrain = systemPrompt({
      ...session, surface: "terrain", lens: "canvas", focusRef: null,
      contextRefs: [{ type: "product-truth", id: "truth-1" }],
    }, workspace, [], null);
    assert.match(terrain, /Active view: product terrain on the canvas/);
    assert.match(terrain, /Current focus: none/);
    assert.match(terrain, /Context: product-truth:truth-1/);

    const question = systemPrompt({
      ...session, surface: "terrain", lens: "canvas", questionId: "q-1",
      focusRef: { type: "question", id: "q-1" }, contextRefs: [],
    }, workspace, [], null);
    assert.match(question, /Active view: question focus/);
    assert.match(question, /Pinned question: question:q-1/);

    const pipeline = systemPrompt({
      ...session, surface: "pipeline", lens: "canvas",
      focusRef: { type: "pipeline", id: "pipeline-1" }, contextRefs: [],
    }, workspace, [], null);
    assert.match(pipeline, /Active view: focused pipeline on the canvas/);
    assert.match(pipeline, /Current focus: pipeline:pipeline-1/);
  });
});
