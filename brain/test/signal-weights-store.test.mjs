// signal-weights-store.test.mjs — the path-ranking weights as a founder-tunable table.
//
// What this proves:
//   - The seed defaults are TODAY'S EXACT numbers: a fresh project reproduces the prior ranking
//     behavior byte-for-byte, so moving the values into the store changed nothing out of the box.
//   - compositeRank's arithmetic is unchanged: the default-weighted composite equals the store's
//     default-weighted composite, and a tuned table shifts the composite deterministically.
//   - A saved tuned table reads back normalized to the seven known keys.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  DEFAULT_SIGNAL_WEIGHTS,
  SIGNAL_WEIGHT_KEYS,
  getSignalWeights,
  saveSignalWeights,
  normalizeSignalWeights,
} from "../src/signal-weights-store.mjs";
import { compositeRank, SIGNAL_WEIGHTS } from "../src/path-portfolio.mjs";

function freshRoot() {
  return { root: fs.mkdtempSync(path.join(os.tmpdir(), "signal-weights-")) };
}

// The exact table ranking used before the values moved into the store — pinned here so a future edit
// to the defaults that would silently change ranking fails this test.
const PRIOR_WEIGHTS = {
  evidenceStrength: 0.22,
  productReadiness: 0.15,
  channelReachability: 0.15,
  measurementReadiness: 0.13,
  speedToTest: 0.13,
  upside: 0.12,
  founderFit: 0.1,
};

describe("signal-weights store — a founder-tunable table that defaults to today's numbers", () => {
  it("the seed defaults are exactly the prior hardcoded weights", () => {
    assert.deepEqual({ ...DEFAULT_SIGNAL_WEIGHTS }, PRIOR_WEIGHTS);
    // path-portfolio still re-exports the seed table, so every prior importer reads the same numbers.
    assert.deepEqual({ ...SIGNAL_WEIGHTS }, PRIOR_WEIGHTS);
    const sum = Object.values(DEFAULT_SIGNAL_WEIGHTS).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9, "the seven weights still partition the composite");
  });

  it("a fresh project reads the defaults, so ranking is identical out of the box", () => {
    assert.deepEqual(getSignalWeights(freshRoot()), PRIOR_WEIGHTS);
  });

  it("compositeRank with the store's default weights reproduces the prior composite", () => {
    const signals = {
      evidenceStrength: 0.8,
      productReadiness: 0.6,
      channelReachability: 0.5,
      measurementReadiness: 1,
      speedToTest: 0.4,
      upside: 0.9,
      founderFit: 0.5,
    };
    // The old code path (module default) and the new store lookup produce the same number.
    const viaDefault = compositeRank(signals);
    const viaStore = compositeRank(signals, getSignalWeights(freshRoot()));
    assert.equal(viaDefault, viaStore);
    // And it equals an independent hand computation over the pinned prior weights.
    const expected = SIGNAL_WEIGHT_KEYS.reduce((total, key) => total + PRIOR_WEIGHTS[key] * signals[key], 0);
    assert.ok(Math.abs(viaDefault - expected) < 1e-9);
  });

  it("a saved tuned table reads back and shifts the composite deterministically", () => {
    const options = freshRoot();
    const signals = { evidenceStrength: 1, productReadiness: 0, channelReachability: 0, measurementReadiness: 0, speedToTest: 0, upside: 0, founderFit: 0 };
    const before = compositeRank(signals, getSignalWeights(options));
    // Founder promotes evidence strength to the whole weight; behavior changes only after this save.
    saveSignalWeights({ evidenceStrength: 1, productReadiness: 0, channelReachability: 0, measurementReadiness: 0, speedToTest: 0, upside: 0, founderFit: 0 }, options);
    const tuned = getSignalWeights(options);
    assert.equal(tuned.evidenceStrength, 1);
    const after = compositeRank(signals, tuned);
    assert.ok(after > before, "raising evidence weight raises a pure-evidence bet's composite");
    assert.equal(after, 1);
  });

  it("normalize keeps only the seven known keys, defaulting missing/invalid ones", () => {
    const normalized = normalizeSignalWeights({ evidenceStrength: 0.5, bogus: 9, founderFit: -1 });
    assert.equal(normalized.evidenceStrength, 0.5);
    assert.equal(normalized.founderFit, DEFAULT_SIGNAL_WEIGHTS.founderFit, "a negative weight falls back to default");
    assert.equal(normalized.productReadiness, DEFAULT_SIGNAL_WEIGHTS.productReadiness, "a missing weight falls back to default");
    assert.ok(!("bogus" in normalized), "an unknown key is dropped");
    assert.deepEqual(Object.keys(normalized), SIGNAL_WEIGHT_KEYS);
  });
});
