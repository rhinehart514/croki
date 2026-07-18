// relationship-interpreter.test.mjs — PURE relationship-kind interpretation (Experience Law 7).
//
// interpretRelationship reads the canonical model + two object ids and returns RANKED open-string proposals.
// The load-bearing behavior: the venture's OWN existing connection labels (real vocabulary) rank BEFORE
// general type-pair proposals, known type pairs get sensible proposals, the kind is an open string (never a
// closed enum), and it NEVER writes — the model is untouched.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { interpretRelationship } from "../../src/firm/relationship-interpreter.mjs";

function object(id, type, extra = {}) {
  return { id, type, name: id, statement: "", properties: {}, assertion: "tentative", ...extra };
}

function relationship(id, fromId, toId, label) {
  return {
    id,
    fromRef: `object:${fromId}`,
    toRef: `object:${toId}`,
    label,
    type: "connection",
    assertion: "tentative",
    sourceRefs: [],
    properties: {},
  };
}

function model(objects, relationships = []) {
  return { schemaVersion: 2, ventureId: "venture-interp", revision: 0, objects, relationships, threads: [], runs: [], views: [], workflowContracts: [], insights: [] };
}

describe("interpretRelationship — pure ranked relationship-kind proposals (Law 7)", () => {
  it("ranks the venture's EXISTING connection labels first (real vocabulary before general proposals)", () => {
    const objects = [object("offer-1", "offer"), object("aud-1", "audience"), object("x", "capability"), object("y", "positioning")];
    // The founder has used "sold to" twice and "aimed at" once elsewhere in the venture.
    const relationships = [
      relationship("r1", "x", "y", "sold to"),
      relationship("r2", "x", "y", "sold to"),
      relationship("r3", "x", "y", "aimed at"),
    ];
    const { proposals } = interpretRelationship(model(objects, relationships), "offer-1", "aud-1");

    // Tier 1: the founder's own labels, most-used first, ahead of ANY general proposal.
    assert.equal(proposals[0].kind, "sold to", "the most-used existing label ranks first");
    assert.equal(proposals[0].source, "venture-label");
    assert.equal(proposals[1].kind, "aimed at", "the next existing label ranks second");
    assert.equal(proposals[1].source, "venture-label");
    // The general offer->audience proposal appears, but only AFTER the venture's real vocabulary.
    const designedForRank = proposals.findIndex((p) => p.kind === "designed for");
    assert.ok(designedForRank > 1, "the general proposal ranks below the venture's own labels");
    assert.equal(proposals[designedForRank].source, "type-pair");
    // Every proposal carries a short rationale.
    for (const proposal of proposals) assert.ok(proposal.rationale && proposal.rationale.length > 0, "each proposal has a rationale");
  });

  it("proposes sensible kinds for known type pairs (offer->audience = 'designed for'; positioning->capability = 'promised by')", () => {
    const offerAudience = interpretRelationship(
      model([object("o", "offer"), object("a", "audience")]),
      "o", "a",
    );
    assert.equal(offerAudience.proposals[0].kind, "designed for", "offer->audience proposes 'designed for' first when no venture vocabulary exists");
    assert.equal(offerAudience.proposals[0].source, "type-pair");

    const positioningCapability = interpretRelationship(
      model([object("p", "positioning"), object("c", "capability")]),
      "p", "c",
    );
    assert.equal(positioningCapability.proposals[0].kind, "promised by", "positioning->capability proposes 'promised by'");
  });

  it("kinds are OPEN STRINGS, never a closed enum — an unknown type pair still yields a usable starting point", () => {
    const { proposals } = interpretRelationship(
      model([object("m", "mystery-type"), object("n", "another-mystery")]),
      "m", "n",
    );
    // No type-pair matches and no venture vocabulary — the founder is still handed an open starting point.
    assert.ok(proposals.length >= 1);
    assert.equal(proposals[proposals.length - 1].kind, "relates to", "a neutral open fallback is always offered");
    // Nothing here is validated against an enum; a venture label of any string would be accepted verbatim.
    const withCustomLabel = interpretRelationship(
      model([object("m", "mystery-type"), object("n", "another-mystery")], [relationship("r", "m", "n", "totally bespoke phrasing")]),
      "m", "n",
    );
    assert.equal(withCustomLabel.proposals[0].kind, "totally bespoke phrasing", "an arbitrary founder label is proposed verbatim — no closed vocabulary");
  });

  it("is PURE — it never writes truth: the model object is untouched and no proposal is established", () => {
    const objects = [object("o", "offer"), object("a", "audience")];
    const relationships = [relationship("r", "o", "a", "existing")];
    const source = model(objects, relationships);
    const snapshot = JSON.stringify(source);

    const result = interpretRelationship(source, "o", "a");

    assert.equal(JSON.stringify(source), snapshot, "the model is byte-for-byte unchanged — interpretation writes nothing");
    // Every returned proposal is a PROPOSAL, not an assertion of truth: no assertion/established fields leak.
    for (const proposal of result.proposals) {
      assert.equal("assertion" in proposal, false, "a proposal never carries an assertion");
      assert.equal("established" in proposal, false, "a proposal never establishes truth");
    }
  });

  it("throws on an id the model does not hold rather than inventing an object", () => {
    assert.throws(
      () => interpretRelationship(model([object("o", "offer")]), "o", "ghost"),
      (e) => e.code === "relationship_interpret_missing" && e.status === 404,
    );
  });
});
