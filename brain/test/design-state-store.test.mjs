import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  DESIGN_DIMENSIONS,
  addReference,
  buildDesignState,
  getDesignState,
  houseStyleSeed,
  normalizeDesignState,
  renderDesignState,
  saveDesignState,
} from "../src/design-state-store.mjs";
import { createDesignProvider, providersFromContext } from "../src/context/providers.mjs";

describe("design state store", () => {
  let parent;
  let options;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-design-state-"));
    options = { root: parent };
  });

  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  it("seeds the Warm Calm house style with all five dimensions and six references", () => {
    const seed = houseStyleSeed();
    assert.equal(seed.houseStyle, "Warm Calm");
    assert.deepEqual(Object.keys(seed.dimensions).sort(), [...DESIGN_DIMENSIONS].sort());
    assert.equal(seed.references.length, 6);
  });

  it("a project with no stored state falls back to the seeded house style (the floor)", () => {
    const state = getDesignState("p1", options);
    assert.equal(state.houseStyle, "Warm Calm");
    assert.equal(state.references.length, 6);
    assert.equal(state.projectId, "p1");
  });

  it("marks a dimension grounded only when a reference anchors it; seeds stay labelled", () => {
    const state = buildDesignState({ projectId: "p1" }, options);
    // visual / ia / components / motion each have at least one seed reference; copy has none.
    assert.equal(state.dimensions.visual.grounded, true);
    assert.equal(state.dimensions.ia.grounded, true);
    assert.equal(state.dimensions.components.grounded, true);
    assert.equal(state.dimensions.motion.grounded, true);
    assert.equal(state.dimensions.copy.grounded, false);
  });

  it("persists atomically and reloads the same state", () => {
    const saved = saveDesignState({ projectId: "p2", references: houseStyleSeed().references }, options);
    assert.ok(fs.existsSync(path.join(parent, "design-state", "p2.json")));
    const loaded = getDesignState("p2", options);
    assert.equal(loaded.references.length, saved.references.length);
    assert.equal(loaded.houseStyle, "Warm Calm");
  });

  it("addReference adds a flagged screen, dedupes by id, and re-grounds its dimensions", () => {
    saveDesignState({ projectId: "p3", references: [], dimensions: { copy: { principle: "x" } } }, options);
    const before = getDesignState("p3", options);
    assert.equal(before.dimensions.copy.grounded, false);

    const after = addReference("p3", {
      source: "url", label: "Linear changelog", url: "https://linear.app/changelog",
      dimensions: ["copy"], proves: "plain, confident one-line entries",
    }, options);
    assert.equal(after.references.length, 1);
    assert.equal(after.dimensions.copy.grounded, true);

    // same id again -> replace, not duplicate
    const again = addReference("p3", {
      source: "url", label: "Linear changelog", url: "https://linear.app/changelog",
      dimensions: ["copy"], proves: "updated note",
    }, options);
    assert.equal(again.references.length, 1);
    assert.equal(again.references[0].proves, "updated note");
  });

  it("normalize drops unknown dimension keys on a reference and defaults to visual", () => {
    const state = normalizeDesignState({
      projectId: "p4",
      references: [{ label: "Mystery", dimensions: ["bogus"] }],
    });
    assert.deepEqual(state.references[0].dimensions, ["visual"]);
  });

  it("renderDesignState produces a base-layer block naming the house style and labelling seeds", () => {
    const state = buildDesignState({ projectId: "p5" }, options);
    const text = renderDesignState(state);
    assert.match(text, /DESIGN STATE/);
    assert.match(text, /Warm Calm/);
    assert.match(text, /Komoot/);
    // copy is a seed default (no reference), so it must be labelled as such
    assert.match(text, /seed default/);
  });

  it("the design provider contributes into the assembled context, honest-blank when empty", () => {
    const state = buildDesignState({ projectId: "p6" }, options);
    const provider = createDesignProvider(state);
    const out = provider.contribute();
    assert.equal(provider.name, "design");
    assert.equal(provider.layer, "base");
    assert.ok(out.text.includes("Warm Calm"));
    assert.equal(out.meta.references, 6);

    // wired into providersFromContext when context.designState is present
    const providers = providersFromContext({ designState: state });
    assert.ok(providers.some((p) => p.name === "design"));

    // honest blank: no references, no contribution
    const emptyProvider = createDesignProvider({ houseStyle: "x", dimensions: {}, references: [] });
    assert.equal(emptyProvider.contribute(), null);
  });
});
