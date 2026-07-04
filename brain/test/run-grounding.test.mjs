import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildRunGrounding } from "../src/run-grounding.mjs";

describe("buildRunGrounding", () => {
  it("assembles the headline from repo headline, positioning promise, and ICP description", () => {
    const grounding = buildRunGrounding({
      name: "Drover",
      sharedContext: {
        repository: { headline: "GTM desk for multi-product founders", outcome: "attributed_win" },
        positioning: { promise: "one desk for every product's go-to-market" },
        icp: { description: "founders running more than one product" },
      },
    });
    assert.equal(grounding.productName, "Drover");
    assert.equal(
      grounding.headline,
      "GTM desk for multi-product founders — one desk for every product's go-to-market — Ideal customer: founders running more than one product",
    );
    assert.deepEqual(grounding.winEvent, { name: "attributed_win" });
    assert.equal(grounding.evidenceState, "blind", "a fresh run starts evidence-blind");
    assert.deepEqual(grounding.evidence, []);
  });

  it("falls back through the positioning and ICP field aliases", () => {
    const grounding = buildRunGrounding({
      name: "P",
      sharedContext: {
        repository: {},
        product: { description: "the product blurb" },
        positioning: { category: "developer tools" },
        icp: { buyer: "platform teams" },
      },
    });
    assert.equal(
      grounding.headline,
      "the product blurb — developer tools — Ideal customer: platform teams",
      "product.description stands in for a missing repo headline; category and buyer are used",
    );
  });

  it("omits the ICP clause and the win event when neither is present", () => {
    const grounding = buildRunGrounding({
      name: "Bare",
      sharedContext: {
        repository: { headline: "just a headline" },
        positioning: {},
        icp: {},
      },
    });
    assert.equal(grounding.headline, "just a headline", "no positioning or ICP clauses appended");
    assert.equal(grounding.winEvent, null, "no repo outcome means no win event");
  });

  it("falls back the product name and headline to the project name when context is empty", () => {
    const grounding = buildRunGrounding({ name: "OnlyName" });
    assert.equal(grounding.productName, "OnlyName");
    assert.equal(grounding.headline, "OnlyName", "empty context still yields the project name as headline");
    assert.equal(grounding.winEvent, null);
  });

  it("defaults the product name to \"product\" when there is no project at all", () => {
    const grounding = buildRunGrounding(null);
    assert.equal(grounding.productName, "product");
    assert.equal(grounding.headline, "");
    assert.equal(grounding.winEvent, null);
    assert.equal(grounding.evidenceState, "blind");
  });
});
