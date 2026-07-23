import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { suggestDirections, sanitizeOptions } from "../../src/firm/composer-predict.mjs";

// An injected model + injected context keep these deterministic and offline: no venture, no key, no network.
const noContext = () => ({ product: null, work: null, mode: "auto" });

describe("composer intent options", () => {
  it("returns the sanitized model options", async () => {
    const model = async () => JSON.stringify([
      { label: "Find first customers", direction: "Find the first twenty customers for this product." },
    ]);
    const { options } = await suggestDirections(
      { ventureId: "v1", draft: "Find", mode: "auto" },
      { model, assembleContext: noContext },
    );
    assert.deepEqual(options, [
      { label: "Find first customers", direction: "Find the first twenty customers for this product." },
    ]);
  });

  it("summons options even with an empty draft", async () => {
    let called = false;
    const model = async () => { called = true; return JSON.stringify([{ label: "Ship it", direction: "Ship the alpha." }]); };
    const { options } = await suggestDirections(
      { ventureId: "v1", draft: "", mode: "auto" },
      { model, assembleContext: noContext },
    );
    assert.equal(called, true, "the founder deliberately summoned, so the model is called with no seed");
    assert.equal(options.length, 1);
  });

  it("fails open when the model throws", async () => {
    const model = async () => { throw new Error("model down"); };
    const { options } = await suggestDirections(
      { ventureId: "v1", draft: "Sharpen the pitch for", mode: "work" },
      { model, assembleContext: noContext },
    );
    assert.deepEqual(options, []);
  });

  it("passes mode and grounded context to the model", async () => {
    let seen = null;
    const model = async (request) => { seen = request; return "[]"; };
    await suggestDirections(
      { ventureId: "v1", draft: "Ship the", mode: "product-gtm" },
      { model, assembleContext: () => ({ product: { name: "Croki" }, work: null, mode: "product-gtm" }) },
    );
    assert.equal(seen.mode, "product-gtm");
    assert.equal(seen.context.product.name, "Croki");
  });
});

describe("sanitizeOptions", () => {
  it("parses a fenced JSON array the model wrapped in prose", () => {
    const raw = "Here you go:\n```json\n[{\"label\":\"Broaden positioning\",\"direction\":\"Explore three new positioning angles.\"}]\n```";
    assert.deepEqual(sanitizeOptions(raw), [
      { label: "Broaden positioning", direction: "Explore three new positioning angles." },
    ]);
  });

  it("caps to three distinct options and drops label duplicates", () => {
    const raw = JSON.stringify([
      { label: "A", direction: "Do a." },
      { label: "a", direction: "Do a again." },
      { label: "B", direction: "Do b." },
      { label: "C", direction: "Do c." },
      { label: "D", direction: "Do d." },
    ]);
    assert.deepEqual(sanitizeOptions(raw).map((o) => o.label), ["A", "B", "C"]);
  });

  it("falls back to the direction as the label when none is given", () => {
    assert.deepEqual(sanitizeOptions([{ direction: "Just this direction." }]), [
      { label: "Just this direction.", direction: "Just this direction." },
    ]);
  });

  it("skips entries with no usable direction", () => {
    assert.deepEqual(sanitizeOptions([{ label: "empty", direction: "   " }, { label: "kept", direction: "Keep me." }]), [
      { label: "kept", direction: "Keep me." },
    ]);
  });

  it("returns empty for unparseable model output", () => {
    assert.deepEqual(sanitizeOptions("sorry, I can't do that"), []);
  });
});
