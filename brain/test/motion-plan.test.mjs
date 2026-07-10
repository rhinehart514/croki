import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  blankPlan,
  toPlan,
  rankMotions,
  planSpan,
  createClaudeMotionPlanner,
  createTerrainMotionPlanner,
  terrainReadToPlan,
  MOTION_PLAN_PROMPT,
} from "../src/motion-plan.mjs";
import { productLedGrounding } from "../src/run-grounding.mjs";

// A stored product model with all eight layers, so both projections can be checked off ONE model.
const STORED_MODEL = {
  things: [{ name: "Sale", kind: "entity", summary: "An estate sale listing" }],
  relationships: [{ from: "Seller", to: "Sale", label: "creates" }],
  userGoals: [{ actor: "seller", goal: "list a sale", outcome: "buyers show up" }],
  states: [{ thingId: "Sale", name: "published" }],
  ia: [{ name: "Sale pages", parentId: "", summary: "one page per sale", relatedThings: ["Sale"], provenance: "derived", evidence: [{ file: "src/routes/sale.js", line: 12, text: "app.get('/sales/:id')" }] }],
  workflows: [{ name: "List a sale", actor: "seller", steps: [{ label: "create sale" }, { label: "publish" }], provenance: "derived", evidence: [] }],
  interactions: [{ name: "Sale editor", kind: "screen", summary: "edit a sale" }],
  transitions: [{ from: "Sale editor", to: "Sale page", trigger: "publish" }],
};

describe("productLedGrounding — the plan-path projection over the same stored model", () => {
  it("retains the four product-led layers the run path discards, on top of the compact core", () => {
    const g = productLedGrounding(STORED_MODEL);
    // Compact core is present.
    assert.equal(g.things[0].name, "Sale");
    assert.equal(g.userGoals[0].goal, "list a sale");
    // The four extra layers the run path drops are kept for the plan.
    assert.equal(g.ia[0].name, "Sale pages");
    assert.equal(g.ia[0].evidence[0].file, "src/routes/sale.js", "IA evidence carried for the planner to cite");
    assert.equal(g.workflows[0].name, "List a sale");
    assert.equal(g.workflows[0].steps.length, 2);
    assert.equal(g.interactions[0].name, "Sale editor");
    assert.equal(g.transitions[0].trigger, "publish");
  });

  it("returns null on no model, and empty bags on an empty model (honest blank — never invented)", () => {
    assert.equal(productLedGrounding(null), null);
    assert.equal(productLedGrounding(undefined), null);
    // An empty-but-present model projects to empty bags (matching compactProductModel), never invented.
    const empty = productLedGrounding({});
    assert.deepEqual(empty.things, []);
    assert.deepEqual(empty.ia, []);
    assert.deepEqual(empty.workflows, []);
  });
});

describe("motion-plan pollution guard — a fake citation is demoted to a bet", () => {
  it("demotes a 'derived' motion with no real citation to speculative and flags it demoted", () => {
    const plan = toPlan([
      { kind: "programmatic-pages", title: "Per-city pages", origin: "derived", codeNative: true, evidence: [] },
    ]);
    const m = plan.motions[0];
    assert.equal(m.origin, "speculative", "derived-with-no-evidence is demoted");
    assert.equal(m.demoted, true, "the demotion is surfaced, not silently swallowed");
  });

  it("an empty {} evidence entry does not count — only a real file:line counts", () => {
    const plan = toPlan([
      { kind: "outbound", title: "Cold email PCOs", origin: "derived", evidence: [{}, { label: "no file" }] },
    ]);
    assert.equal(plan.motions[0].origin, "speculative", "citations without a file are not proof");
  });

  it("keeps a derived motion that carries a real file:line citation", () => {
    const plan = toPlan([
      { kind: "code-change", title: "Add share link to sale pages", origin: "derived", codeNative: true,
        evidence: [{ file: "src/routes/sale.js", line: 12, text: "app.get('/sales/:id')" }] },
    ]);
    const m = plan.motions[0];
    assert.equal(m.origin, "derived");
    assert.equal(m.demoted, false);
    assert.equal(m.evidence[0].file, "src/routes/sale.js");
  });
});

describe("motion-plan open shape — kind is an open string, never validated", () => {
  it("a novel motion kind passes through untouched", () => {
    const plan = toPlan([{ kind: "community-almanac-drop", title: "Seed the local almanac", origin: "speculative" }]);
    assert.equal(plan.motions[0].kind, "community-almanac-drop");
  });

  it("a titleless bag is dropped rather than shown as a blank card", () => {
    const plan = toPlan([{ kind: "outbound" }, { title: "Real one" }]);
    assert.equal(plan.motions.length, 1);
    assert.equal(plan.motions[0].title, "Real one");
  });

  it("junk input yields an empty plan, never a throw", () => {
    for (const bad of [null, undefined, "text", 5, {}, [null, 7, "x"]]) {
      const plan = toPlan(bad);
      assert.deepEqual(plan.motions, [], `empty for ${String(bad)}`);
      assert.equal(plan.span.motionCount, 0);
    }
  });
});

describe("motion-plan ranking — provenance + citation + code-native, tie-stable", () => {
  it("a derived, cited, code-native motion outranks a bare speculative bet", () => {
    const ranked = rankMotions([
      { id: "a", kind: "x", title: "bet", origin: "speculative", confidence: "low", codeNative: false, evidence: [] },
      { id: "b", kind: "y", title: "derived code-native", origin: "derived", confidence: "high", codeNative: true, evidence: [{ file: "a.js", line: 1, text: "t" }] },
    ]);
    assert.equal(ranked[0].title, "derived code-native");
    assert.equal(ranked[0].orderRank, 0);
    assert.equal(ranked[1].orderRank, 1);
  });

  it("equal-scored motions keep their original order (stable)", () => {
    const same = { origin: "speculative", confidence: "low", codeNative: false, evidence: [] };
    const ranked = rankMotions([
      { id: "1", kind: "k", title: "first", ...same },
      { id: "2", kind: "k", title: "second", ...same },
    ]);
    assert.equal(ranked[0].title, "first");
    assert.equal(ranked[1].title, "second");
  });
});

describe("planSpan — the eval's 'the read produces the plan' summary (Area 4 #4)", () => {
  it("a plan spanning kinds with a real derived code-native motion passes the span", () => {
    const plan = toPlan([
      { kind: "programmatic-pages", title: "Per-city pages", origin: "derived", codeNative: true, evidence: [{ file: "src/data/sales.js", line: 3, text: "sales" }] },
      { kind: "in-product-loop", title: "Share link", origin: "speculative", codeNative: true },
      { kind: "ai-visibility", title: "Get cited near-me", origin: "speculative", capabilityRefs: ["localseodata/ai_mentions"] },
      { kind: "outbound", title: "Reach estate-sale companies", origin: "speculative" },
    ]);
    assert.equal(plan.span.kindCount, 4);
    assert.equal(plan.span.hasDerivedCodeNative, true);
    assert.equal(plan.span.capabilityWired, true, "a wired MCP capability ref is recognized");
  });

  it("a code-native motion demoted to a bet does NOT count as a derived code-native (span honest)", () => {
    const plan = toPlan([
      { kind: "code-change", title: "Bet only", origin: "derived", codeNative: true, evidence: [] }, // demoted
    ]);
    assert.equal(plan.span.hasDerivedCodeNative, false, "a demoted bet is not a proven code-native motion");
  });
});

describe("motion-plan blank default — refuses rather than fabricates", () => {
  it("returns an ok, empty plan with meta.blank when no planner is wired", async () => {
    const result = await blankPlan({ productModel: { things: [] } });
    assert.equal(result.ok, true);
    assert.equal(result.meta.blank, true);
    assert.deepEqual(result.plan.motions, []);
  });
});

describe("motion-plan doctrine — the prompt forbids a predefined shape and mandates a code-native motion", () => {
  it("the prompt names the no-funnel rule, the derived/speculative split, and the code-native requirement", () => {
    assert.match(MOTION_PLAN_PROMPT, /NO PREDEFINED SHAPE/);
    assert.match(MOTION_PLAN_PROMPT, /derived|speculative/);
    assert.match(MOTION_PLAN_PROMPT, /code-native/i);
    assert.match(MOTION_PLAN_PROMPT, /file:line/);
  });
});

describe("createClaudeMotionPlanner — injectable factory (no live model call in the unit env)", () => {
  it("is a factory that returns a plan function", () => {
    const planner = createClaudeMotionPlanner({ cwd: process.cwd() });
    assert.equal(typeof planner, "function");
  });

  it("toPlan threads scannedAt through so the staleness flag can be computed at read time", () => {
    const plan = toPlan([{ title: "x", origin: "speculative" }], { scannedAt: "2026-07-09T00:00:00.000Z", generatedAt: "2026-07-08T00:00:00.000Z" });
    assert.equal(plan.scannedAt, "2026-07-09T00:00:00.000Z");
    assert.equal(plan.generatedAt, "2026-07-08T00:00:00.000Z");
    // A scan newer than the plan's generation is the staleness condition the route flags.
    assert.ok(String(plan.scannedAt) > String(plan.generatedAt));
  });
});

describe("motion-plan terrain compatibility", () => {
  it("projects only optional terrain suggested moves and preserves the old plan exports", () => {
    const plan = terrainReadToPlan({
      generatedAt: "2026-07-10T00:00:00.000Z",
      hypotheses: [
        { title: "No move", provenance: "speculative", suggestedMove: null },
        { title: "Opening", whyItMatters: "The product can travel.", provenance: "speculative", suggestedMove: { title: "Publish a field guide", intendedEffect: "Learn what gets shared.", measurementIntent: null } },
      ],
    });
    assert.equal(plan.motions.length, 1);
    assert.equal(plan.motions[0].title, "Publish a field guide");
    assert.equal(plan.motions[0].kind, "terrain-suggested-move");
  });

  it("offers a clean planner adapter over an injected terrain reader", async () => {
    const planner = createTerrainMotionPlanner({
      readTerrain: async () => ({ ok: true, terrainRead: { generatedAt: "2026-07-10T00:00:00.000Z", hypotheses: [] }, meta: { provider: "codex" } }),
    });
    const result = await planner({ projectId: "p", scannedAt: "2026-07-10T00:00:00.000Z" });
    assert.equal(result.ok, true);
    assert.deepEqual(result.plan.motions, []);
    assert.equal(result.meta.provider, "codex");
  });
});
