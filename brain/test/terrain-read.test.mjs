import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createTerrainReader,
  normalizeTerrainRead,
  TERRAIN_READ_PROMPT,
  terrainInputFingerprint,
} from "../src/terrain-read.mjs";

const NOW = () => "2026-07-10T12:00:00.000Z";

function input(overrides = {}) {
  return {
    projectId: "project-a",
    scan: {
      scannedAt: "2026-07-10T10:00:00.000Z",
      truths: [{ id: "truth-route", projectId: "project-a", evidence: [{ file: "src/routes/sale.js", line: 12, text: "app.get('/sales/:id')" }] }],
    },
    productModel: { id: "model-a", version: 3, things: [{ id: "thing-sale", name: "Sale" }] },
    marketRecords: [{ id: "market-1", type: "market-evidence", projectId: "project-a", updatedAt: "2026-07-10T11:00:00.000Z" }],
    founderDecisions: [{ id: "decision-1", updatedAt: "2026-07-10T11:10:00.000Z" }],
    joinedOutcomes: [{ id: "outcome-1", kind: "reply", updatedAt: "2026-07-10T11:20:00.000Z" }],
    implications: [{ id: "implication-1", updatedAt: "2026-07-10T11:30:00.000Z" }],
    capabilities: { tools: [{ ref: "search/read" }] },
    tasteRevision: 4,
    crew: [{ ref: "gtm-research", projectId: "project-a" }],
    ...overrides,
  };
}

function supported(overrides = {}) {
  return {
    stance: "opening",
    title: "Turn sale records into useful local pages",
    claim: "The existing sale route could support a public page for each sale.",
    whyItMatters: "Each real sale can become a findable product artifact.",
    provenance: "inferred",
    evidenceRefs: [{ type: "evidence", id: "truth-route" }],
    productRefs: [{ type: "thing", id: "thing-sale" }],
    marketRefs: [{ type: "market-evidence", id: "market-1" }],
    counterEvidenceRefs: [],
    unknown: "Whether buyers search for individual sales.",
    falsifier: "Search evidence shows no buyer demand for local sale pages.",
    suggestedMove: { title: "Publish one local sale page", intendedEffect: "Test whether a real sale page attracts discovery.", measurementIntent: "Qualified visits to the page" },
    crewRefs: [{ type: "teammate", id: "gtm-research" }],
    ...overrides,
  };
}

describe("terrain read normalization and provenance", () => {
  it("returns the exact read/hypothesis contract with resolvable project-scoped refs", () => {
    const read = normalizeTerrainRead([supported()], input(), { id: "codex", model: "gpt-5.6" }, { now: NOW });
    assert.equal(read.schemaVersion, 1);
    assert.equal(read.projectId, "project-a");
    assert.equal(read.runtime.id, "codex");
    assert.equal(read.hypotheses[0].provenance, "inferred");
    assert.deepEqual(read.hypotheses[0].evidenceRefs, [{ type: "evidence", id: "truth-route" }]);
    assert.deepEqual(read.hypotheses[0].productRefs, [{ type: "thing", id: "thing-sale" }]);
    assert.equal(read.hypotheses[0].unknown, "Whether buyers search for individual sales.");
    assert.equal(read.hypotheses[0].falsifier, "Search evidence shows no buyer demand for local sale pages.");
  });

  it("demotes fake code citations and cross-project evidence instead of laundering them", () => {
    const fake = supported({ evidenceRefs: [{ type: "evidence", id: "src/fake.js:999" }], marketRefs: [] });
    const crossProject = input({ evidenceRecords: [{ id: "foreign", projectId: "project-b", file: "src/x.js", line: 1 }] });
    const read = normalizeTerrainRead([fake, supported({ title: "Foreign", claim: "Foreign evidence supports this.", evidenceRefs: [{ type: "evidence", id: "foreign" }], marketRefs: [] })], crossProject, { id: "claude-code" }, { now: NOW });
    assert.equal(read.hypotheses[0].provenance, "speculative");
    assert.deepEqual(read.hypotheses[0].evidenceRefs, []);
    assert.equal(read.hypotheses[1].provenance, "speculative");
  });

  it("keeps counterevidence, open stances, and optional suggested moves without a motion enum", () => {
    const raw = supported({
      stance: "tension",
      counterEvidenceRefs: [{ type: "market-evidence", id: "market-1" }],
      suggestedMove: { kind: "neighborhood-field-guide", title: "Try the field guide", intendedEffect: "Learn which local facts travel.", measurementIntent: null },
    });
    const hypothesis = normalizeTerrainRead([raw], input(), { id: "codex" }, { now: NOW }).hypotheses[0];
    assert.equal(hypothesis.stance, "tension");
    assert.deepEqual(hypothesis.counterEvidenceRefs, [{ type: "market-evidence", id: "market-1" }]);
    assert.equal(hypothesis.suggestedMove.title, "Try the field guide");
    assert.equal("kind" in hypothesis.suggestedMove, false, "the host neither validates nor persists a closed kind");

    const noMove = normalizeTerrainRead([supported({ suggestedMove: null })], input(), { id: "codex" }, { now: NOW });
    assert.equal(noMove.hypotheses[0].suggestedMove, null);
  });

  it("drops malformed hypotheses and accepts an honest empty response", () => {
    assert.deepEqual(normalizeTerrainRead([], input(), { id: "blank" }, { now: NOW }).hypotheses, []);
    assert.deepEqual(normalizeTerrainRead([null, "bad", {}, { title: "No claim" }], input(), { id: "codex" }, { now: NOW }).hypotheses, []);
  });
});

describe("terrain read determinism and rented runtime boundary", () => {
  it("keeps fingerprints and ids stable for identical authority revisions", () => {
    const first = normalizeTerrainRead([supported()], input(), { id: "codex" }, { now: () => "2026-07-10T12:00:00Z" });
    const second = normalizeTerrainRead([supported()], input(), { id: "claude-code" }, { now: () => "2026-07-11T12:00:00Z" });
    assert.equal(first.inputFingerprint, second.inputFingerprint);
    assert.equal(first.id, second.id);
    assert.equal(first.hypotheses[0].id, second.hypotheses[0].id);
    assert.notEqual(first.generatedAt, second.generatedAt);
  });

  it("changes the fingerprint across every required freshness authority", () => {
    const base = input();
    const original = terrainInputFingerprint(base);
    const changes = [
      { projectId: "project-b" },
      { scannedAt: "2026-07-11T00:00:00Z" },
      { productModelVersion: 4 },
      { marketRevision: "market-r2" },
      { latestFounderTerrainDecisionAt: "2026-07-11T01:00:00Z" },
      { latestJoinedOutcomeAt: "2026-07-11T02:00:00Z" },
      { latestImplicationAt: "2026-07-11T03:00:00Z" },
      { capabilityInventoryIdentity: "caps-r2" },
      { tasteRevision: 5 },
    ];
    for (const change of changes) assert.notEqual(terrainInputFingerprint({ ...base, ...change }), original, JSON.stringify(change));
  });

  it("makes no-market evidence explicit in the rented prompt and never invents a demand ref", async () => {
    let request;
    const read = createTerrainReader({
      now: NOW,
      runTask: async (value) => { request = value; return { ok: true, value: [supported({ marketRefs: [], provenance: "speculative" })], runtime: "codex", model: "gpt-test" }; },
    });
    const result = await read(input({ marketRecords: [] }));
    assert.equal(result.ok, true);
    assert.match(request.prompt, /NO MARKET EVIDENCE IS AVAILABLE/);
    assert.equal(request.readOnly, true);
    assert.equal(request.output, "items");
    assert.deepEqual(result.terrainRead.hypotheses[0].marketRefs, []);
  });

  it("provider failure returns an honest empty partial read with safe error metadata", async () => {
    const read = createTerrainReader({
      now: NOW,
      runTask: async () => ({ ok: false, value: [], runtime: "claude-code", model: "claude-test", error: { kind: "limit", message: "Usage limit reached.", retriable: true } }),
    });
    const result = await read(input());
    assert.equal(result.ok, false);
    assert.deepEqual(result.terrainRead.hypotheses, []);
    assert.deepEqual(result.terrainRead.runtime, { id: "claude-code", model: "claude-test" });
    assert.equal(result.error.kind, "limit");
  });

  it("the prompt preserves uncertainty and has no authorization or closed-motion power", () => {
    assert.match(TERRAIN_READ_PROMPT, /counterevidence/);
    assert.match(TERRAIN_READ_PROMPT, /falsifier/);
    assert.match(TERRAIN_READ_PROMPT, /never permission or authorization/);
    assert.match(TERRAIN_READ_PROMPT, /do not restrict moves to a fixed list of kinds/i);
  });
});
