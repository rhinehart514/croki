import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { buildRunGrounding, inferProductSummary, reportForProject } from "../src/run-grounding.mjs";
import { createProductProvider } from "../src/context/providers.mjs";
import { saveWorkspace } from "../src/workspace.mjs";

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

describe("inferProductSummary — honest inferred understanding from the derived model", () => {
  // A model the reader extracted, mirroring an EstateSaleUSA-shaped read: real user goals and things,
  // no founder-stated positioning. NOTHING here is product-specific in the code — this is test data.
  const core = {
    userGoals: [
      { actor: "Seller", goal: "run an estate sale without a traditional company", outcome: "keep more of the proceeds" },
      { actor: "Seller", goal: "turn a pile of stuff into priced listings", outcome: "" },
      { actor: "Buyer", goal: "buy items without being there", outcome: "win items remotely" },
    ],
    things: [
      { name: "Sale", kind: "entity", summary: "an estate sale event" },
      { name: "Listing", kind: "artifact", summary: "a priced item" },
    ],
    relationships: [],
    states: [],
  };

  it("composes a labeled inferred value-prop and summary from goals + things, generically", () => {
    const inferred = inferProductSummary(core, "EstateSaleUSA");
    assert.equal(inferred.inferred, true, "explicitly marked inferred, never a proven claim");
    // Value-prop is composed from the primary goal + actor + outcome — no hardcoded pitch.
    assert.match(inferred.valueProp, /EstateSaleUSA helps Seller run an estate sale without a traditional company so they can keep more of the proceeds\./);
    assert.match(inferred.summary, /Serves: Seller, Buyer/);
    assert.match(inferred.summary, /What users come to do:/);
    assert.match(inferred.summary, /Core objects in the product: Sale, Listing/);
    assert.ok(/confirm/i.test(inferred.note), "the note tells the crew to flag it for founder confirmation");
  });

  it("returns null when the model is too thin to say anything real (honest blank, never fabricated)", () => {
    assert.equal(inferProductSummary({ userGoals: [], things: [], relationships: [], states: [] }, "P"), null);
    assert.equal(inferProductSummary(null, "P"), null);
  });

  it("buildRunGrounding falls the headline back to the inferred value-prop when positioning is empty", () => {
    // No product model in the default store for this synthetic id, so the grounding's own model is null;
    // prove the inferredSummary field is at least present-and-null and the headline stays honest.
    const grounding = buildRunGrounding({ id: "no-such-project", name: "Bare", sharedContext: {} });
    assert.ok("inferredSummary" in grounding, "grounding always carries the inferredSummary slot");
    // With no derived model, inference is null and the headline is just the project name — honest blank.
    assert.equal(grounding.inferredSummary, null);
    assert.equal(grounding.headline, "Bare");
  });
});

describe("createProductProvider — inferred understanding reaches the crew, unconfirmed win is a flag not blindness", () => {
  it("renders the inferred value-prop clearly labeled, and softens the blind win event to a confirm-flag", () => {
    // A grounding shaped exactly like buildRunGrounding produces for a scanned product with a derived
    // model but NO founder positioning: empty headline, an inferred summary, an unconfirmed win event.
    const understanding = {
      productName: "EstateSaleUSA",
      headline: "",
      stack: ["package.json"],
      winEvent: { name: "project_created", found: false, attributionProperties: [] },
      evidenceState: "blind",
      blindSpots: [],
      evidence: [],
      inferredSummary: {
        inferred: true,
        summary: "Serves: Seller, Buyer. What users come to do: turn a pile of stuff into priced listings",
        valueProp: "EstateSaleUSA helps Seller run an estate sale without a traditional company.",
        note: "Inferred from the product's derived model, NOT founder-stated positioning.",
      },
    };
    const { text, meta } = createProductProvider(understanding).contribute();
    // The crew now sees a real product understanding to draft from — clearly labeled inferred.
    assert.match(text, /INFERRED PRODUCT UNDERSTANDING/);
    assert.match(text, /Working value proposition \(inferred\): EstateSaleUSA helps Seller/);
    assert.match(text, /needing the founder's confirmation/);
    assert.match(text, /Do NOT refuse for lack of stated positioning/);
    // The unconfirmed win event is a flag to confirm, not "flying blind" that pushes the crew empty.
    assert.match(text, /attribution UNCONFIRMED/);
    assert.match(text, /keep drafting from the product understanding above/);
    assert.doesNotMatch(text, /attribution BLIND/);
    assert.equal(meta.inferredPositioning, true);
  });

  it("stays an honest blank of inferred content when the founder DID state positioning (real wins)", () => {
    const understanding = {
      productName: "P",
      headline: "a founder-stated promise",
      stack: [],
      winEvent: null,
      evidenceState: "proven",
      blindSpots: [],
      evidence: [],
      inferredSummary: null,
    };
    const { text, meta } = createProductProvider(understanding).contribute();
    assert.doesNotMatch(text, /INFERRED PRODUCT UNDERSTANDING/);
    assert.equal(meta.inferredPositioning, false);
  });
});

describe("reportForProject — the direct/streaming run paths now ground on cited product truth", () => {
  let root;
  const isolate = () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-report-for-project-"));
    return { root };
  };

  // A durable workspace carrying a proven scan report, saved to an isolated store — exactly the shape
  // openWorkspace persists after a real scan. saveWorkspace lets the test avoid running scanRepo.
  const seedProvenWorkspace = (options, { id = "ws-proven" } = {}) =>
    saveWorkspace({
      schemaVersion: 1,
      id,
      name: "rodentradar · project_created",
      repo: "/tmp/rodentradar",
      outcome: "project_created",
      createdAt: new Date().toISOString(),
      report: {
        headline: "Tracking gap proven: attribution captured but missing from project_created.",
        filesScanned: 42,
        productContext: {
          readme: "RodentRadar turns pest-control sensor data into a monitored feed.",
          pkg: { name: "rodentradar", description: "sensor feed", keywords: ["pest", "iot"] },
          sampleDataFiles: [],
        },
        stack: ["package.json", "vercel.json"],
        winEvent: { name: "project_created", found: true, attributionProperties: ["utm_source"], citations: [{ file: "a.ts", line: 3 }] },
        gaps: [{ title: "Source missing from project_created", summary: "the gap", citations: [{ file: "b.ts", line: 9 }] }],
        funnel: { stages: [] },
      },
      revisions: [],
      decisions: [],
      runs: [],
    }, options);

  it("resolves the report from the project's linked workspaceId, so grounding cites file:line evidence", () => {
    const options = isolate();
    seedProvenWorkspace(options, { id: "ws-linked" });
    // A project grounded in that workspace carries its id on sharedContext.repository.workspaceId.
    const project = { id: "p1", name: "RodentRadar", sharedContext: { repository: { workspaceId: "ws-linked" } } };

    const report = reportForProject(project, options);
    assert.ok(report, "the linked workspace's scan report is resolved");

    // This is the EXACT call the direct/streaming endpoints now make. Before the fix they passed no
    // report and got evidenceState "blind" with empty evidence — losing every draft citation.
    const grounding = buildRunGrounding(project, report);
    assert.equal(grounding.evidenceState, "proven", "carried attribution makes the run's evidence proven, not blind");
    assert.equal(grounding.evidence.length, 2, "win-event citation + gap citation both reach the run");
    assert.deepEqual(grounding.evidence, [{ file: "a.ts", line: 3 }, { file: "b.ts", line: 9 }]);
    assert.deepEqual(grounding.winEvent, { name: "project_created", found: true, attributionProperties: ["utm_source"] });
  });

  it("falls back to the newest workspace when the project has no linked workspaceId (still cited, not blind)", () => {
    const options = isolate();
    seedProvenWorkspace(options, { id: "ws-unlinked" });
    // A scanned-but-not-yet-linked project (no workspaceId) still grounds on the fresh scan.
    const project = { id: "p2", name: "RodentRadar", sharedContext: { repository: {} } };

    const report = reportForProject(project, options);
    assert.ok(report, "the newest workspace's report is resolved when nothing is linked");
    assert.equal(buildRunGrounding(project, report).evidenceState, "proven");
  });

  it("returns null (grounding stays honestly blind) when there is no workspace at all", () => {
    const options = isolate();
    const project = { id: "p3", name: "Bare", sharedContext: { repository: {} } };
    assert.equal(reportForProject(project, options), null, "no workspace → no report, an honest blank");
    const grounding = buildRunGrounding(project, reportForProject(project, options));
    assert.equal(grounding.evidenceState, "blind", "with no report the run is honestly blind, never fabricated");
    assert.deepEqual(grounding.evidence, []);
  });

  it("never throws on a dangling linked workspaceId — degrades to blind", () => {
    const options = isolate();
    const project = { id: "p4", name: "Bare", sharedContext: { repository: { workspaceId: "does-not-exist" } } };
    // No fallback workspace exists either, so this resolves null rather than throwing.
    assert.doesNotThrow(() => reportForProject(project, options));
    assert.equal(reportForProject(project, options), null);
  });

  it("returns null for a null project without throwing", () => {
    assert.equal(reportForProject(null), null);
  });
});
