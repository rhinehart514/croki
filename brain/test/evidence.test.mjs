import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  SOLIDITY_LADDER,
  SPECULATIVE,
  solidityRank,
  normalizeEvidence,
  normalizeEvidenceList,
  hasSourcedEvidence,
  effectiveSolidity,
  isGrounded,
} from "../src/evidence.mjs";

describe("evidence — the shared provenance contract", () => {
  it("keeps the canonical ladder strongest-first and ranks unknown labels as weakest-known", () => {
    assert.deepEqual(SOLIDITY_LADDER, ["observed", "researched", "inferred", "speculative"]);
    assert.ok(solidityRank("observed") < solidityRank("researched"));
    assert.ok(solidityRank("researched") < solidityRank("speculative"));
    // A novel, open label is honored (not rejected) but never outranks the canonical scale.
    assert.equal(solidityRank("night_market_signal"), SOLIDITY_LADDER.length);
    assert.ok(solidityRank("observed") < solidityRank("night_market_signal"));
  });

  it("demotes a sourceless piece of evidence to speculative regardless of its declared solidity", () => {
    const grounded = normalizeEvidence({ claim: "logins carry utm_source", source: "web/track.ts:42", solidity: "observed" });
    assert.equal(grounded.solidity, "observed");
    assert.equal(grounded.source, "web/track.ts:42");

    const bluffed = normalizeEvidence({ claim: "buyers love it", solidity: "observed" });
    assert.equal(bluffed.solidity, SPECULATIVE, "no source must force speculative even when observed was declared");

    // A source with no declared solidity defaults to researched (something backs it, unspecified how).
    assert.equal(normalizeEvidence({ claim: "x", source: "https://example.com" }).solidity, "researched");
  });

  it("drops empty evidence stubs and detects sourced evidence", () => {
    const list = normalizeEvidenceList([
      { claim: "real", source: "file.ts:1" },
      {},
      { notes: "a bare note with no source" },
      null,
    ]);
    assert.equal(list.length, 2, "empty stub dropped; the bare note kept");
    assert.equal(hasSourcedEvidence(list), true);
    assert.equal(hasSourcedEvidence([{ claim: "guess" }]), false);
  });

  it("computes a claim's effective solidity: speculative with no source, honored otherwise", () => {
    // No sourced evidence → speculative no matter what the claim declared.
    assert.equal(effectiveSolidity("observed", [{ claim: "hunch" }]), SPECULATIVE);
    assert.equal(effectiveSolidity("researched", []), SPECULATIVE);

    // Sourced evidence → the declared (open) label is honored.
    assert.equal(effectiveSolidity("observed", [{ claim: "c", source: "f:1" }]), "observed");
    assert.equal(effectiveSolidity("wild_open_label", [{ claim: "c", source: "f:1" }]), "wild_open_label");

    // Sourced, no declared label → the strongest sourced piece sets it.
    assert.equal(
      effectiveSolidity(null, [
        { claim: "a", source: "f:1", solidity: "inferred" },
        { claim: "b", source: "g:2", solidity: "observed" },
      ]),
      "observed",
    );
  });

  it("treats speculative and empty as not grounded, everything else as grounded", () => {
    assert.equal(isGrounded("observed"), true);
    assert.equal(isGrounded("some_open_label"), true);
    assert.equal(isGrounded(SPECULATIVE), false);
    assert.equal(isGrounded(""), false);
    assert.equal(isGrounded(null), false);
  });
});
