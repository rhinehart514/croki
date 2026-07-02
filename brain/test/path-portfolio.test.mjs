// path-portfolio.test.mjs — the Phase 2 GTM path portfolio (GTM-ENGINE-REBUILD §4, Phase 2).
//
// What this proves:
//   - RANKING is deterministic code over stored data (the guard): the seven signals are computed by
//     resolving each path's restsOn refs back to the stored records and reading their real solidity /
//     confidence / source plus the attached contract — never a model guessing a number. Same records
//     in → same signals out; a grounded, measurable, reachable bet outranks a speculative one.
//   - GENERATION is a LEAN prompt with a SEPARATE, SINGLE grade: the generator and grader are
//     different functions by construction (passing the same is rejected), and the whole batch is
//     graded in ONE call, not a per-path fleet — mirroring the reworked ideation.
//   - Each path carries its OWN MeasurementContract, persisted and linked, before it could ever run.
//   - The Strelva validation: the run yields a FOCUSED, DIVERSE set (a soft ~6-10 band), spread across
//     distinct GTM angles, each grounded in named evidence, each with a measurement contract attached.
//   - Honest blank default persists nothing; open shapes (novel bet facet, novel outcome kind) pass.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  composePathPortfolio,
  computeRankingSignals,
  compositeRank,
  contractCompleteness,
  buildPathGrounding,
  blankGeneratePaths,
  blankGradePath,
  SIGNAL_WEIGHTS,
} from "../src/path-portfolio.mjs";
import { productTruthStore, marketObjectStore, gtmPathStore, measurementContractStore } from "../src/gtm-store.mjs";

// Isolated store root per test — nothing touches the real ~/.gtm-ide.
function freshRoot() {
  return { root: fs.mkdtempSync(path.join(os.tmpdir(), "path-portfolio-")) };
}

// ── Ranking: deterministic code over stored data ──────────────────────────────────────────────────

describe("path-portfolio ranking — deterministic code over stored data, never a guessed number", () => {
  const truthById = new Map([["t1", { id: "t1", solidity: "observed" }]]);
  const marketById = new Map([
    ["c1", { id: "c1", kind: "channel", solidity: "researched" }],
    ["b1", { id: "b1", kind: "buyer", solidity: "inferred", source: "founder-stated", confidence: 0.9 }],
    ["spec", { id: "spec", kind: "buyer", solidity: "speculative" }],
  ]);
  const completeContract = {
    outcomeKinds: ["reply"],
    sources: ["connected-account"],
    joinKey: "thread-id",
    successCriteria: "3 replies in a week",
  };

  it("computes each of the seven signals from the referenced records and their contract", () => {
    const strong = computeRankingSignals({
      path: { restsOn: ["t1", "c1", "b1"], bet: { buyer: "x", channel: "y", offer: "z" } },
      truthById,
      marketById,
      contract: completeContract,
    });
    // measurement readiness = all four contract essentials present.
    assert.equal(strong.measurementReadiness, 1);
    // channel reachability = strength of the best-grounded channel record (researched = 0.75).
    assert.equal(strong.channelReachability, 0.75);
    // product readiness = strength of the observed ProductTruth it rests on.
    assert.equal(strong.productReadiness, 1);
    // founder fit = fraction of referenced market records the founder stated (b1 of {c1,b1} = 0.5).
    assert.equal(strong.founderFit, 0.5);
    // upside = stored confidence of the prize facet (the buyer, 0.9).
    assert.equal(strong.upside, 0.9);
    // the composite is the weighted sum of the seven — recompute it independently.
    const { composite, ...signals } = strong;
    assert.equal(composite, compositeRank(signals));
  });

  it("a grounded, measurable, reachable bet outranks a speculative one with no contract", () => {
    const strong = computeRankingSignals({
      path: { restsOn: ["t1", "c1", "b1"], bet: { buyer: "x", channel: "y" } },
      truthById,
      marketById,
      contract: completeContract,
    });
    const weak = computeRankingSignals({
      path: { restsOn: ["spec"], bet: {} },
      truthById,
      marketById,
      contract: null,
    });
    assert.ok(strong.composite > weak.composite, "the well-grounded bet ranks higher");
    assert.equal(weak.measurementReadiness, 0, "no contract → honestly unmeasurable");
    assert.equal(weak.channelReachability, 0, "no grounded channel → unreachable");
  });

  it("is fully deterministic: the same records in yield the same signals out", () => {
    const args = {
      path: { restsOn: ["t1", "c1", "b1"], bet: { buyer: "x" } },
      truthById,
      marketById,
      contract: completeContract,
    };
    assert.deepEqual(computeRankingSignals(args), computeRankingSignals(args));
  });

  it("the signal weights sum to 1 (a clean composite)", () => {
    const sum = Object.values(SIGNAL_WEIGHTS).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9, "the seven weights partition the composite");
  });

  it("contractCompleteness scores each essential a quarter; empty is honestly zero", () => {
    assert.equal(contractCompleteness(null), 0);
    assert.equal(contractCompleteness({ outcomeKinds: ["reply"] }), 0.25);
    assert.equal(contractCompleteness({ outcomeKinds: ["reply"], sources: ["x"], joinKey: "k", successCriteria: "s" }), 1);
  });

  it("buildPathGrounding carries each record's id so a bet can cite what it rests on", () => {
    const g = buildPathGrounding(
      [{ id: "t1", statement: "does X", solidity: "observed" }],
      [{ id: "m1", kind: "buyer", statement: "SMB owners", solidity: "researched", confidence: 0.7, source: "web-research" }],
    );
    assert.equal(g.productTruths[0].id, "t1");
    assert.equal(g.marketObjects[0].id, "m1");
    assert.equal(g.marketObjects[0].kind, "buyer");
  });
});

// ── Generation: a lean generate + a SEPARATE grade ─────────────────────────────────────────────────

// A fake generator standing in for the rented strategist — the seam that proves generation is reached
// through an injectable step, not a hardwired connector. It cites the real record ids from grounding.
function fakeGenerator(perAngle = 4) {
  return async ({ grounding, angle }) => {
    const truthId = grounding.productTruths[0]?.id;
    const channelId = grounding.marketObjects.find((m) => m.kind === "channel")?.id;
    const buyerId = grounding.marketObjects.find((m) => m.kind === "buyer")?.id;
    const paths = [];
    for (let i = 0; i < perAngle; i += 1) {
      paths.push({
        summary: `${angle}: reach the buyer via distinct route ${i} with wedge ${angle}-${i}`,
        bet: { buyer: `buyer for ${angle}`, channel: `channel ${angle} ${i}`, offer: `offer ${i}` },
        restsOn: [truthId, channelId, buyerId].filter(Boolean),
        risk: "the trigger may be assumed",
        confidence: 0.6,
        measurementContract: {
          outcomeKinds: ["reply", "meeting"],
          sources: ["connected-account"],
          joinKey: "thread-id",
          successCriteria: "3 replies in a week",
        },
      });
    }
    return { paths };
  };
}

// A fake generator that self-tags each path with a DIFFERENT go-to-market angle — the seam that proves
// a single unconstrained pass spreads the focused set across the palette (no per-angle fan-out).
function fakeDiverseGenerator(count = 8) {
  const palette = ["audience", "offer", "pricing", "channel", "message", "partnership", "content", "motion"];
  return async ({ grounding }) => {
    const truthId = grounding.productTruths[0]?.id;
    const channelId = grounding.marketObjects.find((m) => m.kind === "channel")?.id;
    const buyerId = grounding.marketObjects.find((m) => m.kind === "buyer")?.id;
    const paths = [];
    for (let i = 0; i < count; i += 1) {
      const angle = palette[i % palette.length];
      paths.push({
        summary: `Win via ${angle}: distinct bet ${i}`,
        angle,
        bet: { buyer: `buyer ${i}`, channel: `${angle} channel ${i}`, offer: `offer ${i}` },
        restsOn: [truthId, channelId, buyerId].filter(Boolean),
        risk: "the trigger may be assumed",
        confidence: 0.6,
        measurementContract: {
          outcomeKinds: ["reply"],
          sources: ["connected-account"],
          joinKey: "thread-id",
          successCriteria: "3 replies in a week",
        },
      });
    }
    return { paths };
  };
}

// A fake grader — a DIFFERENT function from the generator by construction (the invariant). BATCHED: it
// grades the whole set in ONE call and returns a verdict per path, keyed by index.
function fakeGrader() {
  return async ({ paths = [] }) => ({
    verdicts: paths.map((_, i) => ({ index: i, coherent: true, weakestLink: "the now-trigger is assumed, not observed" })),
  });
}

describe("path-portfolio generation — a lean generate + a SEPARATE grade", () => {
  it("refuses to run when the generator and grader are the same function", async () => {
    const same = async () => ({ paths: [] });
    await assert.rejects(
      () => composePathPortfolio({ generate: same, grade: same, options: freshRoot() }),
      /must not grade its own bets/,
    );
  });

  it("persists every generated path with its own linked measurement contract and a grade annotation", async () => {
    const options = freshRoot();
    const truth = productTruthStore.create(
      { projectId: "strelva", statement: "The app records project_created events", evidence: [{ claim: "seen", source: "src/x.ts:12", solidity: "observed" }], solidity: "observed" },
      options,
    );
    const channel = marketObjectStore.create(
      { projectId: "strelva", kind: "channel", statement: "owners gather in local Facebook groups", evidence: [{ claim: "threads", source: "https://x" }], solidity: "researched" },
      options,
    );
    const buyer = marketObjectStore.create(
      { projectId: "strelva", kind: "buyer", statement: "1-10 person local businesses", source: "founder-stated", solidity: "inferred", evidence: [{ claim: "founder", source: "founder-stated" }], confidence: 0.8 },
      options,
    );

    const result = await composePathPortfolio({
      projectId: "strelva",
      productTruths: [truth],
      marketObjects: [channel, buyer],
      generate: fakeGenerator(3),
      grade: fakeGrader(),
      angles: ["by-channel", "by-trigger"],
      options,
    });

    assert.equal(result.portfolio.length, 6, "2 angles × 3 paths each");
    for (const entry of result.portfolio) {
      assert.ok(entry.path.measurementContractId, "each path links a measurement contract");
      const contract = measurementContractStore.get(entry.path.measurementContractId, options);
      assert.equal(contract.pathId, entry.path.id, "the contract points back at its path");
      assert.deepEqual(contract.outcomeKinds, ["reply", "meeting"]);
      assert.equal(entry.weakestLink, "the now-trigger is assumed, not observed", "the separate grade rides along");
      assert.ok(entry.rankingSignals.evidenceStrength > 0, "grounded in named evidence, so it ranks");
    }
  });

  it("grades the whole batch in ONE separate call, not one per path (lean, not a fleet)", async () => {
    const options = freshRoot();
    const truth = productTruthStore.create(
      { projectId: "lean", statement: "records events", evidence: [{ claim: "seen", source: "src/x.ts:1", solidity: "observed" }], solidity: "observed" },
      options,
    );
    const channel = marketObjectStore.create(
      { projectId: "lean", kind: "channel", statement: "owners gather in local groups", evidence: [{ claim: "threads", source: "https://x" }], solidity: "researched" },
      options,
    );

    let gradeCalls = 0;
    let generateCalls = 0;
    const grade = async ({ paths = [] }) => {
      gradeCalls += 1;
      return { verdicts: paths.map((_, i) => ({ index: i, coherent: true, weakestLink: null })) };
    };
    const generate = async (args) => {
      generateCalls += 1;
      return fakeDiverseGenerator(8)(args);
    };

    const result = await composePathPortfolio({
      projectId: "lean",
      productTruths: [truth],
      marketObjects: [channel],
      generate,
      grade,
      options,
    });

    assert.equal(generateCalls, 1, "one unconstrained generate pass — no per-angle fan-out");
    assert.equal(gradeCalls, 1, "the whole batch is graded in a single call, not one per path");
    assert.equal(result.portfolio.length, 8, "all eight generated paths persisted");
  });
});

// ── The Strelva validation: a focused, diverse set spread across GTM angles ──────────────────────────

describe("path-portfolio — the Strelva run yields a FOCUSED, DIVERSE set spread across GTM angles", () => {
  it("produces a focused portfolio (soft ~6-10 band), ranked strongest first, all persisted", async () => {
    const options = freshRoot();
    // The two truth sides for Strelva, persisted so the run reads them from the Phase 0 stores.
    productTruthStore.create(
      { projectId: "strelva", statement: "Strelva records a project_created win event", evidence: [{ claim: "seen", source: "src/events.ts:40", solidity: "observed" }], solidity: "observed" },
      options,
    );
    marketObjectStore.create(
      { projectId: "strelva", kind: "channel", statement: "owners gather in local Facebook groups and trade associations", evidence: [{ claim: "threads", source: "https://example.com/t" }], solidity: "researched" },
      options,
    );
    marketObjectStore.create(
      { projectId: "strelva", kind: "buyer", statement: "1-10 person local businesses who stopped fixing their site", source: "founder-stated", solidity: "inferred", evidence: [{ claim: "founder", source: "founder-stated" }], confidence: 0.8 },
      options,
    );
    marketObjectStore.create(
      { projectId: "strelva", kind: "offer", statement: "$199/mo, no contract", source: "founder-stated", solidity: "observed", evidence: [{ claim: "price", source: "founder-stated" }], confidence: 0.9 },
      options,
    );

    // ONE unconstrained pass (no injected angles): the generator produces the whole focused set and
    // spreads it across the GTM-angle palette itself, self-tagging each path.
    const result = await composePathPortfolio({
      projectId: "strelva",
      generate: fakeDiverseGenerator(8),
      grade: fakeGrader(),
      options,
    });

    assert.ok(
      result.portfolio.length >= 6 && result.portfolio.length <= 10,
      `expected a focused ~6-10 band, got ${result.portfolio.length}`,
    );

    // Diverse: the bets are spread across DISTINCT go-to-market angles, each tagged and persisted.
    const angles = new Set(result.portfolio.map((p) => p.path.angle));
    assert.ok(angles.size >= 4, `expected the set spread across several distinct angles, got ${angles.size}`);
    for (const entry of result.portfolio) {
      assert.ok(entry.path.angle, "each path is tagged with the go-to-market angle it takes");
    }

    // Sorted strongest first by the code-computed composite rank.
    const composites = result.portfolio.map((p) => p.rankingSignals.composite);
    const sorted = [...composites].sort((a, b) => b - a);
    assert.deepEqual(composites, sorted, "the portfolio is ranked, strongest first");

    // Every path: grounded in named evidence and carrying a measurement contract.
    for (const entry of result.portfolio) {
      assert.ok(entry.path.restsOn.length > 0, "each bet rests on named records");
      assert.ok(entry.rankingSignals.evidenceStrength > 0, "each bet ranks on real evidence");
      assert.ok(entry.contract && entry.contract.id, "each bet carries its own measurement contract");
    }

    // Persisted and readable back from the store.
    const stored = gtmPathStore.list({ ...options, projectId: "strelva" });
    assert.equal(stored.length, result.portfolio.length, "the whole portfolio persisted");
  });

  it("still fans out over explicit angles when a caller assigns them (the injected-angle seam)", async () => {
    const options = freshRoot();
    const truth = productTruthStore.create(
      { projectId: "fan", statement: "records events", evidence: [{ claim: "seen", source: "src/x.ts:1", solidity: "observed" }], solidity: "observed" },
      options,
    );
    const channel = marketObjectStore.create(
      { projectId: "fan", kind: "channel", statement: "owners gather in local groups", evidence: [{ claim: "threads", source: "https://x" }], solidity: "researched" },
      options,
    );
    const result = await composePathPortfolio({
      projectId: "fan",
      productTruths: [truth],
      marketObjects: [channel],
      generate: fakeGenerator(2),
      grade: fakeGrader(),
      angles: ["by-channel", "by-offer", "by-message"],
      options,
    });
    assert.equal(result.portfolio.length, 6, "3 angles × 2 paths each");
    // The lane's angle is stamped on each path when the caller assigned one.
    assert.deepEqual(new Set(result.portfolio.map((p) => p.path.angle)), new Set(["by-channel", "by-offer", "by-message"]));
  });
});

// ── Honest blank + open shapes ──────────────────────────────────────────────────────────────────────

describe("path-portfolio — honest blank default and open shapes", () => {
  it("the blank default generates and persists nothing", async () => {
    const options = freshRoot();
    const result = await composePathPortfolio({ projectId: "p", productTruths: [], marketObjects: [], generate: blankGeneratePaths, grade: blankGradePath, options });
    assert.equal(result.portfolio.length, 0);
    assert.equal(gtmPathStore.list({ ...options, projectId: "p" }).length, 0);
  });

  it("carries a novel bet facet and a novel outcome kind through untouched — no closed enum", async () => {
    const options = freshRoot();
    const truth = productTruthStore.create(
      { projectId: "p", statement: "does a thing", evidence: [{ claim: "c", source: "s.ts:1", solidity: "observed" }], solidity: "observed" },
      options,
    );
    const generate = async () => ({
      paths: [
        {
          summary: "a bet with a facet nobody named",
          bet: { buyer: "x", midnight_barter_ritual: "swap tools at a weekly meetup" },
          restsOn: [truth.id],
          confidence: 0.5,
          measurementContract: { outcomeKinds: ["a_totally_new_outcome_kind"], sources: ["a_novel_source"], joinKey: "k", successCriteria: "it works" },
        },
      ],
    });
    const result = await composePathPortfolio({ projectId: "p", productTruths: [truth], marketObjects: [], generate, grade: blankGradePath, options });
    assert.equal(result.portfolio.length, 1);
    const entry = result.portfolio[0];
    assert.equal(entry.path.bet.midnight_barter_ritual, "swap tools at a weekly meetup", "the novel bet facet passes through");
    assert.deepEqual(entry.contract.outcomeKinds, ["a_totally_new_outcome_kind"], "the novel outcome kind passes through");
  });
});
