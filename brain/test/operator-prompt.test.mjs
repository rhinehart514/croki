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

  it("makes the embodied SHAPE the opening move via propose_candidates", () => {
    const prompt = systemPrompt(session, workspace, [], null);
    // Shape-first is the default opening move on a build.
    assert.ok(prompt.includes("Lead with the SHAPE"));
    // propose_candidates remains the only way options are offered.
    assert.ok(prompt.includes("propose_candidates"));
    assert.ok(prompt.includes("ONLY way you offer options"));
  });
});
