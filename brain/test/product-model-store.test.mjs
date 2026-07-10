import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  buildPinnedSignal,
  buildProductModel,
  getProductModel,
  normalizeProductModel,
  reviseProductModel,
  saveProductModelStore,
} from "../src/product-model-store.mjs";
import { blankGenerate } from "../src/product-model-generator.mjs";

const CITATION = { label: "win", file: "brain/src/scan.mjs", line: 204, text: "analytics.track('project_created')" };

describe("product model store", () => {
  let parent;
  let options;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-product-model-"));
    options = { root: parent };
  });

  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  it("buildProductModel stamps the lineage triplet and a stable id", () => {
    const model = buildProductModel({
      projectId: "p1",
      things: [{ name: "Project", kind: "entity", summary: "A work record", provenance: "derived", evidence: [CITATION] }],
    }, options);
    assert.equal(model.lineageId, model.id);
    assert.equal(model.previousModelId, null);
    assert.equal(model.version, 1);
    assert.equal(model.projectId, "p1");
    assert.ok(model.id.startsWith("product-model-"));
    assert.equal(model.things.length, 1);
    assert.equal(model.things[0].provenance, "derived");
    assert.ok(model.things[0].id.startsWith("thing-"));
    assert.ok(model.createdAt);
    assert.equal(model.createdAt, model.updatedAt);
  });

  it("records Codex generation honestly while retaining legacy Claude and blank values", () => {
    assert.equal(buildProductModel({ projectId: "p1", generatedBy: "codex" }, options).generatedBy, "codex");
    assert.equal(buildProductModel({ projectId: "p1", generatedBy: "claude" }, options).generatedBy, "claude");
    assert.equal(buildProductModel({ projectId: "p1", generatedBy: "blank" }, options).generatedBy, "blank");
  });

  it("normalizeProductModel demotes a derived-without-evidence element to speculative", () => {
    const normalized = normalizeProductModel({
      things: [
        { name: "Cited thing", provenance: "derived", evidence: [CITATION] },
        { name: "Bare guess", provenance: "derived", evidence: [] },
        { name: "Fake citation", provenance: "derived", evidence: [{ label: "x", line: 1 }] }, // no file → not real evidence
      ],
      relationships: [{ from: "a", to: "b", label: "creates", provenance: "derived" }],
      userGoals: [{ actor: "user", goal: "ship faster", provenance: "derived" }],
      states: [{ thingId: "t", name: "draft", provenance: "derived" }],
    });
    // The genuinely cited element stays derived; everything claiming derived without a real file:line
    // citation is demoted to speculative — the pollution-guard valve.
    assert.equal(normalized.things[0].provenance, "derived");
    assert.equal(normalized.things[1].provenance, "speculative");
    assert.equal(normalized.things[2].provenance, "speculative");
    assert.equal(normalized.things[2].evidence.length, 0);
    assert.equal(normalized.relationships[0].provenance, "speculative");
    assert.equal(normalized.userGoals[0].provenance, "speculative");
    assert.equal(normalized.states[0].provenance, "speculative");
  });

  it("reviseProductModel bumps version, preserves lineageId, and sets previousModelId", () => {
    const v1 = buildProductModel({ projectId: "p1", things: [{ name: "Project", provenance: "speculative" }] }, options);
    saveProductModelStore({ projectId: "p1", productModels: [v1] }, options);

    const v2 = reviseProductModel(v1.id, {
      things: [
        { name: "Project", kind: "entity", summary: "edited", provenance: "derived", evidence: [CITATION] },
        { name: "Operator", provenance: "speculative" },
      ],
    }, { ...options, projectId: "p1" });

    assert.equal(v2.id, v1.id); // same record id for lineage continuity
    assert.equal(v2.version, 2);
    assert.equal(v2.lineageId, v1.lineageId);
    assert.equal(v2.previousModelId, v1.id);
    assert.equal(v2.things.length, 2);
    assert.equal(v2.things[0].provenance, "derived");
    // A revised element claiming derived without evidence is demoted, exactly as on derive.
    assert.equal(v2.things[1].provenance, "speculative");

    // pinnedSignals is NOT a founder-editable bag.
    assert.throws(() => reviseProductModel(v1.id, { pinnedSignals: [] }, { ...options, projectId: "p1" }), /Unsupported product model fields/);
  });

  it("blankGenerate never fabricates — returns an empty, honest-blank model", async () => {
    const result = await blankGenerate({ grounding: { anything: true } });
    assert.equal(result.ok, true);
    assert.equal(result.meta.blank, true);
    assert.deepEqual(result.model, {
      things: [], relationships: [], userGoals: [], states: [],
      ia: [], workflows: [], interactions: [], transitions: [],
    });
  });

  it("normalizes the IA, workflow, and interaction layers and applies the provenance valve to each", () => {
    const normalized = normalizeProductModel({
      ia: [
        { name: "Product mode", provenance: "derived", evidence: [CITATION] },
        { name: "GTM mode", parentId: "Product mode", provenance: "derived", evidence: [] }, // bare guess → demoted
      ],
      workflows: [
        { name: "Draw the picture", actor: "Founder", provenance: "derived", evidence: [],
          steps: [{ label: "Scan the code" }, { label: "Derive" }, { label: "" }] }, // empty step dropped
      ],
      interactions: [{ name: "Canvas", kind: "screen", provenance: "derived", evidence: [CITATION] }],
      transitions: [
        { from: "Canvas", to: "Gate", trigger: "an action reaches the wall", provenance: "derived" }, // no evidence → demoted
        { from: "", to: "x", trigger: "y" }, // missing from → dropped
      ],
    });
    assert.equal(normalized.ia.length, 2);
    assert.equal(normalized.ia[0].provenance, "derived");
    assert.equal(normalized.ia[1].provenance, "speculative"); // derived-without-evidence demoted
    assert.ok(normalized.ia[0].id.startsWith("ia-"));
    assert.equal(normalized.workflows.length, 1);
    assert.equal(normalized.workflows[0].steps.length, 2); // the empty-label step was dropped
    assert.equal(normalized.interactions[0].provenance, "derived");
    assert.equal(normalized.transitions.length, 1); // the malformed transition was dropped
    assert.equal(normalized.transitions[0].provenance, "speculative");
  });

  it("reviseProductModel accepts the new layer bags", () => {
    const v1 = buildProductModel({ projectId: "p2", things: [{ name: "Project", provenance: "speculative" }] }, options);
    saveProductModelStore({ projectId: "p2", productModels: [v1] }, options);
    const v2 = reviseProductModel(v1.id, {
      ia: [{ name: "Home", provenance: "speculative" }],
      workflows: [{ name: "Onboard", actor: "user", steps: [{ label: "step 1" }], provenance: "speculative" }],
    }, { ...options, projectId: "p2" });
    assert.equal(v2.ia.length, 1);
    assert.equal(v2.workflows.length, 1);
    assert.equal(v2.workflows[0].steps[0].label, "step 1");
    assert.equal(v2.things.length, 1); // untouched bag preserved
  });

  it("buildPinnedSignal copies only the pin, not the signal body", () => {
    const pin = buildPinnedSignal({
      signalId: "signal-123",
      target: { kind: "thing", id: "thing-project" },
      type: "ObservedOutcome",
      summary: "A real customer used this",
      observedAt: "2026-06-24T00:00:00.000Z",
    });
    assert.equal(pin.signalId, "signal-123");
    assert.deepEqual(pin.target, { kind: "thing", id: "thing-project" });
    assert.equal(pin.type, "ObservedOutcome");
    // An unknown target kind falls back to the whole-model pin.
    assert.equal(buildPinnedSignal({ signalId: "s", target: { kind: "bogus" } }).target.kind, "model");
    assert.throws(() => buildPinnedSignal({}), /requires a signalId/);
  });

  it("getProductModel returns null when none exists (honest blank)", () => {
    assert.equal(getProductModel("empty-project", options), null);
  });
});
