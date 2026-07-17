import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  deriveVentureTraceability,
  objectTerritory,
  TERRITORIES,
} from "../../src/firm/venture-traceability.mjs";
import {
  emptySemanticModel,
  objectTerritory as objectTerritoryReexport,
  projectArchitectureCompatibility,
  validateSemanticModel,
} from "../../src/firm/semantic-model.mjs";

function object(id, overrides = {}) {
  return {
    id,
    type: overrides.type ?? "concept",
    name: overrides.name ?? id,
    statement: overrides.statement ?? `${id} statement`,
    properties: overrides.properties ?? {},
    assertion: overrides.assertion ?? "tentative",
    provenance: overrides.provenance ?? { kind: "founder-authored" },
    createdAt: null,
    updatedAt: null,
    ...("authorityRef" in overrides ? { authorityRef: overrides.authorityRef } : {}),
  };
}

function relationship(id, fromRef, toRef, overrides = {}) {
  return {
    id,
    fromRef,
    toRef,
    label: overrides.label ?? id,
    type: overrides.type ?? "links",
    properties: overrides.properties ?? {},
    assertion: overrides.assertion ?? "founder-asserted",
    sourceRefs: overrides.sourceRefs ?? [],
    createdAt: null,
    updatedAt: null,
  };
}

function insight(id, overrides = {}) {
  return {
    id,
    statement: overrides.statement ?? `${id} statement`,
    subjectRefs: overrides.subjectRefs ?? [],
    stance: overrides.stance ?? "supports",
    type: overrides.type ?? "response",
    assertion: overrides.assertion ?? "founder-asserted",
    sourceRefs: overrides.sourceRefs ?? [],
    supersedes: overrides.supersedes ?? [],
    status: overrides.status ?? "current",
    proposedBy: overrides.proposedBy ?? { authority: "founder", id: "founder" },
    appliedBy: overrides.appliedBy ?? null,
    properties: overrides.properties ?? {},
    createdAt: null,
    updatedAt: null,
  };
}

function modelWith({ objects = [], relationships = [], insights = [] } = {}) {
  return {
    ...emptySemanticModel("venture-one"),
    revision: 1,
    objects,
    relationships,
    insights,
  };
}

describe("territory facet", () => {
  it("is optional and defaults to unset", () => {
    assert.equal(objectTerritory(object("plain")), null);
    assert.equal(objectTerritory({}), null);
    assert.equal(objectTerritory(null), null);
    assert.equal(objectTerritory(undefined), null);
  });

  it("reads an explicit facet and rejects unknown values", () => {
    assert.equal(objectTerritory(object("p", { properties: { territory: "product" } })), "product");
    assert.equal(objectTerritory(object("g", { properties: { territory: "gtm" } })), "gtm");
    assert.equal(objectTerritory(object("x", { properties: { territory: "finance" } })), null);
    assert.deepEqual(TERRITORIES, ["product", "gtm"]);
    assert.equal(objectTerritoryReexport, objectTerritory);
  });

  it("derives territory from architecture role for compatibility-owned objects", () => {
    const gtm = object("c", { type: "campaign", properties: { architecture: { role: "campaign" } } });
    const product = object("s", { type: "system", properties: { architecture: { role: "system" } } });
    const indeterminate = object("k", { type: "concept", properties: { architecture: { role: "concept" } } });
    assert.equal(objectTerritory(gtm), "gtm");
    assert.equal(objectTerritory(product), "product");
    assert.equal(objectTerritory(indeterminate), null);
  });

  it("falls back to the spec type vocabulary when no explicit facet exists", () => {
    assert.equal(objectTerritory(object("a", { type: "capability" })), "product");
    assert.equal(objectTerritory(object("b", { type: "positioning" })), "gtm");
    assert.equal(objectTerritory(object("i", { type: "insight" })), null);
  });

  it("survives semantic-model validation and round-trips as an open property", () => {
    const model = modelWith({
      objects: [object("cap", { type: "capability", properties: { territory: "product" } })],
    });
    assert.doesNotThrow(() => validateSemanticModel(model, { ventureId: "venture-one" }));
    const clone = structuredClone(model);
    assert.equal(clone.objects[0].properties.territory, "product");
    assert.equal(objectTerritory(clone.objects[0]), "product");
  });

  it("does not appear in the architecture projection as a role", () => {
    const model = modelWith({
      objects: [object("cap", { type: "capability", properties: { territory: "product" } })],
    });
    const projected = projectArchitectureCompatibility(model);
    // A territory-faceted canonical object carries no architecture marker, so the v1 projection ignores it.
    assert.equal(projected.current.elements.length, 0);
    assert.ok(!JSON.stringify(projected).includes("territory"));
  });
});

describe("cross-boundary trace links", () => {
  it("derives the scout relationship pairs from existing relationships", () => {
    const model = modelWith({
      objects: [
        object("pos", { type: "positioning" }),
        object("prom", { type: "promise" }),
        object("cap", { type: "capability" }),
        object("aud", { type: "audience" }),
        object("exp", { type: "experience" }),
      ],
      relationships: [
        relationship("r1", "object:pos", "object:prom", { sourceRefs: [] }),
        relationship("r2", "object:prom", "object:cap", { sourceRefs: ["outcome:o1"] }),
        relationship("r3", "object:aud", "object:exp", { sourceRefs: ["outcome:o2"] }),
      ],
    });
    const { relationshipLinks } = deriveVentureTraceability(model);
    const pairs = relationshipLinks.map((link) => link.pair).sort();
    assert.deepEqual(pairs, ["audience-need->experience", "positioning->promise", "promise->capability"]);
    const crossing = relationshipLinks.find((link) => link.pair === "promise->capability");
    assert.equal(crossing.crossBoundary, true);
    assert.equal(crossing.fromTerritory, "gtm");
    assert.equal(crossing.toTerritory, "product");
  });

  it("derives insight-based crossings (response, revenue, telemetry)", () => {
    const model = modelWith({
      objects: [
        object("pos", { type: "positioning" }),
        object("camp", { type: "campaign" }),
        object("offer", { type: "offer" }),
        object("cap", { type: "capability" }),
        object("mkt", { type: "market" }),
      ],
      insights: [
        insight("i-resp", { type: "response", subjectRefs: ["object:pos"], sourceRefs: ["conversation:c1"] }),
        insight("i-rev", { type: "revenue", subjectRefs: ["object:camp", "object:cap"], sourceRefs: ["outcome:rev1"] }),
        insight("i-tel", { type: "telemetry", subjectRefs: ["object:mkt"], stance: "supports", sourceRefs: ["outcome:t1"] }),
      ],
    });
    const { insightLinks } = deriveVentureTraceability(model);
    const pairs = insightLinks.map((link) => link.pair).sort();
    assert.deepEqual(pairs, ["response", "revenue", "telemetry"]);
    const rev = insightLinks.find((link) => link.pair === "revenue");
    assert.deepEqual(rev.subjectTerritories.sort(), ["gtm", "product"]);
  });

  it("never invents a link where no relationship or insight exists", () => {
    const model = modelWith({
      objects: [object("pos", { type: "positioning" }), object("cap", { type: "capability" })],
    });
    const { traceLinks } = deriveVentureTraceability(model);
    assert.equal(traceLinks.length, 0);
  });
});

describe("gap derivations", () => {
  it("flags an unsupported claim with no product-reaching link and no supporting evidence", () => {
    const model = modelWith({
      objects: [object("pos", { type: "positioning", assertion: "founder-asserted" })],
    });
    const { gapsByKind } = deriveVentureTraceability(model);
    const gap = gapsByKind.unsupportedClaims.find((entry) => entry.kind === "unsupported-claim");
    assert.ok(gap);
    assert.equal(gap.objectRef, "object:pos");
  });

  it("yields NO unsupported-claim gap when the claim reaches product truth", () => {
    const model = modelWith({
      objects: [
        object("prom", { type: "promise", assertion: "founder-asserted" }),
        object("cap", { type: "capability" }),
      ],
      relationships: [relationship("r", "object:prom", "object:cap", { sourceRefs: ["outcome:o1"] })],
    });
    const { gapsByKind } = deriveVentureTraceability(model);
    assert.equal(gapsByKind.unsupportedClaims.filter((g) => g.kind === "unsupported-claim" && g.objectRef === "object:prom").length, 0);
  });

  it("yields NO unsupported-claim gap when a current supporting insight resolves", () => {
    const model = modelWith({
      objects: [object("pos", { type: "positioning", assertion: "founder-asserted" })],
      insights: [insight("i", { subjectRefs: ["object:pos"], stance: "supports", sourceRefs: ["outcome:o1"] })],
    });
    const resolveEvidenceRef = (ref) => (ref === "outcome:o1" ? { state: "resolved" } : { state: "unresolved" });
    const { gapsByKind } = deriveVentureTraceability(model, { resolveEvidenceRef });
    assert.equal(gapsByKind.unsupportedClaims.filter((g) => g.kind === "unsupported-claim").length, 0);
  });

  it("still flags an unsupported claim when the supporting evidence does not resolve", () => {
    const model = modelWith({
      objects: [object("pos", { type: "positioning", assertion: "founder-asserted" })],
      insights: [insight("i", { subjectRefs: ["object:pos"], stance: "supports", sourceRefs: ["outcome:o1"] })],
    });
    const resolveEvidenceRef = () => ({ state: "stale" });
    const { gapsByKind } = deriveVentureTraceability(model, { resolveEvidenceRef });
    assert.equal(gapsByKind.unsupportedClaims.filter((g) => g.kind === "unsupported-claim").length, 1);
  });

  it("does not let a tentative interpretation discharge a claim gap (Law 10)", () => {
    const model = modelWith({
      objects: [object("pos", { type: "positioning", assertion: "founder-asserted" })],
      insights: [insight("i", { subjectRefs: ["object:pos"], stance: "interprets", assertion: "tentative", sourceRefs: ["outcome:o1"] })],
    });
    const resolveEvidenceRef = () => ({ state: "resolved" });
    const { gapsByKind } = deriveVentureTraceability(model, { resolveEvidenceRef });
    assert.equal(gapsByKind.unsupportedClaims.filter((g) => g.kind === "unsupported-claim").length, 1);
  });

  it("does not let an unknown or refuting stance count as support even with resolving evidence", () => {
    for (const stance of ["refutes", "observes", "challenges", "notes"]) {
      const model = modelWith({
        objects: [object("pos", { type: "positioning", assertion: "founder-asserted" })],
        insights: [insight("i", { subjectRefs: ["object:pos"], stance, sourceRefs: ["outcome:o1"] })],
      });
      const { gapsByKind } = deriveVentureTraceability(model, { resolveEvidenceRef: () => ({ state: "resolved" }) });
      assert.equal(gapsByKind.unsupportedClaims.filter((g) => g.kind === "unsupported-claim").length, 1, stance);
    }
  });

  it("keeps a claim gap visible when no evidence resolver is wired (fail toward visibility)", () => {
    const model = modelWith({
      objects: [object("pos", { type: "positioning", assertion: "founder-asserted" })],
      insights: [insight("i", { subjectRefs: ["object:pos"], stance: "supports", sourceRefs: ["outcome:o1"] })],
    });
    const { gapsByKind } = deriveVentureTraceability(model);
    assert.equal(gapsByKind.unsupportedClaims.filter((g) => g.kind === "unsupported-claim").length, 1);
  });

  it("treats a motion as go-to-market, so a gtm claim linked only to a motion is still unsupported", () => {
    assert.equal(objectTerritory(object("m", { type: "motion", properties: { architecture: { role: "motion" } } })), "gtm");
    const model = modelWith({
      objects: [
        object("prom", { type: "promise", assertion: "founder-asserted" }),
        object("mot", { type: "motion", properties: { architecture: { role: "motion" } } }),
      ],
      relationships: [relationship("r", "object:prom", "object:mot", { sourceRefs: ["outcome:o1"] })],
    });
    const { gapsByKind } = deriveVentureTraceability(model);
    assert.equal(gapsByKind.unsupportedClaims.filter((g) => g.kind === "unsupported-claim" && g.objectRef === "object:prom").length, 1);
  });

  it("flags a tentative cross-boundary link with no evidence as an unsupported link", () => {
    const model = modelWith({
      objects: [object("prom", { type: "promise" }), object("cap", { type: "capability" })],
      relationships: [relationship("r", "object:prom", "object:cap", { assertion: "tentative", sourceRefs: [] })],
    });
    const { gapsByKind } = deriveVentureTraceability(model);
    assert.ok(gapsByKind.unsupportedClaims.some((g) => g.kind === "unsupported-link" && g.relationshipId === "r"));
  });

  it("flags an unexpressed capability with no cross-territory relationship", () => {
    const model = modelWith({
      objects: [object("cap", { type: "capability" }), object("exp", { type: "experience" })],
      relationships: [relationship("r", "object:cap", "object:exp", { sourceRefs: [] })],
    });
    const { gapsByKind } = deriveVentureTraceability(model);
    const refs = gapsByKind.unexpressedCapabilities.map((g) => g.objectRef).sort();
    assert.deepEqual(refs, ["object:cap", "object:exp"]);
  });

  it("does not flag a capability that a gtm record references across the boundary", () => {
    const model = modelWith({
      objects: [object("prom", { type: "promise" }), object("cap", { type: "capability" })],
      relationships: [relationship("r", "object:prom", "object:cap", { sourceRefs: ["outcome:o1"] })],
    });
    const { gapsByKind } = deriveVentureTraceability(model);
    assert.equal(gapsByKind.unexpressedCapabilities.filter((g) => g.objectRef === "object:cap").length, 0);
  });

  it("flags disconnected evidence enumerable from venture truth but referenced nowhere", () => {
    const model = modelWith({
      objects: [object("pos", { type: "positioning" })],
      insights: [insight("i", { subjectRefs: ["object:pos"], sourceRefs: ["outcome:used"] })],
    });
    const enumerateEvidenceRefs = () => ["outcome:used", "outcome:orphan", "conversation:orphan"];
    const { gapsByKind } = deriveVentureTraceability(model, { enumerateEvidenceRefs });
    const refs = gapsByKind.disconnectedEvidence.map((g) => g.evidenceRef).sort();
    assert.deepEqual(refs, ["conversation:orphan", "outcome:orphan"]);
  });

  it("flags referenced evidence that no longer resolves as the weak form of disconnection", () => {
    const model = modelWith({
      objects: [object("pos", { type: "positioning" })],
      insights: [insight("i", { subjectRefs: ["object:pos"], sourceRefs: ["outcome:stale"] })],
    });
    const resolveEvidenceRef = () => ({ state: "unresolved" });
    const { gapsByKind } = deriveVentureTraceability(model, { resolveEvidenceRef });
    assert.ok(gapsByKind.disconnectedEvidence.some((g) => g.evidenceRef === "outcome:stale" && g.state === "unresolved"));
  });
});

describe("purity", () => {
  it("never mutates the input model", () => {
    const model = modelWith({
      objects: [
        object("pos", { type: "positioning", assertion: "founder-asserted" }),
        object("cap", { type: "capability" }),
      ],
      relationships: [relationship("r", "object:pos", "object:cap", { assertion: "tentative", sourceRefs: [] })],
      insights: [insight("i", { subjectRefs: ["object:pos"], sourceRefs: ["outcome:o1"] })],
    });
    const before = structuredClone(model);
    deriveVentureTraceability(model, {
      resolveEvidenceRef: () => ({ state: "resolved" }),
      enumerateEvidenceRefs: () => ["outcome:o1", "outcome:orphan"],
    });
    assert.deepEqual(model, before);
  });

  it("never fabricates evidence into the returned links", () => {
    const model = modelWith({
      objects: [object("prom", { type: "promise" }), object("cap", { type: "capability" })],
      relationships: [relationship("r", "object:prom", "object:cap", { sourceRefs: [] })],
    });
    const { relationshipLinks } = deriveVentureTraceability(model);
    assert.deepEqual(relationshipLinks[0].sourceRefs, []);
  });
});
