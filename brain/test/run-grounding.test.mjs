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

  it("reflects a real scan report: proven attribution, cited evidence, named blind spots", () => {
    const report = {
      // The scan's tracking-gap verdict — must NOT seed the product description headline.
      headline: "Tracking gap proven: attribution captured but missing from project_created.",
      productContext: {
        readme: "RodentRadar turns pest-control sensor data into a monitored feed for food facilities.",
        pkg: { name: "rodentradar", description: "sensor feed", keywords: ["pest", "iot"] },
        sampleDataFiles: [{ file: "data/leads.csv", bytes: 2048 }],
      },
      stack: ["package.json", "vercel.json"],
      winEvent: { name: "project_created", found: true, attributionProperties: ["utm_source"], citations: [{ file: "a.ts", line: 3 }] },
      gaps: [
        { title: "Source missing from project_created", summary: "the gap", citations: [{ file: "b.ts", line: 9 }] },
      ],
      funnel: { stages: [] },
    };
    const grounding = buildRunGrounding({ name: "RodentRadar", sharedContext: {} }, report);
    // README prose seeds the product headline — the tracking-gap verdict never does.
    assert.ok(grounding.headline.startsWith("RodentRadar turns pest-control sensor data"));
    assert.ok(!grounding.headline.includes("Tracking gap"), "the scan's gap verdict is not the product description");
    assert.equal(grounding.evidenceState, "proven", "carried attribution makes the win event proven");
    assert.deepEqual(grounding.winEvent, { name: "project_created", found: true, attributionProperties: ["utm_source"] });
    assert.equal(grounding.evidence.length, 2, "win-event citation + gap citation both carried");
    assert.deepEqual(grounding.blindSpots, [{ title: "Source missing from project_created", summary: "the gap" }]);
    assert.deepEqual(grounding.stack, ["package.json", "vercel.json"]);
    assert.deepEqual(grounding.productContext, { keywords: ["pest", "iot"], sampleDataFiles: [{ file: "data/leads.csv", bytes: 2048 }] });
  });

  it("a report with no carried attribution stays evidence-blind", () => {
    const report = {
      headline: "Blind: project_created could not be confirmed.",
      productContext: null,
      winEvent: { name: "project_created", found: false, attributionProperties: [], citations: [] },
      gaps: [],
      funnel: null,
    };
    const grounding = buildRunGrounding({ name: "P", sharedContext: {} }, report);
    assert.equal(grounding.evidenceState, "blind");
    assert.deepEqual(grounding.evidence, []);
    assert.equal(grounding.productContext, null);
  });
});
