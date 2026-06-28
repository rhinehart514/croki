// Per-provider cutover (E1.6 + E2.4). Agentic retrieval is no longer all-or-nothing: a config
// names WHICH grounding sources are pulled through tools, and the rest stay pre-packed and proven.
// This proves the dial: default = today's behavior, one source can be cut over while the others
// stay packed, the full flag still cuts everything over, and taste/design can be flipped last.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { agenticProviders, buildAgentPrompt } from "../src/agent-bridge.mjs";
import { RETRIEVAL_SOURCES } from "../src/context/retrieval-tools.mjs";

// A run context with several real sources populated, so the partition is observable: a source that
// is cut over should appear as a tool and NOT in the pre-pack; a source still packed should appear
// in the pre-pack and NOT as a tool.
function richContext() {
  return {
    grounding: { productName: "RodentRadar", headline: "Remote rodent monitoring for food facilities" },
    market: {
      buyer: "Regional pest-control operators with commercial food accounts",
      trigger: "A failed audit at a food-facility account",
      channels: ["LinkedIn", "industry forums"],
    },
    __memory: { approved: [{ summary: "Discovery-first openers land" }], rejected: [], edits: [] },
    designState: {
      houseStyle: "Warm Calm",
      feeling: "calm, grounded, unhurried",
      references: [],
      dimensions: { visual: { principle: "OKLCH warm neutrals, generous whitespace", grounded: false } },
    },
    __state: [{ createdAt: "2026-06-20", ok: true }],
  };
}

describe("agenticProviders — the cutover resolver", () => {
  it("defaults to an empty set (no config, no env, flag off) — nothing changes", () => {
    const prior = process.env.GTM_AGENTIC_PROVIDERS;
    const priorFull = process.env.GTM_AGENTIC_RETRIEVAL;
    delete process.env.GTM_AGENTIC_PROVIDERS;
    delete process.env.GTM_AGENTIC_RETRIEVAL;
    try {
      assert.equal(agenticProviders().size, 0);
    } finally {
      if (prior !== undefined) process.env.GTM_AGENTIC_PROVIDERS = prior;
      if (priorFull !== undefined) process.env.GTM_AGENTIC_RETRIEVAL = priorFull;
    }
  });

  it("an explicit array selects exactly those sources", () => {
    const set = agenticProviders(["market"]);
    assert.deepEqual([...set], ["market"]);
  });

  it("the full flag cuts EVERY source over (the all-on case is preserved)", () => {
    const set = agenticProviders(undefined, { full: true });
    assert.equal(set.size, RETRIEVAL_SOURCES.length);
    for (const source of RETRIEVAL_SOURCES) assert.ok(set.has(source), `${source} should be agentic under the full flag`);
  });

  it("\"all\" string is equivalent to the full flag", () => {
    assert.equal(agenticProviders("all").size, RETRIEVAL_SOURCES.length);
  });

  it("a comma-string from config parses to a set", () => {
    assert.deepEqual([...agenticProviders("market,signal")].sort(), ["market", "signal"]);
  });

  it("drops names that are not real sources (a stale config can't invent a tool)", () => {
    assert.deepEqual([...agenticProviders(["market", "not-a-source"])], ["market"]);
  });

  it("an explicit empty value means explicitly OFF, even with env set", () => {
    const prior = process.env.GTM_AGENTIC_PROVIDERS;
    process.env.GTM_AGENTIC_PROVIDERS = "market";
    try {
      assert.equal(agenticProviders("").size, 0, "an explicit empty string wins over the env");
    } finally {
      if (prior === undefined) delete process.env.GTM_AGENTIC_PROVIDERS;
      else process.env.GTM_AGENTIC_PROVIDERS = prior;
    }
  });

  it("reads GTM_AGENTIC_PROVIDERS from the env when no explicit config is given", () => {
    const prior = process.env.GTM_AGENTIC_PROVIDERS;
    process.env.GTM_AGENTIC_PROVIDERS = "taste";
    try {
      assert.deepEqual([...agenticProviders()], ["taste"]);
    } finally {
      if (prior === undefined) delete process.env.GTM_AGENTIC_PROVIDERS;
      else process.env.GTM_AGENTIC_PROVIDERS = prior;
    }
  });
});

describe("buildAgentPrompt — per-provider partition", () => {
  it("default (no agentic config) pre-packs everything and offers no tools (byte-for-byte today)", () => {
    const built = buildAgentPrompt({ ref: "gtm-enrich", prompt: "Work it.", items: [], context: richContext() });
    assert.equal(built.retrievalTools, null, "no tools offered by default");
    assert.equal(built.manifest.mode, undefined, "default manifest is the pre-pack assembler manifest");
    assert.ok(Array.isArray(built.manifest.providers), "pre-pack manifest lists providers");
    // The market context is stapled into the prompt (pre-packed), not pulled.
    assert.match(built.prompt, /Regional pest-control operators/);
    assert.doesNotMatch(built.prompt, /get_market/);
  });

  it("with ONLY market cut over: get_market is a tool AND the others stay pre-packed", () => {
    const built = buildAgentPrompt({
      ref: "gtm-enrich",
      prompt: "Work it.",
      items: [],
      context: richContext(),
      agenticProviders: ["market"],
    });

    assert.equal(built.manifest.mode, "partial-agentic");
    assert.deepEqual(built.manifest.cutover, ["market"]);

    // get_market is OFFERED as a tool...
    const offered = built.retrievalTools.map((t) => t.name);
    assert.deepEqual(offered, ["get_market"], "only the cut-over source is offered as a tool");
    assert.match(built.prompt, /get_market/, "the catalog lists get_market");

    // ...and the market text is NOT pre-packed (it would be delivered twice otherwise).
    assert.doesNotMatch(built.prompt, /Regional pest-control operators/, "cut-over market must not be pre-packed");

    // The OTHER sources are still pre-packed (taste/design/product/state).
    const prePacked = built.manifest.prePacked.providers.filter((p) => p.contributed).map((p) => p.name);
    assert.ok(prePacked.includes("taste"), "taste stays pre-packed");
    assert.ok(prePacked.includes("design"), "design stays pre-packed");
    // And market is toggled off in the pre-pack manifest, not contributing.
    const marketEntry = built.manifest.prePacked.providers.find((p) => p.name === "market");
    assert.equal(marketEntry?.contributed, false, "market is toggled off in the pre-pack");
  });

  it("taste and design can be flipped LAST: cut over the rest, leave taste/design pre-packed", () => {
    const lastTwo = new Set(["taste", "design"]);
    const allButTasteDesign = RETRIEVAL_SOURCES.filter((s) => !lastTwo.has(s));
    const built = buildAgentPrompt({
      ref: "gtm-enrich",
      prompt: "Work it.",
      items: [],
      context: richContext(),
      agenticProviders: allButTasteDesign,
    });

    assert.equal(built.manifest.mode, "partial-agentic");
    const offered = built.retrievalTools.map((t) => t.name);
    assert.ok(offered.includes("get_market"), "market is cut over");
    assert.ok(!offered.includes("get_taste"), "taste is NOT yet cut over");
    assert.ok(!offered.includes("get_design"), "design is NOT yet cut over");

    // taste + design still pre-packed and contributing.
    const prePacked = built.manifest.prePacked.providers.filter((p) => p.contributed).map((p) => p.name);
    assert.ok(prePacked.includes("taste"), "taste still pre-packed (flipped last)");
    assert.ok(prePacked.includes("design"), "design still pre-packed (flipped last)");
  });

  it("the full flag still works as the all-on case: every source is a tool, nothing pre-packed", () => {
    const built = buildAgentPrompt({
      ref: "gtm-enrich",
      prompt: "Work it.",
      items: [],
      context: richContext(),
      agenticRetrieval: true,
    });
    assert.equal(built.manifest.mode, "agentic");
    assert.equal(built.retrievalTools.length, RETRIEVAL_SOURCES.length);
    // No pre-packed grounding text — only the tool catalog.
    assert.doesNotMatch(built.prompt, /Regional pest-control operators/);
    assert.match(built.prompt, /get_market/);
    assert.match(built.prompt, /get_taste/);
  });
});
