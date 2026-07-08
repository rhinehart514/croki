import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { distillTaste, renderDistilledTaste } from "../src/taste-distill.mjs";
import { buildTasteProfile, extractDecisions } from "../src/memory.mjs";

describe("taste distillation", () => {
  it("renders nothing when there is no signal", () => {
    assert.equal(distillTaste(null), null);
    assert.equal(renderDistilledTaste(null), "");
  });

  it("turns approved examples into founder voice guidance", () => {
    const distilled = distillTaste({
      approved: ["warm note"],
      rejected: [],
      edits: [],
      counts: { approved: 1, rejected: 0, edits: 0, killedAngles: 0, keptAngles: 0 },
    });
    assert.ok(distilled.rules.some((rule) => rule.includes("warm note")));
    assert.equal(distilled.observed.approved, 1);
  });

  it("prioritizes founder edits as the strongest rule", () => {
    const distilled = distillTaste({
      approved: [],
      rejected: [],
      edits: [{ from: "stiff pitch", to: "warm hello" }],
      counts: { approved: 0, rejected: 0, edits: 1, killedAngles: 0, keptAngles: 0 },
    });
    assert.ok(distilled.rules[0].includes("stiff pitch"));
    assert.ok(distilled.rules[0].includes("warm hello"));
  });

  it("turns rejected examples into avoid guidance", () => {
    const distilled = distillTaste({
      approved: [],
      rejected: ["overwrought sales copy"],
      edits: [],
      counts: { approved: 0, rejected: 1, edits: 0, killedAngles: 0, keptAngles: 0 },
    });
    assert.ok(distilled.rules.some((rule) => rule.includes("overwrought sales copy")));
  });

  it("turns killed idea angles into angle guidance", () => {
    const distilled = distillTaste({
      approved: [],
      rejected: [],
      edits: [],
      ideaTaste: { killedAngles: [{ angle: "cold outreach", count: 1 }], keptAngles: [] },
      counts: { approved: 0, rejected: 0, edits: 0, killedAngles: 1, keptAngles: 0 },
    });
    assert.ok(distilled.rules.some((rule) => rule.includes("cold outreach")));
  });

  it("caps rules while preserving priority order", () => {
    const distilled = distillTaste({
      approved: ["approved voice"],
      rejected: ["rejected voice"],
      edits: [{ from: "before", to: "after" }],
      ideaTaste: {
        killedAngles: [{ angle: "dead angle", count: 1 }],
        keptAngles: [{ angle: "live angle", count: 1 }],
      },
      counts: { approved: 1, rejected: 1, edits: 1, killedAngles: 1, keptAngles: 1 },
    }, { maxRules: 2 });
    assert.equal(distilled.rules.length, 2);
    assert.ok(distilled.rules[0].startsWith("Correct toward"));
    assert.ok(distilled.rules[1].startsWith("Match the voice"));
  });

  it("bounds long examples with an ellipsis", () => {
    const distilled = distillTaste({
      approved: ["x".repeat(500)],
      rejected: [],
      edits: [],
      counts: { approved: 1, rejected: 0, edits: 0, killedAngles: 0, keptAngles: 0 },
    }, { maxExampleChars: 20 });
    assert.ok(distilled.rules[0].includes("…"));
    assert.ok(distilled.rules[0].length < 120);
  });

  it("is deterministic for identical input", () => {
    const profile = {
      approved: ["warm note"],
      rejected: ["cold note"],
      edits: [{ from: "stiff", to: "warm" }],
      counts: { approved: 1, rejected: 1, edits: 1, killedAngles: 0, keptAngles: 0 },
    };
    assert.deepEqual(distillTaste(profile), distillTaste(profile));
  });

  it("consumes the real taste profile shape from run decisions", () => {
    const runs = [{
      result: {
        nodes: {
          gate: {
            category: "gate",
            items: [{ name: "A", email: "a@x.com", draft: "warm note to A", approvalStatus: "approved" }],
          },
        },
      },
    }];
    const profile = buildTasteProfile(extractDecisions(runs));
    const distilled = distillTaste(profile);
    assert.ok(distilled);
    assert.ok(Array.isArray(distilled.rules));
    assert.ok(distilled.rules.length > 0);
  });

  it("renders rules with gate-safe context and observed counts", () => {
    const distilled = {
      rules: ['Match the voice the founder approved (e.g. "warm note").'],
      observed: { approved: 1, rejected: 0, edits: 0, killedAngles: 0, keptAngles: 0 },
    };
    const rendered = renderDistilledTaste(distilled);
    assert.ok(rendered.includes('- Match the voice the founder approved (e.g. "warm note").'));
    assert.ok(rendered.includes("Observed:"));
    assert.ok(rendered.includes("the approval gate still decides what actually sends"));
  });
});
