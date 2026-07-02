// market-research.test.mjs — the Phase 1 buyer-side truth pillar.
//
// What this proves (GTM-ENGINE-REBUILD §4, Phase 1):
//   - The capability is reached through an injectable generator (a research agent/skill), not a
//     hardwired connector: a fake generator drives the whole ritual in tests.
//   - Evidence discipline is enforced in CODE on persist: a sourced record keeps its solidity; an
//     unsourced record is demoted to speculative — never rejected, never faked into shape.
//   - Founder-typed inputs become an OVERRIDE layer alongside the researched (primary) records.
//   - The market context is a PROJECTION over the stored objects, founder-stated overriding for the
//     flat fields, the full labelled set carried for the provider.
//   - The provider renders each record with its honest solidity (a hypothesis reads as a hypothesis).
//   - The honest-blank default persists nothing rather than fabricating a picture.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  runMarketResearch,
  blankGenerate,
  founderOverrideObjects,
  buildMarketContext,
  founderInputsFromSharedContext,
  createClaudeMarketResearcher,
  MARKET_OBJECT_KIND_HINTS,
} from "../src/market-research.mjs";
import { marketObjectStore } from "../src/gtm-store.mjs";
import { createMarketProvider } from "../src/context/providers.mjs";

// Isolated store root per test — nothing touches the real ~/.gtm-ide.
function freshRoot() {
  return { root: fs.mkdtempSync(path.join(os.tmpdir(), "market-research-")) };
}

// A fake generator standing in for the rented research agent — the seam that proves the capability
// is reached through an open, injectable step and never a hardwired connector.
function fakeGenerator(objects, meta = {}) {
  return async () => ({ ok: true, objects, meta });
}

describe("market-research — the ritual persists a researched, evidence-disciplined set", () => {
  it("persists sourced records at their solidity and demotes an unsourced record to speculative", async () => {
    const options = freshRoot();
    const generate = fakeGenerator([
      {
        kind: "buyer",
        statement: "Local business owners with 1-10 staff who stopped fixing their website",
        evidence: [{ claim: "described in the repo ICP", source: "AGENTS.md:146", solidity: "observed" }],
        solidity: "observed",
        confidence: 0.8,
      },
      {
        kind: "channel",
        statement: "These owners gather in local Facebook groups and trade associations",
        evidence: [{ claim: "forum threads", source: "https://example.com/thread", solidity: "researched" }],
        solidity: "researched",
      },
      {
        // No sourced evidence — a flagged hypothesis. Must persist, but demoted to speculative.
        kind: "trigger",
        statement: "They churn from an agency right before renewal season",
        solidity: "researched",
        openQuestions: ["Is renewal season the real trigger?"],
      },
    ]);

    const { ok, objects, meta } = await runMarketResearch({ generator: generate, projectId: "strelva", options });
    assert.equal(ok, true);
    assert.equal(objects.length, 3);
    assert.equal(meta.researched, 3);

    const byKind = Object.fromEntries(objects.map((o) => [o.kind, o]));
    assert.equal(byKind.buyer.solidity, "observed", "a sourced record keeps its declared solidity");
    assert.equal(byKind.channel.solidity, "researched");
    assert.equal(
      byKind.trigger.solidity,
      "speculative",
      "an unsourced record is structurally demoted, never presented as researched",
    );

    // Persisted, project-scoped, and readable back.
    const stored = marketObjectStore.list({ ...options, projectId: "strelva" });
    assert.equal(stored.length, 3);
  });

  it("accepts a novel kind — no closed kind enum (the hints are only a hint)", async () => {
    const options = freshRoot();
    const generate = fakeGenerator([
      { kind: "ritual_gathering", statement: "buyers swap referrals at a weekly breakfast", evidence: [{ claim: "seen", source: "https://x" }] },
    ]);
    const { objects } = await runMarketResearch({ generator: generate, projectId: "p", options });
    assert.equal(objects[0].kind, "ritual_gathering");
    assert.ok(!MARKET_OBJECT_KIND_HINTS.includes("ritual_gathering"), "the novel kind is not on the hint list, yet passes through");
  });

  it("skips a candidate missing a required field rather than inventing shape", async () => {
    const options = freshRoot();
    const generate = fakeGenerator([
      { kind: "buyer", statement: "a real buyer", evidence: [{ claim: "c", source: "https://x" }] },
      { kind: "pain" }, // no statement — the store would reject; the ritual drops it
      { statement: "no kind here" }, // no kind — dropped
    ]);
    const { objects, meta } = await runMarketResearch({ generator: generate, projectId: "p", options });
    assert.equal(objects.length, 1);
    assert.equal(meta.skipped, 2);
  });

  it("the honest-blank default persists nothing", async () => {
    const options = freshRoot();
    const { objects, meta } = await runMarketResearch({ generator: blankGenerate, projectId: "p", options });
    assert.equal(objects.length, 0);
    assert.equal(meta.blank, true);
    assert.equal(marketObjectStore.list({ ...options, projectId: "p" }).length, 0);
  });
});

describe("market-research — founder-typed inputs are an override layer", () => {
  const founderInputs = {
    buyer: "1-10 person local businesses",
    trigger: "just left an agency",
    channels: ["local Facebook groups"],
    positioning: { category: "AI website management", promise: "See what's working. Tell the AI what to change.", problem: "a website they stopped fixing" },
    offer: { price: "$199", unit: "/mo", terms: "no contract, leave anytime" },
  };

  it("maps founder inputs into founder-stated records at honest solidity", () => {
    const objects = founderOverrideObjects(founderInputs, { projectId: "strelva" });
    const byKind = {};
    for (const o of objects) (byKind[o.kind] ??= []).push(o);

    assert.ok(byKind.buyer, "a buyer record is mapped");
    assert.equal(byKind.buyer[0].source, "founder-stated");
    // The founder's own price is observed reality of their business; their buyer read is inferred.
    // (These are pre-store override records, so the declared solidity is on `solidity`.)
    assert.equal(byKind.offer[0].solidity, "observed");
    assert.equal(byKind.buyer[0].solidity, "inferred");
    // founder-stated is a real source, so once persisted the offer is honored as observed (not demoted).
    const options = freshRoot();
    const persistedOffer = marketObjectStore.create({ ...byKind.offer[0], projectId: "strelva" }, options);
    assert.equal(persistedOffer.solidity, "observed");
  });

  it("the ritual persists researched records AND the founder override layer", async () => {
    const options = freshRoot();
    const generate = fakeGenerator([
      { kind: "buyer", statement: "researched buyer read", evidence: [{ claim: "c", source: "https://x" }], solidity: "researched" },
    ]);
    const { objects, meta } = await runMarketResearch({ generator: generate, projectId: "strelva", founderInputs, options });
    assert.equal(meta.researched, 1);
    assert.ok(objects.length > 1, "the founder override layer is persisted alongside the researched record");
    const founderStated = objects.filter((o) => o.source === "founder-stated");
    assert.ok(founderStated.length >= 1, "founder-stated overrides are present");
  });

  it("extracts founder inputs from a project's shared-context market side; null when nothing stated", () => {
    const sc = {
      icp: { query: "local businesses", keywords: ["facebook groups"] },
      positioning: { category: "AI website management", promise: "See what's working." },
      offer: { price: "$199", unit: "/mo" },
    };
    const inputs = founderInputsFromSharedContext(sc);
    assert.equal(inputs.buyer, "local businesses");
    assert.deepEqual(inputs.channels, ["facebook groups"]);
    assert.equal(inputs.offer.price, "$199");
    assert.equal(founderInputsFromSharedContext({}), null, "an empty shared context yields no founder inputs");
    assert.equal(founderInputsFromSharedContext(null), null);
  });
});

describe("market-research — the context projection and provider", () => {
  it("projects stored objects into a market context; founder-stated overrides the flat field", () => {
    const objects = [
      { kind: "buyer", statement: "researched buyer", solidity: "researched", source: "web-research" },
      { kind: "buyer", statement: "founder's buyer", solidity: "inferred", source: "founder-stated" },
      { kind: "channel", statement: "local Facebook groups", solidity: "researched" },
      { kind: "offer", statement: "$199/mo", solidity: "observed", source: "founder-stated" },
    ];
    const ctx = buildMarketContext(objects);
    assert.equal(ctx.buyer, "founder's buyer", "the founder-stated buyer overrides the flat field");
    assert.deepEqual(ctx.channels, ["local Facebook groups"]);
    assert.equal(ctx.offer, "$199/mo");
    assert.equal(ctx.objects.length, 4, "the full labelled set is carried for the provider");
  });

  it("an empty set projects to null (honest blank)", () => {
    assert.equal(buildMarketContext([]), null);
    assert.equal(buildMarketContext(), null);
  });

  it("the provider renders each record with its honest solidity; a hypothesis reads as a hypothesis", () => {
    const ctx = buildMarketContext([
      { kind: "buyer", statement: "a researched buyer", solidity: "researched", source: "web-research" },
      { kind: "trigger", statement: "a guessed trigger", solidity: "speculative" },
    ]);
    const contribution = createMarketProvider(ctx).contribute();
    assert.match(contribution.text, /\[buyer\] a researched buyer \[researched\]/);
    assert.match(contribution.text, /a guessed trigger \[hypothesis — unconfirmed, no source\]/);
    assert.equal(contribution.meta.objects, 2);
    assert.equal(contribution.meta.researched, 1, "only the sourced record counts as researched");
  });

  it("the provider is an honest blank on no market context", () => {
    assert.equal(createMarketProvider(null).contribute(), null);
    assert.equal(createMarketProvider({}).contribute(), null);
  });
});

describe("market-research — the live generator is the injectable seam", () => {
  it("createClaudeMarketResearcher builds a generator function (an open step, not a hardwired connector)", () => {
    // A full live call is the Strelva ritual run, not a unit test. Here we only assert the factory
    // yields a generator with the { ok, objects, meta } contract the ritual drives — the same
    // injectable seam a fake generator fills in every test above.
    const generate = createClaudeMarketResearcher({ cwd: process.cwd(), maxTurns: 1 });
    assert.equal(typeof generate, "function");
  });
});
