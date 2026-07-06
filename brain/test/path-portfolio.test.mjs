// path-portfolio.test.mjs — the GTM path RANKING layer.
//
// What this proves:
//   - RANKING is deterministic code over stored data (the guard): the seven signals are computed by
//     resolving each path's restsOn refs back to the stored records and reading their real solidity /
//     confidence / source plus the attached contract — never a model guessing a number. Same records
//     in → same signals out; a grounded, measurable, reachable bet outranks a speculative one.
//   - contractCompleteness scores each measurement essential honestly; buildPathGrounding carries each
//     record's id so a bet can cite what it rests on.
// (The portfolio-composition/generation entrypoint was removed — that machinery was a cage. The
// deterministic scoring the live graph-intelligence layer reuses is what remains.)

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  computeRankingSignals,
  compositeRank,
  contractCompleteness,
  buildPathGrounding,
  SIGNAL_WEIGHTS,
} from "../src/path-portfolio.mjs";

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
